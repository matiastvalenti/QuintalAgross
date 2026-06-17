from decimal import Decimal
from sqlalchemy.orm import Session
from app.db.models.commercial_models import StockItem

def get_or_create_stock_item(db: Session, product_id: str, warehouse_id: str) -> StockItem:
    """Helper to get a StockItem record or create it if missing."""
    if not product_id or not warehouse_id:
        return None
        
    item = db.query(StockItem).filter(
        StockItem.product_id == product_id,
        StockItem.warehouse_id == warehouse_id
    ).first()
    if not item:
        item = StockItem(
            product_id=product_id, 
            warehouse_id=warehouse_id, 
            qty_on_hand=Decimal("0.0"), 
            qty_reserved=Decimal("0.0")
        )
        db.add(item)
        db.flush()
    return item

def reserve_stock(db: Session, product_id: str, warehouse_id: str, qty: Decimal):
    """Increments the reservation counter for a product in a warehouse."""
    if not warehouse_id or not product_id or qty == 0:
        return
    item = get_or_create_stock_item(db, product_id, warehouse_id)
    if item:
        item.qty_reserved = Decimal(str(item.qty_reserved or 0)) + Decimal(str(qty))
        db.flush()

def unreserve_stock(db: Session, product_id: str, warehouse_id: str, qty: Decimal):
    """Decrements the reservation counter, ensuring it doesn't go below zero."""
    if not warehouse_id or not product_id or qty == 0:
        return
    item = get_or_create_stock_item(db, product_id, warehouse_id)
    if item:
        item.qty_reserved = Decimal(str(item.qty_reserved or 0)) - Decimal(str(qty))
        item.qty_reserved = max(Decimal("0.0"), item.qty_reserved)
        db.flush()
