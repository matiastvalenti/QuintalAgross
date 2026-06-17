from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from app.db.session import get_db
from app.db.models.commercial_models import (
    SalesOrder, SalesOrderLine, 
    DeliveryNote, DeliveryNoteLine, 
    OrderStatus, DeliveryNoteStatus, OrderType,
    Product, Container
)
from pydantic import BaseModel
from decimal import Decimal

router = APIRouter(prefix="/pending-items", tags=["Pending Items"])

class PendingLineResponse(BaseModel):
    id: str
    parent_id: str
    parent_number: str
    date: str
    product_id: Optional[str]
    product_name: str
    description: Optional[str] = ""
    qty: float
    qty_fulfilled: float # delivered or invoiced
    qty_pending: float
    unit_price: float
    discount_pct: float
    vat_rate: float
    currency: str = "ARS"
    exchange_rate: float = 1.0
    # New fields for containers and units
    quantity_per_container: float = 1.0
    container_name: str = "Unidad"
    unit_short_name: str = "u"
    sales_account_code: Optional[str] = None
    source_sales_line_id: Optional[str] = None
    source_dn_line_id: Optional[str] = None
    
    model_config = {
        "from_attributes": True
    }

@router.get("/sales-orders", response_model=List[PendingLineResponse])
def get_pending_so_lines(entity_id: str, sale_condition_id: Optional[str] = None, db: Session = Depends(get_db)):
    """Retorna líneas de Órdenes de Venta pendientes de remitir."""
    query = db.query(SalesOrderLine).join(SalesOrder).filter(
        SalesOrder.entity_id == entity_id,
        SalesOrder.status.in_([
            OrderStatus.CONFIRMED, 
            OrderStatus.PARTIALLY_DELIVERED,
            OrderStatus.FULLY_DELIVERED,
            OrderStatus.PARTIALLY_INVOICED,
            OrderStatus.REMITIDO_PARCIAL_FACTURADO_PARCIAL,
            OrderStatus.REMITIDO_TOTAL_FACTURADO_PARCIAL,
            OrderStatus.REMITIDO_PARCIAL_FACTURADO_TOTAL
        ]),
        SalesOrderLine.qty > SalesOrderLine.qty_invoiced
    )
    
    if sale_condition_id:
        query = query.filter(SalesOrder.sale_condition_id == sale_condition_id)
        
    lines = query.options(
        joinedload(SalesOrderLine.order),
        joinedload(SalesOrderLine.product).joinedload(Product.container).joinedload(Container.unit)
    ).all()
    
    res = []
    for l in lines:
        res.append({
            "id": str(l.id),
            "parent_id": str(l.order_id),
            "parent_number": l.order.number,
            "date": l.order.date.isoformat(),
            "product_id": str(l.product_id) if l.product_id else None,
            "product_name": l.product.name if l.product else l.description,
            "description": l.description,
            "qty": float(l.qty),
            "qty_fulfilled": float(l.qty_delivered),
            "qty_pending": float(l.qty - l.qty_delivered),
            "unit_price": float(l.unit_price),
            "discount_pct": float(l.discount_pct),
            "vat_rate": float(l.vat_rate),
            "currency": l.order.currency,
            "exchange_rate": float(l.order.exchange_rate or 1.0),
            "quantity_per_container": float(l.product.quantity_per_container or 1.0) if l.product else 1.0,
            "container_name": l.product.container.name if (l.product and l.product.container) else "Unidad",
            "unit_short_name": l.product.container.unit.short_name if (l.product and l.product.container and l.product.container.unit) else "u",
            "sales_account_code": l.product.sales_account_code if l.product else None,
            "source_sales_line_id": str(l.id)
        })
    return res

@router.get("/delivery-notes", response_model=List[PendingLineResponse])
def get_pending_dn_lines(entity_id: str, sale_condition_id: Optional[str] = None, db: Session = Depends(get_db)):
    """Retorna líneas de Remitos pendientes de facturar."""
    query = db.query(DeliveryNoteLine).join(DeliveryNote).filter(
        DeliveryNote.entity_id == entity_id,
        DeliveryNote.status.in_([DeliveryNoteStatus.DISPATCHED, DeliveryNoteStatus.PARTIAL]),
        DeliveryNote.note_type == OrderType.SALE,
        DeliveryNoteLine.qty > DeliveryNoteLine.qty_invoiced
    )
    
    if sale_condition_id:
        query = query.filter(DeliveryNote.sale_condition_id == sale_condition_id)

    lines = query.options(
        joinedload(DeliveryNoteLine.delivery_note),
        joinedload(DeliveryNoteLine.product).joinedload(Product.container).joinedload(Container.unit)
    ).all()
    
    res = []
    for l in lines:
        qty_rem = float(l.qty) - float(l.qty_invoiced)
        if qty_rem <= 0: continue
        
        # Guard against parent order already being invoiced
        if l.source_sales_line_id:
            from app.db.models.commercial_models import SalesOrderLine
            sl = db.query(SalesOrderLine).filter(SalesOrderLine.id == l.source_sales_line_id).first()
            if sl:
                order_qty_rem = max(0.0, float(sl.qty or 0) - float(sl.qty_invoiced or 0))
                qty_rem = min(qty_rem, order_qty_rem)
        
        if qty_rem <= 0.01: continue
        
        res.append({
            "id": str(l.id),
            "parent_id": str(l.delivery_note_id),
            "parent_number": l.delivery_note.number,
            "date": l.delivery_note.date.isoformat(),
            "product_id": str(l.product_id) if l.product_id else None,
            "product_name": l.product.name if l.product else l.description,
            "description": l.description,
            "qty": float(l.qty),
            "qty_fulfilled": float(l.qty) - qty_rem,
            "qty_pending": qty_rem,
            "unit_price": float(l.unit_price),
            "discount_pct": float(l.discount_pct),
            "vat_rate": float(l.vat_rate),
            "currency": l.delivery_note.currency or "ARS",
            "exchange_rate": float(l.delivery_note.exchange_rate or 1.0),
            "quantity_per_container": float(l.product.quantity_per_container or 1.0) if l.product else 1.0,
            "container_name": l.product.container.name if (l.product and l.product.container) else "Unidad",
            "unit_short_name": l.product.container.unit.short_name if (l.product and l.product.container and l.product.container.unit) else "u",
            "sales_account_code": l.product.sales_account_code if l.product else None,
            "source_dn_line_id": str(l.id),
            "source_sales_line_id": str(l.source_sales_line_id) if l.source_sales_line_id else None
        })
    return res
