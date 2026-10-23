from decimal import Decimal


def calculate_reservation(on_hand, reserved, requested):
    physical = Decimal(str(on_hand))
    already_reserved = Decimal(str(reserved))
    demand = Decimal(str(requested))

    if physical < 0:
        physical = Decimal("0")

    if already_reserved < 0:
        raise ValueError("Las reservas existentes no pueden ser negativas")

    if demand < 0:
        raise ValueError("La cantidad solicitada no puede ser negativa")

    available = max(
        Decimal("0"),
        physical - already_reserved
    )

    to_reserve = min(demand, available)
    shortage = demand - to_reserve

    return {
        "physical": physical,
        "already_reserved": already_reserved,
        "available": available,
        "requested": demand,
        "to_reserve": to_reserve,
        "shortage": shortage,
    }


def allocate_pending_reservations(on_hand, pending_orders):
    """
    Distribuye stock físico entre demandas pendientes.

    pending_orders:
      Lista de diccionarios con:
      - order_id
      - pending_qty

    La lista debe venir ordenada por prioridad.

    No modifica bases de datos.
    """
    physical = Decimal(str(on_hand))

    if not physical.is_finite():
        raise ValueError("Stock físico inválido")

    available = max(Decimal("0"), physical)
    allocations = []

    for order in pending_orders:
        requested = Decimal(str(order["pending_qty"]))

        if not requested.is_finite() or requested < 0:
            raise ValueError("Cantidad pendiente inválida")

        reserved = min(requested, available)
        shortage = requested - reserved

        allocations.append({
            "order_id": order["order_id"],
            "pending_qty": requested,
            "reserved": reserved,
            "shortage": shortage,
        })

        available -= reserved

    return {
        "physical": physical,
        "total_reserved": sum(
            (item["reserved"] for item in allocations),
            Decimal("0"),
        ),
        "total_shortage": sum(
            (item["shortage"] for item in allocations),
            Decimal("0"),
        ),
        "available": available,
        "allocations": allocations,
    }
