"""Validaciones para transferencias entre depósitos."""

from decimal import Decimal, InvalidOperation

from fastapi import HTTPException

from app.db.models.commercial_models import (
    Warehouse,
    StockItem,
)


def validate_stock_transfer(db, data):
    """Valida una transferencia sin modificar existencias."""

    if data.movement_type != "TRANSFER":
        raise HTTPException(
            400,
            "El movimiento debe ser de tipo TRANSFER",
        )

    origin_id = data.from_warehouse_id
    destination_id = data.to_warehouse_id

    if not origin_id or not destination_id:
        raise HTTPException(
            400,
            "La transferencia requiere origen y destino",
        )

    if origin_id == destination_id:
        raise HTTPException(
            400,
            "El depósito de origen y destino deben ser distintos",
        )

    origin = db.get(Warehouse, origin_id)
    destination = db.get(Warehouse, destination_id)

    if not origin or not destination:
        raise HTTPException(
            404,
            "Uno de los depósitos no existe",
        )

    if not origin.active or not destination.active:
        raise HTTPException(
            409,
            "No se puede transferir entre depósitos inactivos",
        )

    if not data.lines:
        raise HTTPException(
            400,
            "La transferencia necesita al menos un producto",
        )

    seen = set()
    validated = []

    for line in data.lines:
        product_id = line.product_id

        if product_id in seen:
            raise HTTPException(
                400,
                "Un producto no puede repetirse en la transferencia",
            )

        seen.add(product_id)

        try:
            qty = Decimal(str(line.qty))
        except (InvalidOperation, ValueError, TypeError):
            raise HTTPException(
                400,
                "Cantidad de transferencia inválida",
            )

        if not qty.is_finite() or qty <= 0:
            raise HTTPException(
                400,
                "Las cantidades deben ser positivas",
            )

        if qty.as_tuple().exponent < -2:
            raise HTTPException(
                400,
                "La cantidad admite como máximo dos decimales",
            )

        item = (
            db.query(StockItem)
            .filter(
                StockItem.product_id == product_id,
                StockItem.warehouse_id == origin_id,
            )
            .first()
        )

        physical = (
            Decimal(str(item.qty_on_hand or 0))
            if item else Decimal("0")
        )

        reserved = (
            Decimal(str(item.qty_reserved or 0))
            if item else Decimal("0")
        )

        available = physical - reserved

        if qty > available:
            raise HTTPException(
                409,
                (
                    f"Stock disponible insuficiente para "
                    f"el producto {product_id}. "
                    f"Disponible: {available}; "
                    f"solicitado: {qty}"
                ),
            )

        validated.append({
            "product_id": product_id,
            "qty": qty,
            "available": available,
        })

    return {
        "from_warehouse_id": origin_id,
        "to_warehouse_id": destination_id,
        "lines": validated,
    }
