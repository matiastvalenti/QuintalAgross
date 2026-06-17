"""Endpoints for Complex Stock Actions (Adjustments, Transfers, Multi-line)."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime
import uuid

from app.db.session import get_db
from app.db.models.commercial_models import (
    StockItem, StockMovement, StockMovementType, Product, Warehouse,
    StockMovementHeader, StockMovementLine
)
from . import stock_schemas
from app.modules.inventory.stock_utils import get_or_create_stock_item

router = APIRouter(prefix="/stock", tags=["Stock Actions"])

def _get_or_create_stock_item(db: Session, product_id: str, warehouse_id: str) -> StockItem:
    return get_or_create_stock_item(db, product_id, warehouse_id)

@router.post("/movements", status_code=201)
def create_stock_movement(data: stock_schemas.StockMovementHeaderCreate, db: Session = Depends(get_db)):
    """Create a new complex stock movement (multi-line)."""
    header = StockMovementHeader(
        number=data.number or f"ST-{str(uuid.uuid4())[:8]}",
        date=data.date or datetime.utcnow(),
        movement_type=data.movement_type,
        from_warehouse_id=data.from_warehouse_id,
        to_warehouse_id=data.to_warehouse_id,
        transporter=data.transporter,
        driver=data.driver,
        cost_center=data.cost_center,
        notes=data.notes,
        status="CONFIRMED"
    )
    db.add(header)
    db.flush()
    
    revision_id = str(uuid.uuid4())
    
    for line_data in data.lines:
        line = StockMovementLine(
            header_id=header.id,
            product_id=line_data.product_id,
            qty=line_data.qty,
            batch=line_data.batch,
            expiry_date=line_data.expiry_date,
            container_qty=line_data.container_qty,
            container_type=line_data.container_type,
            notes=line_data.notes
        )
        db.add(line)
        db.flush()
        
        # 1. Source Impact (OUT or ADJUSTMENT)
        if data.from_warehouse_id:
            from_item = _get_or_create_stock_item(db, line.product_id, data.from_warehouse_id)
            from_item.qty_on_hand = float(from_item.qty_on_hand) - float(line.qty)
            
            # Movement record
            db.add(StockMovement(
                stock_item_id=from_item.id,
                movement_type=StockMovementType.OUT if data.to_warehouse_id else StockMovementType.ADJUSTMENT,
                qty=-line.qty,
                reference_type="STOCK_MOVEMENT",
                reference_id=header.id,
                revision_id=revision_id,
                notes=f"Línea {line.id} - Documento {header.number}"
            ))
            
        # 2. Destination Impact (IN)
        if data.to_warehouse_id:
            to_item = _get_or_create_stock_item(db, line.product_id, data.to_warehouse_id)
            to_item.qty_on_hand = float(to_item.qty_on_hand) + float(line.qty)
            
            # Movement record
            db.add(StockMovement(
                stock_item_id=to_item.id,
                movement_type=StockMovementType.IN,
                qty=line.qty,
                reference_type="STOCK_MOVEMENT",
                reference_id=header.id,
                revision_id=revision_id,
                notes=f"Línea {line.id} - Documento {header.number}"
            ))
            
    db.commit()
    db.refresh(header)
    return {"id": header.id, "number": header.number}

@router.get("/movements", response_model=List[dict])
def list_stock_movements(
    movement_type: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    cost_center: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """List complex stock movement documents."""
    q = db.query(StockMovementHeader).options(joinedload(StockMovementHeader.lines))
    
    if movement_type:
        q = q.filter(StockMovementHeader.movement_type == movement_type)
    if from_date:
        q = q.filter(StockMovementHeader.date >= from_date)
    if to_date:
        q = q.filter(StockMovementHeader.date <= to_date)
    if cost_center:
        q = q.filter(StockMovementHeader.cost_center == cost_center)
        
    headers = q.order_by(StockMovementHeader.date.desc()).all()
    
    results = []
    for h in headers:
        results.append({
            "id": h.id,
            "number": h.number,
            "date": h.date,
            "movement_type": h.movement_type,
            "from_warehouse_name": h.from_warehouse.name if h.from_warehouse else None,
            "to_warehouse_name": h.to_warehouse.name if h.to_warehouse else None,
            "status": h.status,
            "notes": h.notes,
            "item_count": len(h.lines)
        })
    return results

@router.get("/movements/{header_id}", response_model=dict)
def get_stock_movement(header_id: str, db: Session = Depends(get_db)):
    """Get single document with lines."""
    header = db.query(StockMovementHeader).options(
        joinedload(StockMovementHeader.lines).joinedload(StockMovementLine.product)
    ).filter(StockMovementHeader.id == header_id).first()
    
    if not header:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
        
    return {
        "id": header.id,
        "number": header.number,
        "date": header.date,
        "movement_type": header.movement_type,
        "from_warehouse_id": header.from_warehouse_id,
        "from_warehouse_name": header.from_warehouse.name if header.from_warehouse else None,
        "to_warehouse_id": header.to_warehouse_id,
        "to_warehouse_name": header.to_warehouse.name if header.to_warehouse else None,
        "transporter": header.transporter,
        "driver": header.driver,
        "cost_center": header.cost_center,
        "status": header.status,
        "notes": header.notes,
        "lines": [{
            "id": l.id,
            "product_id": l.product_id,
            "product_name": l.product.name if l.product else "?",
            "qty": float(l.qty),
            "batch": l.batch,
            "expiry_date": l.expiry_date,
            "container_qty": float(l.container_qty) if l.container_qty else None,
            "container_type": l.container_type,
            "notes": l.notes
        } for l in header.lines]
    }

@router.delete("/movements/{header_id}", status_code=204)
def void_stock_movement(header_id: str, db: Session = Depends(get_db)):
    """Void a movement and reverse stock impacts."""
    header = db.query(StockMovementHeader).filter(StockMovementHeader.id == header_id).first()
    if not header:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    if header.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Ya se encuentra anulado")
        
    # Reverse impact line by line
    revision_id = f"REV-{header.id}"
    for line in header.lines:
        # Reverse Source Impact
        if header.from_warehouse_id:
            from_item = _get_or_create_stock_item(db, line.product_id, header.from_warehouse_id)
            from_item.qty_on_hand = float(from_item.qty_on_hand) + float(line.qty) # Add back
            db.add(StockMovement(
                stock_item_id=from_item.id,
                movement_type=StockMovementType.IN,
                qty=line.qty,
                reference_type="REVERSAL",
                reference_id=header.id,
                revision_id=revision_id,
                notes=f"Reversión de Línea {line.id}"
            ))
            
        # Reverse Destination Impact
        if header.to_warehouse_id:
            to_item = _get_or_create_stock_item(db, line.product_id, header.to_warehouse_id)
            to_item.qty_on_hand = float(to_item.qty_on_hand) - float(line.qty) # Subtract back
            db.add(StockMovement(
                stock_item_id=to_item.id,
                movement_type=StockMovementType.OUT,
                qty=-line.qty,
                reference_type="REVERSAL",
                reference_id=header.id,
                revision_id=revision_id,
                notes=f"Reversión de Línea {line.id}"
            ))
            
    header.status = "CANCELLED"
    db.commit()


# ── Keep compatibility for old simple endpoints if needed ──
@router.post("/adjust", status_code=201)
def adjust_stock(data: stock_schemas.StockAdjustmentCreate, db: Session = Depends(get_db)):
    """Legacy endpoint for single product adjust."""
    item = _get_or_create_stock_item(db, data.product_id, data.warehouse_id)
    item.qty_on_hand = float(item.qty_on_hand) + float(data.qty)
    mov = StockMovement(
        stock_item_id=item.id,
        movement_type=StockMovementType.ADJUSTMENT,
        qty=data.qty,
        reference_type="MANUAL_ADJUSTMENT",
        notes=data.notes,
        created_at=data.date or datetime.utcnow()
    )
    db.add(mov)
    db.commit()
    return {"status": "ok"}

@router.get("/history", response_model=List[dict])
def get_stock_history(
    product_id: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    reference_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Generic list of stock movements (audit trail)."""
    q = db.query(StockMovement).join(StockItem)
    if product_id: q = q.filter(StockItem.product_id == product_id)
    if warehouse_id: q = q.filter(StockItem.warehouse_id == warehouse_id)
    if reference_type: q = q.filter(StockMovement.reference_type == reference_type)
    movements = q.order_by(StockMovement.created_at.desc()).limit(100).all()
    return [{
        "id": m.id,
        "date": m.created_at,
        "product_name": m.stock_item.product.name if m.stock_item.product else "?",
        "warehouse_name": m.stock_item.warehouse.name if m.stock_item.warehouse else "?",
        "qty": float(m.qty),
        "type": m.movement_type.value,
        "reference": m.reference_type,
        "notes": m.notes,
        "revision_id": m.revision_id
    } for m in movements]
