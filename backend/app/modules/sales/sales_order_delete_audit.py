"""Auditoría de eliminación de órdenes de venta.

El registro participa en la misma transacción que la eliminación.
No ejecuta commit.
"""

from app.db.models.auth_models import AuditLog


def register_sales_order_deletion(db, order, current_user):
    if current_user is None or not getattr(current_user, "id", None):
        raise ValueError(
            "Se requiere un usuario identificado para eliminar una OV"
        )

    username = (
        getattr(current_user, "username", None)
        or getattr(current_user, "email", None)
        or str(current_user.id)
    )

    line_snapshot = [
        {
            "line_id": line.id,
            "product_id": line.product_id,
            "qty": str(line.qty or 0),
            "qty_delivered": str(line.qty_delivered or 0),
            "qty_invoiced": str(line.qty_invoiced or 0),
        }
        for line in order.lines
    ]

    log = AuditLog(
        user_id=current_user.id,
        username=username,
        action="DELETE",
        module="sales_orders",
        target_id=order.id,
        description=(
            f"Eliminación de Orden de Venta {order.number}"
        ),
        data={
            "order_id": order.id,
            "order_number": order.number,
            "entity_id": order.entity_id,
            "warehouse_id": order.warehouse_id,
            "status": (
                order.status.value
                if hasattr(order.status, "value")
                else str(order.status)
            ),
            "lines": line_snapshot,
        },
    )

    db.add(log)
    return log
