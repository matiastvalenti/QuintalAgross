"""Validación de anulaciones de transferencias."""

from collections import defaultdict
from decimal import Decimal

from fastapi import HTTPException

from app.db.models.commercial_models import StockItem
from app.modules.inventory.reservation_reconciliation import (
    reconcile_product_reservations,
)


def validate_transfer_cancellation(db, header):
    """Verifica que una transferencia pueda revertirse."""

    if header.movement_type != "TRANSFER":
        return

    if header.status == "CANCELLED":
        raise HTTPException(
            400,
            "La transferencia ya se encuentra anulada",
        )

    if header.status != "CONFIRMED":
        raise HTTPException(
            409,
            "Solo se pueden anular transferencias confirmadas",
        )

    if not header.from_warehouse_id or not header.to_warehouse_id:
        raise HTTPException(
            409,
            "La transferencia no tiene origen y destino válidos",
        )

    if header.from_warehouse_id == header.to_warehouse_id:
        raise HTTPException(
            409,
            "La transferencia tiene depósitos iguales",
        )

    required = defaultdict(lambda: Decimal("0"))

    for line in header.lines:
        qty = Decimal(str(line.qty))

        if not qty.is_finite() or qty <= 0:
            raise HTTPException(
                409,
                "La transferencia contiene cantidades inválidas",
            )

        required[line.product_id] += qty

    if not required:
        raise HTTPException(
            409,
            "La transferencia no contiene productos",
        )

    destination_id = header.to_warehouse_id

    # Recalcular reservas comerciales antes de validar.
    for product_id in sorted(required):
        reconcile_product_reservations(
            db,
            product_id,
            destination_id,
        )

    db.flush()

    for product_id, qty in required.items():
        item = (
            db.query(StockItem)
            .filter(
                StockItem.product_id == product_id,
                StockItem.warehouse_id == destination_id,
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

        if available < qty:
            raise HTTPException(
                409,
                (
                    "No se puede anular la transferencia: "
                    f"el producto {product_id} tiene "
                    f"{available} disponibles en destino "
                    f"y se necesitan {qty}. "
                    "Puede existir mercadería reservada "
                    "o utilizada posteriormente."
                ),
            )

    return {
        "destination_warehouse_id": destination_id,
        "required": dict(required),
    }
