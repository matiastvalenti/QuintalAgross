from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from app.db.session import get_db
from app.db.models.commercial_models import StockItem, Product, Warehouse, Category, SubCategory

router = APIRouter(prefix="/dashboard", tags=["Inventory Dashboard"])

@router.get("/summary")
def get_inventory_summary(db: Session = Depends(get_db)):
    """Provides a high-level summary of stock valuation and distribution."""
    
    # 1. Base Query for Valuation
    stock_data = db.query(
        StockItem.qty_on_hand,
        Product.id,
        Product.name,
        Product.cost_price,
        Warehouse.name.label("warehouse_name"),
        Category.name.label("category_name")
    ).join(Product, StockItem.product_id == Product.id)\
     .join(Warehouse, StockItem.warehouse_id == Warehouse.id)\
     .outerjoin(SubCategory, Product.subcategory_id == SubCategory.id)\
     .outerjoin(Category, SubCategory.category_id == Category.id)\
     .all()
    
    total_usd = 0.0
    warehouse_map = {}
    category_map = {}
    items_map = {}
    
    for qty, pid, pname, cost, wh_name, cat_name in stock_data:
        val = float(qty or 0) * float(cost or 0)
        total_usd += val
        
        # By Warehouse
        warehouse_map[wh_name] = float(warehouse_map.get(wh_name, 0.0)) + val
        
        # By Category
        cat_key = cat_name or "General"
        category_map[cat_key] = float(category_map.get(cat_key, 0.0)) + val
        
        # By Item (Top valuation)
        if pid not in items_map:
            items_map[pid] = {"name": pname, "value": 0.0, "qty": 0.0}
        items_map[pid]["value"] += val
        items_map[pid]["qty"] += float(qty or 0)

    # 2. Critical Items (Low Stock)
    critical_query = db.query(Product).join(StockItem).group_by(Product.id).having(
        func.sum(StockItem.qty_on_hand) <= Product.min_stock
    ).filter(Product.min_stock > 0)
    
    critical_items = []
    # Usamos slicing normal de lista tras ejecutar la query
    crit_prods = critical_query.limit(5).all()
    for p in crit_prods:
        total_qty = db.query(func.sum(StockItem.qty_on_hand)).filter(StockItem.product_id == p.id).scalar() or 0
        critical_items.append({
            "name": p.name,
            "sku": p.sku,
            "qty": float(total_qty),
            "min": float(p.min_stock)
        })

    # Sort and Format
    top_items = sorted(items_map.values(), key=lambda x: x["value"], reverse=True)[:5]
    
    return {
        "total_valuation_usd": round(total_usd, 2),
        "by_warehouse": [{"label": k, "value": round(v, 2)} for k, v in warehouse_map.items()],
        "by_category": [{"label": k, "value": round(v, 2)} for k, v in category_map.items()],
        "top_items": top_items,
        "critical_items": critical_items,
        "critical_count": len(critical_items)
    }

@router.get("/warehouse-detail")
def get_warehouse_stock_detail(warehouse_id: str, db: Session = Depends(get_db)):
    """Detailed stock list for a specific warehouse including valuation."""
    items = db.query(StockItem).filter(StockItem.warehouse_id == warehouse_id).all()
    results = []
    for i in items:
        val = float(i.qty_on_hand) * float(i.product.cost_price or 0)
        results.append({
            "product_name": i.product.name,
            "qty": float(i.qty_on_hand),
            "valuation_usd": val,
            "is_critical": float(i.qty_on_hand) <= (i.product.min_stock or 0)
        })
    return results
