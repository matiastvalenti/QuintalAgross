"""Validaciones para ajustes manuales de inventario."""

from decimal import Decimal, InvalidOperation
from fastapi import HTTPException
from app.db.models.commercial_models import Warehouse, StockItem


def validate_stock_adjustment(db, data):
    warehouse = db.get(Warehouse, data.warehouse_id)

    if warehouse is None:
        raise HTTPException(404, "Depósito inexistente")

    if not warehouse.active:
        raise HTTPException(409, "Depósito inactivo")

    try:
        qty = Decimal(str(data.qty))
    except (InvalidOperation, TypeError, ValueError):
        raise HTTPException(400, "Cantidad inválida")

    if not qty.is_finite() or qty == 0:
        raise HTTPException(400, "La cantidad debe ser distinta de cero")

    if qty.as_tuple().exponent < -2:
        raise HTTPException(400, "Máximo dos decimales")

    item = db.query(StockItem).filter(
        StockItem.product_id == data.product_id,
        StockItem.warehouse_id == data.warehouse_id,
    ).first()

    physical = Decimal(str(item.qty_on_hand or 0)) if item else Decimal("0")
    reserved = Decimal(str(item.qty_reserved or 0)) if item else Decimal("0")
    resulting = physical + qty

    if qty < 0 and resulting < reserved:
        raise HTTPException(
            409,
            "El ajuste dejaría stock insuficiente para las reservas",
        )

    return {
        "qty": qty,
        "physical_before": physical,
        "reserved": reserved,
        "physical_after": resulting,
    }
