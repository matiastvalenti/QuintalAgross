from app.db.models.models import Document
import uuid
"""CRUD básico de depósitos + consulta de stock."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from app.db.session import get_db
from app.db.models.commercial_models import (
    Warehouse, StockItem, StockMovement,
    SalesOrder, PurchaseOrder, DeliveryNote,
    StockMovementHeader
)
from app.modules.inventory import warehouse_schemas

router = APIRouter(prefix="/warehouses", tags=["Warehouses"])


# ═══════════════════════════════════════════
# WAREHOUSE CRUD
# ═══════════════════════════════════════════

@router.post("/", response_model=warehouse_schemas.WarehouseResponse, status_code=201)
def create_warehouse(data: warehouse_schemas.WarehouseCreate, db: Session = Depends(get_db)):
    values = data.model_dump()

    duplicate_name = db.query(Warehouse.id).filter(
        func.lower(Warehouse.name) == values["name"].lower()
    ).first()
    if duplicate_name:
        raise HTTPException(409, "Ya existe un depósito con ese nombre")

    if not values["code"]:
        # Identificador aleatorio: no depende de contar depósitos.
        # La restricción UNIQUE de la base es la última protección.
        values["code"] = "WH-" + uuid.uuid4().hex[:12].upper()

    duplicate_code = db.query(Warehouse.id).filter(
        func.lower(Warehouse.code) == values["code"].lower()
    ).first()
    if duplicate_code:
        raise HTTPException(409, "Ya existe un depósito con ese código")

    warehouse = Warehouse(**values)
    try:
        db.add(warehouse)
        db.commit()
        db.refresh(warehouse)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Nombre o código de depósito duplicado")
    except Exception:
        db.rollback()
        raise

    return warehouse


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
    warehouse = db.query(Warehouse).filter(
        Warehouse.id == warehouse_id
    ).first()
    if not warehouse:
        raise HTTPException(404, "Depósito no encontrado")

    values = data.model_dump(exclude_unset=True)

    if "name" in values:
        duplicate = db.query(Warehouse.id).filter(
            func.lower(Warehouse.name) == values["name"].lower(),
            Warehouse.id != warehouse_id
        ).first()
        if duplicate:
            raise HTTPException(409, "Ya existe un depósito con ese nombre")

    if "code" in values:
        duplicate = db.query(Warehouse.id).filter(
            func.lower(Warehouse.code) == values["code"].lower(),
            Warehouse.id != warehouse_id
        ).first()
        if duplicate:
            raise HTTPException(409, "Ya existe un depósito con ese código")

    for field, value in values.items():
        setattr(warehouse, field, value)

    try:
        db.commit()
        db.refresh(warehouse)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Nombre o código de depósito duplicado")
    except Exception:
        db.rollback()
        raise

    return warehouse


@router.delete("/{warehouse_id}", status_code=204)
def delete_warehouse(warehouse_id: str, db: Session = Depends(get_db)):
    """
    Solo permite eliminar depósitos completamente sin uso.
    Los depósitos con actividad deben desactivarse.
    """
    wh = db.query(Warehouse).filter(
        Warehouse.id == warehouse_id
    ).first()

    if not wh:
        raise HTTPException(
            status_code=404,
            detail="Depósito no encontrado"
        )

    checks = [
        (
            "existencias o reservas",
            db.query(StockItem.id).filter(
                StockItem.warehouse_id == warehouse_id
            )
        ),
        (
            "órdenes de venta",
            db.query(SalesOrder.id).filter(
                SalesOrder.warehouse_id == warehouse_id
            )
        ),
        (
            "órdenes de compra",
            db.query(PurchaseOrder.id).filter(
                PurchaseOrder.warehouse_id == warehouse_id
            )
        ),
        (
            "remitos",
            db.query(DeliveryNote.id).filter(
                DeliveryNote.warehouse_id == warehouse_id
            )
        ),
        (
            "documentos comerciales o contables",
            db.query(Document.id).filter(
                Document.warehouse_id == warehouse_id
            )
        ),
        (
            "movimientos de stock",
            db.query(StockMovementHeader.id).filter(
                (StockMovementHeader.from_warehouse_id == warehouse_id) |
                (StockMovementHeader.to_warehouse_id == warehouse_id)
            )
        )
    ]

    for description, query in checks:
        if query.first() is not None:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"No se puede eliminar el depósito: "
                    f"tiene {description}. "
                    f"Desactivalo para conservar su historial."
                )
            )

    try:
        db.delete(wh)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=(
                "No se pudo eliminar el depósito porque "
                "tiene referencias o restricciones pendientes."
            )
        )


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
