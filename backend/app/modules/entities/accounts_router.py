"""
Endpoint /accounts/{entity_id}/ledger — Cuenta Corriente de Entidad

Construye un estado de cuenta cronológico con saldos acumulados en ARS y USD,
consumido por StatementPage.jsx en el frontend.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime

from app.db.session import get_db
from app.db.models.models import (
    Document, DocumentType, DocumentStatus, Application, Entity, 
    CurrencyType, DocumentLine
)
from app.db.models.commercial_models import (
    DeliveryNote, DeliveryNoteStatus, OrderType, SaleCondition,
    InvoiceDeliveryNoteLink
)

accounts_router = APIRouter(prefix="/accounts", tags=["accounts"])

# Clasificación de documentos según impacto en Cuenta Corriente
# Positivo (+) = A favor de la Empresa (Deuda del Cliente aumenta o Deuda al Proveedor disminuye)
# Negativo (-) = A favor de la Entidad (Deuda al Proveedor aumenta o Pago del Cliente recibido)

# Documentos que aumentan la deuda de la entidad (o disminuyen nuestro saldo a favor)
DEBIT_TYPES = {
    DocumentType.INVOICE,
    DocumentType.DEBIT_NOTE,
    DocumentType.LPG_SECONDARY,
    DocumentType.PAYMENT,           # Pago realizado (baja nuestra deuda -> positivo p/nosotros)
    DocumentType.PURCHASE_CREDIT_NOTE, # Rebaja de deuda proveedor -> positivo p/nosotros
}

# Documentos que disminuyen la deuda de la entidad (o aumentan nuestra deuda)
CREDIT_TYPES = {
    DocumentType.RECEIPT,           # Cobro recibido (baja deuda cliente -> negativo p/nosotros)
    DocumentType.CREDIT_NOTE,       # Bonificación a cliente -> negativo p/nosotros
    DocumentType.PURCHASE_INVOICE,  # Factura de compra (sube nuestra deuda -> negativo)
    DocumentType.PURCHASE_DEBIT_NOTE, # Recargo proveedor -> negativo
    DocumentType.LPG_PRIMARY,       # Compra de grano -> negativo
}

@accounts_router.get("/{entity_id}/ledger")
def get_entity_ledger(
    entity_id: str,
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    currency: Optional[str] = Query(None),
    doc_type: Optional[str] = Query(None),
    cost_center: Optional[int] = Query(None),
    only_unapplied: bool = Query(False),
    only_overdue: bool = Query(False),
    sale_condition: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Retorna el estado de cuenta (libro mayor) de una entidad.
    Cada movimiento incluye saldo acumulado en ARS y USD.
    Filtra por cost_center si se provee (1: ARCA, 2: Interno).
    """
    # 0. Cache for sale conditions to ensure they show up even if relationship is tricky
    all_sc = db.query(SaleCondition).all()
    sc_map = {str(sc.id).lower().strip(): sc.description for sc in all_sc}
    sc_map.update({str(sc.description).lower().strip(): sc.description for sc in all_sc})

    # 1. Validar entidad
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entidad no encontrada")

    # 2. Levantar todos los documentos de la entidad (no cancelados)
    query = db.query(Document).options(joinedload(Document.sale_condition)).filter(
        Document.entity_id == entity_id,
        Document.status != DocumentStatus.CANCELLED
    )

    # Filtro por centro de costo
    if cost_center is not None:
        query = query.filter(Document.cost_center == cost_center)

    # Filtros opcionales por fecha
    if from_date:
        try:
            query = query.filter(Document.date >= datetime.fromisoformat(from_date))
        except Exception:
            pass
    if to_date:
        try:
            query = query.filter(Document.date <= datetime.fromisoformat(to_date + "T23:59:59"))
        except Exception:
            pass

    # Filtro por moneda
    if currency:
        query = query.filter(Document.currency == currency)

    # Filtro por tipo de doc
    if doc_type:
        query = query.filter(Document.doc_type == doc_type)

    # Filtro por condición de venta
    if sale_condition:
        query = query.filter(Document.sale_condition_id == sale_condition)

    docs = query.order_by(Document.date.asc(), Document.created_at.asc()).all()

    # 3. Para cada documento, calcular la aplicación (cuánto se cobró/pagó)
    doc_ids = [d.id for d in docs]

    # Aplicaciones donde el documento ES EL ORIGEN (recibos/pagos que se aplicaron)
    # Queremos saber específicamente cuánto se aplicó a facturas en USD vs ARS
    apps_from_q = db.query(
        Application.from_document_id,
        Document.currency.label("to_currency"),
        func.sum(Application.amount_applied).label("applied"),
        func.sum(Application.amount_applied_ars).label("applied_ars"),
    ).join(Document, Application.to_document_id == Document.id)\
     .filter(Application.from_document_id.in_(doc_ids))\
     .group_by(Application.from_document_id, Document.currency).all()
    
    applied_from_map = {}
    for a in apps_from_q:
        did = a.from_document_id
        if did not in applied_from_map: applied_from_map[did] = {}
        curr = str(a.to_currency.value if hasattr(a.to_currency, "value") else a.to_currency)
        applied_from_map[did][curr] = (float(a.applied or 0), float(a.applied_ars or 0))

    # Aplicaciones donde el documento ES EL DESTINO (facturas que se pagaron) - Totales para saldo pendiente
    apps_to_q = db.query(
        Application.to_document_id,
        func.sum(Application.amount_applied).label("applied"),
    ).filter(Application.to_document_id.in_(doc_ids)).group_by(Application.to_document_id).all()
    applied_to_map = {a.to_document_id: float(a.applied or 0) for a in apps_to_q}

    # 4. Construir el ledger con saldos acumulados
    balance_ars = 0.0
    balance_usd = 0.0
    entries = []

    for doc in docs:
        # 4.1 Identificación de signo del impacto
        # INVERSION: is_positive_impact = True significa que es a favor de la empresa (+)
        is_positive_impact = doc.doc_type in DEBIT_TYPES
        is_usd = str(doc.currency) in ("USD", "CurrencyType.USD")

        total_usd_doc = float(doc.total_amount or 0)
        total_ars_doc = float(doc.total_amount_ars or 0)
        tc = float(doc.exchange_rate or 1.0)
        
        # 4.2 Lógica de Documentos Directos (Facturas, ND, NC, LPG) vs Aplicaciones (Recibos, Pagos)
        # Los documentos que TIENEN aplicaciones (según applied_from_map) se procesan distinto
        has_apps = doc.id in applied_from_map
        
        if not has_apps:
            # Facturas, NC, LPG (movimientos directos)
            # El signo del impacto (+ o -) define si sube o baja el saldo
            sign = 1 if is_positive_impact else -1
            
            # LÓGICA ESPECIAL DIFERENCIA DE CAMBIO (WOW FACTOR)
            # Si el usuario mandó la ND/NC cargada como Dif de Cambio, 
            # en USD el NETO es irrelevante (ya se saldó en la aplicación),
            # solo nos importa el IVA que quedó a pagar/cobrar.
            is_fx_adj_doc = getattr(doc, 'is_fx_adjustment', False)
            
            if is_usd:
                # Documento en dólares: mueve saldo USD
                if is_fx_adj_doc:
                    # Solo el IVA impacta la deuda USD (ej: ND por solo IVA de dif cambio)
                    amount_usd = (float(doc.total_amount or 0) - float(sum(l.net_amount or 0 for l in doc.lines))) * sign
                    # Fallback si las líneas están vacías (usar % aproximado o buscar en DB)
                    if abs(amount_usd) < 0.01: 
                         # Asumimos que si marcó FX Adj y no hay líneas, es porque cargó el TOTAL
                         # pero en USD solo queremos el componente impositivo.
                         # O para ser más preciso, cargamos solo el IVA si el net es 0.
                         amount_usd = total_usd_doc * sign
                else:
                    amount_usd = total_usd_doc * sign
                amount_ars = 0.0
            else:
                # Documento en pesos: mueve saldo ARS siempre por el TOTAL
                amount_usd = 0.0
                if is_fx_adj_doc:
                    # En USD, calculamos cuánto representa el IVA de este doc en pesos
                    vat_ars = sum(float(l.vat_amount or 0) for l in doc.lines) * tc
                    if vat_ars < 0.01: # fallback si no hay líneas
                        vat_ars = (total_ars_doc * 0.21 / 1.21) # Aproximación si no hay detalle
                    amount_usd = (vat_ars / tc) * sign if tc > 0 else 0
                
                amount_ars = total_ars_doc * sign
        else:
            # RECIBOS y PAGOS (movimientos indirectos vía Aplicaciones)
            apps = applied_from_map.get(doc.id, {})
            app_usd_val, app_usd_ars = apps.get("USD", (0.0, 0.0))
            app_ars_val, app_ars_ars = apps.get("ARS", (0.0, 0.0))

            # Signo para Recibo (-) o Pago (+)
            # Receipts: bajan deuda cliente (-). Payments: bajan nuestra deuda (+).
            sign = 1 if is_positive_impact else -1
            
            if is_usd:
                # Recibo/Pago en USD:
                # Lo aplicado a facturas ARS mueve saldo ARS
                amount_ars = app_ars_val * sign
                # Lo aplicado a facturas USD (o no aplicado) mueve saldo USD
                val_spent_in_ars_as_usd = app_ars_ars / tc if tc > 0 else 0
                amount_usd = (total_usd_doc - val_spent_in_ars_as_usd) * sign
            else:
                # Recibo/Pago en ARS:
                # Lo aplicado a facturas USD mueve saldo USD
                amount_usd = app_usd_val * sign
                # Lo aplicado a facturas ARS (o no aplicado) mueve saldo ARS
                amount_ars = (total_ars_doc - app_usd_ars) * sign

        # Limpieza de redondeo
        if abs(amount_ars) < 0.005: amount_ars = 0.0
        if abs(amount_usd) < 0.00005: amount_usd = 0.0
        
        balance_ars += amount_ars
        balance_usd += amount_usd

        # 4.3 Cálculo de Estado de Cobro/Pago
        apps = applied_from_map.get(doc.id, {})
        applied_total = sum(v[0] for v in apps.values())
        applied_total_ars = sum(v[1] for v in apps.values())

        # Pendiente (siempre en moneda original p/simplicidad visual)
        if not has_apps:
            # Para facturas/NC, miramos cuánto les aplicaron (to)
            applied_already = applied_to_map.get(doc.id, 0.0)
            remaining = max(0.0, total_usd_doc - applied_already)
            
            if remaining < 0.01: payment_status = "PAID"
            elif remaining < total_usd_doc: payment_status = "PARTIAL"
            else: payment_status = "OPEN"
        else:
            # Para Recibos/Pagos, miramos cuánto aplicamos (from) comparado con el total
            # El total_target es total_usd si es USD, sino total_ars.
            total_target = total_usd_doc if is_usd else total_ars_doc
            applied_target = applied_total if is_usd else applied_total_ars
            remaining = max(0.0, total_target - applied_target)
            
            if applied_target >= total_target - 0.05:
                payment_status = "PAID"
            elif applied_target > 0.05:
                payment_status = "PARTIAL"
            else:
                payment_status = "OPEN"
        
        # Filtering after in-memory calculation (since remaining is calculated here)
        show_this = True
        if only_unapplied and payment_status == "PAID":
            show_this = False
        
        if only_overdue:
            is_overdue = False
            if doc.due_date and doc.due_date.date() < datetime.now().date() and payment_status != "PAID":
                is_overdue = True
            if not is_overdue:
                show_this = False

        if show_this:
            entry = {
                "id": doc.id,
                "date": doc.date.isoformat() if doc.date else None,
                "doc_type": doc.doc_type.value if hasattr(doc.doc_type, "value") else str(doc.doc_type),
                "payment_status": payment_status,
                "number": doc.number,
                "due_date": doc.due_date.isoformat() if doc.due_date else None,
                "currency": doc.currency.value if hasattr(doc.currency, "value") else str(doc.currency),
                "exchange_rate": tc,
                "total_amount": total_usd_doc,
                "total_amount_ars": total_ars_doc,
                "status": doc.status.value if hasattr(doc.status, "value") else str(doc.status),
                "notes": doc.notes,
                "sale_condition": (doc.sale_condition.description if doc.sale_condition else sc_map.get(str(doc.sale_condition_id).lower().strip())) if (doc.sale_condition_id and str(doc.sale_condition_id).strip()) else None,
                "is_initial_load": doc.is_initial_load or False,
                # Movement amounts (positive = debit, negative = credit)
                "amount_ars": amount_ars,
                "amount_usd": amount_usd,
                # Running balances
                "balance_ars": balance_ars,
                "balance_usd": balance_usd,
                # Applications
                "applied_amount": applied_total,
                "applied_amount_ars": applied_total_ars,
                "remaining": remaining,
                "remaining_ars": max(0.0, total_ars_doc - applied_total_ars),
                # Extra fields
                "lines": []
            }
            entries.append(entry)

    # El frontend espera los movimientos en orden ASCENDENTE (más viejo arriba, lo más nuevo abajo)
    return list(entries)

@accounts_router.get("/{entity_id}/unbilled-delivery-notes")
def get_entity_unbilled_delivery_notes(
    entity_id: str,
    cost_center: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Retorna los remitos sin facturar (o parcialmente facturados) de la entidad,
    con el saldo pendiente de facturar.
    """
    # 0. Cache for sale conditions to ensure they show up
    all_sc = db.query(SaleCondition).all()
    sc_map = {str(sc.id).lower().strip(): sc.description for sc in all_sc}
    sc_map.update({str(sc.description).lower().strip(): sc.description for sc in all_sc})

    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entidad no encontrada")

    query = db.query(DeliveryNote).options(joinedload(DeliveryNote.sale_condition)).filter(
        DeliveryNote.entity_id == entity_id,
        DeliveryNote.status.in_([DeliveryNoteStatus.DISPATCHED, DeliveryNoteStatus.PARTIAL])
    )
    
    if cost_center is not None:
        query = query.filter(DeliveryNote.cost_center == cost_center)
        
    notes = query.order_by(DeliveryNote.date.asc()).all()

    results = []
    
    total_balance_ars = 0.0
    total_balance_usd = 0.0
    for note in notes:
        # 1. Filtro de Vínculo: 
        # Si el remito está marcado como INVOICED, ya fue filtrado arriba (line 266).
        # Si está como PARTIAL o DISPATCHED, entramos aquí. 
        # No debemos hacer continue si solo tiene vínculos parciales,
        # pues el cálculo por renglón (abajo) resolverá qué falta cobrar.
        
        unbilled_ars = 0.0
        unbilled_usd = 0.0
        
        is_usd = str(note.currency) in ("USD", "CurrencyType.USD")
        is_credit = note.note_type == OrderType.PURCHASE
        sign = -1 if is_credit else 1

        for line in note.lines:
            # First check remito's own invoiced line
            qty_rem = float(line.qty or 0) - float(line.qty_invoiced or 0)
            
            # If the remito is tied to a sales order line, we MUST NOT exceed the unbilled quantity of that order line.
            # Otherwise we'd recommend billing a remito when the original order was already billed directly.
            if line.source_sales_line_id:
                from app.db.models.commercial_models import SalesOrderLine
                sl = db.query(SalesOrderLine).filter(SalesOrderLine.id == line.source_sales_line_id).first()
                if sl:
                    order_qty_rem = max(0.0, float(sl.qty or 0) - float(sl.qty_invoiced or 0))
                    qty_rem = min(qty_rem, order_qty_rem)
            elif line.source_purchase_line_id:
                from app.db.models.commercial_models import PurchaseOrderLine
                pl = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == line.source_purchase_line_id).first()
                if pl:
                    order_qty_rem = max(0.0, float(pl.qty or 0) - float(pl.qty_invoiced or 0))
                    qty_rem = min(qty_rem, order_qty_rem)

            if qty_rem > 0.01:
                price = float(line.unit_price or 0.0)
                disc = float(line.discount_pct or 0.0) / 100.0
                vat = float(line.vat_rate or 0.21)
                
                net_price = price * (1.0 - disc)
                gross_price = net_price * (1.0 + vat)
                
                line_unbilled_amt = gross_price * qty_rem
                if is_usd: unbilled_usd += line_unbilled_amt
                else: unbilled_ars += line_unbilled_amt

        movement_ars = unbilled_ars * sign
        movement_usd = unbilled_usd * sign

        if abs(movement_ars) < 0.01 and abs(movement_usd) < 0.01:
            continue

        total_balance_usd += movement_usd
        total_balance_ars += movement_ars
            
        tc = float(note.exchange_rate or 1.0)
        results.append({
            "id": note.id,
            "date": note.date.isoformat() if note.date else None,
            "number": note.number,
            "doc_type": "DELIVERY_NOTE",
            "type_label": "Remito de Compra" if is_credit else "Remito de Venta",
            "currency": note.currency,
            "exchange_rate": tc,
            "unbilled_amount": unbilled_usd if is_usd else unbilled_ars,
            "amount_ars": movement_ars,
            "amount_usd": movement_usd,
            "balance_ars": total_balance_ars,
            "balance_usd": total_balance_usd,
            "status": note.status.value if hasattr(note.status, "value") else str(note.status),
            "sale_condition": (note.sale_condition.description if note.sale_condition else sc_map.get(str(note.sale_condition_id).lower().strip())) if (note.sale_condition_id and str(note.sale_condition_id).strip()) else None,
            "notes": note.notes
        })

    return results
