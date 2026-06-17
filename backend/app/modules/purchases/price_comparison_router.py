from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from datetime import datetime

from app.db.session import get_db
from app.db.models.commercial_models import PurchaseOrder, PurchaseOrderLine, Product
from app.db.models.models import Entity

router = APIRouter(prefix="/price-comparison", tags=["Purchase Price Comparison"])

@router.get("/")
def get_price_comparison(
    product_id: Optional[str] = None,
    entity_id: Optional[str] = None,
    cost_center: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Retorna el historial de precios de compra para comparar.
    Siempre ordena por fecha descendente para que el último precio usado aparezca arriba.
    """
    query = db.query(
        PurchaseOrderLine.unit_price,
        PurchaseOrderLine.qty,
        PurchaseOrder.currency,
        PurchaseOrder.date,
        PurchaseOrder.number,
        Entity.name.label("provider_name"),
        Product.name.label("product_name")
    ).join(PurchaseOrder, PurchaseOrderLine.order_id == PurchaseOrder.id)\
     .join(Entity, PurchaseOrder.entity_id == Entity.id)\
     .join(Product, PurchaseOrderLine.product_id == Product.id)

    if product_id:
        query = query.filter(PurchaseOrderLine.product_id == product_id)
    if entity_id:
        query = query.filter(PurchaseOrder.entity_id == entity_id)

    # Ordenar por fecha DESC para que el último precio esté arriba
    results = query.order_by(desc(PurchaseOrder.date)).limit(100).all()

    return [
        {
            "date": r.date,
            "order_number": r.number,
            "provider_name": r.provider_name,
            "product_name": r.product_name,
            "qty": float(r.qty),
            "unit_price": float(r.unit_price),
            "currency": r.currency
        }
        for r in results
    ]

@router.get("/autocomplete/products")
def autocomplete_products(q: str = "", cost_center: Optional[int] = None, db: Session = Depends(get_db)):
    from app.db.models.commercial_models import Product
    search = f"%{q}%"
    products = db.query(Product).filter(
        (Product.name.ilike(search)) | (Product.sku.ilike(search))
    ).limit(1000).all()
    
    return [{"id": p.id, "label": p.name, "sku": p.sku} for p in products]

@router.get("/autocomplete/entities")
def autocomplete_entities(q: str = "", cost_center: Optional[int] = None, db: Session = Depends(get_db)):
    from app.db.models.models import Entity
    search = f"%{q}%"
    entities = db.query(Entity).filter(Entity.name.ilike(search)).limit(1000).all()
    return [{"id": e.id, "label": e.name} for e in entities]
