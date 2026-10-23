from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.modules.auth.auth_router import get_current_user
from app.db.models.stock_count_models import StockCount
from .stock_authorization import authorize_stock_action
from .stock_count_service import (
    create_pending_stock_count, approve_stock_count, reject_stock_count
)

router = APIRouter(prefix="/stock/counts", tags=["Stock Counts"])

class CountLineInput(BaseModel):
    product_id: str
    counted_qty: str

class CountInput(BaseModel):
    warehouse_id: str
    lines: list[CountLineInput] = Field(min_length=1)
    notes: str | None = None

def serialize(count):
    return {
        "id": count.id,
        "warehouse_id": count.warehouse_id,
        "status": count.status,
        "counted_by": count.counted_by,
        "approved_by": count.approved_by,
        "created_at": count.created_at,
        "reviewed_at": count.reviewed_at,
        "notes": count.notes,
        "lines": [{
            "product_id": line.product_id,
            "system_qty": str(line.system_qty),
            "reserved_qty": str(line.reserved_qty),
            "counted_qty": str(line.counted_qty),
            "difference": str(line.difference),
        } for line in count.lines],
    }

@router.post("")
def create_count(data: CountInput, db: Session = Depends(get_db),
                 user=Depends(get_current_user)):
    authorize_stock_action(db, user, "count")
    try:
        count = create_pending_stock_count(
            db, data.warehouse_id,
            [line.model_dump() for line in data.lines],
            user.id, data.notes
        )
        result = serialize(count)
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise

@router.get("")
def list_counts(db: Session = Depends(get_db),
                user=Depends(get_current_user)):
    authorize_stock_action(db, user, "view")
    counts = db.query(StockCount).order_by(
        StockCount.created_at.desc()
    ).limit(100).all()
    return [serialize(count) for count in counts]

@router.get("/{count_id}")
def get_count(count_id: str, db: Session = Depends(get_db),
              user=Depends(get_current_user)):
    authorize_stock_action(db, user, "view")
    count = db.get(StockCount, count_id)
    if count is None:
        raise HTTPException(404, "Recuento inexistente")
    return serialize(count)

@router.post("/{count_id}/approve")
def approve_count(count_id: str, db: Session = Depends(get_db),
                  user=Depends(get_current_user)):
    # Conservar la identidad autenticada antes de cerrar la lectura.
    user_id = user.id
    try:
        authorize_stock_action(db, user, "approve")

        # La autenticación puede haber abierto una transacción de lectura.
        # Finalizarla antes de reservar la escritura en SQLite.
        if db.bind.dialect.name == "sqlite":
            if db.in_transaction():
                db.rollback()
            db.connection().exec_driver_sql("BEGIN IMMEDIATE")

        count = approve_stock_count(db, count_id, user_id)
        return serialize(count)
    except Exception:
        db.rollback()
        raise

@router.post("/{count_id}/reject")
def reject_count(count_id: str, db: Session = Depends(get_db),
                 user=Depends(get_current_user)):
    authorize_stock_action(db, user, "approve")
    count = reject_stock_count(db, count_id, user.id)
    return serialize(count)
