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
    from app.modules.entities.account_statement_service import build_entity_ledger
    
    entries = build_entity_ledger(
        db=db,
        entity_id=entity_id,
        from_date=from_date,
        to_date=to_date,
        currency=currency,
        doc_type=doc_type,
        cost_center=cost_center,
        only_unapplied=only_unapplied,
        only_overdue=only_overdue,
        sale_condition=sale_condition
    )
    
    # El frontend espera los movimientos en orden ASCENDENTE (más viejo arriba, lo más nuevo abajo)
    return entries

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
