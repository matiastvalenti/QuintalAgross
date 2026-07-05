from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from datetime import datetime

from app.db.session import get_db
from app.db.models.commercial_models import PurchaseOrder, PurchaseOrderLine, OrderStatus
from app.modules.auth.auth_router import check_permission

router = APIRouter(prefix="/pending-items", tags=["Purchase Pending Items"])

@router.get("/purchase-orders")
def get_pending_purchase_order_items(
    entity_id: Optional[str] = None,
    purchase_order_id: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(PurchaseOrderLine).join(PurchaseOrder).filter(
        PurchaseOrder.status.in_([
            OrderStatus.CONFIRMED, 
            OrderStatus.PARTIALLY_DELIVERED,
            OrderStatus.FULLY_DELIVERED,
            OrderStatus.PARTIALLY_INVOICED,
            OrderStatus.REMITIDO_PARCIAL_FACTURADO_PARCIAL,
            OrderStatus.REMITIDO_TOTAL_FACTURADO_PARCIAL,
            OrderStatus.REMITIDO_PARCIAL_FACTURADO_TOTAL
        ])
    )
    
    if purchase_order_id:
        query = query.filter(PurchaseOrder.id == purchase_order_id)
    if entity_id:
        query = query.filter(PurchaseOrder.entity_id == entity_id)
        
    if q:
        search = f"%{q}%"
        query = query.filter(
            or_(
                PurchaseOrder.number.ilike(search),
                PurchaseOrderLine.description.ilike(search)
            )
        )
        
    lines = query.all()
    results = []
    
    for l in lines:
        qty = float(l.qty or 0)
        qty_received = float(l.qty_received or 0)
        qty_pending = qty - qty_received
        
        if qty_pending > 0:
            product_name = l.product.name if l.product else l.name
            description = l.description or product_name
            
            results.append({
                "id": l.id,
                "purchase_order_id": l.order_id,
                "parent_number": l.order.number,
                "date": l.order.date.isoformat(),
                "entity_id": l.order.entity_id,
                "entity_name": l.order.entity.name if l.order.entity else "",
                "product_id": l.product_id,
                "product_name": product_name,
                "description": description,
                "qty": qty,
                "qty_fulfilled": qty_received,
                "qty_pending": qty_pending,
                "unit_price": float(l.unit_price or 0),
                "currency": l.order.currency,
                "exchange_rate": float(l.order.exchange_rate or 1),
                "warehouse_id": l.order.warehouse_id
            })
            
    return results
