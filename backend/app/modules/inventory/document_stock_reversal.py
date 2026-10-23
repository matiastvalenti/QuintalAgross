"""Reversión auditable de stock originado por documentos.

No realiza commit: participa de la transacción del documento.
"""

from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.models.commercial_models import (
    StockMovement,
    StockMovementType,
    StockItem,
)
from app.modules.inventory.reservation_reconciliation import (
    reconcile_product_reservations,
)


def reverse_document_stock_movement(
    db: Session,
    movement_id: str,
    document_id: str,
):
    original = db.query(StockMovement).filter(
        StockMovement.id == movement_id,
    ).first()

    if original is None:
        raise HTTPException(
            status_code=409,
            detail="No se encontró el movimiento original de stock",
        )

    if str(original.reference_id) != str(document_id):
        raise HTTPException(
            status_code=409,
            detail="El movimiento no pertenece al documento",
        )

    existing = db.query(StockMovement).filter(
        StockMovement.reference_type == "DOCUMENT_REVERSAL",
        StockMovement.reference_id == original.id,
    ).first()

    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="El movimiento ya fue revertido",
        )

    item = db.query(StockItem).filter(
        StockItem.id == original.stock_item_id,
    ).first()

    if item is None:
        raise HTTPException(
            status_code=409,
            detail="No existe el registro de stock del movimiento",
        )

    original_qty = Decimal(str(original.qty or 0))

    if original.movement_type == StockMovementType.IN:
        delta = -abs(original_qty)
        reverse_type = StockMovementType.OUT

    elif original.movement_type == StockMovementType.OUT:
        delta = abs(original_qty)
        reverse_type = StockMovementType.IN

    else:
        raise HTTPException(
            status_code=409,
            detail="Tipo de movimiento no reversible automáticamente",
        )

    item.qty_on_hand = (
        Decimal(str(item.qty_on_hand or 0)) + delta
    )

    reversal = StockMovement(
        stock_item_id=item.id,
        movement_type=reverse_type,
        qty=delta,
        reference_type="DOCUMENT_REVERSAL",
        reference_id=original.id,
        revision_id=document_id,
        stock_negative=item.qty_on_hand < 0,
        notes=(
            f"Reversión del movimiento {original.id} "
            f"del documento {document_id}"
        ),
    )

    db.add(reversal)
    db.flush()

    reconcile_product_reservations(
        db,
        item.product_id,
        item.warehouse_id,
    )

    return reversal
