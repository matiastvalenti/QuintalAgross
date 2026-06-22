from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional
from decimal import Decimal
import logging
import traceback

from app.db.session import get_db
from app.db.models.commercial_models import (
    SalesOrder, SalesOrderLine, OrderStatus, DeliveryNote, 
    DeliveryNoteLine, DeliveryNoteStatus, SalesOrderHistory, Product, 
    InvoiceDeliveryNoteLink, StockItem
)
from app.db.models.models import Document, DocumentLine, DocumentStatus
from app.db.models import models
from app.modules.sales import sales_order_schemas, numbering_service, delivery_note_schemas as dn_schemas
from app.modules.auth.auth_router import check_permission, get_current_user, log_action
from app.db.models.auth_models import User
from fastapi.responses import Response
from app.modules.finance.pdf_export import export_document_to_pdf
from app.modules.finance.mailer import send_email
from pydantic import BaseModel
from app.modules.inventory.stock_utils import reserve_stock, unreserve_stock
from app.modules.sales.sales_utils import recalc_sales_order_status, sync_sales_order_traceability, recalc_sales_order_traceability_strict

class EmailPayload(BaseModel):
    to_email: str
    subject: Optional[str] = None
    body: Optional[str] = None

router = APIRouter(prefix="/sales-orders", tags=["Sales Orders"])

def _generate_next_number(pv: str, db: Session) -> str:
    """Calcula el próximo número para OV."""
    return numbering_service.get_next_number(db, pv, "OV")


def _calculate_line(line_data: dict, db: Session = None) -> dict:
    from app.utils.pricing import calculate_line_totals
    
    qty = float(line_data.get("qty", 1.0))
    unit_price = float(line_data.get("unit_price", 0.0))
    discount_pct = float(line_data.get("discount_pct", 0.0))
    vat_rate = float(line_data.get("vat_rate", 0.21))
    
    qty_packages = line_data.get("qty_packages")
    package_size = line_data.get("package_size")
    
    input_cost = line_data.get("cost_price") if line_data.get("cost_price") is not None else line_data.get("unit_cost")
    unit_cost = float(input_cost) if input_cost is not None else 0.0
    
    if db and line_data.get("product_id"):
        product = db.query(Product).filter(Product.id == line_data["product_id"]).first()
        if product:
            if product.quantity_per_container and float(product.quantity_per_container) > 1:
                package_size = float(product.quantity_per_container)
            
            if unit_cost == 0.0:
                unit_cost = float(product.cost_price or 0.0)

    # Llamar a la utilidad central
    totals = calculate_line_totals(
        qty_packages=qty_packages,
        package_size=package_size,
        fallback_qty=qty,
        unit_price=unit_price,
        discount_pct=discount_pct,
        vat_rate=vat_rate
    )
    
    total_cost = unit_cost * totals["qty"]
    margin_amount = totals["net_amount"] - total_cost
    
    result = {
        **line_data,
        "qty_packages": totals["qty_packages"],
        "package_size": totals["package_size"],
        "qty": totals["qty"],
        "unit_price": totals["unit_price"],
        "discount_pct": totals["discount_pct"],
        "vat_rate": totals["vat_rate"],
        "net_amount": totals["net_amount"],
        "vat_amount": totals["vat_amount"],
        "total_amount": totals["total_amount"],
        "unit_cost": round(unit_cost, 2),
        "total_cost": round(total_cost, 2),
        "margin_amount": round(margin_amount, 2)
    }
    result.pop("cost_price", None)
    return result


def _recalc_total(order: SalesOrder, db: Session = None):
    """Recalcula total_amount, total_cost, margin_amount y comisiones desde líneas."""
    order.total_amount = float(sum(Decimal(str(l.total_amount)) for l in order.lines))
    order.total_cost = float(sum(Decimal(str(l.total_cost)) for l in order.lines if l.total_cost is not None))
    order.margin_amount = float(sum(Decimal(str(l.margin_amount)) for l in order.lines if l.margin_amount is not None))

    # ── Cálculo de Comisiones ──
    # Solo recalcular automáticamente si el monto es 0 (asume que si hay valor, es manual)
    if db and float(order.commission_amount or 0) == 0:
        from app.db.models.models import Entity
        from sqlalchemy import func
        sp = None
        if order.salesperson_id:
            sp = db.query(Entity).filter(Entity.id == order.salesperson_id).first()
        elif order.vendedor and order.vendedor.strip():
            # Búsqueda robusta por nombre para vendedores virtuales / carga histórica
            name_norm = order.vendedor.strip().lower()
            sp = db.query(Entity).filter(
                func.trim(func.lower(Entity.name)) == name_norm, 
                Entity.is_salesperson == True
            ).first()
            
        if sp:
            pct = Decimal(str(sp.commission_pct or "0.0"))
            
            # Tipos de comisión: fixed (sobre neto) o markup (sobre margen)
            comm_type = getattr(sp, 'commission_type', 'markup')
            if comm_type == 'fixed':
                base = Decimal(str(order.total_amount or "0.0"))
            else:
                base = Decimal(str(order.margin_amount or "0.0"))
                # Si no hay margen cargado pero hay total, usamos el total como margen 100%
                if base == 0 and float(order.total_amount or 0) > 0:
                    base = Decimal(str(order.total_amount))
            
            order.commission_amount = float((base * (pct / Decimal("100"))).quantize(Decimal("0.01")))
            print(f"COMM_DEBUG: Result: {order.commission_amount}")
        else:
            print(f"COMM_DEBUG: No SP match for {repr(order.vendedor)}")
            order.commission_amount = 0.0
    else:
        # Si ya tiene valor, se respeta el valor existente (manual)
        pass


def _log_history(db: Session, order_id: str, action: str, details: Optional[str] = None, current_user: Optional[User] = None):
    """Registra una entrada en el historial de la OV."""
    username = "Sistema"
    if current_user:
        if hasattr(current_user, 'username'):
            username = current_user.username
        elif hasattr(current_user, 'name'):
            username = current_user.name
        else:
            username = str(current_user)

    history = SalesOrderHistory(
        order_id=order_id,
        user=username,
        action=action,
        details=details
    )
    db.add(history)


def _calculate_progress(order: SalesOrder) -> float:
    """Calcula el % de entrega basado en cantidades de líneas."""
    if not order.lines:
        return 0.0
    total_qty = sum(float(l.qty) for l in order.lines)
    if total_qty == 0:
        return 0.0
    total_delivered = sum(float(l.qty_delivered) for l in order.lines)
    return round((total_delivered / total_qty) * 100, 1)


def _recalc_status(db: Session, order_id: str):
    """Llama a la utilidad centralizada de recálculo."""
    recalc_sales_order_status(db, order_id)


# ═══════════════════════════════════════════
# CREATE
# ═══════════════════════════════════════════
@router.post("/", response_model=sales_order_schemas.SalesOrderResponse, status_code=201)
def create_sales_order(
    data: sales_order_schemas.SalesOrderCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(check_permission("sales_orders", "create"))
):
    # 0. Validar Entidad
    entity = db.query(models.Entity).filter(models.Entity.id == data.entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="La entidad especificada no existe")

    order_data = data.model_dump(exclude={"lines"})
    pv = order_data.pop("pv", None)
    # Eliminar campos del schema que no son columnas del modelo SalesOrder
    _non_model_fields = {"company_id", "pv"}
    for f in _non_model_fields:
        order_data.pop(f, None)
    
    # Si falta pv, intentar extraerlo del número
    if not pv and order_data.get("number") and "-" in order_data["number"]:
        pv = order_data["number"].split("-")[0]
    
    # Fallback si sigue faltando
    if not pv:
        pv = "0001"
    
    # Auto-assign number if missing
    import sqlalchemy.exc
    max_retries = 2
    for attempt in range(max_retries):
        if not order_data.get("number"):
            order_data["number"] = _generate_next_number(pv, db)
            
        db_order = SalesOrder(**order_data, status=OrderStatus.CONFIRMED)
        db.add(db_order)
        
        try:
            db.flush()
            break # No collision
        except sqlalchemy.exc.IntegrityError:
            db.rollback()
            if attempt == max_retries - 1:
                raise HTTPException(status_code=400, detail="Error de colisión al generar número.")
            # Clear number to retry
            order_data["number"] = None


    # Crear líneas con cálculo automático
    for i, line in enumerate(data.lines):
        line_dict = _calculate_line(line.model_dump(), db)
        if not line_dict.get("line_order"):
            line_dict["line_order"] = i
            
        db_line = SalesOrderLine(
            order_id=db_order.id,
            **line_dict
        )
        db.add(db_line)
        
        # 3. Reservar Stock si nace CONFIRMADA
        if db_order.status == OrderStatus.CONFIRMED and db_order.warehouse_id:
            # Reservamos segun qty (cantidad comercial)
            reserve_stock(db, db_line.product_id, db_order.warehouse_id, db_line.qty)

    db.flush()
    db.refresh(db_order)
    _recalc_total(db_order, db)
    db_order.created_by = db_order.vendedor or "Admin"
    
    _log_history(db, db_order.id, "CREACION", f"Orden creada", current_user=current_user)
    
    # Audit Log
    log_action(
        user=current_user,
        action="CREATE",
        module="sales_orders",
        target_id=db_order.id,
        description=f"Nueva Orden de Venta {db_order.number} para {entity.name}",
        db=db,
        data={"total": db_order.total_amount}
    )
    
    # Incrementar contador si aplica
    numbering_service.increment_last_number(db, pv, "OV")
    db.commit()
    db.refresh(db_order)
    return db_order

@router.post("/{order_id}/manual-link-remito", dependencies=[Depends(check_permission("sales_orders", "edit"))])
def manual_link_remito(
    order_id: str,
    data: dn_schemas.ManualLinkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Vincula manualmente líneas de uno o más remitos a líneas de esta Orden de Venta.
    Actualiza qty_delivered en la OV y source_sales_line_id en el Remito.
    """
    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden de Venta no encontrada")

    from app.db.models.commercial_models import DeliveryNoteStatus
    from app.modules.inventory.stock_utils import unreserve_stock

    for match in data.matches:
        dn_line = db.query(DeliveryNoteLine).filter(DeliveryNoteLine.id == match.dn_line_id).first()
        ov_line = db.query(SalesOrderLine).filter(SalesOrderLine.id == match.ov_line_id).first()
        
        if not dn_line or not ov_line:
            continue
            
        if ov_line.order_id != order.id:
            continue

        qty = Decimal(str(match.qty))
        
        # 1. Actualizar Remito
        dn_line.source_sales_line_id = ov_line.id
        
        # 2. Vincular el Remito cabecera si es el primer vínculo o no tiene origen
        dn = dn_line.delivery_note
        if not dn.sales_order_id:
            dn.sales_order_id = order.id
            dn.origin_reference = order.number

        # 3. Solo actualizar qty_delivered si el remito ya impactó stock (está despachado)
        if dn.status == DeliveryNoteStatus.DISPATCHED:
            ov_line.qty_delivered = Decimal(str(ov_line.qty_delivered or 0)) + qty
            # Si el remito ya está despachado, debemos descontar stock reservado en la OV
            if order.warehouse_id:
                unreserve_stock(db, ov_line.product_id, order.warehouse_id, qty)
        
        _log_history(db, order.id, "VINCULO", f"Remito {dn.number} vinculado manualmente ({qty} u.)", current_user=current_user)

    db.commit()
    _recalc_status(db, order.id)
    db.commit()
    
    return {"status": "ok", "message": "Vínculos establecidos correctamente"}





@router.post("/{order_id}/manual-link-invoice", dependencies=[Depends(check_permission("sales_orders", "edit"))])
def manual_link_invoice(
    order_id: str,
    data: dn_schemas.ManualLinkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Vincula facturas existentes a la OV. 
    A nivel de base, esto suele ser visual or link en tabla puente de remitos si corresponde,
    pero aquí lo usamos para asegurar que la OV sepa que ya fue facturada/pagada.
    """
    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order: raise HTTPException(404, "OV no encontrada")

    for match in data.matches:
        # Aquí asimilamos que 'dn_line_id' en el match es un 'document_id' de factura
        doc = db.query(models.Document).filter(models.Document.id == match.dn_line_id).first()
        if not doc: continue
        
        # Link a nivel cabecera
        doc.origin_reference = order.number
        # Si la factura no tenía OV, la vinculamos
        # Nota: Normalmente las facturas se vinculan vía Remito -> Link, 
        # pero para carga histórica o corrección permitimos link directo.
        
        _log_history(db, order.id, "VINCULO_FACTURA", f"Factura {doc.number} vinculada manualmente", current_user=current_user)

    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════
# LIST
# ═══════════════════════════════════════════
@router.get("/", response_model=List[sales_order_schemas.SalesOrderListResponse], dependencies=[Depends(check_permission("sales_orders", "view"))])
def list_sales_orders(
    entity_id: Optional[str] = None,
    status: Optional[str] = None,
    cost_center: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(SalesOrder)
    if cost_center:
        q = q.filter(SalesOrder.cost_center == cost_center)
    else:
        pass  # Sin filtro de centro de costo: retorna todos
    if entity_id:
        q = q.filter(SalesOrder.entity_id == entity_id)
    if status:
        q = q.filter(SalesOrder.status == status)
    
    try:
        orders = q.order_by(SalesOrder.date.desc()).all()
        for o in orders:
            # 1. Cálculo de Progresos Logísticos/Facturación (Trazabilidad)
            lines = o.lines
            total_qty = sum(float(l.qty) for l in lines) if lines else 0
            
            # Healing preventivo si el progreso es 0 pero el estado dice remitido
            curr_deliv_progress = round((sum(float(l.qty_delivered or 0) for l in lines) / total_qty) * 100, 1) if total_qty > 0 else 0
            if total_qty > 0 and curr_deliv_progress == 0 and "REMITIDO" in (o.status.name if hasattr(o.status, 'name') else str(o.status)).upper():
                sync_sales_order_traceability(db, o)
                lines = o.lines # Refresh lines reference
            
            if total_qty > 0:
                o.delivery_progress = round((sum(float(l.qty_delivered or 0) for l in lines) / total_qty) * 100, 1)
                o.invoice_progress = round((sum(float(l.qty_invoiced or 0) for l in lines) / total_qty) * 100, 1)
            else:
                o.delivery_progress = 0.0
                o.invoice_progress = 0.0
            
            # 2. Dynamic Status Healing (In-memory for UI consistency)
            if o.status != OrderStatus.CANCELLED and total_qty > 0:
                if o.delivery_progress >= 99.9 and o.invoice_progress >= 99.9:
                    o.status = OrderStatus.COMPLETED
                elif o.delivery_progress >= 99.9 and o.invoice_progress > 0:
                    o.status = OrderStatus.REMITIDO_TOTAL_FACTURADO_PARCIAL
                elif o.delivery_progress >= 99.9:
                    o.status = OrderStatus.FULLY_DELIVERED
                elif o.delivery_progress > 0 and o.invoice_progress >= 99.9:
                    o.status = OrderStatus.REMITIDO_PARCIAL_FACTURADO_TOTAL
                elif o.delivery_progress > 0 and o.invoice_progress > 0:
                    o.status = OrderStatus.REMITIDO_PARCIAL_FACTURADO_PARCIAL
                elif o.delivery_progress > 0:
                    o.status = OrderStatus.PARTIALLY_DELIVERED
                elif o.invoice_progress >= 99.9:
                    o.status = OrderStatus.INVOICED
                elif o.invoice_progress > 0:
                    o.status = OrderStatus.PARTIALLY_INVOICED

            # 3. Cálculo de Progreso de Pago (Real y preciso)
            # Buscamos IDs de facturas relacionadas por línea o remito para evitar duplicados
            line_ids = [l.id for l in lines]
            dn_ids = [dn.id for dn in o.delivery_notes if dn.status != DeliveryNoteStatus.CANCELLED]
            
            invoice_ids = set()
            if line_ids:
                inv_ids_lines = db.query(models.Document.id).join(models.DocumentLine).filter(
                    models.DocumentLine.source_sales_line_id.in_(line_ids)
                ).all()
                invoice_ids.update([r[0] for r in inv_ids_lines])
            
            if dn_ids:
                inv_ids_dn = db.query(InvoiceDeliveryNoteLink.document_id).filter(
                    InvoiceDeliveryNoteLink.delivery_note_id.in_(dn_ids)
                ).all()
                invoice_ids.update([r[0] for r in inv_ids_dn])

            total_paid = 0.0
            if invoice_ids:
                total_paid = db.query(func.sum(models.Application.amount_applied)).filter(
                    models.Application.to_document_id.in_(list(invoice_ids))
                ).scalar() or 0.0
                total_paid = float(total_paid)

                # Fallback: Check if the invoices themselves are marked as CLOSED (paid)
                if total_paid < float(o.total_amount) and hasattr(models.DocumentStatus, 'CLOSED'):
                    invoices = db.query(models.Document.status).filter(
                        models.Document.id.in_(list(invoice_ids))
                    ).all()
                    
                    if invoices and all(inv[0] == models.DocumentStatus.CLOSED for inv in invoices):
                        total_paid = float(o.total_amount)  # Forzar al 100% si están cerradas

            if total_paid >= float(o.total_amount) and float(o.total_amount) > 0:
                o.paid_progress = 100.0
            else:
                o.paid_progress = min(100.0, round((total_paid / float(o.total_amount) * 100), 1)) if float(o.total_amount) > 0 else 0.0
            
            invoiced_amt = 0.0
            if invoice_ids:
                try:
                    # En Python, el Enum DocumentStatus o strings
                    total_invoiced_query = db.query(func.sum(models.Document.total_amount)).filter(
                        models.Document.id.in_(list(invoice_ids)),
                        models.Document.status.notin_(['CANCELLED', 'DRAFT'])
                    ).scalar()
                    invoiced_amt = float(total_invoiced_query or 0.0)
                except Exception:
                    # Fallback if status logic fails due to enum types
                    invoices = db.query(models.Document).filter(
                        models.Document.id.in_(list(invoice_ids))
                    ).all()
                    invoiced_amt = sum(float(inv.total_amount or 0) for inv in invoices if str(inv.status) not in ['CANCELLED', 'DRAFT', 'DocumentStatus.CANCELLED', 'DocumentStatus.DRAFT'])
            
            o.invoiced_amount = invoiced_amt
            
            # El progreso de pago se mantiene real basado en aplicaciones/recibos
            pass
                

        return orders
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"list_sales_orders failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error al listar órdenes de venta")


@router.get("/debug/db")
def debug_db(db: Session = Depends(get_db)):
    try:
        from sqlalchemy import text
        res = db.execute(text("SELECT cost_center, typeof(cost_center), COUNT(*) FROM sales_orders GROUP BY cost_center")).fetchall()
        return {"sales_orders_cost_center_stats": [{"cost_center": r[0], "type": r[1], "count": r[2]} for r in res]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/debug/fix")
def fix_db(db: Session = Depends(get_db)):
    from sqlalchemy import text
    tables = [
        "sales_orders", "documents", "delivery_notes", "account_movements",
        "cheques", "grain_contracts", "expense_claims", "journal_entries", "grain_movements"
    ]
    results = {}
    for t in tables:
        try:
            db.execute(text("ALTER TABLE " + t + " DROP COLUMN cost_center"))
            db.execute(text("ALTER TABLE " + t + " ADD COLUMN cost_center INTEGER DEFAULT 1"))
            db.commit()
            results[t] = "fixed_schema"
        except Exception as e:
            db.rollback()
            results[t] = str(e)

        try:
            db.execute(text("UPDATE " + t + " SET cost_center = 1 WHERE cost_center IS NULL"))
            db.commit()
            results[t + "_update"] = "fixed_data"
        except Exception as e:
            db.rollback()
            results[t + "_update"] = str(e)

    return results


# ═══════════════════════════════════════════
# NEXT NUMBER
# ═══════════════════════════════════════════
@router.get("/next-number", dependencies=[Depends(check_permission("sales_orders", "view"))])
def get_next_number(pv: str, db: Session = Depends(get_db)):
    """Calcula el próximo número correlativo para un PV dado."""
    next_num = _generate_next_number(pv, db)
    return {
        "pv": pv,
        "next_number": next_num.split("-")[-1] if "-" in next_num else next_num,
        "number": next_num
    }

# ═══════════════════════════════════════════
# GET BY ID
# ═══════════════════════════════════════════
@router.get("/{order_id}", response_model=sales_order_schemas.SalesOrderResponse, dependencies=[Depends(check_permission("sales_orders", "view"))])
def get_sales_order(order_id: str, db: Session = Depends(get_db)):
    order = db.query(SalesOrder).options(
        joinedload(SalesOrder.delivery_notes),
        joinedload(SalesOrder.history),
        joinedload(SalesOrder.entity)
    ).filter(SalesOrder.id == order_id).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="OV no encontrada")
    
    line_ids = [l.id for l in order.lines]

    # Filtrar remitos: Aquellos vinculados por línea O vinculados por cabecera
    actual_dn_ids = db.query(DeliveryNoteLine.delivery_note_id).filter(
        DeliveryNoteLine.source_sales_line_id.in_(line_ids)
    ).distinct().all()
    actual_dn_ids = [r[0] for r in actual_dn_ids]
    
    # Incluir también los que están linkeados por cabecera directamente
    header_dn_ids = [dn.id for dn in order.delivery_notes]
    final_dn_ids = list(set(actual_dn_ids + header_dn_ids))
    
    order.delivery_notes = [dn for dn in order.delivery_notes if dn.id in final_dn_ids]

    # Sincronización Automática (Healing) para reparar contadores dañados
    sync_sales_order_traceability(db, order)

    # 4. Volver a buscar facturas vinculadas (ahora que los vínculos están sanados)
    dn_ids = [dn.id for dn in order.delivery_notes if dn.status != DeliveryNoteStatus.CANCELLED]
    invoices_via_dn = db.query(Document).options(joinedload(Document.applied_by)).join(InvoiceDeliveryNoteLink).filter(
        InvoiceDeliveryNoteLink.delivery_note_id.in_(dn_ids)
    ).all() if dn_ids else []
    
    invoices_via_lines = db.query(Document).options(joinedload(Document.applied_by)).join(DocumentLine).filter(
        DocumentLine.source_sales_line_id.in_(line_ids)
    ).all() if line_ids else []
    
    seen_invoices = {}
    for inv in (invoices_via_dn + invoices_via_lines):
        if inv.id not in seen_invoices:
            seen_invoices[inv.id] = {
                "id": inv.id,
                "number": inv.number,
                "doc_type": inv.doc_type.name if hasattr(inv.doc_type, 'name') else str(inv.doc_type),
                "date": inv.date.isoformat() if inv.date else None,
                "status": inv.status.name if hasattr(inv.status, 'name') else str(inv.status),
                "total_amount": float(inv.total_amount or 0),
                "currency": inv.currency,
                "applied_amount": float(sum(a.amount_applied for a in inv.applied_by))
            }
    invoices_list = list(seen_invoices.values())

    # Calcular progresos definitivos para la respuesta
    total_qty = sum(float(l.qty) for l in order.lines) if order.lines else 0
    if total_qty > 0:
        order.delivery_progress = round((sum(float(l.qty_delivered or 0) for l in order.lines) / total_qty) * 100, 1)
        order.invoice_progress = round((sum(float(l.qty_invoiced or 0) for l in order.lines) / total_qty) * 100, 1)
    else:
        order.delivery_progress = 0.0
        order.invoice_progress = 0.0

    # Pago basado en facturas vinculadas
    total_paid = sum(inv_data["applied_amount"] for inv_data in invoices_list)
    order.paid_progress = min(100.0, round((total_paid / float(order.total_amount) * 100), 1)) if float(order.total_amount) > 0 else 0.0
    if order.total_amount > 0 and order.paid_progress >= 99.9:
        order.paid_progress = 100.0

    # Serializar usando Pydantic; luego sobreescribir invoices con los dicts construidos manualmente
    # (no se puede asignar dicts a order.invoices porque Pydantic usa from_attributes)
    response = sales_order_schemas.SalesOrderResponse.model_validate(order)
    response.invoices = [
        sales_order_schemas.InvoiceMinimal(
            id=inv["id"],
            number=inv["number"],
            date=inv["date"],
            doc_type=inv["doc_type"],
            status=inv["status"],
            total_amount=inv["total_amount"],
            currency=inv["currency"],
        )
        for inv in invoices_list
    ]
    return response


def get_product_sales_account_code(product):
    if not product:
        return None
    if hasattr(product, "sales_account_code"):
        return product.sales_account_code
    if hasattr(product, "sales_account") and product.sales_account:
        return getattr(product.sales_account, "code", None)
    return getattr(product, "sales_account_id", None)

@router.get("/{order_id}/traceability", dependencies=[Depends(check_permission("sales_orders", "view"))])
def get_sales_order_traceability(order_id: str, db: Session = Depends(get_db)):
    """
    Retorna la trazabilidad completa de una OV:
    - Línea por línea: cuánto se pidió, cuánto se remitió (en qué remitos) y cuánto se facturó.
    - Documentos relacionados: lista de remitos y facturas.
    """
    order = db.query(SalesOrder).options(
        joinedload(SalesOrder.lines).joinedload(SalesOrderLine.product),
        joinedload(SalesOrder.delivery_notes).joinedload(DeliveryNote.lines),
        joinedload(SalesOrder.delivery_notes).joinedload(DeliveryNote.invoices).joinedload(InvoiceDeliveryNoteLink.document)
    ).filter(SalesOrder.id == order_id).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="OV no encontrada")

    lines_trace = []
    for l in order.lines:
        # Buscar en qué remitos aparece esta línea de OV
        deliveries = []
        for dn in order.delivery_notes:
            if dn.status == DeliveryNoteStatus.CANCELLED: continue
            for dnl in dn.lines:
                if dnl.source_sales_line_id == l.id:
                    deliveries.append({
                        "dn_id": dn.id,
                        "number": dn.number,
                        "date": dn.date,
                        "qty": float(dnl.qty),
                        "status": dn.status.value
                    })
        
        # Buscar facturas (vía remitos)
        invoices = []
        seen_inv = set()
        for dn in order.delivery_notes:
            if dn.status == DeliveryNoteStatus.CANCELLED: continue
            for link in dn.invoices:
                inv = link.document
                if inv.id not in seen_inv:
                    invoices.append({
                        "invoice_id": inv.id,
                        "number": inv.number,
                        "date": inv.date,
                        "status": inv.status
                    })
                    seen_inv.add(inv.id)
        
        # Buscar facturas (vía enlazado directo de ítems a esta línea de OV)
        invoices_via_lines = db.query(models.Document).join(models.DocumentLine).filter(
            models.DocumentLine.source_sales_line_id == l.id
        ).all()
        for inv in invoices_via_lines:
            if inv.id not in seen_inv:
                invoices.append({
                    "invoice_id": inv.id,
                    "number": inv.number,
                    "date": inv.date,
                    "status": inv.status
                })
                seen_inv.add(inv.id)

        lines_trace.append({
            "id": l.id,
            "product_id": l.product_id,
            "product_name": l.product.name if l.product else l.description,
            "description": l.description,
            "qty_ordered": float(l.qty),
            "qty_delivered": float(l.qty_delivered),
            "qty_invoiced": float(l.qty_invoiced),
            "qty_pending": float(l.qty) - float(l.qty_delivered),
            "unit_price": float(l.unit_price),
            "discount_pct": float(l.discount_pct or 0),
            "vat_rate": float(l.vat_rate or 0.21),
            "sales_account_code": get_product_sales_account_code(l.product),
            "quantity_per_container": float(l.product.quantity_per_container or 1) if l.product else 1,
            "container_name": l.product.container.name if l.product and l.product.container else "Unidad",
            "unit_label": l.product.container.unit.short_name if l.product and l.product.container and l.product.container.unit else "u",
            "currency": order.currency,
            "parent_number": order.number,
            "deliveries": deliveries,
            "invoices": invoices
        })

    # Resumen de documentos únicos
    related_docs = {
        "delivery_notes": [
            {"id": dn.id, "number": dn.number, "date": dn.date, "status": dn.status.value}
            for dn in order.delivery_notes if dn.status != DeliveryNoteStatus.CANCELLED
        ],
        "invoices": []
    }
    
    seen_inv_overall = set()
    # 1. Facturas vía remitos
    for dn in order.delivery_notes:
        if dn.status == DeliveryNoteStatus.CANCELLED: continue
        for link in dn.invoices:
            inv = link.document
            if inv.id not in seen_inv_overall:
                related_docs["invoices"].append({
                    "id": inv.id,
                    "number": inv.number,
                    "date": inv.date,
                    "status": inv.status
                })
                seen_inv_overall.add(inv.id)
    
    # 2. Facturas vía líneas directas
    line_ids = [l.id for l in order.lines]
    invoices_via_lines_total = db.query(models.Document).join(models.DocumentLine).filter(
        models.DocumentLine.source_sales_line_id.in_(line_ids)
    ).all()
    for inv in invoices_via_lines_total:
        if inv.id not in seen_inv_overall:
            related_docs["invoices"].append({
                "id": inv.id,
                "number": inv.number,
                "date": inv.date,
                "status": inv.status
            })
            seen_inv_overall.add(inv.id)

    # Calcular progreso global
    total_qty = sum(float(l.qty) for l in order.lines) if order.lines else 0
    if total_qty > 0:
        delivery_progress = round((sum(float(l.qty_delivered or 0) for l in order.lines) / total_qty) * 100, 1)
        invoice_progress = round((sum(float(l.qty_invoiced or 0) for l in order.lines) / total_qty) * 100, 1)
    else:
        delivery_progress = 0.0
        invoice_progress = 0.0

    effective_status = order.status.value
    if effective_status != "CANCELLED":
        if delivery_progress >= 100 and invoice_progress >= 100:
            effective_status = "COMPLETED"
        elif delivery_progress >= 100 and invoice_progress > 0:
            effective_status = "REMITIDO_TOTAL_FACTURADO_PARCIAL"
        elif delivery_progress > 0 and invoice_progress >= 100:
            effective_status = "REMITIDO_PARCIAL_FACTURADO_TOTAL"
        elif delivery_progress > 0 and invoice_progress > 0:
            effective_status = "REMITIDO_PARCIAL_FACTURADO_PARCIAL"
        elif invoice_progress >= 100:
            effective_status = "INVOICED"
        elif invoice_progress > 0:
            effective_status = "PARTIALLY_INVOICED"
        elif delivery_progress >= 100:
            effective_status = "FULLY_DELIVERED"
        elif delivery_progress > 0:
            effective_status = "PARTIALLY_DELIVERED"

    return {
        "order_id": order.id,
        "number": order.number,
        "status": effective_status,
        "date": order.date.isoformat() if order.date else None,
        "delivery_progress": delivery_progress,
        "invoice_progress": invoice_progress,
        "lines": lines_trace,
        "documents": related_docs
    }


@router.get("/{order_id}/history", dependencies=[Depends(check_permission("sales_orders", "view"))])
def get_sales_order_history(order_id: str, db: Session = Depends(get_db)):
    """Retorna el historial de cambios de una OV."""
    history = db.query(SalesOrderHistory).filter(SalesOrderHistory.order_id == order_id).order_by(SalesOrderHistory.date.desc()).all()
    return history


@router.get("/{order_id}/pdf", dependencies=[Depends(check_permission("sales_orders", "view"))])
def get_sales_order_pdf(order_id: str, db: Session = Depends(get_db)):
    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="OV no encontrada")
    
    pdf_output = export_document_to_pdf(order, db=db)
    filename = f"OV_{order.number}.pdf"
    
    return Response(
        content=pdf_output,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )

@router.post("/{order_id}/email", dependencies=[Depends(check_permission("sales_orders", "view"))])
def send_sales_order_email(order_id: str, payload: EmailPayload, db: Session = Depends(get_db)):
    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="OV no encontrada")
    
    pdf_output = export_document_to_pdf(order, db=db)
    filename = f"OV_{order.number}.pdf"
    
    subject = payload.subject or f"Orden de Venta {order.number} - Quintal Agross"
    body = payload.body or f"""
    <p>Estimado/a,</p>
    <p>Adjuntamos la Orden de Venta <b>{order.number}</b>.</p>
    <p>Saludos cordiales,<br>Quintal Agross</p>
    """
    
    attachment = {
        "filename": filename,
        "content": pdf_output
    }
    
    res = send_email(subject, body, attachments=[attachment], to_email=payload.to_email)
    if not res.get("sent"):
        raise HTTPException(status_code=500, detail=f"Error enviando correo: {res.get('reason') or res.get('error')}")
    
    return {"message": "Correo enviado con éxito"}


# ═══════════════════════════════════════════
# UPDATE (solo si DRAFT)
# ═══════════════════════════════════════════
@router.put("/{order_id}", response_model=sales_order_schemas.SalesOrderResponse)
def update_sales_order(
    order_id: str, 
    data: sales_order_schemas.SalesOrderUpdate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(check_permission("sales_orders", "edit"))
):
    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="OV no encontrada")

    update_data = data.model_dump(exclude_unset=True)
    lines_data = update_data.pop("lines", None)

    # Campos editables incluso con remitos activos
    safe_fields = {"sale_condition_id", "due_date", "currency", "exchange_rate", "vendedor"}
    header_only = set(update_data.keys()) <= safe_fields
    has_active_dn = any(dn.status != "CANCELLED" for dn in order.delivery_notes)

    # Permitir edición incluso con remitos, el frontend ya avisa.
    # Podríamos agregar validaciones específicas aquí si se intenta bajar la qty por debajo de lo ya remitido.
    pass

    # Actualizar campos de cabecera
    for key, value in update_data.items():
        setattr(order, key, value)

    # Propagar campos compartidos a remitos DRAFT vinculados
    propagate_fields = safe_fields & set(update_data.keys())
    
    # Manejar cambio de depósito (Reservaciones)
    old_wh_id = order.warehouse_id
    new_wh_id = update_data.get("warehouse_id", old_wh_id)
    wh_changed = old_wh_id != new_wh_id

    if order.status == OrderStatus.CONFIRMED and wh_changed:
        # Mover reservas del viejo al nuevo
        for line in order.lines:
            if old_wh_id: unreserve_stock(db, line.product_id, old_wh_id, line.qty)
            if new_wh_id: reserve_stock(db, line.product_id, new_wh_id, line.qty)

    if header_only and propagate_fields:
        for dn in order.delivery_notes:
            if dn.status == DeliveryNoteStatus.DRAFT:
                for field in propagate_fields:
                    setattr(dn, field, update_data.get(field))
        db.flush()

    # Reemplazar/Actualizar líneas si se envían
    if lines_data is not None:
        was_confirmed = order.status == OrderStatus.CONFIRMED
        existing_lines = {str(line.id): line for line in order.lines}
        incoming_ids = set()

        # Update or Create lines
        for i, line_dict in enumerate(lines_data):
            calc = _calculate_line(line_dict if isinstance(line_dict, dict) else line_dict.model_dump(), db)
            line_order_val = calc.pop("line_order", i)
            # Extraer y remover el id para que no explote la asignación de campos nuevos
            lid = calc.pop("id", None)
            
            if lid and str(lid) in existing_lines:
                incoming_ids.add(str(lid))
                db_line = existing_lines[str(lid)]
                
                # Update reservation if quantity changed
                if was_confirmed and order.warehouse_id and float(db_line.qty) != float(calc["qty"]):
                    diff = float(calc["qty"]) - float(db_line.qty)
                    if diff > 0:
                        reserve_stock(db, db_line.product_id, order.warehouse_id, Decimal(str(diff)))
                    else:
                        unreserve_stock(db, db_line.product_id, order.warehouse_id, Decimal(str(abs(diff))))
                
                for k, v in calc.items():
                    setattr(db_line, k, v)
                db_line.line_order = line_order_val
            else:
                # Create NEW line
                db_line = SalesOrderLine(
                    order_id=order.id,
                    **calc,
                    line_order=line_order_val,
                )
                db.add(db_line)
                if was_confirmed and order.warehouse_id:
                    reserve_stock(db, db_line.product_id, order.warehouse_id, db_line.qty)

        # Remove deleted lines
        for old_line in order.lines:
            if str(old_line.id) not in incoming_ids:
                if was_confirmed and order.warehouse_id:
                    unreserve_stock(db, old_line.product_id, order.warehouse_id, old_line.qty)
                db.delete(old_line)

    db.flush()
    db.refresh(order)
    _recalc_total(order, db)
    recalc_sales_order_status(db, order.id)
    
    order.updated_by = order.vendedor or "Admin"
    _log_history(db, order.id, "MODIFICACION", "Cambios en cabecera o ítems", current_user=current_user)

    # Audit Log
    log_action(
        user=current_user,
        action="UPDATE",
        module="sales_orders",
        target_id=order.id,
        description=f"Actualización de Orden de Venta {order.number}",
        db=db,
        data={"total_new": order.total_amount}
    )

    db.commit()
    db.refresh(order)
    return order


# ═══════════════════════════════════════════
# CONFIRM
# ═══════════════════════════════════════════
@router.post("/{order_id}/confirm", response_model=sales_order_schemas.SalesOrderResponse, dependencies=[Depends(check_permission("sales_orders", "edit"))])
def confirm_sales_order(order_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="OV no encontrada")
    if order.status != OrderStatus.DRAFT:
        raise HTTPException(status_code=409, detail=f"Solo se pueden confirmar OV en estado DRAFT (actual: {order.status.value})")
    if not order.lines or len(order.lines) == 0:
        raise HTTPException(status_code=400, detail="No se puede confirmar una OV sin líneas")

    order.status = OrderStatus.CONFIRMED
    
    # Reservar Stock
    if order.warehouse_id:
        for line in order.lines:
            reserve_stock(db, line.product_id, order.warehouse_id, line.qty)
            
    _log_history(db, order.id, "CONFIRMACION", f"Estado cambiado a {OrderStatus.CONFIRMED.value}", current_user=current_user)
    db.commit()
    db.refresh(order)
    return order


# ═══════════════════════════════════════════
# CANCEL (solo DRAFT o CONFIRMED)
# ═══════════════════════════════════════════
@router.post("/{order_id}/cancel", response_model=sales_order_schemas.SalesOrderResponse, dependencies=[Depends(check_permission("sales_orders", "delete"))])
def cancel_sales_order(order_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="OV no encontrada")
    if order.status not in (OrderStatus.DRAFT, OrderStatus.CONFIRMED):
        raise HTTPException(status_code=409, detail=f"No se puede cancelar una OV en estado {order.status.value}")

    # Liberar reservas si estaba confirmada
    if order.status == OrderStatus.CONFIRMED and order.warehouse_id:
        for line in order.lines:
            unreserve_stock(db, line.product_id, order.warehouse_id, line.qty)

    order.status = OrderStatus.CANCELLED
    _log_history(db, order.id, "CANCELACION", "Orden anulada", current_user=current_user)
    db.commit()
    db.refresh(order)
    return order


# ═══════════════════════════════════════════
# DELETE
# ═══════════════════════════════════════════
@router.delete("/{order_id}", dependencies=[Depends(check_permission("sales_orders", "delete"))])
def delete_sales_order(order_id: str, db: Session = Depends(get_db)):
    """Borra una OV siempre y cuando no tenga remitos enlazados."""
    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="OV no encontrada")

    # Verificar vínculos (Remitos)
    if order.delivery_notes and len(order.delivery_notes) > 0:
        raise HTTPException(
            status_code=409, 
            detail="No se puede eliminar la Orden de Venta porque tiene remitos asociados. Anule los remitos primero."
        )

    # Las líneas se borran por cascade="all, delete-orphan"
    db.delete(order)
    db.commit()
    return {"ok": True, "message": "Orden de Venta eliminada correctamente"}


# ═══════════════════════════════════════════
# PURGE UNLINKED (Cleanup)
# ═══════════════════════════════════════════
@router.post("/purge-unlinked", dependencies=[Depends(check_permission("sales_orders", "delete"))])
def purge_unlinked_sales_orders(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Elimina todas las OV que no tengan remitos asociados y estén en estado DRAFT o CONFIRMED."""
    # Buscar OVs sin remitos
    # Usamos una subquery para mayor eficiencia
    subq = db.query(DeliveryNote.sales_order_id).filter(DeliveryNote.sales_order_id.isnot(None))
    
    orders_to_delete = db.query(SalesOrder).filter(
        SalesOrder.id.notin_(subq),
        SalesOrder.status.in_([OrderStatus.DRAFT, OrderStatus.CONFIRMED])
    ).all()
    
    count = len(orders_to_delete)
    for o in orders_to_delete:
        db.delete(o)
    
    db.commit()
    return {"ok": True, "message": f"Se eliminaron {count} órdenes de venta sin vínculos."}


# ═══════════════════════════════════════════
# PATCH LINE (Actualizar campo de línea individualmente)
# ═══════════════════════════════════════════
class SalesOrderLinePatch(BaseModel):
    cost_price: Optional[float] = None
    unit_price: Optional[float] = None
    discount_pct: Optional[float] = None

@router.patch("/{order_id}/lines/{line_id}", dependencies=[Depends(check_permission("sales_orders", "edit"))])
def patch_sales_order_line(
    order_id: str,
    line_id: str,
    data: SalesOrderLinePatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Actualiza campos individuales de una línea de OV (ej: cost_price).
    Permite editar datos de gestión interna incluso en órdenes con remitos.
    """
    line = db.query(SalesOrderLine).filter(
        SalesOrderLine.id == line_id,
        SalesOrderLine.order_id == order_id
    ).first()

    if not line:
        raise HTTPException(status_code=404, detail="Línea de OV no encontrada")

    updated = False
    if data.cost_price is not None:
        line.unit_cost = data.cost_price
        # Recalcular total_cost y margin_amount
        physical_qty = float(line.qty or 0) * float(
            line.product.quantity_per_container if line.product else 1
        )
        line.total_cost = round(data.cost_price * physical_qty, 2)
        line.margin_amount = round(float(line.net_amount or 0) - line.total_cost, 2)
        updated = True

    if data.unit_price is not None:
        line.unit_price = data.unit_price
        updated = True

    if data.discount_pct is not None:
        line.discount_pct = data.discount_pct
        updated = True

    if updated:
        # Recalcular totales de la orden
        order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
        if order:
            _recalc_total(order, db)

        _log_history(
            db, order_id, "EDICION_LINEA",
            f"Línea actualizada: cost_price={data.cost_price}",
            current_user=current_user
        )
        db.commit()

    return {"ok": True, "line_id": line_id}

# ═══════════════════════════════════════════
# GET ORDER BY LINE ID
# ═══════════════════════════════════════════
@router.get("/lines/{line_id}/order", dependencies=[Depends(check_permission("sales_orders", "view"))])
def get_order_by_line(line_id: str, db: Session = Depends(get_db)):
    """Devuelve la OV a la que pertenece una línea específica."""
    line = db.query(SalesOrderLine).filter(SalesOrderLine.id == line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    
    order = db.query(SalesOrder).filter(SalesOrder.id == line.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
        
    return {
        "id": order.id,
        "pv": order.pv,
        "number": order.number,
        "entity": {
            "id": order.entity.id,
            "name": order.entity.name
        } if order.entity else None
    }

# ═══════════════════════════════════════════
# RECALCULATE TRACEABILITY
# ═══════════════════════════════════════════
@router.post("/{order_id}/recalculate-traceability")
def recalculate_sales_order_traceability(
    order_id: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(check_permission("sales_orders", "edit"))
):
    """Recalcula estrictamente trazabilidad y estado de la OV"""
    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="OV no encontrada")
    
    old_status = order.status.value if order.status else None
    
    recalculated_lines = recalc_sales_order_traceability_strict(db, order)
    
    db.commit()
    db.refresh(order)
    
    return {
        "order_id": order.id,
        "number": order.number,
        "old_status": old_status,
        "new_status": order.status.value if order.status else None,
        "recalculated_lines": recalculated_lines
    }
