from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import text
import pandas as pd
import io
from typing import List, Optional
from app.db.session import get_db
from app.db.models.models import Entity, EntityType, generate_uuid

router = APIRouter(prefix="/entities/import", tags=["Import Entities"])

@router.post("/")
async def import_entities(reset: bool = False, file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="El archivo debe ser un Excel (.xlsx o .xls)")

    if reset:
        try:
            db.execute(text("DELETE FROM entities"))
            db.commit()
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Error resetting entities: {str(e)}")

    try:
        contents = await file.read()
        excel_file = io.BytesIO(contents)
        # Read without header first to detect it
        xl_dict = pd.read_excel(excel_file, sheet_name=None, header=None)
        
        stats = {"created": 0, "updated": 0, "merged": 0, "errors": []}
        
        def clean_tax_id(val):
            if pd.isna(val): return None
            # Keep only digits and hyphens (to clean)
            raw = "".join(filter(str.isdigit, str(val)))
            if not raw: return None
            # Format as XX-XXXXXXXX-X if 11 digits
            if len(raw) == 11:
                return f"{raw[:2]}-{raw[2:10]}-{raw[10:]}"
            return raw

        def _get_next_code(db: Session, type_enum: EntityType) -> str:
            prefix = "C" if type_enum == EntityType.CLIENT else "P"
            if type_enum == EntityType.MIXED: prefix = "M"
            
            # Find last code with this prefix
            last = db.query(Entity).filter(Entity.code.like(f"{prefix}-%")).order_by(Entity.code.desc()).first()
            if not last: return f"{prefix}-0001"
            try:
                parts = last.code.split('-')
                if len(parts) >= 2:
                    # Increment last numeric part
                    num_str = "".join(filter(str.isdigit, parts[-1]))
                    next_num = int(num_str) + 1
                    return f"{prefix}-{str(next_num).zfill(4)}"
            except: pass
            return f"{prefix}-0001"

        def infer_tax_category(tax_id, current_val=None):
            if current_val and pd.notna(current_val):
                v = str(current_val).strip().upper().replace(" ", "_")
                if v not in ["NAN", "NONE", "", "-"]: return v
            
            if not tax_id: return None
            # Extract prefix (handles both XX-XXXXXXXX-X and XXXXXXXXXXX)
            raw = "".join(filter(str.isdigit, str(tax_id)))
            if not raw: return None
            prefix = raw[:2]
            if prefix in ["30", "33"]: return "RESPONSABLE_INSCRIPTO"
            if prefix in ["20", "27", "23", "24"]: return "MONOTRIBUTO"
            return None
        
        column_map = {
            "name": ["razón social", "nombre", "cliente", "proveedor", "name", "nombre/razon social", "entidad", "descripcion", "detalle"],
            "tax_id": ["cuit", "tax_id", "identificación", "doc", "documento", "cuit/cuil", "nro doc", "c.u.i.t.", "nro. doc."],
            "tax_category": ["iva", "condición iva", "iva_rate", "tax_category", "condicion iva", "categoría", "sit. iva", "situación iva"],
            "email": ["email", "correo", "e-mail", "mail", "casilla"],
            "phone": ["telefono", "teléfono", "celular", "phone", "cel", "tel", "movil"],
            "address": ["direccion", "dirección", "address", "calle", "domicilio"],
            "city": ["localidad", "ciudad", "city", "pueblo", "loc"],
            "state": ["provincia", "estado", "state", "prov"],
            "zip_code": ["cp", "c.p.", "zip_code", "codigo postal", "código postal"],
            "notes": ["notas", "observaciones", "comentarios", "notes", "obs"]
        }

        # Determine default type from filename
        file_hint = file.filename.lower()
        default_type = EntityType.CLIENT
        if any(kw in file_hint for kw in ["prov", "compra", "supplier", "vendor"]):
            default_type = EntityType.PROVIDER

        for sheet_name, df_raw in xl_dict.items():
            # 1. Detect Header Row
            header_row_index = 0
            keywords = ["nombre", "razon", "cuit", "iva", "entidad", "razón"]
            for i, row in df_raw.iterrows():
                row_str_vals = [str(val).lower() for val in row.values if pd.notna(val)]
                if any(any(kw in val for kw in keywords) for val in row_str_vals):
                    header_row_index = i
                    break
            
            # Re-process DF with detected header
            df = df_raw.iloc[header_row_index:].copy()
            
            # Deduplicate column names to avoid "Truth value of a Series is ambiguous"
            raw_cols = [str(c).strip().lower() for c in df.iloc[0]]
            new_cols = []
            seen = {}
            for c in raw_cols:
                if c in seen:
                    seen[c] += 1
                    new_cols.append(f"{c}_{seen[c]}")
                else:
                    seen[c] = 0
                    new_cols.append(c)
            
            df.columns = new_cols
            df = df.iloc[1:] # Skip header row

            # Map columns
            mapped_cols = {}
            for target, aliases in column_map.items():
                for col in df.columns:
                    if col in aliases:
                        mapped_cols[target] = col
                        break
            
            if "name" not in mapped_cols:
                # Fallback to first column if no name found
                if len(df.columns) > 0: mapped_cols["name"] = df.columns[0]
                else: continue

            # Determine type of sheet
            sheet_hint = sheet_name.lower()
            current_type = default_type
            if any(kw in sheet_hint for kw in ["prov", "compra", "supplier", "vendor"]):
                current_type = EntityType.PROVIDER
            elif any(kw in sheet_hint for kw in ["clie", "venta", "customer"]):
                current_type = EntityType.CLIENT

            for idx, row in df.iterrows():
                try:
                    name_raw = row[mapped_cols["name"]]
                    name = str(name_raw).strip().upper() if pd.notna(name_raw) else ""
                    
                    # More strict validation for names to avoid importing junk
                    if not name or name in ["NAN", "NONE", "", "-", "NOMBRE", "RAZÓN SOCIAL", "CÓDIGO"]: 
                        continue
                    
                    # If name is purely numeric and short, it's likely an ID misidentified as name
                    if name.isdigit() and len(name) < 5:
                        continue

                    tax_id = clean_tax_id(row[mapped_cols.get("tax_id")]) if "tax_id" in mapped_cols else None
                    
                    existing = None
                    if tax_id:
                        existing = db.query(Entity).filter(Entity.tax_id == tax_id).first()
                    if not existing:
                        existing = db.query(Entity).filter(Entity.name == name).first()
                    if not existing:
                        existing = db.query(Entity).filter(Entity.name.ilike(name)).first()

                    if existing:
                        if existing.type != current_type and existing.type != EntityType.MIXED:
                            existing.type = EntityType.MIXED
                            stats["merged"] += 1
                        
                        for field in ["email", "phone", "address", "city", "state", "zip_code", "notes", "tax_category"]:
                            col = mapped_cols.get(field)
                            val = str(row[col]).strip() if col and pd.notna(row[col]) else None
                            
                            if field == "tax_category":
                                val = infer_tax_category(tax_id, val)

                            if val and val.lower() not in ["nan", "none"]: 
                                if not getattr(existing, field):
                                    setattr(existing, field, val)
                        stats["updated"] += 1
                    else:
                        new_entity = Entity(
                            id=generate_uuid(),
                            name=name,
                            type=current_type,
                            code=_get_next_code(db, current_type),
                            tax_id=tax_id
                        )
                        for field in ["email", "phone", "address", "city", "state", "zip_code", "notes", "tax_category"]:
                            col = mapped_cols.get(field)
                            val = str(row[col]).strip() if col and pd.notna(row[col]) else None

                            if field == "tax_category":
                                val = infer_tax_category(tax_id, val)

                            if val and val.lower() not in ["nan", "none"]:
                                setattr(new_entity, field, val)
                        
                        db.add(new_entity)
                        db.flush()
                        stats["created"] += 1

                except Exception as e:
                    stats["errors"].append(f"Hoja {sheet_name}, Fila {idx + 2}: {str(e)}")

        db.commit()
        return {"message": "Sincronización finalizada", "stats": stats}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
