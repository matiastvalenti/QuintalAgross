from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional
from app.db.session import get_db
from app.db.models.commercial_models import (
    PurchaseOrder, PurchaseOrderLine, OrderStatus, PurchaseOrderHistory, 
    DeliveryNoteLine, DeliveryNote, DeliveryNoteStatus, InvoiceDeliveryNoteLink
)
from app.db.models.models import Entity, User
from app.db import models as db_models
from app.modules.purchases import purchase_order_schemas
from app.modules.sales import numbering_service
from app.modules.auth.auth_router import check_permission, get_current_user
from fastapi.responses import Response
from app.modules.finance.pdf_export import export_document_to_pdf
from app.modules.sales.sales_utils import recalc_purchase_order_status, recalc_purchase_order_traceability_strict
from app.modules.sales import delivery_note_schemas as dn_schemas
import traceback
from app.modules.finance.mailer import send_email
from pydantic import BaseModel
from decimal import Decimal

class EmailPayload(BaseModel):
    to_email: str
    subject: Optional[str] = None
    body: Optional[str] = None

router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])

# ═══════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════

def _generate_next_number(pv: str, db: Session) -> str:
    return numbering_service.get_next_number(db, pv, "OC")

def _calculate_line(line_data: dict) -> dict:
    qty = Decimal(str(line_data["qty"]))
    price = Decimal(str(line_data["unit_price"]))
    discount = Decimal(str(line_data.get("discount_pct", 0)))
    vat_rate = Decimal(str(line_data.get("vat_rate", 0.21)))
    
    net = (qty * price * (Decimal("1") - discount / Decimal("100"))).quantize(Decimal("0.01"))
    vat = (net * vat_rate).quantize(Decimal("0.01"))
    total = net + vat
    
    return {
        **line_data,
        "net_amount": float(net),
        "vat_amount": float(vat),
        "total_amount": float(total),
    }

def _recalc_total(order: PurchaseOrder):
    order.total_amount = float(sum(Decimal(str(l.total_amount)) for l in order.lines))
    # Purchase Order might not have cost/margin since it IS the cost

def _log_history(db: Session, order_id: str, action: str, details: Optional[str] = None, current_user: Optional[User] = None):
    username = "Sistema"
    if current_user:
        username = getattr(current_user, 'username', getattr(current_user, 'name', str(current_user)))

    history = PurchaseOrderHistory(
        order_id=order_id,
        user=username,
        action=action,
        details=details
    )
    db.add(history)

def _recalc_status(db: Session, order_id: str):
    recalc_purchase_order_status(db, order_id)

# ═══════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════

@router.get("/next-number")
def get_next_purchase_order_number(pv: str = "0001", db: Session = Depends(get_db)):
    return {"number": _generate_next_number(pv, db)}

@router.post("/", response_model=purchase_order_schemas.PurchaseOrderResponse, status_code=201)
def create_purchase_order(
    data: purchase_order_schemas.PurchaseOrderCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(check_permission("purchase_orders", "create"))
):
    entity = db.query(Entity).filter(Entity.id == data.entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="El proveedor especificado no existe")

    order_data = data.model_dump(exclude={"lines"})
    pv = "0001" 
    
    if not order_data.get("number"):
        order_data["number"] = _generate_next_number(pv, db)
        numbering_service.increment_last_number(db, pv, "OC")

    db_order = PurchaseOrder(**order_data, status=OrderStatus.CONFIRMED)
    db.add(db_order)
    db.flush()

    for i, line in enumerate(data.lines):
        line_dict = _calculate_line(line.model_dump())
        db_line = PurchaseOrderLine(
            order_id=db_order.id,
            **line_dict,
            line_order=i
        )
        db.add(db_line)

    db.flush()
    _recalc_total(db_order)
    _log_history(db, db_order.id, "CREACION", "Orden creada", current_user=current_user)
    
    db.commit()
    db.refresh(db_order)
    return db_order

@router.get("/", response_model=List[purchase_order_schemas.PurchaseOrderListResponse], dependencies=[Depends(check_permission("purchase_orders", "view"))])
def list_purchase_orders(
    entity_id: Optional[str] = None, 
    status: Optional[str] = None, 
    cost_center: Optional[int] = None, 
    db: Session = Depends(get_db)
):
    q = db.query(PurchaseOrder)
    if cost_center: q = q.filter(PurchaseOrder.cost_center == cost_center)
    if entity_id: q = q.filter(PurchaseOrder.entity_id == entity_id)
    if status: q = q.filter(PurchaseOrder.status == status)
    
    orders = q.order_by(PurchaseOrder.date.desc()).all()
    for o in orders:
        # Calcular progresos
        total_qty = sum(float(l.qty) for l in o.lines) if o.lines else 0
        if total_qty > 0:
            o.delivery_progress = round((sum(float(l.qty_received or 0) for l in o.lines) / total_qty) * 100, 1)
            o.invoice_progress = round((sum(float(l.qty_invoiced or 0) for l in o.lines) / total_qty) * 100, 1)
        else:
            o.delivery_progress = 0.0
            o.invoice_progress = 0.0
        
        o.entity_name = o.entity.name if o.entity else "S/D"
        o.paid_progress = 100.0 if o.status == OrderStatus.COMPLETED else 0.0
        
    return orders

@router.get("/{order_id}", response_model=purchase_order_schemas.PurchaseOrderResponse, dependencies=[Depends(check_permission("purchase_orders", "view"))])
def get_purchase_order(order_id: str, db: Session = Depends(get_db)):
    order = db.query(PurchaseOrder).options(
        joinedload(PurchaseOrder.lines),
        joinedload(PurchaseOrder.delivery_notes),
        joinedload(PurchaseOrder.history)
    ).filter(PurchaseOrder.id == order_id).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="OC no encontrada")
    
    # Calcular progresos
    total_qty = sum(float(l.qty) for l in order.lines)
    if total_qty > 0:
        order.delivery_progress = round((sum(float(l.qty_received or 0) for l in order.lines) / total_qty) * 100, 1)
        order.invoice_progress = round((sum(float(l.qty_invoiced or 0) for l in order.lines) / total_qty) * 100, 1)
    else:
        order.delivery_progress = 0.0
        order.invoice_progress = 0.0

    # Invoices vinculadas
    dn_ids = [dn.id for dn in order.delivery_notes if dn.status != DeliveryNoteStatus.CANCELLED]
    invoices_via_dn = db.query(db_models.Document).join(InvoiceDeliveryNoteLink).filter(
        InvoiceDeliveryNoteLink.delivery_note_id.in_(dn_ids)
    ).all() if dn_ids else []
    
    order_line_ids = [l.id for l in order.lines]
    invoices_via_lines = db.query(db_models.Document).join(db_models.DocumentLine).filter(
        db_models.DocumentLine.source_purchase_line_id.in_(order_line_ids)
    ).all() if order_line_ids else []
    
    seen_invoices = {inv.id: inv for inv in (invoices_via_dn + invoices_via_lines)}
    order.invoices = list(seen_invoices.values())
    
    return order

@router.put("/{order_id}", response_model=purchase_order_schemas.PurchaseOrderResponse)
def update_purchase_order(
    order_id: str, 
    data: purchase_order_schemas.PurchaseOrderCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(check_permission("purchase_orders", "edit"))
):
    db_order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not db_order:
        raise HTTPException(status_code=404, detail="OC no encontrada")
    
    has_active_dn = any(dn.status != DeliveryNoteStatus.CANCELLED for dn in db_order.delivery_notes)
    if has_active_dn:
        raise HTTPException(status_code=409, detail="No se puede editar una OC con recepciones activas.")

    # 1. Actualizar cabecera
    order_data = data.model_dump(exclude={"lines"})
    for key, value in order_data.items():
        setattr(db_order, key, value)
    
    # 2. Reemplazar líneas
    db.query(PurchaseOrderLine).filter(PurchaseOrderLine.order_id == order_id).delete()
    for i, line in enumerate(data.lines):
        line_dict = _calculate_line(line.model_dump())
        db_line = PurchaseOrderLine(
            order_id=db_order.id,
            **line_dict,
            line_order=i
        )
        db.add(db_line)
    
    db.flush()
    _recalc_total(db_order)
    _log_history(db, db_order.id, "MODIFICACION", "Cambios en cabecera o ítems", current_user=current_user)
    db.commit()
    db.refresh(db_order)
    return db_order

@router.post("/{order_id}/confirm")
def confirm_purchase_order(order_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order: raise HTTPException(status_code=404, detail="OC no encontrada")
    if order.status != OrderStatus.DRAFT:
        raise HTTPException(status_code=409, detail="Solo se pueden confirmar OC en DRAFT")
    
    order.status = OrderStatus.CONFIRMED
    _log_history(db, order.id, "CONFIRMACION", f"Estado cambiado a {OrderStatus.CONFIRMED.value}", current_user=current_user)
    db.commit()
    return order

@router.post("/{order_id}/cancel")
def cancel_purchase_order(order_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order: raise HTTPException(status_code=404, detail="OC no encontrada")
    if order.status not in (OrderStatus.DRAFT, OrderStatus.CONFIRMED):
        raise HTTPException(status_code=409, detail="No se puede cancelar una OC que ya tiene movimientos")
    
    order.status = OrderStatus.CANCELLED
    _log_history(db, order.id, "CANCELACION", "Orden anulada", current_user=current_user)
    db.commit()
    return order

@router.delete("/{order_id}", dependencies=[Depends(check_permission("purchase_orders", "delete"))])
def delete_purchase_order(order_id: str, db: Session = Depends(get_db)):
    db_order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not db_order:
        raise HTTPException(status_code=404, detail="OC no encontrada")
    
    if db_order.delivery_notes and len(db_order.delivery_notes) > 0:
        raise HTTPException(status_code=400, detail="No se puede eliminar una OC con remitos asociados.")
    
    db.delete(db_order)
    db.commit()
    return {"ok": True, "message": "OC eliminada correctamente"}

@router.post("/{order_id}/manual-link-remito")
def manual_link_remito(
    order_id: str,
    data: dn_schemas.ManualLinkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order: raise HTTPException(status_code=404, detail="OC no encontrada")

    for match in data.matches:
        dn_line = db.query(DeliveryNoteLine).filter(DeliveryNoteLine.id == match.dn_line_id).first()
        oc_line = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == match.ov_line_id).first() # Match schema uses ov_line_id
        
        if not dn_line or not oc_line: continue
        if oc_line.order_id != order.id: continue

        qty = Decimal(str(match.qty))
        dn_line.source_purchase_line_id = oc_line.id
        
        dn = dn_line.delivery_note
        if not dn.purchase_order_id:
            dn.purchase_order_id = order.id
            dn.origin_reference = order.number

        if dn.status == DeliveryNoteStatus.DISPATCHED:
            oc_line.qty_received = Decimal(str(oc_line.qty_received or 0)) + qty
        
        _log_history(db, order.id, "VINCULO", f"Remito {dn.number} vinculado manualmente ({qty} u.)", current_user=current_user)

    db.commit()
    _recalc_status(db, order.id)
    db.commit()
    return {"status": "ok", "message": "Vínculos establecidos correctamente"}

@router.get("/{order_id}/pdf")
def get_purchase_order_pdf(order_id: str, db: Session = Depends(get_db)):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order: raise HTTPException(status_code=404, detail="OC no encontrada")
    pdf_output = export_document_to_pdf(order, db=db)
    return Response(content=pdf_output, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=OC_{order.number}.pdf"})

@router.post("/{order_id}/email")
def send_purchase_order_email(order_id: str, payload: EmailPayload, db: Session = Depends(get_db)):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order: raise HTTPException(status_code=404, detail="OC no encontrada")
    pdf_output = export_document_to_pdf(order, db=db)
    res = send_email(payload.subject or f"OC {order.number}", payload.body or "Adjunto OC", attachments=[{"filename": f"OC_{order.number}.pdf", "content": pdf_output}], to_email=payload.to_email)
    if not res.get("sent"): raise HTTPException(status_code=500, detail="Error enviando mail")
    return {"message": "Correo enviado con éxito"}

# ═══════════════════════════════════════════
# RECALCULATE TRACEABILITY
# ═══════════════════════════════════════════
@router.post("/{order_id}/recalculate-traceability")
def recalculate_purchase_order_traceability(
    order_id: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(check_permission("purchase_orders", "edit"))
):
    """Recalcula estrictamente trazabilidad y estado de la OC"""
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="OC no encontrada")
    
    old_status = order.status.value if order.status else None
    
    recalculated_lines = recalc_purchase_order_traceability_strict(db, order)
    
    db.commit()
    db.refresh(order)
    
    return {
        "order_id": order.id,
        "number": order.number,
        "old_status": old_status,
        "new_status": order.status.value if order.status else None,
        "recalculated_lines": recalculated_lines
    }
