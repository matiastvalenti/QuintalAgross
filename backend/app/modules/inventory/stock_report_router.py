from decimal import Decimal
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models.commercial_models import StockItem, Warehouse, Product
from app.modules.auth.auth_router import get_current_user
from .stock_authorization import authorize_stock_action

router = APIRouter(prefix="/reports", tags=["Inventory Reports"])


def _rows(db, warehouse_id=None, product_id=None):
    query = db.query(StockItem, Warehouse, Product).join(
        Warehouse, StockItem.warehouse_id == Warehouse.id
    ).join(Product, StockItem.product_id == Product.id)
    if warehouse_id:
        query = query.filter(Warehouse.id == warehouse_id)
    if product_id:
        query = query.filter(Product.id == product_id)

    results = []
    for item, warehouse, product in query.order_by(
        Warehouse.name, Product.name
    ).all():
        physical = Decimal(str(item.qty_on_hand or 0))
        reserved = Decimal(str(item.qty_reserved or 0))
        available = physical - reserved
        minimum = Decimal(str(product.min_stock or 0))
        control = getattr(warehouse.low_stock_control, "value",
                          warehouse.low_stock_control)
        alert = (
            str(control) in ("WARNING", "STRICT")
            and minimum > 0
            and available <= minimum
        )
        results.append({
            "warehouse_id": warehouse.id,
            "warehouse_name": warehouse.name,
            "product_id": product.id,
            "product_name": product.name,
            "sku": product.sku,
            "qty_on_hand": str(physical),
            "qty_reserved": str(reserved),
            "qty_available": str(available),
            "min_stock": str(minimum),
            "stock_control": str(control),
            "is_critical": alert,
        })
    return results


@router.get("/availability")
def stock_availability(
    warehouse_id: str | None = None,
    product_id: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    authorize_stock_action(db, user, "view")
    return _rows(db, warehouse_id, product_id)


@router.get("/alerts")
def stock_alerts(
    warehouse_id: str | None = None,
    product_id: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    authorize_stock_action(db, user, "view")
    return [
        row for row in _rows(db, warehouse_id, product_id)
        if row["is_critical"]
    ]
