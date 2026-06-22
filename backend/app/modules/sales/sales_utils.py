from sqlalchemy.orm import Session
from sqlalchemy import func
from decimal import Decimal
import logging
from app.db.models.models import Document, DocumentLine, DocumentStatus
from app.db.models.commercial_models import (
    SalesOrder, SalesOrderLine, OrderStatus, 
    DeliveryNote, DeliveryNoteLine, DeliveryNoteStatus, 
    OrderType, PurchaseOrder, PurchaseOrderLine,
    InvoiceDeliveryNoteLink
)

logger = logging.getLogger(__name__)

def recalc_sales_order_traceability_strict(db: Session, order: SalesOrder) -> list:
    """
    Recalcula estrictamente qty_delivered y qty_invoiced de una OV
    basándose solo en vínculos duros (source_sales_line_id). No usa fuzzy matching.
    """
    if not order.lines:
        return []

    # Remitos vinculados (status != CANCELLED)
    dns = db.query(DeliveryNote).filter(
        DeliveryNote.sales_order_id == order.id,
        DeliveryNote.status != DeliveryNoteStatus.CANCELLED
    ).all()
    dn_ids = [dn.id for dn in dns]

    # Facturas vinculadas por tabla puente (RV -> FV)
    invoice_links = db.query(InvoiceDeliveryNoteLink).filter(
        InvoiceDeliveryNoteLink.delivery_note_id.in_(dn_ids)
    ).all() if dn_ids else []
    invoice_ids = {link.document_id for link in invoice_links}

    # Facturas vinculadas directo a líneas (OV -> FV)
    line_ids = [l.id for l in order.lines]
    direct_invoice_ids = db.query(DocumentLine.document_id).filter(
        DocumentLine.source_sales_line_id.in_(line_ids)
    ).all()
    invoice_ids.update([r[0] for r in direct_invoice_ids])

    invoices = db.query(Document).filter(
        Document.id.in_(list(invoice_ids)),
        Document.status != DocumentStatus.CANCELLED
    ).all() if invoice_ids else []

    any_change = False
    recalculated_lines = []

    for line in order.lines:
        line_id = str(line.id)
        old_delivered = float(line.qty_delivered or 0)
        old_invoiced = float(line.qty_invoiced or 0)

        # Sumar remitos
        total_deliv = Decimal("0.0")
        for dn in dns:
            for dnl in dn.lines:
                if str(dnl.source_sales_line_id) == line_id:
                    total_deliv += Decimal(str(dnl.qty or 0))

        # Sumar facturas
        total_inv = Decimal("0.0")
        for inv in invoices:
            for il in inv.lines:
                if str(il.source_sales_line_id) == line_id:
                    total_inv += Decimal(str(il.qty or 0))

        if old_delivered != float(total_deliv) or old_invoiced != float(total_inv):
            line.qty_delivered = total_deliv
            line.qty_invoiced = total_inv
            any_change = True

        recalculated_lines.append({
            "line_id": str(line.id),
            "product_id": str(line.product_id),
            "qty_ordered": float(line.qty),
            "old_qty_delivered": old_delivered,
            "new_qty_delivered": float(total_deliv),
            "old_qty_invoiced": old_invoiced,
            "new_qty_invoiced": float(total_inv)
        })

    if any_change:
        db.flush()
        recalc_sales_order_status(db, order.id)

    return recalculated_lines

def recalc_purchase_order_traceability_strict(db: Session, order: PurchaseOrder) -> list:
    """
    Recalcula estrictamente qty_received y qty_invoiced de una OC
    basándose solo en vínculos duros (source_purchase_line_id). No usa fuzzy matching.
    """
    if not order.lines:
        return []

    # Remitos de compra (DeliveryNote con OrderType.PURCHASE u OC vinculada)
    dns = db.query(DeliveryNote).filter(
        DeliveryNote.purchase_order_id == order.id,
        DeliveryNote.status != DeliveryNoteStatus.CANCELLED
    ).all()
    dn_ids = [dn.id for dn in dns]

    # Facturas vinculadas por tabla puente (RC -> FC) - Opcional en compras pero posible
    invoice_links = db.query(InvoiceDeliveryNoteLink).filter(
        InvoiceDeliveryNoteLink.delivery_note_id.in_(dn_ids)
    ).all() if dn_ids else []
    invoice_ids = {link.document_id for link in invoice_links}

    # Facturas vinculadas directo a líneas (OC -> FC)
    line_ids = [l.id for l in order.lines]
    direct_invoice_ids = db.query(DocumentLine.document_id).filter(
        DocumentLine.source_purchase_line_id.in_(line_ids)
    ).all()
    invoice_ids.update([r[0] for r in direct_invoice_ids])

    invoices = db.query(Document).filter(
        Document.id.in_(list(invoice_ids)),
        Document.status != DocumentStatus.CANCELLED
    ).all() if invoice_ids else []

    any_change = False
    recalculated_lines = []

    for line in order.lines:
        line_id = str(line.id)
        old_received = float(line.qty_received or 0)
        old_invoiced = float(line.qty_invoiced or 0)

        # Sumar remitos
        total_rec = Decimal("0.0")
        for dn in dns:
            for dnl in dn.lines:
                if str(dnl.source_purchase_line_id) == line_id:
                    total_rec += Decimal(str(dnl.qty or 0))

        # Sumar facturas
        total_inv = Decimal("0.0")
        for inv in invoices:
            for il in inv.lines:
                if str(il.source_purchase_line_id) == line_id:
                    total_inv += Decimal(str(il.qty or 0))

        if old_received != float(total_rec) or old_invoiced != float(total_inv):
            line.qty_received = total_rec
            line.qty_invoiced = total_inv
            any_change = True

        recalculated_lines.append({
            "line_id": str(line.id),
            "product_id": str(line.product_id),
            "qty_ordered": float(line.qty),
            "old_qty_received": old_received,
            "new_qty_received": float(total_rec),
            "old_qty_invoiced": old_invoiced,
            "new_qty_invoiced": float(total_inv)
        })

    if any_change:
        db.flush()
        recalc_purchase_order_status(db, order.id)

    return recalculated_lines

def sync_sales_order_traceability(db: Session, order: SalesOrder):
    """
    Restaura las cantidades entregadas (qty_delivered) y facturadas (qty_invoiced)
    de una OV consultando los Remitos y Facturas reales vinculados.
    Útil para 'curar' datos dañados o inconsistentes.
    """
    if not order.lines:
        return

    # 1. Obtener todos los remitos vinculados (vía header o vía líneas)
    dns = db.query(DeliveryNote).filter(
        DeliveryNote.sales_order_id == order.id,
        DeliveryNote.status != DeliveryNoteStatus.CANCELLED
    ).all()
    
    # 2. Obtener todas las facturas vinculadas (vía tabla puente con remitos)
    dn_ids = [dn.id for dn in dns]
    invoice_links = db.query(InvoiceDeliveryNoteLink).filter(
        InvoiceDeliveryNoteLink.delivery_note_id.in_(dn_ids)
    ).all() if dn_ids else []
    invoice_ids = set([link.document_id for link in invoice_links])
    
    # También facturas vinculadas directamente a líneas (si existen)
    line_ids = [l.id for l in order.lines]
    direct_invoice_ids = db.query(DocumentLine.document_id).filter(
        DocumentLine.source_sales_line_id.in_(line_ids)
    ).all()
    invoice_ids.update([r[0] for r in direct_invoice_ids])

    # --- NUEVA BÚSQUEDA FUZZY (Healing Profundo) ---
    # Buscar facturas por número de orden en las notas o referencia
    order_num_clean = order.number.split("-")[-1] if "-" in order.number else order.number
    fuzzy_invoices = db.query(Document).filter(
        Document.entity_id == order.entity_id,
        Document.notes.ilike(f"%{order_num_clean}%"),
        Document.status != DocumentStatus.CANCELLED
    ).all()
    invoice_ids.update([inv.id for inv in fuzzy_invoices])

    # Buscar facturas que tengan exactamente los mismos productos (si no se encontró nada)
    if not invoice_ids:
        # Buscamos documentos del cliente con líneas que coincidan con los productos de la OV
        product_ids = [l.product_id for l in order.lines if l.product_id]
        potential_inv_ids = db.query(DocumentLine.document_id).filter(
            DocumentLine.product_id.in_(product_ids)
        ).distinct().all()
        potential_inv_ids = [r[0] for r in potential_inv_ids]
        
        candidates = db.query(Document).filter(
            Document.id.in_(potential_inv_ids),
            Document.entity_id == order.entity_id,
            Document.status != DocumentStatus.CANCELLED
        ).all()
        
        for cand in candidates:
            # Si coinciden los montos o productos principales, lo tomamos como candidato
            cand_product_ids = [cl.product_id for cl in cand.lines if cl.product_id]
            if set(product_ids).intersection(set(cand_product_ids)):
                invoice_ids.add(cand.id)

    invoices = db.query(Document).filter(
        Document.id.in_(list(invoice_ids)),
        Document.status != DocumentStatus.CANCELLED
    ).all() if invoice_ids else []

    # 3. Recalcular contadores línea por línea
    current_line_ids = {str(l.id) for l in order.lines}
    any_change = False

    for line in order.lines:
        line_id = str(line.id)
        # Sumar de Remitos
        total_deliv = Decimal("0.0")
        for dn in dns:
            for dnl in dn.lines:
                # Caso A: El vínculo técnico es correcto
                match_id = str(dnl.source_sales_line_id) == line_id
                # Caso B: El vínculo técnico está roto pero el producto y el pedido coinciden
                match_product = (dnl.product_id == line.product_id)
                link_is_broken = dnl.source_sales_line_id and str(dnl.source_sales_line_id) not in current_line_ids
                
                if match_id or (link_is_broken and match_product):
                    total_deliv += Decimal(str(dnl.qty or 0))
                    # Sanar el vínculo técnico para el futuro
                    if not match_id:
                        dnl.source_sales_line_id = line.id
                        any_change = True
        
        # Sumar de Facturas
        total_inv = Decimal("0.0")
        for inv in invoices:
            for il in inv.lines:
                match_id = str(il.source_sales_line_id) == line_id
                match_product = (il.product_id == line.product_id)
                link_is_broken = il.source_sales_line_id and str(il.source_sales_line_id) not in current_line_ids
                
                if match_id or (link_is_broken and match_product):
                    total_inv += Decimal(str(il.qty or 0))
                    # Sanar el vínculo técnico
                    if not match_id:
                        il.source_sales_line_id = line.id
                        any_change = True

        # Aplicar si hay cambios o si estaba en 0 erróneamente
        if float(line.qty_delivered or 0) != float(total_deliv):
            line.qty_delivered = total_deliv
            any_change = True
        if float(line.qty_invoiced or 0) != float(total_inv):
            line.qty_invoiced = total_inv
            any_change = True

    if any_change:
        db.flush()
        # Finalmente recalcular el estado del pedido
        recalc_sales_order_status(db, order.id)
        # db.commit() REMOVED TO PREVENT BACKEND CRASH DURING GET REQUESTS

    # --- NUEVA SINCRONIZACIÓN DE COMISIONES (Para que se reflejen en el panel) ---
    # Si la OV tiene un vendedor y un monto de comisión, propagarlo a DNs y Facturas
    if order.salesperson_id and float(order.commission_amount or 0) > 0:
        # 1. Propagar a Remitos
        for dn in dns:
            # Si el remito no tiene vendedor o comisión, le pasamos la de la OV (o una parte proporcional)
            # Por ahora, si es 1:1, pasamos el monto total o aseguramos el salesperson_id
            if not dn.salesperson_id or float(dn.commission_amount or 0) == 0:
                dn.salesperson_id = order.salesperson_id
                # Si hay múltiples remitos, esta lógica podría ser más compleja (prorrateo)
                # Pero para 'curar' el caso de Bigot, aseguramos que el dato llegue
                dn.commission_amount = order.commission_amount
        
        # 2. Propagar a Facturas
        for inv in invoices:
            if not inv.salesperson_id or float(inv.commission_amount or 0) == 0:
                inv.salesperson_id = order.salesperson_id
                inv.commission_amount = float(order.commission_amount)
                # También actualizar el campo 'vendedor' (string) para consistencia visual
                if not inv.vendedor and order.vendedor:
                    inv.vendedor = order.vendedor
        
        db.flush()





def recalc_sales_order_status(db: Session, order_id: str):
    """
    Recalcula el estado de la OV basado en una matriz de Trazabilidad 
    (Remitido vs Facturado).
    """
    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order: 
        return
    
    if order.status == OrderStatus.CANCELLED:
        return

    # Si es DRAFT, se queda en DRAFT a menos que explícitamente se mueva
    if order.status == OrderStatus.DRAFT:
        # Pero si ya tiene movimientos (raro en DRAFT pero posible en imports), lo dejamos fluir
        if not any(l.qty_delivered > 0 or l.qty_invoiced > 0 for l in order.lines):
             return

    all_delivered = True
    any_delivered = False
    all_invoiced = True
    any_invoiced = False
    
    if not order.lines:
        return

    for line in order.lines:
        qty = Decimal(str(line.qty))
        deliv = Decimal(str(line.qty_delivered or 0))
        inv = Decimal(str(line.qty_invoiced or 0))
        
        # Tolerancia para errores de punto flotante
        TOLERANCE = Decimal("0.0001")
        
        if deliv < (qty - TOLERANCE): 
            all_delivered = False
        if deliv > TOLERANCE: 
            any_delivered = True
            
        if inv < (qty - TOLERANCE): 
            all_invoiced = False
        if inv > TOLERANCE: 
            any_invoiced = True

    # ── MATRIZ DE ESTADOS ──
    # Caso 1: Todo completo
    if all_delivered and all_invoiced:
        order.status = OrderStatus.COMPLETED
        
    # Caso 2: Todo remitido
    elif all_delivered:
        if any_invoiced:
            order.status = OrderStatus.REMITIDO_TOTAL_FACTURADO_PARCIAL
        else:
            order.status = OrderStatus.FULLY_DELIVERED
            
    # Caso 3: Algo remitido (Parcial)
    elif any_delivered:
        if all_invoiced:
            order.status = OrderStatus.REMITIDO_PARCIAL_FACTURADO_TOTAL
        elif any_invoiced:
            order.status = OrderStatus.REMITIDO_PARCIAL_FACTURADO_PARCIAL
        else:
            order.status = OrderStatus.PARTIALLY_DELIVERED
            
    # Caso 4: Nada remitido pero algo facturado (Servicios o Anticipos)
    elif all_invoiced:
        order.status = OrderStatus.INVOICED
    elif any_invoiced:
        order.status = OrderStatus.PARTIALLY_INVOICED
        
    # Caso 5: Sin movimientos
    else:
        # Si no hay remisión ni factura, vuelve a CONFIRMED
        order.status = OrderStatus.CONFIRMED

    db.flush()
    logger.info(f"OV {order.number} status recalculated to {order.status}")


def recalc_purchase_order_status(db: Session, order_id: str):
    """
    Recalcula el estado de la OC basado en recepciones y facturación.
    """
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order: 
        return
    
    if order.status == OrderStatus.CANCELLED:
        return

    all_received = True
    any_received = False
    all_invoiced = True
    any_invoiced = False
    
    if not order.lines:
        return

    for line in order.lines:
        qty = Decimal(str(line.qty))
        rec = Decimal(str(line.qty_received or 0))
        inv = Decimal(str(line.qty_invoiced or 0))
        
        TOLERANCE = Decimal("0.0001")
        
        if rec < (qty - TOLERANCE): 
            all_received = False
        if rec > TOLERANCE: 
            any_received = True
            
        if inv < (qty - TOLERANCE): 
            all_invoiced = False
        if inv > TOLERANCE: 
            any_invoiced = True

    if all_received and all_invoiced:
        order.status = OrderStatus.COMPLETED
    elif all_received:
        order.status = OrderStatus.FULLY_DELIVERED # Para parity con OV
    elif any_received:
        order.status = OrderStatus.PARTIALLY_DELIVERED
    elif all_invoiced:
        order.status = OrderStatus.INVOICED
    elif any_invoiced:
        order.status = OrderStatus.PARTIALLY_INVOICED
    else:
        order.status = OrderStatus.CONFIRMED

    db.flush()
    logger.info(f"OC {order.number} status recalculated to {order.status}")
