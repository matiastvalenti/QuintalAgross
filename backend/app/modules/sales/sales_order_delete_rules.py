"""Protecciones para eliminar órdenes de venta."""


def validate_sales_order_deletion(db, order):
    from decimal import Decimal

    from app.db.models.commercial_models import (
        DeliveryNote,
        SalesOrderLine,
    )
    from app.db.models.models import DocumentLine
    from app.db.base import Base

    if db.query(DeliveryNote.id).filter(
        DeliveryNote.sales_order_id == order.id
    ).first():
        raise ValueError(
            "La OV tiene remitos asociados"
        )

    lines = db.query(SalesOrderLine).filter(
        SalesOrderLine.order_id == order.id
    ).all()

    line_ids = [line.id for line in lines]

    for line in lines:
        delivered = Decimal(str(line.qty_delivered or 0))
        invoiced = Decimal(str(line.qty_invoiced or 0))

        if delivered != 0 or invoiced != 0:
            raise ValueError(
                "La OV tiene cantidades entregadas o facturadas"
            )

    if line_ids and db.query(DocumentLine.id).filter(
        DocumentLine.source_sales_line_id.in_(line_ids)
    ).first():
        raise ValueError(
            "La OV tiene documentos vinculados"
        )

    for table_name in (
        "commission_applications",
        "commission_payments",
    ):
        table = Base.metadata.tables.get(table_name)

        if table is None:
            raise ValueError(
                f"No se pudo verificar {table_name}"
            )

        if db.execute(
            table.select()
            .with_only_columns(table.c.sales_order_id)
            .where(table.c.sales_order_id == order.id)
            .limit(1)
        ).first():
            raise ValueError(
                "La OV tiene comisiones vinculadas"
            )

    return True
