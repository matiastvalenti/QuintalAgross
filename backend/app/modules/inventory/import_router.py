from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import text
import pandas as pd
import io
import hashlib
import re
from typing import List
from app.db.session import get_db
from app.db.models.commercial_models import Product, Category, SubCategory, Unit, Container, TaxType, Account, generate_uuid

router = APIRouter(prefix="/products/import", tags=["Import"])

@router.post("/")
async def import_products(reset: bool = False, file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="El archivo debe ser un Excel (.xlsx o .xls)")

    if reset:
        print("RESET: Iniciando limpieza de base de datos...")
        try:
            # Orden de eliminación para respetar foreign keys
            db.execute(text("DELETE FROM stock_movements"))
            db.execute(text("DELETE FROM stock_items"))
            db.execute(text("DELETE FROM delivery_note_lines"))
            db.execute(text("DELETE FROM delivery_notes"))
            db.execute(text("DELETE FROM sales_order_lines"))
            db.execute(text("DELETE FROM sales_orders"))
            db.execute(text("DELETE FROM purchase_order_lines"))
            db.execute(text("DELETE FROM purchase_orders"))
            db.execute(text("DELETE FROM products"))
            db.execute(text("DELETE FROM subcategories"))
            db.execute(text("DELETE FROM categories"))
            db.execute(text("DELETE FROM accounts"))
            db.commit()
            print("RESET: Base de datos limpiada correctamente.")
        except Exception as e:
            db.rollback()
            print(f"RESET ERROR: {e}")

    try:
        contents = await file.read()
        excel_file = io.BytesIO(contents)
        # Leer todas las hojas en un diccionario {nombre_hoja: dataframe}
        xl_dict = pd.read_excel(excel_file, sheet_name=None, header=None)
        
        stats = {"created": 0, "errors": []}
        
        # Mapeo flexible de columnas
        column_map = {
            "rubro": ["rubro", "category", "categoria", "clasificación", "linea"],
            "subrubro": ["subrubro", "sub rubro", "subcategory", "subcategoria", "familia"],
            "nombre": ["insumos", "insumo", "nombre", "producto", "name", "nombre de producto", "descripcion", "artículo", "detalle"],
            "contenedor": ["contenedor", "container", "envase", "packaging"],
            "medida": ["u.m.", "medida", "unidad", "unit", "uom", "formato", "unidad de medida", "unid. med."],
            "cantidad_contenedor": ["cant x cont", "cantidad x contenedor", "cantidad_contenedor", "cantidad en el contenedor", "cantidad", "contenido", "capacidad"],
            "iva": ["iva", "iva_rate", "impuesto", "alícuota", "alic"],
            "cta_venta": ["cta contable venta", "cuenta venta", "cta venta"],
            "cta_compra": ["cta contable compra", "cuenta compra", "cta compra"]
        }

        # Caches para acelerar la importación
        cache_cat = {c.name.lower(): c for c in db.query(Category).all()}
        cache_subcat = {(s.category_id, s.name.lower()): s for s in db.query(SubCategory).all()}
        cache_tax = {t.rate: t for t in db.query(TaxType).all()}
        cache_unit = {u.name.lower(): u for u in db.query(Unit).all()}
        cache_cont = {c.name.lower(): c for c in db.query(Container).all()}
        cache_acc = {a.code: a for a in db.query(Account).all()}

        print(f"--- INICIO IMPORTACIÓN ({len(xl_dict)} hojas) ---")

        for sheet_name, df_raw in xl_dict.items():
            print(f"Procesando hoja: {sheet_name}")
            
            # 1. Detectar encabezado
            header_row_index = 0
            keywords = ["rubro", "insumo", "nombre", "categoria", "clasificación"]
            for i, row in df_raw.iterrows():
                row_str_vals = [str(val).lower() for val in row.values if pd.notna(val)]
                if any(any(kw in val for kw in keywords) for val in row_str_vals):
                    header_row_index = i
                    break
            
            # Re-leer dataframe con encabezado correcto
            df = df_raw.iloc[header_row_index:].copy()
            df.columns = [str(c).strip().replace('\n', ' ') for c in df.iloc[0]]
            df = df.iloc[1:] # Quitar la fila de encabezado de los datos

            # 2. Mapear columnas encontradas
            def find_col(aliases):
                for col in df.columns:
                    c_low = str(col).lower().strip()
                    if c_low in aliases: return col
                # Coincidencia parcial si es palabra clave larga
                for col in df.columns:
                    c_low = str(col).lower().strip()
                    for a in aliases:
                        if len(a) > 3 and a in c_low: return col
                return None

            cols = {k: find_col(v) for k, v in column_map.items()}
            if not cols["nombre"]:
                print(f"  > Hoja {sheet_name} omitida: No se detectó columna 'Nombre/Insumo'")
                continue

            # 3. Soporte para Merged Cells (Forward Fill)
            for k in ["rubro", "subrubro"]:
                c_name = cols[k]
                if c_name:
                    # Convertir vacíos a NaN para ffill
                    df[c_name] = df[c_name].astype(str).str.strip().replace(['', '-', 'None', 'nan', 'NaN'], pd.NA)
                    df[c_name] = df[c_name].ffill()

            # 4. Procesar filas
            for idx, row in df.iterrows():
                try:
                    product_name = str(row[cols["nombre"]]).strip() if pd.notna(row[cols["nombre"]]) else ""
                    if not product_name or product_name.lower() in ['nan', 'none', '-', 'insumos', 'nombre']:
                        continue

                    # Rubro (Category)
                    rub_name = str(row[cols["rubro"]]).strip() if cols["rubro"] and pd.notna(row[cols["rubro"]]) else sheet_name
                    if not rub_name or rub_name.lower() in ['nan', 'none']: rub_name = "General"
                    
                    cat = cache_cat.get(rub_name.lower())
                    if not cat:
                        cat = Category(id=generate_uuid(), name=rub_name, active=True)
                        db.add(cat); db.flush()
                        cache_cat[rub_name.lower()] = cat

                    # Subrubro (SubCategory)
                    sub_name = str(row[cols["subrubro"]]).strip() if cols["subrubro"] and pd.notna(row[cols["subrubro"]]) else "Sin Subrubro"
                    if not sub_name or sub_name.lower() in ['nan', 'none']: sub_name = "Sin Subrubro"
                    
                    subcat = cache_subcat.get((cat.id, sub_name.lower()))
                    if not subcat:
                        subcat = SubCategory(id=generate_uuid(), name=sub_name, category_id=cat.id, active=True)
                        db.add(subcat); db.flush()
                        cache_subcat[(cat.id, sub_name.lower())] = subcat

                    # IVA (TaxType)
                    iva_rate = 0.21
                    if cols["iva"] and pd.notna(row[cols["iva"]]):
                        try:
                            v = str(row[cols["iva"]]).replace('%', '').replace(',', '.').strip()
                            n = float(v)
                            iva_rate = n / 100 if n > 1 else n
                        except: pass
                    
                    tax = cache_tax.get(iva_rate)
                    if not tax:
                        tax = TaxType(id=generate_uuid(), name=f"{int(iva_rate*100)}%", rate=iva_rate, active=True)
                        db.add(tax); db.flush()
                        cache_tax[iva_rate] = tax

                    # Unidad (Unit)
                    unit_n = str(row[cols["medida"]]).strip() if cols["medida"] and pd.notna(row[cols["medida"]]) else "Unidad"
                    if not unit_n or unit_n.lower() in ['nan', 'none']: unit_n = "Unidad"
                    unit = cache_unit.get(unit_n.lower())
                    if not unit:
                        unit = Unit(id=generate_uuid(), name=unit_n, short_name=unit_n[:2].upper())
                        db.add(unit); db.flush()
                        cache_unit[unit_n.lower()] = unit

                    # Envase (Container)
                    cont_n = str(row[cols["contenedor"]]).strip() if cols["contenedor"] and pd.notna(row[cols["contenedor"]]) else "Default"
                    if not cont_n or cont_n.lower() in ['nan', 'none']: cont_n = "Default"
                    cont = cache_cont.get(cont_n.lower())
                    if not cont:
                        cont = Container(id=generate_uuid(), name=cont_n, capacity=1.0, unit_id=unit.id)
                        db.add(cont); db.flush()
                        cache_cont[cont_n.lower()] = cont

                    # Cuentas Contables
                    def get_acc(prefix, acc_type, manual=None):
                        code = str(manual).strip() if pd.notna(manual) and str(manual).strip() not in ['', 'nan', 'None'] else f"{prefix}.{hashlib.md5(cat.name.encode()).hexdigest()[:4]}"
                        acc = cache_acc.get(code)
                        if not acc:
                            acc = Account(id=generate_uuid(), code=code, name=f"{acc_type} - {cat.name}", active=True)
                            db.add(acc); db.flush()
                            cache_acc[code] = acc
                        return acc.code

                    s_acc = get_acc("4.1.1", "Ventas", row[cols["cta_venta"]] if cols["cta_venta"] else None)
                    p_acc = get_acc("2.1.1", "Compras", row[cols["cta_compra"]] if cols["cta_compra"] else None)
                    st_acc = get_acc("1.1.5", "Stock")

                    # SKU
                    sku = f"{''.join([w[0] for w in rub_name.split() if w])[:3].upper()}-{hashlib.md5(product_name.encode()).hexdigest()[:4].upper()}"

                    # Evitar duplicados en el mismo subrubro
                    existing = db.query(Product).filter(Product.name.ilike(product_name), Product.subcategory_id == subcat.id).first()
                    if not existing:
                        try:
                            cap_val = str(row[cols["cantidad_contenedor"]]).strip() if cols["cantidad_contenedor"] else "1"
                            capacity = float(cap_val) if cap_val not in ['', 'nan', 'None'] else 1.0
                        except: capacity = 1.0

                        prod = Product(
                            id=generate_uuid(), name=product_name, sku=sku, subcategory_id=subcat.id,
                            container_id=cont.id, quantity_per_container=capacity, tax_type_id=tax.id,
                            sales_account_code=s_acc, purchase_account_code=p_acc, stock_account_code=st_acc,
                            active=True
                        )
                        db.add(prod)
                        stats["created"] += 1
                except Exception as e:
                    stats["errors"].append(f"Hoja {sheet_name}, Fila {idx + 1}: {str(e)}")

        db.commit()
        print(f"--- FIN: {stats['created']} productos creados ---")
        return {"message": "Importación finalizada", "stats": stats}

    except Exception as e:
        db.rollback()
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error crítico: {str(e)}")
