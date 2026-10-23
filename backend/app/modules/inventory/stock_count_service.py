from datetime import datetime
"""Registro de recuentos físicos pendientes."""

from decimal import Decimal
from fastapi import HTTPException
from app.db.models.commercial_models import Warehouse, Product, StockItem
from app.db.models.stock_count_models import StockCount, StockCountLine
from .stock_count_validation import calculate_stock_count


def create_pending_stock_count(db, warehouse_id, lines, user_id, notes=None):
    warehouse = db.get(Warehouse, warehouse_id)
    if warehouse is None:
        raise HTTPException(404, "Depósito inexistente")
    if not warehouse.active:
        raise HTTPException(409, "Depósito inactivo")
    if not lines:
        raise HTTPException(400, "El recuento debe tener productos")
    if not user_id:
        raise HTTPException(401, "Usuario no identificado")

    count = StockCount(
        warehouse_id=warehouse_id,
        counted_by=str(user_id),
        status="PENDING",
        notes=notes,
    )
    seen = set()

    for line in lines:
        product_id = line["product_id"]
        if product_id in seen:
            raise HTTPException(400, "Producto duplicado en el recuento")
        seen.add(product_id)

        product = db.get(Product, product_id)
        if product is None:
            raise HTTPException(404, "Producto inexistente")
        if not product.active or product.is_service:
            raise HTTPException(409, "Producto no habilitado para stock")

        item = db.query(StockItem).filter(
            StockItem.product_id == product_id,
            StockItem.warehouse_id == warehouse_id,
        ).first()

        physical = Decimal(str(item.qty_on_hand or 0)) if item else Decimal("0")
        reserved = Decimal(str(item.qty_reserved or 0)) if item else Decimal("0")
        result = calculate_stock_count(
            physical, reserved, line["counted_qty"]
        )

        count.lines.append(StockCountLine(
            product_id=product_id,
            system_qty=result["physical_before"],
            reserved_qty=result["reserved_qty"],
            counted_qty=result["counted_qty"],
            difference=result["difference"],
        ))

    db.add(count)
    db.flush()
    return count


def approve_stock_count(db, count_id, user_id):
    from datetime import datetime
    from app.db.models.commercial_models import (
        StockMovement, StockMovementType
    )
    from .reservation_reconciliation import reconcile_product_reservations

    count = db.get(StockCount, count_id)
    if count is None:
        raise HTTPException(404, "Recuento inexistente")
    if count.status != "PENDING":
        raise HTTPException(409, "Recuento ya procesado")
    if not user_id:
        raise HTTPException(401, "Usuario no identificado")

    warehouse = db.get(Warehouse, count.warehouse_id)
    if warehouse is None or not warehouse.active:
        raise HTTPException(409, "Depósito no disponible")

    try:
        changes = []
        for line in count.lines:
            reconcile_product_reservations(
                db, line.product_id, count.warehouse_id
            )
            item = db.query(StockItem).filter(
                StockItem.product_id == line.product_id,
                StockItem.warehouse_id == count.warehouse_id,
            ).first()
            physical = Decimal(str(item.qty_on_hand or 0)) if item else Decimal("0")
            reserved = Decimal(str(item.qty_reserved or 0)) if item else Decimal("0")

            if physical != line.system_qty or reserved != line.reserved_qty:
                raise HTTPException(
                    409, "El stock cambió: se requiere nuevo recuento"
                )
            result = calculate_stock_count(
                physical, reserved, line.counted_qty
            )
            changes.append((line, item, result["difference"]))

        for line, item, difference in changes:
            if difference == 0:
                continue
            if item is None:
                item = StockItem(
                    product_id=line.product_id,
                    warehouse_id=count.warehouse_id,
                    qty_on_hand=Decimal("0"),
                    qty_reserved=Decimal("0"),
                )
                db.add(item)
                db.flush()

            item.qty_on_hand = Decimal(str(item.qty_on_hand)) + difference
            db.add(StockMovement(
                stock_item_id=item.id,
                movement_type=StockMovementType.ADJUSTMENT,
                qty=difference,
                reference_type="STOCK_COUNT",
                reference_id=count.id,
                stock_negative=item.qty_on_hand < 0,
                notes=count.notes,
                created_at=datetime.utcnow(),
            ))

        updated = db.query(StockCount).filter(
            StockCount.id == count_id,
            StockCount.status == "PENDING",
        ).update({
            StockCount.status: "APPROVED",
            StockCount.approved_by: str(user_id),
            StockCount.reviewed_at: datetime.utcnow(),
        }, synchronize_session=False)
        if updated != 1:
            raise HTTPException(409, "Recuento ya procesado")
        db.commit()
        db.refresh(count)
        return count
    except Exception:
        db.rollback()
        raise


def reject_stock_count(db, count_id, user_id):
    count = db.get(StockCount, count_id)
    if count is None:
        raise HTTPException(404, "Recuento inexistente")
    if count.status != "PENDING":
        raise HTTPException(409, "Recuento ya procesado")
    if not user_id:
        raise HTTPException(401, "Usuario no identificado")

    try:
        count.status = "REJECTED"
        count.approved_by = str(user_id)
        count.reviewed_at = datetime.utcnow()
        db.commit()
        return count
    except Exception:
        db.rollback()
        raise
