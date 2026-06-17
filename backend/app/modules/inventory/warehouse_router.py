"""CRUD básico de depósitos + consulta de stock."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import get_db
from app.db.models.commercial_models import Warehouse, StockItem, StockMovement
from app.modules.inventory import warehouse_schemas

router = APIRouter(prefix="/warehouses", tags=["Warehouses"])


# ═══════════════════════════════════════════
# WAREHOUSE CRUD
# ═══════════════════════════════════════════

@router.post("/", response_model=warehouse_schemas.WarehouseResponse, status_code=201)
def create_warehouse(data: warehouse_schemas.WarehouseCreate, db: Session = Depends(get_db)):
    # Unique name
    existing = db.query(Warehouse).filter(Warehouse.name == data.name).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Depósito '{data.name}' ya existe")
    
    # Auto-generate code if not provided
    if not data.code:
        count = db.query(Warehouse).count()
        data.code = f"WH-{str(count + 1).zfill(3)}"
    else:
        existing_code = db.query(Warehouse).filter(Warehouse.code == data.code).first()
        if existing_code:
            raise HTTPException(status_code=409, detail=f"Código '{data.code}' ya existe")

    db_wh = Warehouse(**data.model_dump())
    db.add(db_wh)
    db.commit()
    db.refresh(db_wh)
    return db_wh


@router.get("/", response_model=List[warehouse_schemas.WarehouseResponse])
def list_warehouses(active: Optional[bool] = None, db: Session = Depends(get_db)):
    q = db.query(Warehouse)
    if active is not None:
        q = q.filter(Warehouse.active == active)
    return q.order_by(Warehouse.name).all()


@router.get("/{warehouse_id}", response_model=warehouse_schemas.WarehouseResponse)
def get_warehouse(warehouse_id: str, db: Session = Depends(get_db)):
    wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Depósito no encontrado")
    return wh


@router.put("/{warehouse_id}", response_model=warehouse_schemas.WarehouseResponse)
def update_warehouse(warehouse_id: str, data: warehouse_schemas.WarehouseUpdate, db: Session = Depends(get_db)):
    wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Depósito no encontrado")

    update_data = data.model_dump(exclude_unset=True)

    if "name" in update_data:
        existing = db.query(Warehouse).filter(
            Warehouse.name == update_data["name"], Warehouse.id != warehouse_id
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"Depósito '{update_data['name']}' ya existe")

    for key, value in update_data.items():
        setattr(wh, key, value)

    db.commit()
    db.refresh(wh)
    return wh


@router.delete("/{warehouse_id}", status_code=204)
def delete_warehouse(warehouse_id: str, db: Session = Depends(get_db)):
    wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Depósito no encontrado")
    # Verificar que no tenga stock
    has_stock = db.query(StockItem).filter(
        StockItem.warehouse_id == warehouse_id, StockItem.qty_on_hand != 0
    ).first()
    if has_stock:
        raise HTTPException(status_code=409, detail="No se puede eliminar un depósito con stock")
    db.delete(wh)
    db.commit()


# ═══════════════════════════════════════════
# STOCK QUERIES (solo lectura por ahora — escritura via Remito en T3.2.2)
# ═══════════════════════════════════════════
@router.get("/{warehouse_id}/stock", response_model=List[warehouse_schemas.StockItemResponse])
def list_stock(warehouse_id: str, db: Session = Depends(get_db)):
    """Stock de todos los productos en un depósito."""
    wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Depósito no encontrado")

    items = db.query(StockItem).filter(StockItem.warehouse_id == warehouse_id).all()
    result = []
    for item in items:
        result.append(warehouse_schemas.StockItemResponse(
            id=item.id,
            product_id=item.product_id,
            warehouse_id=item.warehouse_id,
            qty_on_hand=item.qty_on_hand,
            qty_reserved=item.qty_reserved,
            product_name=item.product.name if item.product else None,
            warehouse_name=wh.name,
        ))
    return result


@router.get("/{warehouse_id}/stock/{product_id}", response_model=warehouse_schemas.StockItemResponse)
def get_stock_item(warehouse_id: str, product_id: str, db: Session = Depends(get_db)):
    """Stock de un producto específico en un depósito."""
    item = db.query(StockItem).filter(
        StockItem.warehouse_id == warehouse_id,
        StockItem.product_id == product_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="No hay registro de stock para este producto en este depósito")

    return warehouse_schemas.StockItemResponse(
        id=item.id,
        product_id=item.product_id,
        warehouse_id=item.warehouse_id,
        qty_on_hand=item.qty_on_hand,
        qty_reserved=item.qty_reserved,
        product_name=item.product.name if item.product else None,
        warehouse_name=item.warehouse.name if item.warehouse else None,
    )
