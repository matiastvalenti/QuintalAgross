from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import uuid
from datetime import datetime

from app.db.session import get_db
from app.db.models.commercial_models import (
    PurchaseOrder, PurchaseOrderLine, DeliveryNote, DeliveryNoteLine,
    DeliveryNoteHistory, DeliveryNoteStatus, OrderType, OrderStatus
)
from app.db.models.models import DocumentStatus
from app.modules.auth.auth_router import check_permission, get_current_user
from app.db.models.auth_models import User
from pydantic import BaseModel
from app.modules.sales.sales_utils import recalc_purchase_order_status

router = APIRouter(prefix="/delivery-notes", tags=["Purchase Delivery Notes"])

def generate_uuid():
    return str(uuid.uuid4())

def _log_history(db: Session, dn_id: str, action: str, details: Optional[str] = None, current_user: Optional[User] = None):
    username = "Sistema"
    if current_user:
        username = getattr(current_user, 'username', getattr(current_user, 'name', str(current_user)))
    db.add(DeliveryNoteHistory(delivery_note_id=dn_id, user=username, action=action, details=details))

@router.get("/")
def list_purchase_delivery_notes(db: Session = Depends(get_db)):
    notes = db.query(DeliveryNote).filter(DeliveryNote.note_type == OrderType.PURCHASE).order_by(DeliveryNote.date.desc()).all()
    return notes

@router.get("/{id}")
def get_purchase_delivery_note(id: str, db: Session = Depends(get_db)):
    note = db.query(DeliveryNote).filter(
        DeliveryNote.id == id,
        DeliveryNote.note_type == OrderType.PURCHASE
    ).first()
    if not note:
        raise HTTPException(404, "Remito de compra no encontrado")
    
    # Eager load lines to avoid lazy load issues when returning
    from sqlalchemy.orm import joinedload
    note = db.query(DeliveryNote).options(joinedload(DeliveryNote.lines)).filter(DeliveryNote.id == id).first()
    return note

@router.post("/")
def create_purchase_delivery_note(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Basic validation
    entity_id = payload.get("entity_id")
    warehouse_id = payload.get("warehouse_id")
    number = payload.get("number")
    date_str = payload.get("date")
    
    if not entity_id or not warehouse_id or not number:
        raise HTTPException(400, "Faltan datos obligatorios (entidad, deposito o numero)")
        
    date_val = datetime.utcnow()
    if date_str:
        try:
            date_val = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        except:
            pass

    # Create DN
    dn = DeliveryNote(
        id=generate_uuid(),
        entity_id=entity_id,
        warehouse_id=warehouse_id,
        number=number,
        date=date_val,
        status=DeliveryNoteStatus.CONFIRMED, # Los remitos de compra entran confirmados por defecto o en borrador si se desea, usamos CONFIRMED por simplicidad
        note_type=OrderType.PURCHASE,
        purchase_order_id=payload.get("sourceId"),
        origin_reference=payload.get("origin_reference"),
        notes=payload.get("notes"),
        currency=payload.get("currency", "ARS"),
        exchange_rate=payload.get("exchange_rate", 1.0),
        cost_center=payload.get("cost_center", 1)
    )
    db.add(dn)
    
    # Process lines
    lines_data = payload.get("lines", [])
    updated_purchase_orders = set()
    
    for ldata in lines_data:
        qty = float(ldata.get("qty", 0.0))
        if qty <= 0:
            continue
            
        src_line_id = ldata.get("source_purchase_line_id") or ldata.get("id")
        
        # Verify and update OC line if linked
        if src_line_id and not str(src_line_id).startswith("0."):
            oc_line = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == src_line_id).first()
            if oc_line:
                qty_pending = float(oc_line.qty) - float(oc_line.qty_received or 0)
                if qty > qty_pending + 0.01: # Small tolerance
                    raise HTTPException(400, f"No se puede recibir más cantidad ({qty}) que la pendiente ({qty_pending}) para el producto {oc_line.name or oc_line.description}")
                
                oc_line.qty_received = float(oc_line.qty_received or 0) + qty
                updated_purchase_orders.add(oc_line.order_id)
                dn.purchase_order_id = oc_line.order_id # Ensure header link
        
        line = DeliveryNoteLine(
            id=generate_uuid(),
            delivery_note_id=dn.id,
            product_id=ldata.get("product_id"),
            description=ldata.get("description", ""),
            qty=qty,
            unit_price=ldata.get("unit_price", 0.0),
            discount_pct=ldata.get("discount_pct", 0.0),
            vat_rate=ldata.get("vat_rate", 0.21),
            net_amount=ldata.get("net_amount", 0.0),
            vat_amount=ldata.get("vat_amount", 0.0),
            total_amount=ldata.get("total_amount", 0.0),
            unit_cost=ldata.get("unit_cost", 0.0),
            total_cost=ldata.get("total_cost", 0.0),
            source_purchase_line_id=src_line_id if src_line_id and not str(src_line_id).startswith("0.") else None,
            line_order=ldata.get("line_order", 0)
        )
        db.add(line)
    
    # TODO: stock entry for purchase delivery notes
    
    _log_history(db, dn.id, "CREADO", f"Remito de compra creado", current_user)
    
    # Recalculate OC statuses
    db.flush()
    for oc_id in updated_purchase_orders:
        recalc_purchase_order_status(db, oc_id)
        
    db.commit()
    db.refresh(dn)
    return dn

@router.put("/{id}")
def update_purchase_delivery_note(id: str, payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == id, DeliveryNote.note_type == OrderType.PURCHASE).first()
    if not dn:
        raise HTTPException(404, "Remito no encontrado")
        
    if dn.status in [DeliveryNoteStatus.CANCELLED, DeliveryNoteStatus.INVOICED]:
        raise HTTPException(400, f"No se puede modificar un remito en estado {dn.status}")
        
    # Revert old lines qty from OC
    updated_purchase_orders = set()
    for old_line in dn.lines:
        if old_line.source_purchase_line_id:
            oc_line = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == old_line.source_purchase_line_id).first()
            if oc_line:
                oc_line.qty_received = float(oc_line.qty_received or 0) - float(old_line.qty)
                updated_purchase_orders.add(oc_line.order_id)
                
    # Delete old lines
    db.query(DeliveryNoteLine).filter(DeliveryNoteLine.delivery_note_id == id).delete()
    
    # Update header
    if "number" in payload: dn.number = payload["number"]
    if "date" in payload and payload["date"]:
        try:
            dn.date = datetime.fromisoformat(payload["date"].replace("Z", "+00:00"))
        except:
            pass
    if "entity_id" in payload: dn.entity_id = payload["entity_id"]
    if "warehouse_id" in payload: dn.warehouse_id = payload["warehouse_id"]
    if "notes" in payload: dn.notes = payload["notes"]
    if "origin_reference" in payload: dn.origin_reference = payload["origin_reference"]
    
    # Apply new lines
    lines_data = payload.get("lines", [])
    for ldata in lines_data:
        qty = float(ldata.get("qty", 0.0))
        if qty <= 0: continue
            
        src_line_id = ldata.get("source_purchase_line_id") or ldata.get("id")
        
        if src_line_id and not str(src_line_id).startswith("0."):
            oc_line = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == src_line_id).first()
            if oc_line:
                qty_pending = float(oc_line.qty) - float(oc_line.qty_received or 0)
                if qty > qty_pending + 0.01:
                    raise HTTPException(400, f"No se puede recibir más cantidad ({qty}) que la pendiente ({qty_pending})")
                
                oc_line.qty_received = float(oc_line.qty_received or 0) + qty
                updated_purchase_orders.add(oc_line.order_id)
                
        line = DeliveryNoteLine(
            id=generate_uuid(),
            delivery_note_id=dn.id,
            product_id=ldata.get("product_id"),
            description=ldata.get("description", ""),
            qty=qty,
            unit_price=ldata.get("unit_price", 0.0),
            discount_pct=ldata.get("discount_pct", 0.0),
            vat_rate=ldata.get("vat_rate", 0.21),
            net_amount=ldata.get("net_amount", 0.0),
            vat_amount=ldata.get("vat_amount", 0.0),
            total_amount=ldata.get("total_amount", 0.0),
            unit_cost=ldata.get("unit_cost", 0.0),
            total_cost=ldata.get("total_cost", 0.0),
            source_purchase_line_id=src_line_id if src_line_id and not str(src_line_id).startswith("0.") else None,
            line_order=ldata.get("line_order", 0)
        )
        db.add(line)
        
    _log_history(db, dn.id, "MODIFICADO", "Remito de compra editado", current_user)
    
    db.flush()
    for oc_id in updated_purchase_orders:
        recalc_purchase_order_status(db, oc_id)
        
    db.commit()
    db.refresh(dn)
    return dn

@router.post("/{id}/cancel")
def cancel_purchase_delivery_note(id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == id, DeliveryNote.note_type == OrderType.PURCHASE).first()
    if not dn:
        raise HTTPException(404, "Remito no encontrado")
        
    if dn.status in [DeliveryNoteStatus.CANCELLED, DeliveryNoteStatus.INVOICED]:
        raise HTTPException(400, f"No se puede anular un remito en estado {dn.status}")
        
    dn.status = DeliveryNoteStatus.CANCELLED
    
    # Revert OC lines
    updated_purchase_orders = set()
    for line in dn.lines:
        if line.source_purchase_line_id:
            oc_line = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == line.source_purchase_line_id).first()
            if oc_line:
                oc_line.qty_received = float(oc_line.qty_received or 0) - float(line.qty)
                updated_purchase_orders.add(oc_line.order_id)
                
    # TODO: stock entry for purchase delivery notes (reversion)
    
    _log_history(db, dn.id, "ANULADO", "Remito anulado", current_user)
    
    db.flush()
    for oc_id in updated_purchase_orders:
        recalc_purchase_order_status(db, oc_id)
        
    db.commit()
    return {"message": "Anulado correctamente"}

@router.get("/{id}/traceability")
def get_purchase_delivery_note_traceability(id: str, db: Session = Depends(get_db)):
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == id, DeliveryNote.note_type == OrderType.PURCHASE).first()
    if not dn:
        raise HTTPException(404, "Remito no encontrado")
        
    oc_number = None
    if dn.purchase_order_id:
        oc = db.query(PurchaseOrder).filter(PurchaseOrder.id == dn.purchase_order_id).first()
        if oc: oc_number = oc.number
        
    return {
        "delivery_note": {
            "id": dn.id,
            "number": dn.number,
            "status": dn.status
        },
        "purchase_order": {
            "id": dn.purchase_order_id,
            "number": oc_number
        } if dn.purchase_order_id else None,
        "invoices": []
    }
