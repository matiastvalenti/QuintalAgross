"""
Conciliación centralizada de reservas por producto y depósito.

No realiza commit ni modifica el stock físico.
"""

from decimal import Decimal

from sqlalchemy.orm import Session

from app.db.models.commercial_models import (
    SalesOrder,
    SalesOrderLine,
    StockItem,
    OrderStatus,
)
from app.modules.inventory.reservation_calculator import (
    allocate_pending_reservations,
)
from app.modules.inventory.stock_utils import (
    get_or_create_stock_item,
)


NON_RESERVING_STATUSES = (
    OrderStatus.DRAFT,
    OrderStatus.CANCELLED,
)


def reconcile_product_reservations(
    db: Session,
    product_id: str,
    warehouse_id: str,
):
    """
    Recalcula reservas agregadas para un producto y depósito.

    Prioridad: fecha de OV, número de OV e ID de línea.
    No realiza commit.
    """

    if not product_id or not warehouse_id:
        raise ValueError(
            "Se requieren producto y depósito para conciliar"
        )

    # Sincronizar modificaciones pendientes de la transacción.
    db.flush()

    item = get_or_create_stock_item(
        db,
        product_id,
        warehouse_id,
    )

    rows = (
        db.query(SalesOrderLine, SalesOrder)
        .join(
            SalesOrder,
            SalesOrderLine.order_id == SalesOrder.id,
        )
        .filter(
            SalesOrderLine.product_id == product_id,
            SalesOrder.warehouse_id == warehouse_id,
            SalesOrder.status.notin_(NON_RESERVING_STATUSES),
        )
        .order_by(
            SalesOrder.date.asc(),
            SalesOrder.number.asc(),
            SalesOrderLine.id.asc(),
        )
        .all()
    )

    pending_orders = []

    for line, order in rows:
        requested = Decimal(str(line.qty or 0))
        delivered = Decimal(str(line.qty_delivered or 0))

        if requested < 0 or delivered < 0:
            raise ValueError(
                f"Cantidad negativa en OV {order.number}"
            )

        pending = max(
            Decimal("0"),
            requested - delivered,
        )

        if pending > 0:
            pending_orders.append({
                "order_id": line.id,
                "pending_qty": pending,
            })

    allocation = allocate_pending_reservations(
        item.qty_on_hand or 0,
        pending_orders,
    )

    item.qty_reserved = allocation["total_reserved"]

    db.flush()

    return {
        "product_id": product_id,
        "warehouse_id": warehouse_id,
        "physical": allocation["physical"],
        "reserved": allocation["total_reserved"],
        "available": allocation["available"],
        "shortage": allocation["total_shortage"],
        "allocations": allocation["allocations"],
    }
