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
    view: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Retorna el estado de cuenta (libro mayor) de una entidad.
    Cada movimiento incluye saldo acumulado en ARS y USD.
    Filtra por cost_center si se provee (1: ARCA, 2: Interno).
    El parámetro opcional `view` (customer, supplier, consolidated) permite separar circuitos.
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
        sale_condition=sale_condition,
        view=view
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
        
    notes = query.order_by(DeliveryNote.date.desc()).all()

    def safe_float(v):
        try:
            return float(v) if v is not None else 0.0
        except (TypeError, ValueError):
            return 0.0

    def normalize_currency(raw):
        """Normaliza el enum/string de moneda a 'USD' o 'ARS'."""
        s = str(raw).upper()
        if "USD" in s:
            return "USD"
        return "ARS"

    def get_line_total(line):
        """Calcula el total bruto (con IVA) de una línea."""
        # Primero intentar total_amount guardado
        if line.total_amount is not None:
            t = safe_float(line.total_amount)
            if t > 0.0:
                return t
        # Luego net + vat
        if line.net_amount is not None or line.vat_amount is not None:
            t = safe_float(line.net_amount) + safe_float(line.vat_amount)
            if t > 0.0:
                return t
        # Fallback: qty * precio con descuento e IVA
        qty = safe_float(line.qty)
        price = safe_float(line.unit_price)
        disc = safe_float(line.discount_pct) / 100.0
        vat = safe_float(line.vat_rate) if line.vat_rate is not None else 0.21
        net = qty * price * (1.0 - disc)
        return net * (1.0 + vat)

    results = []
    
    for note in notes:
        currency = normalize_currency(note.currency)
        is_credit = note.note_type == OrderType.PURCHASE

        # 1. Total bruto del remito (con IVA) sumando líneas
        total_amount = 0.0
        for line in note.lines:
            total_amount += get_line_total(line)
        # Nota: DeliveryNote no tiene total_amount en cabecera; solo total_cost (costo).
        # El total bruto se calcula siempre desde las líneas.

        # 2. Pendiente de facturar: calculado desde qty_rem por línea con IVA
        pending_amount = 0.0
        for line in note.lines:
            qty_rem = safe_float(line.qty) - safe_float(line.qty_invoiced)

            # Limitar por la orden de venta si corresponde
            if qty_rem > 0 and line.source_sales_line_id:
                from app.db.models.commercial_models import SalesOrderLine
                sl = db.query(SalesOrderLine).filter(SalesOrderLine.id == line.source_sales_line_id).first()
                if sl:
                    order_qty_rem = max(0.0, safe_float(sl.qty) - safe_float(sl.qty_invoiced))
                    qty_rem = min(qty_rem, order_qty_rem)
            elif qty_rem > 0 and line.source_purchase_line_id:
                from app.db.models.commercial_models import PurchaseOrderLine
                pl = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == line.source_purchase_line_id).first()
                if pl:
                    order_qty_rem = max(0.0, safe_float(pl.qty) - safe_float(pl.qty_invoiced))
                    qty_rem = min(qty_rem, order_qty_rem)

            if qty_rem > 0.001:
                price = safe_float(line.unit_price)
                disc = safe_float(line.discount_pct) / 100.0
                vat = safe_float(line.vat_rate) if line.vat_rate is not None else 0.21
                net = qty_rem * price * (1.0 - disc)
                pending_amount += net * (1.0 + vat)

        invoiced_amount = max(0.0, total_amount - pending_amount)

        # 3. Estado técnico
        note_status_raw = note.status.value if hasattr(note.status, "value") else str(note.status)
        note_status_str = note_status_raw.upper()
        
        # 4. Estado administrativo
        is_cancelled = "CANCELLED" in note_status_str or "ANULADO" in note_status_str
        if is_cancelled:
            computed_status = "ANULADO"
            status_kind = "cancelled"
            pending_amount = 0.0
            invoiced_amount = 0.0
        elif total_amount > 0.001 and pending_amount <= 0.001:
            computed_status = "FACTURADO"
            status_kind = "invoiced"
        elif invoiced_amount > 0.001 and pending_amount > 0.001:
            computed_status = "PARCIAL"
            status_kind = "partial"
        else:
            computed_status = "PENDIENTE"
            status_kind = "pending"
            
        tc = safe_float(note.exchange_rate) or 1.0
        
        if computed_status in ("PENDIENTE", "PARCIAL"):
            results.append({
                "id": note.id,
                "date": note.date.isoformat() if note.date else None,
                "number": note.number,
                "doc_type": "DELIVERY_NOTE",
                "type_label": "Remito de Compra" if is_credit else "Remito de Venta",
                "technical_status": note_status_raw,
                "status": computed_status,
                "status_label": computed_status,
                "status_kind": status_kind,
                "currency": currency,
                "exchange_rate": tc,
                "total_amount": round(total_amount, 2),
                "invoiced_amount": round(invoiced_amount, 2),
                "pending_amount": round(pending_amount, 2),
                "sale_condition": (note.sale_condition.description if note.sale_condition else sc_map.get(str(note.sale_condition_id).lower().strip())) if (note.sale_condition_id and str(note.sale_condition_id).strip()) else None,
                "notes": note.notes,
                "related_invoices": []
            })

    return results

