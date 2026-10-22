from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db import models
from app.modules.purchases import purchase_invoice_schemas
from datetime import datetime
import os
import shutil
import uuid
import re
from app.db.models.commercial_models import Account, generate_uuid
from app.modules.auth.auth_router import check_permission

router = APIRouter(prefix="/purchase-invoices", tags=["Purchase Invoices"])

@router.post("/process")
async def process_invoice_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Recibe un archivo (PDF/Imagen), lo procesa con pypdf y extrae datos básicos.
    """
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in [".pdf", ".jpg", ".jpeg", ".png"]:
        raise HTTPException(status_code=400, detail="Formato de archivo no soportado. Use PDF o imágenes.")

    # Guardar archivo temporalmente
    upload_dir = "uploads/invoices"
    os.makedirs(upload_dir, exist_ok=True)
    file_id = str(uuid.uuid4())
    file_path = os.path.join(upload_dir, f"{file_id}{file_ext}")
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # 1. Intentar con IA "Definitiva" (Gemini)
    from app.modules.purchases import invoice_ai_service
    ai_data = invoice_ai_service.process_invoice_with_gemini(file_path)
    
    # helper de matching
    from app.db import commercial_models
    def find_best_product(desc, db):
        """
        Busca el producto que mejor coincide con la descripción.
        Devuelve: (mejor_producto, score, candidatos, razon)
        """
        desc_upper = desc.upper()
        # Limpiar descripción: quitar códigos como "0000563" para mejor matching
        clean_desc = re.sub(r'\b\d{7}\b', '', desc_upper)
        clean_desc = re.sub(r'-\s*\d+\s*$', '', clean_desc)
        
        words = [w for w in clean_desc.split() if len(w) > 2]
        if not words: 
            return None, 0.0, [], "Sin palabras clave"
        
        query = db.query(commercial_models.Product).filter(commercial_models.Product.active == True)
        candidates = []
        
        # Buscar por cada palabra clave
        for word in words[:5]:
            query_res = query.filter(
                (commercial_models.Product.name.ilike(f"%{word}%")) |
                (commercial_models.Product.sku.ilike(f"%{word}%"))
            ).all()
            candidates.extend(query_res)
        
        # También buscar por código de producto si parece un código
        code_match = re.search(r'(\d{7})', desc)
        if code_match:
            product_code = code_match.group(1)
            code_res = query.filter(commercial_models.Product.sku.ilike(f"%{product_code}%")).all()
            candidates.extend(code_res)
        
        if not candidates: 
            return None, 0.0, [], "No se encontró coincidencia en catálogo"
        
        # Eliminar duplicados
        unique_candidates = list(set(candidates))
        
        # Ranking por coincidencia de palabras
        scored = []
        for p in unique_candidates:
            p_name = p.name.upper()
            p_sku = (p.sku or "").upper()
            
            word_matches = sum(1 for w in words if w in p_name)
            code_bonus = 0.3 if code_match and code_match.group(1) in p_sku else 0
            
            word_score = min(word_matches / max(len(words), 1), 1.0)
            total_score = min(word_score + code_bonus, 1.0)
            scored.append((total_score, p))
        
        scored.sort(key=lambda x: x[0], reverse=True)
        best = scored[0]
        top_candidates = [p for _, p in scored[:5]]
        
        if best[0] > 0.5:
            razon = f"Coincidencia fuerte ({int(best[0]*100)}%)"
            return best[1], best[0], top_candidates, razon
        else: 
            razon = f"Baja confianza ({int(best[0]*100)}%) - elija manualmente"
            return None, best[0], top_candidates, razon

    if ai_data:
        # Normalizar y devolver
        ai_data["document_type"] = "purchase_invoice"
        if "warnings" not in ai_data: ai_data["warnings"] = ["Procesado con Inteligencia Artificial."]
        for item in ai_data.get("items", []):
            prod, score, candidates, reason = find_best_product(item["raw_description"], db)
            
            # Siempre devolver candidatos para que el usuario pueda elegir
            # NO auto-matchear automáticamente aunque haya alta confianza
            # El usuario debe confirmar el producto
            item["matched_product_id"] = prod.id if prod else None
            item["matched_product_name"] = prod.name if prod else None
            item["match_confidence"] = score
            item["match_reason"] = reason
            item["candidate_products"] = [
                {
                    "id": c.id, 
                    "name": c.name, 
                    "sku": getattr(c, 'sku', None),
                    "container_capacity": c.container.capacity if c.container else None,
                    "container_unit": c.container.unit.short_name if c.container and c.container.unit else None,
                    "quantity_per_container": getattr(c, 'quantity_per_container', None)
                }
                for c in candidates
            ]
            # Siempre requiere revisión para confirmar producto
            item["needs_review"] = True
        return ai_data

    # Fallback: extracción por regex
    extracted_text = ""
    pdf_error = None
    if file_ext == ".pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            for page in reader.pages:
                extracted_text += page.extract_text() + "\n"
        except Exception as e:
            msg = f"Error al leer PDF: {str(e)}"
            print(msg)
            pdf_error = msg

    # --- Lógica de Extracción Ultra-Robusta (Fallback) ---
    clean_text = extracted_text.replace("\r", "")
    lines = [l.strip() for l in clean_text.split("\n") if l.strip()]
    upper_text = clean_text.upper()
    
    # 1. Buscar CUITs (sólo prefijos válidos 20, 23, 24, 27, 30, 33)
    cuits = re.findall(r"\b(20|23|24|27|30|33)[-]?(\d{8})[-]?(\d{1})\b", clean_text)
    my_cuit = "30717400212"
    supplier_cuit = None
    for c_tuple in cuits:
        c = f"{c_tuple[0]}-{c_tuple[1]}-{c_tuple[2]}"
        numeric_c = c.replace("-", "")
        if numeric_c != my_cuit:
            supplier_cuit = c
            break

    # 2. Factura - buscar más específicamente después de "Factura" o "Comprobante"
    pv = "0001"
    num = "00000000"
    
    invoice_context_patterns = [
        r"(?:Factura|Factura\s+A|COMPROBANTE|Comprobante)[\s:]*000[1-5][-\s](\d{8})",
        r"(?:Factura|Factura\s+A|COMPROBANTE)[\s:]*(\d{4})[-\s](\d{8})",
        r"N[°]?\s*(?:de\s+)?(?:Factura|Comprobante)[\s:]*(\d{4})[-\s](\d{8})",
    ]
    
    for pattern in invoice_context_patterns:
        doc_match = re.search(pattern, clean_text, re.IGNORECASE)
        if doc_match:
            groups = doc_match.groups()
            if len(groups) == 1:
                num = groups[0]
            else:
                pv = groups[0]
                num = groups[1]
            break
    
    # Si no encontró con contexto, buscar el patrón general
    if num == "00000000":
        all_invoice_nums = re.findall(r"\b(\d{4})[-\s](\d{8})\b", clean_text)
        if all_invoice_nums:
            pv, num = all_invoice_nums[-1]

    # 3. Fecha - buscar la más cercana a palabras clave de factura/comprobante
    date_matches = []
    
    # Buscar fechas con contexto específico de factura/comprobante
    fecha_factura_contexts = re.finditer(
        r"(?:Fecha\s+de\s+(?:factura|comprobante)|Fecha\s+(?:factura|comprobante)|(?:Factura|Comprobante).*?Fecha)[:\s]+(\d{2}/\d{2}/\d{4})", 
        clean_text, re.IGNORECASE
    )
    for m in fecha_factura_contexts:
        date_matches.append(m.group(1))
    
    # Si no encuentra con contexto, buscar todas las fechas pero priorizar las recientes
    if not date_matches:
        all_dates = re.findall(r"\b(\d{2}/\d{2}/\d{4})\b", clean_text)
        for d in all_dates:
            try:
                parsed = datetime.strptime(d, "%d/%m/%Y")
                if parsed.year >= 2025:  # Aceptar fechas de 2025-2026
                    date_matches.append(d)
            except: pass
        if not date_matches:
            date_matches = all_dates
    
    doc_date = datetime.utcnow().strftime("%Y-%m-%d")
    if date_matches:
        try:
            doc_date = datetime.strptime(date_matches[0], "%d/%m/%Y").strftime("%Y-%m-%d")
        except: pass

    # 4. TOTAL
    currency = "ARS"
    total_val = 0.0
    usd_total_match = re.search(r"U\$S\s*([\d\.,]+)", clean_text)
    ars_total_match = re.search(r"(?:TOTAL|Total)\s*[\$:]\s*([\d\.,]+)", clean_text)
    
    if usd_total_match:
        currency = "USD"
        val = usd_total_match.group(1).replace(".", "").replace(",", ".")
        try: total_val = float(val)
        except: pass
    elif ars_total_match:
        currency = "ARS"
        val = ars_total_match.group(1).replace(".", "").replace(",", ".")
        try: total_val = float(val)
        except: pass
    else:
        money_pattern = re.compile(r"(\d{1,3}(?:\.\d{3})*(?:,\d{2}))|(\d+(?:\.\d{2}))")
        all_money_matches = []
        for m in money_pattern.findall(clean_text):
            val = m[0] or m[1]
            try:
                v_float = float(val.replace(".", "").replace(",", ".")) if m[0] else float(val)
                all_money_matches.append(v_float)
            except: pass
        total_val = max(all_money_matches) if all_money_matches else 0.0

    # 5. Proveedor
    supplier_name = "Proveedor Desconocido"
    if "DELTA" in upper_text: supplier_name = "DELTA AGROINSUMOS S.A."
    elif "QUIMICA OESTE" in upper_text: supplier_name = "QUIMICA OESTE S.A."
    elif supplier_cuit:
        clean_c_find = supplier_cuit.replace("-", "")
        db_s = db.query(models.Entity).filter(models.Entity.tax_id.like(f"%{clean_c_find}%")).first()
        if db_s: supplier_name = db_s.name

    if "U$S" in clean_text or "DOLARIZADA" in upper_text:
        currency = "USD"

    # 6. Moneda / TC
    exchange_rate = 1.0
    tc_match = re.search(r"(?:COTIZACI[OÓ]N|TC|T\.C\.)\s*[:\s]*([\d\.,]+)", upper_text)
    if tc_match:
        try: exchange_rate = float(tc_match.group(1).replace(".", "").replace(",", "."))
        except: pass

    # 7. Items
    items = []
    seen_items = set()
    line_no = 1
    for line in lines:
        item_m = re.search(r"^(.*?)\s+(\d+[\.,]\d*)\s+(LTS|KG|UNID|TN|L)\s+.*?([0-9\.,]+)\s*$", line)
        if item_m:
            raw_desc = item_m.group(1).strip()
            qty = float(item_m.group(2).replace(",", "."))
            subt_str = item_m.group(4)
            try:
                subt = float(subt_str.replace(".", "").replace(",", "."))
            except: subt = 0.0

            if (raw_desc, subt) not in seen_items:
                seen_items.add((raw_desc, subt))
                
                # Intentar matchear producto
                prod, score, candidates, reason = find_best_product(raw_desc, db)
                
                items.append({
                    "line_no": line_no,
                    "raw_description": raw_desc,
                    "quantity": qty,
                    "unit": item_m.group(3),
                    "unit_price": round(subt / qty, 4) if qty > 0 else 0,
                    "line_subtotal": subt,
                    "vat_rate": 0.21,
                    "matched_product_id": prod.id if prod else None,
                    "matched_product_name": prod.name if prod else None,
                    "match_confidence": score,
                    "match_reason": reason,
                    "candidate_products": [
                        {
                            "id": c.id, 
                            "name": c.name, 
                            "sku": getattr(c, 'sku', None),
                            "container_capacity": c.container.capacity if c.container else None,
                            "container_unit": c.container.unit.short_name if c.container and c.container.unit else None,
                            "quantity_per_container": getattr(c, 'quantity_per_container', None)
                        }
                        for c in candidates
                    ] if candidates else [],
                    "needs_review": True
                })
                line_no += 1

    if not items:
        items.append({
            "line_no": 1,
            "raw_description": "Concepto General (Ver PDF)",
            "quantity": 1.0, "unit": "UNID",
            "unit_price": total_val, "line_subtotal": total_val,
            "vat_rate": 0.21, "match_confidence": 0.0,
            "match_reason": "Extraído por fallback heurístico",
            "needs_review": True,
            "candidate_products": []
        })

    warns = ["IA de Google no disponible. Usando motor básico (verificar montos)."]
    if pdf_error:
        warns.append(pdf_error)

    mock_data = {
        "document_type": "purchase_invoice",
        "supplier": {"name": supplier_name, "cuit": supplier_cuit, "iva_condition": "Responsable Inscripto"},
        "invoice": {
            "invoice_type": "A", "point_of_sale": pv, "invoice_number": num, "invoice_date": doc_date,
            "currency": currency, "exchange_rate": exchange_rate,
            "totals": {"net": round(total_val / 1.21, 2), "vat_21": round(total_val - (total_val / 1.21), 2), "total": total_val}
        },
        "items": items,
        "warnings": warns
    }
    
    return mock_data


@router.post("/load", dependencies=[Depends(check_permission("purchase_invoices", "create"))])
def load_purchase_invoice(data: purchase_invoice_schemas.AIPurchaseInvoiceLoader, db: Session = Depends(get_db)):
    """
    Toma el JSON generado por la IA y crea la factura de compra (Document).
    Si el proveedor no existe por CUIT, intenta buscarlo por nombre o falla para revisión.
    """
    
    try:
        # 1. Buscar proveedor
        entity = None
        if data.supplier.cuit:
            clean_cuit = data.supplier.cuit.replace("-", "")
            entity = db.query(models.Entity).filter(models.Entity.tax_id.like(f"%{clean_cuit}%")).first()

        if not entity and data.supplier.name:
            entity = db.query(models.Entity).filter(models.Entity.name.ilike(f"%{data.supplier.name}%")).first()

        if not entity:
            raise HTTPException(status_code=400, detail=f"Proveedor no encontrado: {data.supplier.name} ({data.supplier.cuit})")

        # 2. Preparar cabecera de documento
        # El punto de venta puede ser escrito por el usuario, no está fijo
        pv = data.invoice.point_of_sale
        if pv:
            pv = pv.zfill(4) if len(pv) < 4 else pv[:4]
        else:
            pv = "0001"  # Default si no se especifica
        num = data.invoice.invoice_number or "00000000"
        full_number = f"{pv.zfill(4)}-{num.zfill(8)}"
        
        # Fecha
        try:
            doc_date = datetime.strptime(data.invoice.invoice_date, "%Y-%m-%d") if data.invoice.invoice_date else datetime.utcnow()
        except Exception:
            doc_date = datetime.utcnow()

        total_amount = data.invoice.totals.total if data.invoice.totals else 0.0
        exchange_rate = data.invoice.exchange_rate or 1.0
        currency = models.CurrencyType.USD if data.invoice.currency == "USD" else models.CurrencyType.ARS
        
        total_amount_ars = total_amount * exchange_rate if currency == models.CurrencyType.USD else total_amount

        # Exigir habilitación operativa para productos importados.
        from app.modules.inventory.product_operational import require_operational_product

        for item in data.items:
            if item.matched_product_id:
                require_operational_product(db, item.matched_product_id)

        # FASE4_DUPLICATE_PURCHASE_INVOICE_GUARD
        # Impedir duplicar el mismo comprobante del proveedor.
        duplicate = db.query(models.Document).filter(
            models.Document.entity_id == entity.id,
            models.Document.doc_type == models.DocumentType.PURCHASE_INVOICE,
            models.Document.number == full_number,
        ).first()

        if duplicate:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Ya existe la factura de compra {full_number} "
                    f"para este proveedor (ID: {duplicate.id})"
                ),
            )

        db_doc = models.Document(
            entity_id=entity.id,
            doc_type=models.DocumentType.PURCHASE_INVOICE,
            number=full_number,
            date=doc_date,
            currency=currency,
        exchange_rate=exchange_rate,
            total_amount=total_amount,
            total_amount_ars=total_amount_ars,
            status=models.DocumentStatus.OPEN
        )
        db.add(db_doc)
        db.flush()

        # FASE4C_ACCOUNTING_INTEGRATION
        from app.modules.accounting.document_guards import require_accounting

        # FASE4G_RECEIPT_INVOICE_LINK
        from decimal import Decimal
        from app.db.models.commercial_models import (
            PurchaseOrder, PurchaseOrderLine,
            DeliveryNote, DeliveryNoteLine,
            InvoiceDeliveryNoteLink
        )

        linked_orders = set()
        linked_notes = set()
        pending_order_qty = {}
        pending_note_qty = {}

        def qty_decimal(value):
            return Decimal(str(value or 0))

        # 3. Crear líneas
        from app.db.models.commercial_models import PurchaseOrderLine, OrderStatus
        from app.modules.sales.sales_utils import recalc_purchase_order_status
        
        for item in data.items:
            vat_rate = item.vat_rate if item.vat_rate is not None else 0.21
            net = item.line_subtotal if item.line_subtotal is not None else 0.0
            vat_amount = round(net * vat_rate, 2)
            
            qty = item.quantity or 1.0
            unit = item.unit or "UNID"
            
            account_code = None
            product = None
            source_oc_line_id = None

            # Conciliar únicamente referencias explícitas.
            source_dn_line_id = item.source_dn_line_id
            source_oc_line_id = item.source_purchase_line_id

            if bool(source_dn_line_id) != bool(source_oc_line_id):
                raise HTTPException(
                    400,
                    "Para facturar una recepción se requieren "
                    "la línea de OC y la línea de remito"
                )

            if source_dn_line_id:
                if not item.matched_product_id:
                    raise HTTPException(
                        400, "La línea vinculada requiere producto identificado"
                    )

                oc_line = db.get(PurchaseOrderLine, source_oc_line_id)
                dn_line = db.get(DeliveryNoteLine, source_dn_line_id)

                if not oc_line or not dn_line:
                    raise HTTPException(
                        400, "Línea de OC o remito inexistente"
                    )

                order = db.get(PurchaseOrder, oc_line.order_id)
                note = db.get(DeliveryNote, dn_line.delivery_note_id)

                if not order or not note:
                    raise HTTPException(
                        400, "Orden o remito inexistente"
                    )

                if (
                    str(order.entity_id) != str(entity.id)
                    or str(note.entity_id) != str(entity.id)
                ):
                    raise HTTPException(
                        400, "Proveedor distinto al de la factura"
                    )

                if (
                    str(note.purchase_order_id) != str(order.id)
                    or str(dn_line.source_purchase_line_id) != str(oc_line.id)
                ):
                    raise HTTPException(
                        400, "El remito no corresponde a la línea de OC"
                    )

                if (
                    str(oc_line.product_id) != str(item.matched_product_id)
                    or str(dn_line.product_id) != str(item.matched_product_id)
                ):
                    raise HTTPException(
                        400, "Producto distinto al recibido"
                    )

                if (
                    getattr(note.note_type, "value", note.note_type) != "PURCHASE"
                    or getattr(note.status, "value", note.status)
                    not in ("DISPATCHED", "PARTIAL", "INVOICED")
                ):
                    raise HTTPException(
                        400, "El remito no está habilitado para facturación"
                    )

                # FASE4G5_UNIT_VALIDATION
                product_stock = db.get(
                    models.Product, item.matched_product_id
                )
                if not product_stock:
                    raise HTTPException(
                        400, "Producto de stock inexistente"
                    )

                stock_unit = (
                    product_stock.unit_of_measure or ""
                ).strip().upper()

                invoice_unit = (
                    item.unit or ""
                ).strip().upper()

                aliases = {
                    "L": "LT", "LTS": "LT", "LITRO": "LT",
                    "LITROS": "LT",
                    "KGS": "KG", "KILO": "KG",
                    "KILOS": "KG", "KILOGRAMO": "KG",
                    "KILOGRAMOS": "KG",
                    "UNIDAD": "UN", "UNIDADES": "UN",
                    "UNID": "UN", "UND": "UN",
                }

                stock_unit = aliases.get(stock_unit, stock_unit)
                invoice_unit = aliases.get(invoice_unit, invoice_unit)

                commercial_qty = qty_decimal(item.quantity)
                if commercial_qty <= 0:
                    raise HTTPException(
                        400, "Cantidad comercial inválida"
                    )

                if item.stock_quantity is not None:
                    requested = qty_decimal(item.stock_quantity)
                elif stock_unit and invoice_unit == stock_unit:
                    requested = commercial_qty
                else:
                    raise HTTPException(
                        400,
                        "La unidad de la factura no coincide con "
                        "la unidad de stock. Indicar stock_quantity "
                        "para conciliar la presentación."
                    )

                if requested <= 0:
                    raise HTTPException(
                        400, "Cantidad de stock inválida"
                    )

                # La equivalencia explícita se contrasta con
                # el contenido del envase cuando corresponde.
                if item.stock_quantity is not None:
                    presentation_unit = invoice_unit in (
                        "BIDON", "BIDONES",
                        "BOLSA", "BOLSAS",
                        "CAJA", "CAJAS",
                        "ENVASE", "ENVASES",
                    )
                    if presentation_unit:
                        factor = qty_decimal(
                            product_stock.quantity_per_container
                        )
                        if factor <= 0:
                            raise HTTPException(
                                400, "Presentación sin factor válido"
                            )
                        expected = commercial_qty * factor
                        if abs(requested - expected) > Decimal("0.0001"):
                            raise HTTPException(
                                400,
                                "stock_quantity no coincide con "
                                "la cantidad por envase del producto"
                            )

                # Cantidades expresadas en la misma unidad de stock.
                # No convertir envases automáticamente.
                note_used = pending_note_qty.get(dn_line.id, Decimal(0))
                order_used = pending_order_qty.get(oc_line.id, Decimal(0))

                note_available = (
                    qty_decimal(dn_line.qty)
                    - qty_decimal(dn_line.qty_invoiced)
                    - note_used
                )
                order_available = (
                    qty_decimal(oc_line.qty_received)
                    - qty_decimal(oc_line.qty_invoiced)
                    - order_used
                )

                if requested > note_available or requested > order_available:
                    raise HTTPException(
                        400,
                        "Cantidad superior al saldo recibido "
                        "y pendiente de facturar"
                    )

                pending_note_qty[dn_line.id] = note_used + requested
                pending_order_qty[oc_line.id] = order_used + requested
                linked_orders.add(order.id)
                linked_notes.add(note.id)


            
            if item.matched_product_id:
                product = db.query(models.Product).filter(models.Product.id == item.matched_product_id).first()
                if product:
                    account_code = None
                    if product.purchase_account_id:
                        purchase_account = db.get(
                            Account, product.purchase_account_id
                        )
                        if purchase_account and purchase_account.active:
                            account_code = purchase_account.code
                    # Si el producto tiene un tamaño de envase, usar esto para calcular cantidad en envases
                    # Conservar la cantidad y unidad originales del comprobante.
                    # La conversión a unidades de stock requiere conciliación explícita.
                    
                    # Vinculación automática con OC suspendida:
                    # no modificar qty_invoiced sin verificar unidades y saldo.

            def _infer_account_code_purchase(description: str, db: Session) -> str:
                txt = (description or "").lower()
                mapping = {
                    "combustible": "2.FUEL",
                    "nafta": "2.FUEL",
                    "gasolina": "2.FUEL",
                    "estacion": "2.FUEL",
                    "comida": "2.MEALS",
                    "almuerzo": "2.MEALS",
                    "servicio": "2.SERVICES",
                    "honorario": "2.SERVICES",
                    "ticket": "2.TICKET",
                }
                for k, code in mapping.items():
                    if k in txt:
                        acc = db.query(Account).filter(Account.code == code).first()
                        if not acc:
                            acc = Account(id=generate_uuid(), code=code, name=code, active=True)
                            db.add(acc); db.flush()
                        return acc.code
                gen_code = "2.OTHER"
                acc = db.query(Account).filter(Account.code == gen_code).first()
                if not acc:
                    acc = Account(id=generate_uuid(), code=gen_code, name="Compras Varios", active=True)
                    db.add(acc); db.flush()
                return acc.code

            if not account_code:
                account_code = _infer_account_code_purchase(item.raw_description, db)

            account = db.query(Account).filter(
                Account.code == account_code,
                Account.active.is_(True)
            ).first()
            if not account:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cuenta contable inexistente o inactiva: {account_code}"
                )

            db_line = models.DocumentLine(
                document_id=db_doc.id,
                product_id=item.matched_product_id,
                source_purchase_line_id=source_oc_line_id,
                source_dn_line_id=source_dn_line_id,
                description=item.raw_description,
                qty=qty,
                unit_price=item.unit_price or 0.0,
                net_amount=net,
                vat_rate=vat_rate,
                vat_amount=vat_amount,
                total_amount=round(net + vat_amount, 2),
                line_order=item.line_no,
                accounting_account_id=account.id
            )
            db.add(db_line)

        # Actualizar los saldos de las recepciones facturadas.
        for line_id, amount in pending_note_qty.items():
            line = db.get(DeliveryNoteLine, line_id)
            line.qty_invoiced = (
                qty_decimal(line.qty_invoiced) + amount
            )

        for line_id, amount in pending_order_qty.items():
            line = db.get(PurchaseOrderLine, line_id)
            line.qty_invoiced = (
                qty_decimal(line.qty_invoiced) + amount
            )

        for note_id in linked_notes:
            db.add(InvoiceDeliveryNoteLink(
                id=generate_uuid(),
                document_id=db_doc.id,
                delivery_note_id=note_id,
            ))

        # Comprobar importes antes de registrar deuda y asiento.
        from decimal import Decimal, ROUND_HALF_UP

        def money(value):
            return Decimal(str(value or 0)).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )

        db.flush()
        total_lines = sum(
            (money(line.total_amount) for line in db_doc.lines),
            Decimal("0.00")
        )
        if abs(total_lines - money(db_doc.total_amount)) > Decimal("0.01"):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Total de líneas ({total_lines}) distinto del "
                    f"total de factura ({money(db_doc.total_amount)})"
                )
            )

        require_accounting(db, db_doc)
        db.commit()
        db.refresh(db_doc)
        
        return {
            "ok": True, 
            "document_id": db_doc.id, 
            "number": db_doc.number,
            "warnings": data.warnings
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{document_id}", dependencies=[Depends(check_permission("purchase_invoices", "delete"))])
def delete_purchase_invoice(document_id: str, db: Session = Depends(get_db)):
    """
    Elimina una factura de compra.
    Utiliza la lógica centralizada de document_router para asegurar integridad.
    """
    from app.modules.accounting.document_router import delete_document
    return delete_document(document_id, db)
