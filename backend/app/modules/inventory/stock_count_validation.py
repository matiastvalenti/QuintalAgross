"""Cálculo y validación de recuentos físicos."""

from decimal import Decimal, InvalidOperation
from fastapi import HTTPException


def calculate_stock_count(physical, reserved, counted):
    try:
        physical = Decimal(str(physical))
        reserved = Decimal(str(reserved))
        counted = Decimal(str(counted))
    except (InvalidOperation, TypeError, ValueError):
        raise HTTPException(400, "Cantidad inválida")

    if not all(x.is_finite() for x in (physical, reserved, counted)):
        raise HTTPException(400, "Cantidad no finita")

    if counted < 0:
        raise HTTPException(400, "El recuento no puede ser negativo")

    if counted.as_tuple().exponent < -2:
        raise HTTPException(400, "Máximo dos decimales")

    if reserved < 0:
        raise HTTPException(409, "Reservas inconsistentes")

    if counted < reserved:
        raise HTTPException(
            409,
            "La cantidad contada es inferior al stock reservado",
        )

    difference = counted - physical

    return {
        "physical_before": physical,
        "counted_qty": counted,
        "difference": difference,
        "reserved_qty": reserved,
        "available_after": counted - reserved,
        "requires_adjustment": difference != 0,
    }
