from app.modules.auth.auth_router import get_current_user
from .stock_authorization import authorize_stock_action
from .stock_report_router import _rows
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from app.db.session import get_db
from app.db.models.commercial_models import StockItem, Product, Warehouse, Category, SubCategory

router = APIRouter(prefix="/dashboard", tags=["Inventory Dashboard"])

@router.get("/summary")
def get_inventory_summary(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Provides a high-level summary of stock valuation and distribution."""
    authorize_stock_action(db, user, "view")
    
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

    # 2. Critical Items: available stock, respecting warehouse controls
    all_alerts = [row for row in _rows(db) if row["is_critical"]]
    all_alerts.sort(
        key=lambda row: (
            float(row["qty_available"]) - float(row["min_stock"]),
            row["warehouse_name"],
            row["product_name"],
        )
    )
    critical_items = [
        {
            "name": row["product_name"],
            "sku": row["sku"],
            "qty": float(row["qty_available"]),
            "min": float(row["min_stock"]),
            "warehouse_id": row["warehouse_id"],
            "warehouse_name": row["warehouse_name"],
            "qty_on_hand": float(row["qty_on_hand"]),
            "qty_reserved": float(row["qty_reserved"]),
        }
        for row in all_alerts[:5]
    ]

    # Sort and Format
    top_items = sorted(items_map.values(), key=lambda x: x["value"], reverse=True)[:5]
    
    return {
        "total_valuation_usd": round(total_usd, 2),
        "by_warehouse": [{"label": k, "value": round(v, 2)} for k, v in warehouse_map.items()],
        "by_category": [{"label": k, "value": round(v, 2)} for k, v in category_map.items()],
        "top_items": top_items,
        "critical_items": critical_items,
        "critical_count": len(all_alerts)
    }

@router.get("/warehouse-detail")
def get_warehouse_stock_detail(
    warehouse_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Stock físico, reservado y disponible de un depósito."""
    authorize_stock_action(db, user, "view")
    results = []
    for row in _rows(db, warehouse_id=warehouse_id):
        product = db.get(Product, row["product_id"])
        physical = float(row["qty_on_hand"])
        results.append({
            "product_name": row["product_name"],
            "qty": physical,
            "valuation_usd": physical * float(product.cost_price or 0),
            "is_critical": row["is_critical"],
            "product_id": row["product_id"],
            "warehouse_id": row["warehouse_id"],
            "qty_reserved": float(row["qty_reserved"]),
            "qty_available": float(row["qty_available"]),
            "min_stock": float(row["min_stock"]),
        })
    return results
