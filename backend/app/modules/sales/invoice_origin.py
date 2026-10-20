"""Sales goods need an explicit order; services and free-text concepts do not."""
from fastapi import HTTPException
from app.db.models.commercial_models import Product, SalesOrderLine, OrderStatus, DeliveryNoteLine
from .delivery_allocation import SALES_INVOICE_TYPES, ACTIVE_DELIVERY_STATUSES


def validate_invoice_origins(db, doc_type, entity_id, lines):
    if doc_type not in SALES_INVOICE_TYPES:
        return
    for line in lines or []:
        product_id = getattr(line, 'product_id', None)
        if not product_id:
            continue
        product = db.get(Product, product_id)
        if not product:
            raise HTTPException(400, 'El producto seleccionado no existe.')
        if product.is_service:
            continue
        order_line_id = getattr(line, 'source_sales_line_id', None)
        delivery_line_id = getattr(line, 'source_dn_line_id', None)
        if delivery_line_id:
            delivery_line = db.get(DeliveryNoteLine, delivery_line_id)
            if (not delivery_line or delivery_line.product_id != product_id or
                    delivery_line.delivery_note.entity_id != entity_id or
                    delivery_line.delivery_note.status not in ACTIVE_DELIVERY_STATUSES):
                raise HTTPException(400, 'El remito de origen debe estar confirmado y corresponder al mismo cliente y producto.')
            if order_line_id and order_line_id != delivery_line.source_sales_line_id:
                raise HTTPException(400, 'La OV y el remito de origen no corresponden a la misma línea.')
            order_line_id = delivery_line.source_sales_line_id
        order_line = db.get(SalesOrderLine, order_line_id) if order_line_id else None
        if (not order_line or order_line.product_id != product_id or
                order_line.order.entity_id != entity_id or order_line.order.status == OrderStatus.CANCELLED):
            raise HTTPException(400, f"El producto '{product.name}' requiere una OV vigente del mismo cliente y producto. Los servicios pueden facturarse sin OV.")
