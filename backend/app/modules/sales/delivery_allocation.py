"""Quantity allocation for invoiced sales delivered through one or more notes."""
from decimal import Decimal
from app.db.models.models import Document, DocumentLine, DocumentStatus, DocumentType
from app.db.models.commercial_models import DeliveryNote, DeliveryNoteLine, DeliveryNoteStatus, DeliveryNoteType

ACTIVE_DELIVERY_STATUSES = (DeliveryNoteStatus.DISPATCHED, DeliveryNoteStatus.INVOICED, DeliveryNoteStatus.PARTIAL)
SALES_INVOICE_TYPES = (DocumentType.INVOICE, DocumentType.FCE_MIPYME, DocumentType.TIQUET_FACTURA)


def allocate_quantities(invoice_lines, delivery_lines):
    """Honor explicit links first, then allocate remaining quantities by order line.

    Never change a financial line's source ID to represent a partial delivery.
    The returned tuples are (invoice line, delivery line, matched quantity).
    """
    available = {line.id: Decimal(str(line.qty or 0)) for line in delivery_lines
                 if line.delivery_note.delivery_type != DeliveryNoteType.RETURN}
    # Returns reopen pending delivery; deduct from the newest dispatches first.
    for returned in delivery_lines:
        if returned.delivery_note.delivery_type != DeliveryNoteType.RETURN:
            continue
        remaining = Decimal(str(returned.qty or 0))
        for line in reversed(delivery_lines):
            if line.id not in available or line.source_sales_line_id != returned.source_sales_line_id or line.product_id != returned.product_id:
                continue
            if returned.delivery_note.return_source_id and line.delivery_note_id != returned.delivery_note.return_source_id:
                continue
            used = min(remaining, available[line.id])
            available[line.id] -= used
            remaining -= used
            if remaining <= 0:
                break
    pending = {line.id: Decimal(str(line.qty or 0)) for line in invoice_lines}
    matches = []

    def match(invoice, delivery):
        qty = min(pending[invoice.id], available.get(delivery.id, Decimal(0)))
        if qty > 0:
            matches.append((invoice, delivery, qty))
            pending[invoice.id] -= qty
            available[delivery.id] -= qty

    for invoice in invoice_lines:
        for delivery in delivery_lines:
            if invoice.source_dn_line_id == delivery.id:
                match(invoice, delivery)
    for invoice in invoice_lines:
        if not invoice.source_sales_line_id:
            continue
        for delivery in delivery_lines:
            if delivery.source_sales_line_id == invoice.source_sales_line_id:
                match(invoice, delivery)
    return matches


def invoice_delivery_progress(db, document):
    """Read-only per-product pending quantities, separate from payment status."""
    if document.doc_type not in SALES_INVOICE_TYPES or document.status in (DocumentStatus.DRAFT, DocumentStatus.CANCELLED):
        return 'NOT_REQUIRED', []
    goods = [line for line in document.lines if line.product and not line.product.is_service]
    if not goods:
        return 'NOT_REQUIRED', []
    order_ids = {line.source_sales_line_id for line in goods if line.source_sales_line_id}
    source_ids = {line.source_dn_line_id for line in goods if line.source_dn_line_id}
    from sqlalchemy import or_
    deliveries = db.query(DeliveryNoteLine).join(DeliveryNote).filter(
        or_(DeliveryNoteLine.source_sales_line_id.in_(order_ids), DeliveryNoteLine.id.in_(source_ids)),
        DeliveryNote.status.in_(ACTIVE_DELIVERY_STATUSES),
        DeliveryNote.entity_id == document.entity_id,
    ).order_by(DeliveryNote.date, DeliveryNote.id, DeliveryNoteLine.line_order, DeliveryNoteLine.id).all()
    # Competing invoices must be included so a dispatch is never counted twice.
    lines = db.query(DocumentLine).join(Document).filter(
        or_(DocumentLine.source_sales_line_id.in_(order_ids), DocumentLine.source_dn_line_id.in_([d.id for d in deliveries]), DocumentLine.document_id == document.id),
        Document.doc_type.in_(SALES_INVOICE_TYPES),
        Document.status.notin_([DocumentStatus.CANCELLED, DocumentStatus.DRAFT]),
        Document.entity_id == document.entity_id,
    ).order_by(Document.date, Document.created_at, Document.id, DocumentLine.line_order, DocumentLine.id).all()
    delivered = {}
    for invoice, delivery, qty in allocate_quantities(lines, deliveries):
        delivered[invoice.id] = delivered.get(invoice.id, Decimal(0)) + qty
    detail = []
    for line in goods:
        qty = Decimal(str(line.qty or 0))
        done = min(qty, delivered.get(line.id, Decimal(0)))
        detail.append({'line_id':line.id, 'description':line.description,
                       'unit':line.product.unit_of_measure, 'qty':float(qty),
                       'delivered_qty':float(done), 'pending_qty':float(max(Decimal(0), qty-done))})
    status = 'DELIVERED' if all(row['pending_qty'] == 0 for row in detail) else ('PARTIAL' if any(row['delivered_qty'] > 0 for row in detail) else 'PENDING')
    return status, detail
