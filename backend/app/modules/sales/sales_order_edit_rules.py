"""Validaciones de edición de órdenes de venta."""

from decimal import Decimal


def validate_sales_order_line_edit(
    old_product_id,
    delivered_qty,
    new_product_id,
    new_qty,
):
    delivered = Decimal(str(delivered_qty or 0))
    requested = Decimal(str(new_qty))

    if not delivered.is_finite() or delivered < 0:
        raise ValueError("Cantidad entregada inválida")

    if not requested.is_finite() or requested <= 0:
        raise ValueError("La cantidad debe ser mayor que cero")

    if delivered > 0 and str(old_product_id) != str(new_product_id):
        raise ValueError(
            "No se puede cambiar el producto de una línea ya entregada"
        )

    if requested < delivered:
        raise ValueError(
            "La cantidad no puede ser menor que lo ya entregado"
        )

    return True


def validate_sales_order_line_deletion(
    delivered_qty, invoiced_qty=0
):
    delivered = Decimal(str(delivered_qty or 0))
    invoiced = Decimal(str(invoiced_qty or 0))

    if not delivered.is_finite() or delivered < 0:
        raise ValueError("Cantidad entregada inválida")

    if not invoiced.is_finite() or invoiced < 0:
        raise ValueError("Cantidad facturada inválida")

    if delivered > 0:
        raise ValueError(
            "No se puede eliminar una línea con mercadería entregada"
        )

    if invoiced > 0:
        raise ValueError(
            "No se puede eliminar una línea con cantidades facturadas"
        )

    return True


def validate_sales_order_line_invoicing(
    old_product_id, invoiced_qty, new_product_id, new_qty
):
    invoiced = Decimal(str(invoiced_qty or 0))
    requested = Decimal(str(new_qty))

    if not invoiced.is_finite() or invoiced < 0:
        raise ValueError("Cantidad facturada inválida")

    if not requested.is_finite() or requested <= 0:
        raise ValueError("Cantidad inválida")

    if invoiced > 0 and str(old_product_id) != str(new_product_id):
        raise ValueError(
            "No se puede cambiar el producto de una línea facturada"
        )

    if requested < invoiced:
        raise ValueError(
            "La cantidad no puede ser menor que lo facturado"
        )

    return True
