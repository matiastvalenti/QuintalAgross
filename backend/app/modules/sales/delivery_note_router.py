"""
Remitos (DeliveryNote) — Router completo.
Flujo: OV → Remito(s) parciales → Confirmar (stock OUT) → Editar/Anular con reversión.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from decimal import Decimal
import logging
import uuid
from datetime import datetime

logger = logging.getLogger(__name__)

from app.db.session import get_db
from app.db.models.commercial_models import (
    SalesOrder, SalesOrderLine, PurchaseOrder, PurchaseOrderLine,
    DeliveryNote, DeliveryNoteLine, DeliveryNoteHistory,
    OrderStatus, DeliveryNoteStatus, OrderType, DeliveryNoteType,
    StockItem, StockMovement, StockMovementType, Warehouse, Product,
    InvoiceDeliveryNoteLink, Container, Unit
)
from app.db.models.models import DocumentStatus
from . import delivery_note_schemas as dn_schemas
from . import numbering_service
from .sales_order_router import _recalc_total
from app.modules.accounting import document_schemas
from app.modules.accounting.document_router import create_document as create_doc_func
from app.modules.auth.auth_router import check_permission, log_action, get_current_user
from app.db.models.auth_models import User
from fastapi.responses import Response
from app.modules.finance.pdf_export import export_document_to_pdf
from app.db import models as db_models
import traceback
from app.modules.finance.mailer import send_email
from pydantic import BaseModel
from app.modules.inventory.stock_utils import get_or_create_stock_item, reserve_stock, unreserve_stock
from app.modules.sales.sales_utils import recalc_sales_order_status, recalc_purchase_order_status

class EmailPayload(BaseModel):
    to_email: str
    subject: Optional[str] = None
    body: Optional[str] = None

class LinkAdjustmentRequest(BaseModel):
    line_id: str
    new_qty: float
    source_sales_line_id: str

router = APIRouter(prefix="/delivery-notes", tags=["Delivery Notes"])

def generate_uuid():
    return str(uuid.uuid4())

def _get_or_create_stock_item(db: Session, product_id: str, warehouse_id: str) -> StockItem:
    from app.modules.inventory.stock_utils import get_or_create_stock_item as goci
    return goci(db, product_id, warehouse_id)

def _calculate_line(line_data: dict, db: Session = None):
    from app.utils.pricing import calculate_line_totals
    
    qty = float(line_data.get("qty", 0.0))
    unit_price = float(line_data.get("unit_price", 0.0))
    discount_pct = float(line_data.get("discount_pct", 0.0))
    vat_rate = float(line_data.get("vat_rate", 0.0))
    
    qty_packages = line_data.get("qty_packages")
    package_size = line_data.get("package_size")
    
    if db and line_data.get("product_id"):
        product = db.query(Product).filter(Product.id == line_data["product_id"]).first()
        if product:
             if product.quantity_per_container and float(product.quantity_per_container) > 1:
                 package_size = float(product.quantity_per_container)

    totals = calculate_line_totals(
        qty_packages=qty_packages,
        package_size=package_size,
        fallback_qty=qty,
        unit_price=unit_price,
        discount_pct=discount_pct,
        vat_rate=vat_rate
    )
    return {
        "qty_packages": totals["qty_packages"],
        "package_size": totals["package_size"],
        "qty": totals["qty"],
        "unit_price": totals["unit_price"],
        "discount_pct": totals["discount_pct"],
        "vat_rate": totals["vat_rate"],
        "net_amount": totals["net_amount"],
        "vat_amount": totals["vat_amount"],
        "total_amount": totals["total_amount"]
    }

def _get_next_ov_number(db: Session) -> str:
    # Por ahora hardcodeamos PV 0001 para auto-OV
    return numbering_service.get_next_number(db, "0001", "OV")

def _get_next_dn_number(db: Session, pv: str) -> str:
    return numbering_service.get_next_number(db, pv, "RE")

def _sanitize_delivery_note_for_response(dn: DeliveryNote):
    """Ensure line descriptions are strings to satisfy response model validation."""
    if not dn or not getattr(dn, "lines", None):
        return dn
    for line in dn.lines:
        if getattr(line, "description", None) is None:
            line.description = ""
    return dn


def _log_history(db: Session, dn_id: str, action: str, details: Optional[str] = None, current_user: Optional[User] = None):
    """Registra una entrada en el historial del remito."""
    username = "Sistema"
    if current_user:
        if hasattr(current_user, 'username'):
            username = current_user.username
        elif hasattr(current_user, 'name'):
            username = current_user.name
        else:
            username = str(current_user)

    history = DeliveryNoteHistory(
        delivery_note_id=dn_id,
        user=username,
        action=action,
        details=details
    )
    db.add(history)

# ═══════════════════════════════════════════
# NEXT NUMBER
# ═══════════════════════════════════════════
@router.get("/next-number", dependencies=[Depends(check_permission("sales_delivery", "view"))])
def get_next_number_dn(pv: str, db: Session = Depends(get_db)):
    """Calcula el próximo número correlativo para un PV dado."""
    next_num = numbering_service.get_next_number(db, pv, "RE")
    return {
        "pv": pv,
        "next_number": next_num.split("-")[-1] if "-" in next_num else next_num,
        "number": next_num
    }

@router.get("/pending-link", response_model=List[dn_schemas.DeliveryNoteResponse])
def list_pending_link_delivery_notes(
    entity_id: str,
    sales_order_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_permission("sales_delivery", "view"))
):
    """
    Lista remitos 'sueltos' para una entidad que pueden ser vinculados a una OV.
    Un remito es candidato si tiene al menos una línea sin source_sales_line_id 
    O si el remito ya pertenece a la sales_order_id proporcionada (para permitir descruzar).
    """
    from sqlalchemy import or_
    
    query = db.query(DeliveryNote).options(
        joinedload(DeliveryNote.lines)
    ).filter(
        DeliveryNote.entity_id == entity_id,
        DeliveryNote.note_type == OrderType.SALE,
        DeliveryNote.status != DeliveryNoteStatus.CANCELLED
    )
    
    if sales_order_id:
        # Incluir los que ya están en esta OV y los que tienen huecos
        query = query.filter(
            or_(
                DeliveryNote.sales_order_id == sales_order_id,
                DeliveryNote.lines.any(DeliveryNoteLine.source_sales_line_id == None)
            )
        )
    else:
        # Comportamiento original: solo remitos con líneas huérfanas
        query = query.join(DeliveryNoteLine).filter(DeliveryNoteLine.source_sales_line_id == None)
    
    return query.distinct().all()

def _recalc_dn_commission(dn: DeliveryNote, db: Session):
    if not dn.salesperson_id:
        dn.commission_amount = Decimal("0.0")
        return
    
    from app.db.models.models import Entity
    sp = db.query(Entity).filter(Entity.id == dn.salesperson_id).first()
    if not sp: return

    if sp.commission_type == 'fixed':
        total_net = sum((l.net_amount or Decimal("0")) for l in dn.lines)
        pct = Decimal(str(sp.commission_pct or 0.0)) / Decimal("100")
        dn.commission_amount = (total_net * pct).quantize(Decimal("0.01"))
    elif sp.commission_type == 'markup':
        total_markup = Decimal("0.0")
        for l in dn.lines:
            cost = Decimal("0.0")
            if l.source_sales_line_id:
                ovl = db.query(SalesOrderLine).filter(SalesOrderLine.id == l.source_sales_line_id).first()
                if ovl: cost = Decimal(str(ovl.unit_cost or 0))
            if cost == 0 and l.product_id:
                p = db.query(Product).filter(Product.id == l.product_id).first()
                if p: cost = Decimal(str(p.cost_price or 0))
            
            line_net = l.net_amount or Decimal("0")
            line_qty = Decimal(str(l.qty or 0))
            total_markup += line_net - (cost * line_qty)
            
        pct = Decimal(str(sp.commission_pct or 0.0)) / Decimal("100")
        dn.commission_amount = (total_markup * pct).quantize(Decimal("0.01"))
    else:
        # Default: if costs are present, use 100% margin (net - cost)
        total_net = sum(((l.net_amount or Decimal("0.0")) for l in dn.lines), Decimal("0.0"))
        total_cost = sum(((l.total_cost or Decimal("0.0")) for l in dn.lines), Decimal("0.0"))
        if total_cost > 0:
            dn.commission_amount = (total_net - total_cost).quantize(Decimal("0.01"))
        else:
            dn.commission_amount = Decimal("0.0")

def _update_order_status(db: Session, dn: DeliveryNote):
    """Llama a las utilidades centralizadas para actualizar el estado de la Orden vinculada."""
    if dn.note_type == OrderType.SALE and dn.sales_order_id:
        recalc_sales_order_status(db, dn.sales_order_id)
    elif dn.note_type == OrderType.PURCHASE and dn.purchase_order_id:
        recalc_purchase_order_status(db, dn.purchase_order_id)


def _check_and_cleanup_dn_header_link(db: Session, dn_id: str):
    """
    Verifica si un remito aún tiene ítems vinculados a una OV o OC.
    Si no quedan ítems vinculados, limpia la referencia en la cabecera.
    """
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
    if not dn: return

    # Verificar si tiene algún ítem vinculado a una OV
    has_ov_links = db.query(DeliveryNoteLine).filter(
        DeliveryNoteLine.delivery_note_id == dn_id,
        DeliveryNoteLine.source_sales_line_id != None
    ).first()
    
    if not has_ov_links and dn.sales_order_id:
        dn.sales_order_id = None
        if dn.origin_reference == "DESVINCULADO MASIVAMENTE":
             pass # Mantener si fue manual
        else:
             dn.origin_reference = None
    
    # Verificar si tiene algún ítem vinculado a una OC
    has_oc_links = db.query(DeliveryNoteLine).filter(
        DeliveryNoteLine.delivery_note_id == dn_id,
        DeliveryNoteLine.source_purchase_line_id != None
    ).first()
    
    if not has_oc_links and dn.purchase_order_id:
        dn.purchase_order_id = None

    db.flush()


# Optimize stock queries in delivery_note_router
from sqlalchemy.orm import joinedload

# Inside _apply_stock_impact, replace the per‑line product lookup with a joinedload
def _apply_stock_impact(db: Session, dn: DeliveryNote, revision_id: Optional[str] = None):
    """
    Genera movimientos de stock (IN/OUT) y actualiza qty_delivered en la OV (o qty_received en OC).
    """
    is_sale = dn.note_type == OrderType.SALE
    is_return = dn.delivery_type == DeliveryNoteType.RETURN
    
    # Determinar si suma o resta stock físico
    should_add = (not is_sale and not is_return) or (is_sale and is_return)

    # Reemplazamos la query redundante por dn.lines que ya están en la sesión
    for line in dn.lines:
        product_id = line.product_id
        if not product_id:
            # Fallback a origen si no hay producto en la línea del remito
            if is_sale and line.source_sales_line_id:
                ov_line = db.query(SalesOrderLine).filter(SalesOrderLine.id == line.source_sales_line_id).first()
                product_id = ov_line.product_id if ov_line else None
            elif not is_sale and line.source_purchase_line_id:
                oc_line = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == line.source_purchase_line_id).first()
                product_id = oc_line.product_id if oc_line else None
        
        if not product_id:
            continue

        stock_item = _get_or_create_stock_item(db, product_id, dn.warehouse_id)
        qty = Decimal(str(line.qty))
        
        # 1. Actualizar Stock Físico
        if should_add:
            stock_item.qty_on_hand = Decimal(str(stock_item.qty_on_hand)) + qty
            movement_type = StockMovementType.IN
            mov_qty = qty
        else:
            stock_item.qty_on_hand = Decimal(str(stock_item.qty_on_hand)) - qty
            movement_type = StockMovementType.OUT
            mov_qty = -qty

        # 2. Actualizar contadores de Ordenes (qty_delivered / qty_received)
        if is_sale and line.source_sales_line_id:
            # 2.1 Descontar Reserva si es una Venta (ya que ahora es stock físico OUT)
            if not is_return:
                 unreserve_stock(db, product_id, dn.warehouse_id, qty)
            else:
                 reserve_stock(db, product_id, dn.warehouse_id, qty)

            ov_line = db.query(SalesOrderLine).filter(SalesOrderLine.id == line.source_sales_line_id).first()
            if ov_line:
                change = qty if not is_return else -qty
                ov_line.qty_delivered = Decimal(str(ov_line.qty_delivered or 0)) + change
                ov_line.qty_delivered = max(Decimal(0), ov_line.qty_delivered)
                db.flush()
        elif not is_sale and line.source_purchase_line_id:
            oc_line = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == line.source_purchase_line_id).first()
            if oc_line:
                change = qty if not is_return else -qty
                oc_line.qty_received = Decimal(str(oc_line.qty_received or 0)) + change
                oc_line.qty_received = max(Decimal(0), oc_line.qty_received)
                db.flush()

        # 3. Registrar Movimiento
        movement = StockMovement(
            stock_item_id=stock_item.id,
            movement_type=movement_type,
            qty=mov_qty,
            reference_type="RETURN" if is_return else "DELIVERY_NOTE",
            reference_id=dn.id,
            revision_id=revision_id,
            stock_negative=(stock_item.qty_on_hand < 0),
        )
        db.add(movement)
    
    db.flush() 


def _reverse_stock_impact(db: Session, dn: DeliveryNote, revision_id: Optional[str] = None):
    """Invierte el efecto de _apply_stock_impact."""
    is_sale = dn.note_type == OrderType.SALE
    is_return = dn.delivery_type == DeliveryNoteType.RETURN
    
    # Lo opuesto a should_add de apply
    should_add_now = (is_sale and not is_return) or (not is_sale and is_return)

    for line in dn.lines:
        product_id = line.product_id
        if not product_id: continue

        stock_item = _get_or_create_stock_item(db, product_id, dn.warehouse_id)
        qty = Decimal(str(line.qty))
        
        if should_add_now:
            stock_item.qty_on_hand = Decimal(str(stock_item.qty_on_hand)) + qty
            mov_qty = qty
        else:
            stock_item.qty_on_hand = Decimal(str(stock_item.qty_on_hand)) - qty
            mov_qty = -qty

        # Revertir contadores
        if is_sale and line.source_sales_line_id:
            # Re-reservar si el remito vuelve (ya no salió físico, pero la orden sigue confirmada)
            if not is_return:
                 reserve_stock(db, product_id, dn.warehouse_id, qty)
            else:
                 unreserve_stock(db, product_id, dn.warehouse_id, qty)

            ov_line = db.query(SalesOrderLine).filter(SalesOrderLine.id == line.source_sales_line_id).first()
            if ov_line:
                # Invertimos el efecto del remito
                ov_line.qty_delivered = Decimal(str(ov_line.qty_delivered or 0)) + (-qty if not is_return else qty)
                ov_line.qty_delivered = max(Decimal(0), ov_line.qty_delivered)
        elif not is_sale and line.source_purchase_line_id:
            oc_line = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == line.source_purchase_line_id).first()
            if oc_line:
                oc_line.qty_received = Decimal(str(oc_line.qty_received or 0)) + (-qty if not is_return else qty)
                oc_line.qty_received = max(Decimal(0), oc_line.qty_received)

        movement = StockMovement(
            stock_item_id=stock_item.id,
            movement_type=StockMovementType.ADJUSTMENT,
            qty=mov_qty,
            reference_type="REVERSAL",
            reference_id=dn.id,
            revision_id=revision_id,
            notes=f"Reversión de remito {dn.number}",
        )
        db.add(movement)


# ═══════════════════════════════════════════
# CREATE DIRECT (Auto-OV)
# ═══════════════════════════════════════════
@router.post("/", response_model=dn_schemas.DeliveryNoteResponse, status_code=201)
def create_direct_delivery_note(
    data: dn_schemas.CreateDeliveryNoteDirect,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_permission("sales_delivery", "create"))
):
    """
    Crea un Remito Directo sin OV previa.
    Genera automáticamente una OV (CONFIRMED) con numeración estándar y source=AUTO_REMITO.
    """
    if not data.lines:
        raise HTTPException(status_code=400, detail="El remito debe tener al menos una línea")

    # 1. Validar Entidad
    entity = db.query(db_models.Entity).filter(db_models.Entity.id == data.entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entidad no encontrada")

    # 2. Crear OV Automática
    # Usar numeración estándar "0001-XXXXXXXX"
    ov_number = _get_next_ov_number(db)
    
    total_ov = Decimal(0)
    lines_data = []

    for line in data.lines:
        calc = _calculate_line(line.model_dump(), db=db)
        total_ov += calc["total_amount"]
        lines_data.append({**calc, "raw": line})

    # Crear OV
    new_ov = SalesOrder(
        entity_id=data.entity_id,
        number=ov_number,
        date=data.date or datetime.now(),
        status=OrderStatus.CONFIRMED, # Nace Confirmada
        source="AUTO_REMITO",         # Flag para identificar origen
        total_amount=total_ov,
        currency=data.currency or "ARS",
        exchange_rate=data.exchange_rate or 1.0,
        vendedor=data.vendedor,
        salesperson_id=data.salesperson_id,
        sale_condition_id=data.sale_condition_id,
        due_date=data.due_date,
        vehicle_id=data.vehicle_id,
        vehicle_driver=data.vehicle_driver,
        cost_center=data.cost_center,
        notes=f"Generada automáticamente por Remito {data.number}",
    )
    db.add(new_ov)
    db.flush()


    # Crear Líneas OV (solo para las que no tienen source)
    ov_lines_map = {} 
    for i, item in enumerate(lines_data):
        raw = item["raw"]
        
        # Si ya viene con un ID de línea de OV, lo usamos directamente
        if raw.source_sales_line_id:
            ov_lines_map[i] = raw.source_sales_line_id
            continue

        ov_line = SalesOrderLine(
            order_id=new_ov.id,
            description=(raw.description if getattr(raw, "description", None) is not None else ""),
            product_id=raw.product_id,
            qty=raw.qty,
            unit_price=raw.unit_price,
            discount_pct=raw.discount_pct,
            vat_rate=raw.vat_rate,
            net_amount=item["net_amount"],
            vat_amount=item["vat_amount"],
            total_amount=item["total_amount"],
            line_order=i,
            qty_delivered=0 
        )
        db.add(ov_line)
        db.flush()
        ov_lines_map[i] = ov_line.id

    db.flush()
    db.refresh(new_ov) 
    
    # IMPORTANTE: Recalcular totales DESPUES de crear líneas para que el costo y margen sean correctos
    _recalc_total(new_ov, db)
    db.flush()

    # Incrementar contador OV
    numbering_service.increment_last_number(db, "0001", "OV")

    # 2. Crear Remito vinculado
    # Validar número o generar correlativo
    pv_remito = "0001"
    if data.number and "-" in data.number:
        try:
            pv_remito = data.number.split("-")[0]
            if len(pv_remito) > 5: pv_remito = "0001" # Safety
        except: pass
        
    dn_number = data.number or _get_next_dn_number(db, pv_remito)

    dn = DeliveryNote(
        entity_id=data.entity_id,
        warehouse_id=data.warehouse_id,
        number=dn_number,
        date=data.date or datetime.now(),
        note_type=OrderType.SALE,
        delivery_type=DeliveryNoteType.STANDARD,
        sales_order_id=new_ov.id,
        origin_reference=new_ov.number,
        status=DeliveryNoteStatus.DRAFT,
        notes=data.notes,
        currency=data.currency or "ARS",
        exchange_rate=data.exchange_rate or 1.0,
        vendedor=data.vendedor,
        salesperson_id=data.salesperson_id or new_ov.salesperson_id,
        commission_amount=new_ov.commission_amount,
        sale_condition_id=data.sale_condition_id,
        due_date=data.due_date,
        vehicle_id=data.vehicle_id,
        vehicle_driver=data.vehicle_driver,
        created_by=data.vendedor or "Sistema",
        cost_center=data.cost_center
    )
    db.add(dn)
    db.flush()
    _log_history(db, dn.id, "CREACION", f"Remito directo creado", current_user=current_user)

    # 3. Crear Líneas Remito
    for i, item in enumerate(lines_data):
        raw = item["raw"]
        dn_line = DeliveryNoteLine(
            delivery_note_id=dn.id,
            description=(raw.description if getattr(raw, "description", None) is not None else ""),
            qty=raw.qty,
            unit_price=raw.unit_price,
            discount_pct=raw.discount_pct,
            vat_rate=raw.vat_rate,
            net_amount=item["net_amount"],
            vat_amount=item["vat_amount"],
            total_amount=item["total_amount"],
            line_order=i,
            source_sales_line_id=ov_lines_map[i], 
            unit_cost=float(item["raw"].unit_cost or 0),
            total_cost=float(item["raw"].unit_cost or 0) * float(item["raw"].qty or 0)
        )
        dn.lines.append(dn_line)

    db.flush()
    dn.total_cost = sum(float(l.total_cost or 0) for l in dn.lines)
    dn.margin_amount = float(sum(float(l.net_amount or 0) for l in dn.lines)) - dn.total_cost

    _recalc_dn_commission(dn, db)

    # Autoconfimación si se requiere
    if getattr(data, "confirm_now", True):
        _apply_stock_impact(db, dn)
        dn.status = DeliveryNoteStatus.DISPATCHED
        # _update_order_status ya se llama dentro de _apply_stock_impact o después
        _update_order_status(db, dn)
        _log_history(db, dn.id, "CONFIRMACION", "Remito autoconfirmado al crear", current_user=current_user)

    db.commit()
    db.refresh(dn)
    _sanitize_delivery_note_for_response(dn)

    # Audit Log
    log_action(
        user=current_user,
        action="CREATE",
        module="delivery_notes",
        target_id=dn.id,
        description=f"Nuevo Remito Directo {dn.number} para {entity.name}",
        db=db,
        data={"total": float(sum(l.total_amount for l in dn.lines))}
    )

    return dn


# ═══════════════════════════════════════════
# CREATE FROM OV
# ═══════════════════════════════════════════
@router.post("/from-ov/{order_id}",
             response_model=dn_schemas.DeliveryNoteResponse, status_code=201)
def create_delivery_note_from_ov(
    order_id: str,
    data: dn_schemas.CreateDeliveryNoteFromOV,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_permission("sales_delivery", "create"))
):
    # Validar OV
    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="OV no encontrada")
    
    # Estados permitidos: CONFIRMED o PARTIALLY_DELIVERED
    if order.status not in (OrderStatus.CONFIRMED, OrderStatus.PARTIALLY_DELIVERED, OrderStatus.DRAFT): 
        # Mantengo OPEN por retrocompatibilidad si quedara alguna data vieja, pero idealmente solo CONFIRMED/PARTIAL
        raise HTTPException(
            status_code=409,
            detail=f"Solo se pueden crear remitos desde OV en estado CONFIRMED o PARTIALLY_DELIVERED (actual: {order.status.value})"
        )

    # Validar warehouse
    wh = db.query(Warehouse).filter(Warehouse.id == data.warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Depósito no encontrado")

    if not data.lines:
        raise HTTPException(status_code=400, detail="El remito debe tener al menos una línea")

    # Moneda y datos: priorizar payload (lo que ve el usuario en la OV), sino OV en DB
    use_currency = (data.currency or "").strip() or (order.currency or "ARS")
    use_exchange_rate = float(data.exchange_rate) if data.exchange_rate is not None else float(order.exchange_rate or 1.0)
    use_vendedor = (data.vendedor or "").strip() or order.vendedor
    use_salesperson_id = data.salesperson_id or order.salesperson_id
    use_sale_condition_id = data.sale_condition_id or order.sale_condition_id
    use_due_date = data.due_date or order.due_date

    # Sincronizar OV con lo enviado (por si el usuario cambió a USD y no guardó)
    order.currency = use_currency
    order.exchange_rate = use_exchange_rate
    order.vendedor = use_vendedor or order.vendedor
    order.sale_condition_id = use_sale_condition_id
    order.due_date = use_due_date
    db.flush()

    dn = DeliveryNote(
        entity_id=order.entity_id,
        warehouse_id=data.warehouse_id,
        number=data.number,
        note_type=OrderType.SALE,
        delivery_type=DeliveryNoteType.STANDARD,
        sales_order_id=order.id,
        origin_reference=order.number,
        notes=data.notes,
        currency=use_currency,
        exchange_rate=use_exchange_rate,
        vendedor=use_vendedor,
        salesperson_id=use_salesperson_id,
        sale_condition_id=use_sale_condition_id,
        due_date=use_due_date,
        vehicle_id=data.vehicle_id or order.vehicle_id,
        vehicle_driver=data.vehicle_driver or order.vehicle_driver,
        created_by=use_vendedor or "Sistema",
        cost_center=data.cost_center or order.cost_center
    )
    db.add(dn)
    db.flush()
    _log_history(db, dn.id, "CREACION", f"Remito creado desde OV {order.number}", current_user=current_user)

    for i, line_data in enumerate(data.lines):
        if not line_data.source_sales_line_id:
            raise HTTPException(status_code=400, detail=f"Línea {i}: falta source_sales_line_id")

        ov_line = db.query(SalesOrderLine).filter(
            SalesOrderLine.id == line_data.source_sales_line_id,
            SalesOrderLine.order_id == order.id,
        ).first()
        if not ov_line:
            raise HTTPException(status_code=404, detail=f"Línea OV {line_data.source_sales_line_id} no encontrada")

        qty = Decimal(str(line_data.qty))
        qty_ov = Decimal(str(ov_line.qty))
        qty_delivered = Decimal(str(ov_line.qty_delivered))
        remaining = qty_ov - qty_delivered
        
        if qty > remaining:
            raise HTTPException(
                status_code=409,
                detail=f"Línea '{ov_line.description}': qty {qty} > remaining {remaining}"
            )

        calc = _calculate_line({
            "qty": line_data.qty,
            "unit_price": ov_line.unit_price,
            "discount_pct": ov_line.discount_pct,
            "vat_rate": ov_line.vat_rate,
            "product_id": ov_line.product_id
        }, db=db)
        db_line = DeliveryNoteLine(
            delivery_note_id=dn.id,
            description=(ov_line.description if getattr(ov_line, "description", None) is not None else ""),
            product_id=ov_line.product_id,
            qty=calc["qty"],
            unit_price=calc["unit_price"],
            discount_pct=calc["discount_pct"],
            vat_rate=calc["vat_rate"],
            net_amount=calc["net_amount"],
            vat_amount=calc["vat_amount"],
            total_amount=calc["total_amount"],
            line_order=i,
            source_sales_line_id=ov_line.id,
            unit_cost=float(ov_line.unit_cost or 0),
            total_cost=float(ov_line.unit_cost or 0) * float(calc["qty"])
        )
        dn.lines.append(db_line)
    
    db.flush()
    dn.total_cost = sum(float(l.total_cost or 0) for l in dn.lines)
    dn.margin_amount = float(sum(float(l.net_amount or 0) for l in dn.lines)) - dn.total_cost

    if data.number and "-" in data.number:
        pv_re = data.number.split("-")[0]
        numbering_service.increment_last_number(db, pv_re, "RE")

    _recalc_dn_commission(dn, db) # Requerido para ver comisiones en el reporte

    # Autoconfimación si se requiere
    if getattr(data, "confirm_now", True):
        _apply_stock_impact(db, dn)
        dn.status = DeliveryNoteStatus.DISPATCHED
        _update_order_status(db, dn)
        _log_history(db, dn.id, "CONFIRMACION", "Remito autoconfirmado al crear desde OV", current_user=current_user)

    db.commit()
    db.refresh(dn)
    _sanitize_delivery_note_for_response(dn)

    # Audit Log
    log_action(
        user=current_user,
        action="CREATE",
        module="delivery_notes",
        target_id=dn.id,
        description=f"Nuevo Remito {dn.number} desde OV {order.number}",
        db=db,
        data={"total": float(sum(l.total_amount for l in dn.lines))}
    )

    return dn


# ═══════════════════════════════════════════
# CREATE FROM OC (Purchase Order)
# ═══════════════════════════════════════════
@router.post("/from-oc/{order_id}",
             response_model=dn_schemas.DeliveryNoteResponse, status_code=201, dependencies=[Depends(check_permission("sales_delivery", "create"))])
def create_delivery_note_from_oc(
    order_id: str,
    data: dn_schemas.CreateDeliveryNoteFromOV, # Reusing schema for now
    db: Session = Depends(get_db),
):
    # Validar OC
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="OC no encontrada")
    
    # Validar warehouse
    wh = db.query(Warehouse).filter(Warehouse.id == data.warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Depósito no encontrado")

    if not data.lines:
        raise HTTPException(status_code=400, detail="El remito debe tener al menos una línea")

    logger.info(f"Creating DN from OC {order_id}")
    wh_id = data.warehouse_id
    pv_re = data.pv or "0001"
    
    # Asegurar formato PV-Numero
    final_number = data.number
    logger.debug(f"Input number: {final_number}")
    if final_number and "-" not in final_number:
        try:
            final_number = f"{pv_re}-{int(final_number):08d}"
        except: pass
    elif not final_number:
        final_number = _get_next_dn_number(db, pv_re)
    logger.debug(f"Final number: {final_number}")

    # Check for duplicates to avoid 500 IntegrityError
    existing = db.query(DeliveryNote).filter(DeliveryNote.number == final_number).first()
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"El número de remito {final_number} ya está registrado en el sistema. Por favor, use uno diferente."
        )

    dn = DeliveryNote(
        entity_id=order.entity_id,
        warehouse_id=wh_id,
        number=final_number,
        note_type=OrderType.PURCHASE,
        delivery_type=DeliveryNoteType.STANDARD,
        purchase_order_id=order.id,
        origin_reference=order.number,
        notes=data.notes,
        currency=str(order.currency.value) if order.currency else "ARS",
        exchange_rate=Decimal(str(order.exchange_rate or 1.0)),
        vehicle_id=data.vehicle_id,
        vehicle_driver=data.vehicle_driver,
        cost_center=data.cost_center or order.cost_center
    )
    db.add(dn)
    db.flush()

    for i, line_data in enumerate(data.lines):
        # Intentar obtener el ID de la línea de origen (OC)
        source_id = line_data.source_purchase_line_id or line_data.source_sales_line_id
        if not source_id:
            raise HTTPException(status_code=400, detail=f"Línea {i}: falta source_id")
 
        logger.debug(f"Processing line {i}, source_id={source_id}")
        oc_line = db.query(PurchaseOrderLine).filter(
            PurchaseOrderLine.id == source_id,
            PurchaseOrderLine.order_id == order.id,
        ).first()
        if not oc_line:
            logger.warning(f"Line {source_id} NOT FOUND")
            raise HTTPException(status_code=404, detail=f"Línea OC {source_id} no encontrada")

        qty = Decimal(str(line_data.qty))
        logger.debug(f"Qty to receive: {qty}")
        
        # VALIDACIÓN: No exceder lo pendiente en OC
        qty_oc = Decimal(str(oc_line.qty or 0))
        qty_received = Decimal(str(oc_line.qty_received or 0))
        remaining = qty_oc - qty_received
        
        if qty > remaining:
            raise HTTPException(
                status_code=409,
                detail=f"Línea '{oc_line.description}': qty {qty} > remaining {remaining}"
            )

        calc = _calculate_line({
            "qty": line_data.qty,
            "unit_price": Decimal(str(oc_line.unit_price or 0)),
            "discount_pct": Decimal(str(oc_line.discount_pct or 0)),
            "vat_rate": Decimal(str(oc_line.vat_rate or 0.21)),
            "product_id": oc_line.product_id
        }, db=db)
        unit_price_dec = Decimal(str(oc_line.unit_price or 0))
        db_line = DeliveryNoteLine(
            delivery_note_id=dn.id,
            description=(oc_line.description or ""),
            product_id=oc_line.product_id,
            qty=calc["qty"],
            unit_price=calc["unit_price"],
            discount_pct=calc["discount_pct"],
            vat_rate=calc["vat_rate"],
            net_amount=calc["net_amount"],
            vat_amount=calc["vat_amount"],
            total_amount=calc["total_amount"],
            line_order=i,
            source_purchase_line_id=oc_line.id,
            unit_cost=unit_price_dec,
            total_cost=unit_price_dec * Decimal(str(calc["qty"]))
        )
        dn.lines.append(db_line)

    db.flush()

    # Incrementar contador RE si aplica
    if dn.number and "-" in dn.number:
        pv_val = dn.number.split("-")[0]
        numbering_service.increment_last_number(db, pv_val, "RE")

    # Impactar stock y actualizar estado OC
    _apply_stock_impact(db, dn)
    dn.status = DeliveryNoteStatus.DISPATCHED
    _update_order_status(db, dn)

    db.commit()
    db.refresh(dn)
    _sanitize_delivery_note_for_response(dn)
    return dn


# ═══════════════════════════════════════════
# CONFIRM PREVIEW
# ═══════════════════════════════════════════
@router.get("/{dn_id}/confirm-preview",
            response_model=dn_schemas.ConfirmPreviewResponse, dependencies=[Depends(check_permission("sales_delivery", "view"))])
def confirm_preview(dn_id: str, db: Session = Depends(get_db)):
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
    if not dn:
        raise HTTPException(status_code=404, detail="Remito no encontrado")

    impacts = []
    is_sale = dn.note_type == OrderType.SALE
    is_return = dn.delivery_type == DeliveryNoteType.RETURN
    should_add = (not is_sale and not is_return) or (is_sale and is_return)

    for line in dn.lines:
        product_id = line.product_id
        if not product_id:
             if is_sale and line.source_sales_line_id:
                 ovl = db.query(SalesOrderLine).filter(SalesOrderLine.id == line.source_sales_line_id).first()
                 product_id = ovl.product_id if ovl else None
             elif not is_sale and line.source_purchase_line_id:
                 ocl = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == line.source_purchase_line_id).first()
                 product_id = ocl.product_id if ocl else None
        
        if not product_id:
            continue
            
        product = db.query(Product).filter(Product.id == product_id).first()
        stock_item = db.query(StockItem).filter(
            StockItem.product_id == product_id,
            StockItem.warehouse_id == dn.warehouse_id,
        ).first()
        
        current = Decimal(str(stock_item.qty_on_hand)) if stock_item else Decimal(0)
        qty = Decimal(str(line.qty))
        
        if should_add:
            resulting = current + qty
            mov_qty = qty
        else:
            resulting = current - qty
            mov_qty = -qty
        
        impacts.append(dn_schemas.StockImpactPreview(
            product_id=product_id,
            product_name=product.name if product else "?",
            warehouse_id=dn.warehouse_id,
            current_qty=float(current),
            movement_qty=float(mov_qty),
            resulting_qty=float(resulting),
            will_be_negative=resulting < 0,
        ))

    return dn_schemas.ConfirmPreviewResponse(
        delivery_note_id=dn.id,
        impacts=impacts,
        has_negative_stock=any(i.will_be_negative for i in impacts),
    )


# ═══════════════════════════════════════════
# CONFIRM (stock OUT/IN)
# ═══════════════════════════════════════════
@router.post("/{dn_id}/confirm",
             response_model=dn_schemas.DeliveryNoteResponse, dependencies=[Depends(check_permission("sales_delivery", "edit"))])
def confirm_delivery_note(dn_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
    if not dn:
        raise HTTPException(status_code=404, detail="Remito no encontrado")
    if dn.status != DeliveryNoteStatus.DRAFT:
        raise HTTPException(status_code=409, detail=f"Solo se pueden confirmar remitos DRAFT")

    if dn.delivery_type == DeliveryNoteType.RETURN:
        # Lógica de devolución (Stock IN)
        # Reutilizamos lógica de returns pero adaptada a confirmación principal si fuera unificado
        # Pero tenemos endpoint dedicado 'confirm-return'. 
        # Si el frontend llama este para todos, derivamos.
        return confirm_return_delivery_note(dn_id, db)

    # Standard Delivery (Stock OUT/IN)
    _apply_stock_impact(db, dn)

    dn.status = DeliveryNoteStatus.DISPATCHED

    # Recalcular OV/OC status
    _update_order_status(db, dn)

    _log_history(db, dn.id, "CONFIRMACION", f"Remito confirmado (DISPATCHED)", current_user=current_user)

    db.commit()
    db.refresh(dn)
    _sanitize_delivery_note_for_response(dn)
    return dn


# ═══════════════════════════════════════════
# CANCEL (reverse stock)
# ═══════════════════════════════════════════
@router.post("/{dn_id}/cancel", response_model=dn_schemas.DeliveryNoteResponse, dependencies=[Depends(check_permission("sales_delivery", "delete"))])
def cancel_delivery_note(dn_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
    if not dn:
        raise HTTPException(status_code=404, detail="Remito no encontrado")

    if dn.status == DeliveryNoteStatus.DISPATCHED:
        revision_id = generate_uuid()
        _reverse_stock_impact(db, dn, revision_id)
            
    elif dn.status != DeliveryNoteStatus.DRAFT:
        raise HTTPException(status_code=409, detail=f"No se puede anular un remito en estado {dn.status.value}")

    dn.status = DeliveryNoteStatus.CANCELLED

    # Recalcular OV/OC status
    _update_order_status(db, dn)

    _log_history(db, dn.id, "ANULACION", f"Remito anulado", current_user=current_user)

    db.commit()
    db.refresh(dn)
    _sanitize_delivery_note_for_response(dn)
    return dn


# ═══════════════════════════════════════════
# LIST / GET
# ═══════════════════════════════════════════
@router.get("/", response_model=List[dn_schemas.DeliveryNoteListResponse], dependencies=[Depends(check_permission("sales_delivery", "view"))])
def list_delivery_notes(
    entity_id: Optional[str] = None,
    status: Optional[str] = None,
    note_type: Optional[str] = None,
    sales_order_id: Optional[str] = None,
    purchase_order_id: Optional[str] = None,
    cost_center: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(DeliveryNote).options(
        joinedload(DeliveryNote.lines),
        joinedload(DeliveryNote.invoices).joinedload(InvoiceDeliveryNoteLink.document),
        joinedload(DeliveryNote.sales_order)
    )
    if entity_id:
        q = q.filter(DeliveryNote.entity_id == entity_id)
    if status:
        q = q.filter(DeliveryNote.status == status)
    if note_type:
        q = q.filter(DeliveryNote.note_type == note_type)
    if sales_order_id:
        q = q.filter(DeliveryNote.sales_order_id == sales_order_id)
    if purchase_order_id:
        q = q.filter(DeliveryNote.purchase_order_id == purchase_order_id)
    if cost_center:
        q = q.filter(DeliveryNote.cost_center == cost_center)
    
    results = q.order_by(DeliveryNote.date.desc()).all()
    
    for dn in results:
        # Get linked invoices from the relationship we just eager-loaded
        invs = [link.document for link in dn.invoices if link.document and link.document.status != DocumentStatus.CANCELLED]
        
        so = dn.sales_order
        if not so and dn.origin_reference:
            from app.db.models.commercial_models import SalesOrder
            clean_ref = dn.origin_reference.strip().replace("OV ", "").replace("OV-", "")
            so = db.query(SalesOrder).filter(SalesOrder.number.contains(clean_ref[-10:])).first()
        so_status = getattr(so, 'status', None)
        so_status_val = so_status.name if hasattr(so_status, 'name') else str(so_status) if so_status else ""
        so_upper = so_status_val.upper()

        # DEBUG LOGGING END
        # with open(r"c:\Users\matia\Cosas\Escritorio\Programacion\Otro\QuintalAgross_Back\backend\debug_dn_fixed.log", "a") as dbg:
        #     dbg.write(f"DN: {dn.number} | SO: {so.number if so else 'no'} | SO_REF: {dn.origin_reference} | SO_STATUS: {so_status_val}\n")

        if invs:
            dn.invoice_progress = 100.0
            if dn.status == DeliveryNoteStatus.DISPATCHED:
                dn.status = DeliveryNoteStatus.INVOICED
        elif so and any(k in so_upper for k in ["INVOICED", "COMPLETED", "FACTURADO_TOTAL", "FULLY_DELIVERED"]):
            dn.invoice_progress = 100.0
            if dn.status == DeliveryNoteStatus.DISPATCHED:
                dn.status = DeliveryNoteStatus.INVOICED
        else:
            # Traditional calculation as fallback or for partial scenarios
            total_qty = sum(float(l.qty or 0) for l in dn.lines)
            total_invoiced = sum(float(l.qty_invoiced or 0) for l in dn.lines)
            if total_qty > 0:
                dn.invoice_progress = min(round((total_invoiced / total_qty) * 100, 2), 100.0)
            else:
                dn.invoice_progress = 0.0

        # Update status if progress is full
        if dn.invoice_progress >= 99.9 and dn.status == DeliveryNoteStatus.DISPATCHED:
             dn.status = DeliveryNoteStatus.INVOICED

        # 2. Paid Progress (Based on linked invoice status)
        if invs:
            if all(inv.status == DocumentStatus.CLOSED for inv in invs):
                dn.paid_progress = 100.0
            else:
                total_inv_val = sum(float(inv.total_amount_ars or inv.total_amount or 0) for inv in invs)
                if total_inv_val > 0:
                    total_allocated = sum(float(inv.allocated_amount_ars or inv.allocated_amount or 0) for inv in invs)
                    dn.paid_progress = min(round((total_allocated / total_inv_val) * 100, 2), 100.0)
                else:
                    paid_count = sum(1 for inv in invs if inv.status == DocumentStatus.CLOSED)
                    dn.paid_progress = round((paid_count / len(invs)) * 100, 2)
        elif so and any(k in so_upper for k in ["COMPLETED", "FACTURADO_TOTAL", "FULLY_DELIVERED"]):
            dn.paid_progress = 100.0
        else:
            dn.paid_progress = 0.0

    return results

@router.get("/test-dn-link/{dn_number}")
def test_dn_link(dn_number: str, db: Session = Depends(get_db)):
    from app.db.models.models import Document as MyDoc
    dn = db.query(DeliveryNote).filter(DeliveryNote.number == dn_number).first()
    if not dn: return {"error": "Not found"}
    links = db.query(InvoiceDeliveryNoteLink).filter(InvoiceDeliveryNoteLink.delivery_note_id == dn.id).all()
    invoices = []
    for l in links:
        doc = db.query(MyDoc).filter(MyDoc.id == l.document_id).first()
        invoices.append({"id": doc.id if doc else "None", "number": doc.number if doc else "None", "status": doc.status.name if doc else "None", "type": doc.doc_type if doc else "None"})
    return {"dn_id": dn.id, "number": dn.number, "status": dn.status.name if dn.status else "None", "links_count": len(links), "invoices": invoices}

@router.get("/{dn_id}", response_model=dn_schemas.DeliveryNoteResponse, dependencies=[Depends(check_permission("sales_delivery", "view"))])
def get_delivery_note(dn_id: str, db: Session = Depends(get_db)):
    dn = db.query(DeliveryNote).options(
        joinedload(DeliveryNote.lines).joinedload(DeliveryNoteLine.product).joinedload(Product.container).joinedload(Container.unit),
        joinedload(DeliveryNote.history)
    ).filter(DeliveryNote.id == dn_id).first()

    if not dn:
        raise HTTPException(status_code=404, detail="Remito no encontrado")
        
    # Sincronizar estado basado en facturación
    if dn.status not in [DeliveryNoteStatus.CANCELLED, DeliveryNoteStatus.DRAFT]:
        links = db.query(InvoiceDeliveryNoteLink).options(joinedload(InvoiceDeliveryNoteLink.document)).filter(
            InvoiceDeliveryNoteLink.delivery_note_id == dn.id
        ).all()
        invs = [link.document for link in links if link.document and link.document.status != DocumentStatus.CANCELLED]
        so = dn.sales_order
        if not so and dn.origin_reference:
            from app.db.models.commercial_models import SalesOrder
            clean_ref = dn.origin_reference.strip().replace("OV ", "").replace("OV-", "")
            so = db.query(SalesOrder).filter(SalesOrder.number.contains(clean_ref[-10:])).first()
        so_status = getattr(so, 'status', None)
        so_status_val = so_status.name if hasattr(so_status, 'name') else str(so_status) if so_status else ""
        so_upper = so_status_val.upper()
        
        total_qty_dn = sum(float(l.qty or 0) for l in dn.lines)
        total_invoiced_dn = sum(float(l.qty_invoiced or 0) for l in dn.lines)
        
        if total_qty_dn > 0:
            dn.invoice_progress = min(round((total_invoiced_dn / total_qty_dn) * 100, 2), 100.0)
            if dn.invoice_progress < 1.0 and invs:
                dn.invoice_progress = 100.0
        else:
            dn.invoice_progress = 0.0
            
        if not invs and so and any(k in so_upper for k in ["INVOICED", "COMPLETED", "FACTURADO_TOTAL", "FULLY_DELIVERED"]):
            dn.invoice_progress = 100.0

        if dn.invoice_progress >= 99.9:
            dn.status = DeliveryNoteStatus.INVOICED
        elif dn.invoice_progress > 0:
            dn.status = DeliveryNoteStatus.PARTIAL
            
        if invs:
            total_inv_val = sum(float(inv.total_amount or 0) for inv in invs)
            if total_inv_val > 0:
                total_allocated = sum(float(inv.allocated_amount or 0) for inv in invs)
                dn.paid_progress = min(round((total_allocated / total_inv_val) * 100, 2), 100.0)
            else:
                paid_count = sum(1 for inv in invs if inv.status == DocumentStatus.CLOSED)
                dn.paid_progress = round((paid_count / len(invs)) * 100, 2)
        elif so and any(k in so_upper for k in ["COMPLETED", "FACTURADO_TOTAL", "FULLY_DELIVERED"]):
            dn.paid_progress = 100.0
        else:
            dn.paid_progress = 0.0

    # 2. Poblar traza de facturas
    dn.invoices = []
    # Usando tabla puente M:N
    invoice_links = db.query(InvoiceDeliveryNoteLink).options(joinedload(InvoiceDeliveryNoteLink.document)).filter(
        InvoiceDeliveryNoteLink.delivery_note_id == dn.id
    ).all()
    for link in invoice_links:
        inv = link.document
        dn.invoices.append({
            "id": inv.id,
            "number": inv.number,
            "date": inv.date.isoformat() if inv.date else None,
            "status": inv.status.value if hasattr(inv.status, 'value') else str(inv.status),
            "doc_type": inv.doc_type,
            "total_amount": float(inv.total_amount),
            "currency": inv.currency
        })
    
    # 3. Poblar remitos relacionados (del mismo pedido)
    dn.related_delivery_notes = []
    if dn.sales_order_id:
        others = db.query(DeliveryNote).filter(
            DeliveryNote.sales_order_id == dn.sales_order_id,
            DeliveryNote.id != dn.id,
            DeliveryNote.status != DeliveryNoteStatus.CANCELLED
        ).all()
        for o in others:
            dn.related_delivery_notes.append({
                "id": o.id,
                "number": o.number,
                "date": o.date.isoformat() if o.date else None,
                "status": o.status.value if hasattr(o.status, 'value') else str(o.status)
            })

    # Asegurar compatibilidad...
    for line in dn.lines:
        if getattr(line, "description", None) is None:
            line.description = ""
    return dn


@router.get("/by-ov/{order_id}",
            response_model=List[dn_schemas.DeliveryNoteListResponse], dependencies=[Depends(check_permission("sales_delivery", "view"))])
def list_delivery_notes_by_ov(order_id: str, db: Session = Depends(get_db)):
    """Historial de remitos de una OV. Solo devuelve remitos con ítems vinculados."""
    return db.query(DeliveryNote).join(DeliveryNoteLine).join(SalesOrderLine).filter(
        SalesOrderLine.order_id == order_id
    ).distinct().order_by(DeliveryNote.date.desc()).all()


@router.get("/by-oc/{order_id}",
            response_model=List[dn_schemas.DeliveryNoteListResponse], dependencies=[Depends(check_permission("sales_delivery", "view"))])
def list_delivery_notes_by_oc(order_id: str, db: Session = Depends(get_db)):
    """Historial de remitos de una OC. Solo devuelve remitos con ítems vinculados."""
    return db.query(DeliveryNote).join(DeliveryNoteLine).join(PurchaseOrderLine).filter(
        PurchaseOrderLine.order_id == order_id
    ).distinct().order_by(DeliveryNote.date.desc()).all()


# ═══════════════════════════════════════════
# RETURN DELIVERY NOTE (Devolución)
# ═══════════════════════════════════════════
@router.post("/returns",
             response_model=dn_schemas.DeliveryNoteResponse, status_code=201, dependencies=[Depends(check_permission("sales_delivery", "create"))])
def create_return_delivery_note(
    data: dn_schemas.CreateReturnDeliveryNote,
    db: Session = Depends(get_db),
):
    # Validar remito original
    source_dn = db.query(DeliveryNote).filter(DeliveryNote.id == data.return_source_id).first()
    if not source_dn:
        raise HTTPException(status_code=404, detail="Remito original no encontrado")
    if source_dn.status != DeliveryNoteStatus.DISPATCHED:
        raise HTTPException(status_code=409, detail="Solo se pueden devolver remitos DISPATCHED")

    # Validar warehouse
    wh = db.query(Warehouse).filter(Warehouse.id == data.warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Depósito no encontrado")

    dn = DeliveryNote(
        entity_id=source_dn.entity_id,
        warehouse_id=data.warehouse_id,
        number=data.number,
        note_type=source_dn.note_type,
        delivery_type=DeliveryNoteType.RETURN,
        sales_order_id=source_dn.sales_order_id,
        purchase_order_id=source_dn.purchase_order_id,
        return_source_id=source_dn.id,
        origin_reference=source_dn.number,
        notes=data.notes,
        currency=source_dn.currency,
        exchange_rate=source_dn.exchange_rate,
        vehicle_id=data.vehicle_id,
        vehicle_driver=data.vehicle_driver,
        cost_center=data.cost_center or source_dn.cost_center
    )
    db.add(dn)
    db.flush()

    for i, line_data in enumerate(data.lines):
        # Validaciones de cantidad retenida...
        # Simplificación para el replace: asumimos OK o validación similar a antes
        # Re-implementar validación basica:
        
        calc = _calculate_line({
            "qty": line_data.qty,
            "unit_price": line_data.unit_price,
            "discount_pct": line_data.discount_pct,
            "vat_rate": line_data.vat_rate,
            "product_id": line_data.product_id
        }, db=db)
        db_line = DeliveryNoteLine(
            delivery_note_id=dn.id,
            description=(line_data.description if getattr(line_data, "description", None) is not None else ""),
            qty=calc["qty"],
            unit_price=calc["unit_price"],
            discount_pct=calc["discount_pct"],
            vat_rate=calc["vat_rate"],
            net_amount=calc["net_amount"],
            vat_amount=calc["vat_amount"],
            total_amount=calc["total_amount"],
            line_order=i,
            source_sales_line_id=line_data.source_sales_line_id,
        )
        db.add(db_line)

    db.commit()
    db.refresh(dn)
    _sanitize_delivery_note_for_response(dn)
    return dn


@router.post("/{dn_id}/confirm-return",
             response_model=dn_schemas.DeliveryNoteResponse, dependencies=[Depends(check_permission("sales_delivery", "edit"))])
def confirm_return_delivery_note(dn_id: str, db: Session = Depends(get_db)):
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
    if not dn:
        raise HTTPException(status_code=404, detail="Remito no encontrado")
    if dn.delivery_type != DeliveryNoteType.RETURN:
        raise HTTPException(status_code=409, detail="No es remito de devolución")
    if dn.status != DeliveryNoteStatus.DRAFT:
        raise HTTPException(status_code=409, detail="Solo DRAFT")

    # Aplicar impacto stock (unificado)
    _apply_stock_impact(db, dn)

    dn.status = DeliveryNoteStatus.DISPATCHED
    
    # Recalcular OV/OC
    _update_order_status(db, dn)

    db.commit()
    db.refresh(dn)
    _sanitize_delivery_note_for_response(dn)
    return dn


@router.put("/{dn_id}", response_model=dn_schemas.DeliveryNoteResponse, dependencies=[Depends(check_permission("sales_delivery", "edit"))])
def update_delivery_note(dn_id: str, data: dn_schemas.DeliveryNoteUpdate, db: Session = Depends(get_db)):
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
    if not dn:
        raise HTTPException(status_code=404, detail="Remito no encontrado")
    
    # Solo permitir editar si no está facturado
    if dn.status in [DeliveryNoteStatus.INVOICED, DeliveryNoteStatus.PARTIAL]:
         if db.query(InvoiceDeliveryNoteLink).filter(InvoiceDeliveryNoteLink.delivery_note_id == dn_id).first():
             raise HTTPException(status_code=409, detail="No se puede editar un remito facturado")

    update_data = data.model_dump(exclude_unset=True)
    lines_data = update_data.pop("lines", None)

    for key, value in update_data.items():
        setattr(dn, key, value)

    # Sincronizar condición y vencimiento a la OV vinculada
    if dn.sales_order_id and ("sale_condition_id" in update_data or "due_date" in update_data):
        ov = db.query(SalesOrder).filter(SalesOrder.id == dn.sales_order_id).first()
        if ov:
            if "sale_condition_id" in update_data:
                ov.sale_condition_id = update_data.get("sale_condition_id")
            if "due_date" in update_data:
                ov.due_date = update_data.get("due_date")
            db.flush()

    if lines_data is not None:
        # Si está vinculado a una OV, bloqueamos el cambio de cantidades/productos por integridad
        if dn.sales_order_id:
            # Validar que no haya cambios en qty ni product_id
            if len(lines_data) != len(dn.lines):
                 raise HTTPException(status_code=409, detail="No se pueden agregar o quitar ítems de un remito vinculado a una OV. Use el gestor de vínculos.")
            
            for i, line_data in enumerate(lines_data):
                old_line = dn.lines[i]
                new_qty = float(line_data.qty)
                old_qty = float(old_line.qty)
                
                # Tolerancia mínima para flotantes
                if abs(new_qty - old_qty) > 0.0001:
                    raise HTTPException(
                        status_code=409, 
                        detail=f"Línea {i+1}: No se puede modificar la cantidad de un remito vinculado. Use el gestor de vínculos de la OV."
                    )
                
                # Bloquear cambio de producto
                new_prod = str(line_data.product_id) if line_data.product_id else None
                old_prod = str(old_line.product_id) if old_line.product_id else None
                if new_prod != old_prod:
                    raise HTTPException(status_code=409, detail=f"Línea {i+1}: No se puede cambiar el producto de un remito vinculado.")

        if dn.status == DeliveryNoteStatus.DISPATCHED:
            # Revertir stock
            _reverse_stock_impact(db, dn)
            # Borrar líneas
            for old_line in dn.lines:
                db.delete(old_line)
            db.flush()
            # Crear nuevas y volver a aplicar stock out
            for i, l in enumerate(lines_data):
                l_dict = l.model_dump() if hasattr(l, "model_dump") else l
                calc = _calculate_line(l_dict, db=db)
                # Asegurar campos obligatorios esperados por el response schema
                desc = l.get("description") if isinstance(l, dict) else getattr(l, "description", None)
                if desc is None:
                    desc = ""
                prod = l.get("product_id") if isinstance(l, dict) else getattr(l, "product_id", None)
                src_sales = l.get("source_sales_line_id") if isinstance(l, dict) else getattr(l, "source_sales_line_id", None)
                src_purchase = l.get("source_purchase_line_id") if isinstance(l, dict) else getattr(l, "source_purchase_line_id", None)

                # Si no hay product_id pero hay source, intentar obtener snapshot del producto
                if not prod and src_sales:
                    ovl = db.query(SalesOrderLine).filter(SalesOrderLine.id == src_sales).first()
                    prod = ovl.product_id if ovl else None
                if not prod and src_purchase:
                    ocl = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == src_purchase).first()
                    prod = ocl.product_id if ocl else None

                db_line = DeliveryNoteLine(
                    delivery_note_id=dn.id,
                    description=desc,
                    product_id=prod,
                    qty=calc["qty"],
                    unit_price=calc["unit_price"],
                    discount_pct=calc["discount_pct"],
                    vat_rate=calc["vat_rate"],
                    net_amount=calc["net_amount"],
                    vat_amount=calc["vat_amount"],
                    total_amount=calc["total_amount"],
                    line_order=i,
                    source_sales_line_id=src_sales,
                    source_purchase_line_id=src_purchase,
                )
                db.add(db_line)
            db.flush()
            _apply_stock_impact(db, dn)
        else:
            # Borrar y crear
            for old_line in dn.lines:
                db.delete(old_line)
            db.flush()
            for i, l in enumerate(lines_data):
                l_dict = l.model_dump() if hasattr(l, "model_dump") else l
                calc = _calculate_line(l_dict, db=db)
                desc = l.get("description") if isinstance(l, dict) else getattr(l, "description", None)
                if desc is None:
                    desc = ""
                prod = l.get("product_id") if isinstance(l, dict) else getattr(l, "product_id", None)
                src_sales = l.get("source_sales_line_id") if isinstance(l, dict) else getattr(l, "source_sales_line_id", None)
                src_purchase = l.get("source_purchase_line_id") if isinstance(l, dict) else getattr(l, "source_purchase_line_id", None)

                if not prod and src_sales:
                    ovl = db.query(SalesOrderLine).filter(SalesOrderLine.id == src_sales).first()
                    prod = ovl.product_id if ovl else None
                if not prod and src_purchase:
                    ocl = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == src_purchase).first()
                    prod = ocl.product_id if ocl else None

                db_line = DeliveryNoteLine(
                    delivery_note_id=dn.id,
                    description=desc,
                    product_id=prod,
                    qty=calc["qty"],
                    unit_price=calc["unit_price"],
                    discount_pct=calc["discount_pct"],
                    vat_rate=calc["vat_rate"],
                    net_amount=calc["net_amount"],
                    vat_amount=calc["vat_amount"],
                    total_amount=calc["total_amount"],
                    line_order=i,
                    source_sales_line_id=src_sales,
                    source_purchase_line_id=src_purchase,
                )
                db.add(db_line)

    db.commit()
    db.refresh(dn)
    _sanitize_delivery_note_for_response(dn)
    return dn


@router.post("/{dn_id}/unlink", dependencies=[Depends(check_permission("sales_delivery", "edit"))])
def unlink_delivery_note(dn_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Desvincula un remito de su OV de origen.
    Si el remito está DISPATCHED, se debe recalcular el qty_delivered de la OV.
    El remito pasa a ser un remito 'Directo'.
    """
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
    if not dn:
        raise HTTPException(status_code=404, detail="Remito no encontrado")
    
    if not dn.sales_order_id:
        return {"msg": "El remito ya es directo."}

    order = db.query(SalesOrder).filter(SalesOrder.id == dn.sales_order_id).first()
    
    # 1. Si estaba despachado, revertir impacto en la Orden (qty_delivered / qty_received)
    # PERO NO REVERTIMOS STOCK FISICO, porque el remito sigue existiendo, solo se "separa" de la orden.
    if dn.status in [DeliveryNoteStatus.DISPATCHED, DeliveryNoteStatus.INVOICED, DeliveryNoteStatus.PARTIAL]:
        is_sale = dn.note_type == OrderType.SALE
        is_return = dn.delivery_type == DeliveryNoteType.RETURN
        
        for line in dn.lines:
            qty = Decimal(str(line.qty))
            if is_sale and line.source_sales_line_id:
                ov_line = db.query(SalesOrderLine).filter(SalesOrderLine.id == line.source_sales_line_id).first()
                if ov_line:
                    # Invertir el efecto: si el remito sumó a delivered, restamos. Si restó (return), sumamos.
                    ov_line.qty_delivered = Decimal(str(ov_line.qty_delivered or 0)) + (-qty if not is_return else qty)
                    ov_line.qty_delivered = max(Decimal(0), ov_line.qty_delivered)
            elif not is_sale and line.source_purchase_line_id:
                oc_line = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == line.source_purchase_line_id).first()
                if oc_line:
                    oc_line.qty_received = Decimal(str(oc_line.qty_received or 0)) + (-qty if not is_return else qty)
                    oc_line.qty_received = max(Decimal(0), oc_line.qty_received)
        
        db.flush()
        _update_order_status(db, dn)

    # 2. Romper vínculos
    dn.sales_order_id = None
    dn.purchase_order_id = None
    dn.origin_reference = "DESVINCULADO"
    for line in dn.lines:
        line.source_sales_line_id = None
        line.source_purchase_line_id = None
    
    _log_history(db, dn.id, "DESVINCULACION", "Remito desvinculado de su orden de origen", current_user=current_user)
    db.commit()
    return {"ok": True}

def _recalc_status(db: Session, dn_id: str):
    """
    Recalcula el estado del remito basándose en la cantidad facturada.
    """
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
    if not dn or dn.status == DeliveryNoteStatus.CANCELLED:
        return
    
    if dn.status == DeliveryNoteStatus.DRAFT:
        return

    all_invoiced = True
    any_invoiced = False
    TOLERANCE = Decimal("0.0001")

    for line in dn.lines:
        qty = Decimal(str(line.qty))
        inv = Decimal(str(line.qty_invoiced or 0))
        if inv < (qty - TOLERANCE):
            all_invoiced = False
        if inv > TOLERANCE:
            any_invoiced = True

    if all_invoiced:
        dn.status = DeliveryNoteStatus.INVOICED
    elif any_invoiced:
        dn.status = DeliveryNoteStatus.PARTIAL
    else:
        # Si no hay facturación, queda en DISPATCHED (siempre que ya no sea DRAFT)
        dn.status = DeliveryNoteStatus.DISPATCHED
    
    db.flush()

@router.post("/{dn_id}/manual-link-invoice", dependencies=[Depends(check_permission("sales_delivery", "edit"))])
def manual_link_invoice(
    dn_id: str,
    data: dn_schemas.ManualLinkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Vincula facturas existentes al Remito.
    """
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
    if not dn: raise HTTPException(404, "Remito no encontrado")

    for match in data.matches:
        # 'dn_line_id' en el match es un 'document_id' de factura
        doc = db.query(db_models.Document).filter(db_models.Document.id == match.dn_line_id).first()
        if not doc: continue

        # 1. Crear el vínculo en la tabla puente si no existe
        link = db.query(InvoiceDeliveryNoteLink).filter(
            InvoiceDeliveryNoteLink.document_id == doc.id,
            InvoiceDeliveryNoteLink.delivery_note_id == dn.id
        ).first()
        
        if not link:
            link = InvoiceDeliveryNoteLink(document_id=doc.id, delivery_note_id=dn.id)
            db.add(link)

        # 2. Intentar vincular líneas si coinciden productos para actualizar qty_invoiced
        # Esto es heurístico en manual link
        for l in dn.lines:
            if not l.product_id: continue
            # Buscar línea en factura con mismo producto
            from app.db.models.models import DocumentLine
            doc_line = db.query(DocumentLine).filter(
                DocumentLine.document_id == doc.id,
                DocumentLine.product_id == l.product_id
            ).first()
            
            if doc_line:
                # Si la línea de factura aún no tiene origen, se lo asignamos
                if not doc_line.source_dn_line_id:
                    doc_line.source_dn_line_id = l.id
                    l.qty_invoiced = Decimal(str(l.qty_invoiced or 0)) + Decimal(str(doc_line.qty))
        
        _log_history(db, dn.id, "VINCULO_FACTURA", f"Factura {doc.number} vinculada manualmente", current_user=current_user)

    db.commit()
    _recalc_status(db, dn.id)
    db.commit()
    return {"status": "ok", "message": "Vínculos de factura establecidos"}

@router.get("/{dn_id}/traceability", dependencies=[Depends(check_permission("sales_delivery", "view"))])
def get_delivery_note_traceability(dn_id: str, db: Session = Depends(get_db)):
    """
    Retorna el desglose financiero de un remito (facturas y pagos vinculados).
    """
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
    if not dn: raise HTTPException(404, "Remito no encontrado")

    # Invoices linked via InvoiceDeliveryNoteLink
    links = db.query(InvoiceDeliveryNoteLink).filter(InvoiceDeliveryNoteLink.delivery_note_id == dn_id).all()
    invoice_ids = [l.document_id for l in links]
    
    invoices = db.query(db_models.Document).filter(db_models.Document.id.in_(invoice_ids)).all() if invoice_ids else []
    
    # Calculate progress
    total_qty = sum(Decimal(str(l.qty)) for l in dn.lines)
    total_invoiced = sum(Decimal(str(l.qty_invoiced or 0)) for l in dn.lines)
    
    so = dn.sales_order
    if not so and dn.origin_reference:
        from app.db.models.commercial_models import SalesOrder
        clean_ref = dn.origin_reference.strip().replace("OV ", "").replace("OV-", "")
        so = db.query(SalesOrder).filter(SalesOrder.number.contains(clean_ref[-10:])).first()
    so_status = getattr(so, 'status', None)
    so_status_val = so_status.name if hasattr(so_status, 'name') else str(so_status) if so_status else ""
    so_upper = so_status_val.upper()

    invoice_progress = float((total_invoiced / total_qty * 100)) if total_qty > 0 else 0
    if dn.status == DeliveryNoteStatus.INVOICED: 
        invoice_progress = 100.0
    elif not invoices and so and any(k in so_upper for k in ["INVOICED", "COMPLETED", "FACTURADO_TOTAL", "FULLY_DELIVERED"]):
        invoice_progress = 100.0

    # Calculate payment progress based on linked invoices
    paid_amount_ars = 0.0
    total_invoiced_ars = 0.0
    
    for inv in invoices:
        total_invoiced_ars += float(inv.total_amount_ars or 0)
        # Check applications to this invoice
        apps = db.query(db_models.Application).filter(db_models.Application.to_document_id == inv.id).all()
        paid_amount_ars += sum(float(a.amount_applied_ars or 0) for a in apps)

    paid_progress = (paid_amount_ars / total_invoiced_ars * 100) if total_invoiced_ars > 0 else 0
    if dn.status == DeliveryNoteStatus.INVOICED and paid_progress > 98: 
        paid_progress = 100.0
    elif not invoices and so and any(k in so_upper for k in ["COMPLETED", "FACTURADO_TOTAL", "FULLY_DELIVERED"]):
        paid_progress = 100.0

    return {
        "success": True,
        "delivery_note_id": dn_id,
        "status": dn.status,
        "invoice_progress": min(100, invoice_progress),
        "paid_progress": min(100, paid_progress),
        "invoices": [
            {
                "id": inv.id,
                "number": inv.number,
                "date": inv.date,
                "total_amount": float(inv.total_amount),
                "total_amount_ars": float(inv.total_amount_ars),
                "currency": inv.currency,
                "status": inv.status,
                "paid_amount_ars": sum(float(a.amount_applied_ars or 0) for a in db.query(db_models.Application).filter(db_models.Application.to_document_id == inv.id).all())
            } for inv in invoices
        ]
    }


@router.post("/{dn_id}/link/{order_id}", dependencies=[Depends(check_permission("sales_delivery", "edit"))])
def link_delivery_note_to_ov(dn_id: str, order_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Vincula un remito 'Directo' a una OV existente.
    Intenta matchear líneas por producto y actualizar qty_delivered.
    """
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
    if not dn: raise HTTPException(status_code=404, detail="Remito no encontrado")
    
    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order: raise HTTPException(status_code=404, detail="Orden de Venta no encontrada")

    if dn.sales_order_id:
        raise HTTPException(status_code=400, detail="El remito ya está vinculado a otra orden.")

    dn.sales_order_id = order.id
    dn.origin_reference = order.number
    
    # Intentar matchear líneas
    matched_any = False
    for line in dn.lines:
        # Buscar una línea en la OV que tenga el mismo producto y tenga saldo
        ov_line = db.query(SalesOrderLine).filter(
            SalesOrderLine.order_id == order.id,
            SalesOrderLine.product_id == line.product_id
        ).first()
        
        if ov_line:
            line.source_sales_line_id = ov_line.id
            matched_any = True
            if dn.status in [DeliveryNoteStatus.DISPATCHED, DeliveryNoteStatus.INVOICED, DeliveryNoteStatus.PARTIAL]:
                qty = Decimal(str(line.qty))
                ov_line.qty_delivered = Decimal(str(ov_line.qty_delivered or 0)) + qty
    
    if dn.status in [DeliveryNoteStatus.DISPATCHED, DeliveryNoteStatus.INVOICED, DeliveryNoteStatus.PARTIAL]:
        db.flush()
        _update_order_status(db, dn)

    _log_history(db, dn.id, "VINCULACION", f"Remito vinculado a OV {order.number}", current_user=current_user)
    db.commit()
    
    # Limpiar si no hubo matches reales
    _check_and_cleanup_dn_header_link(db, dn.id)
    db.commit()

    return {"ok": True, "matched": matched_any}

@router.post("/{dn_id}/link-manual/{order_id}", dependencies=[Depends(check_permission("sales_delivery", "edit"))])
def link_delivery_note_manual(dn_id: str, order_id: str, data: dn_schemas.ManualLinkRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Vincula un remito 'Directo' a una OV existente de forma manual (match de líneas).
    """
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
    if not dn: raise HTTPException(status_code=404, detail="Remito no encontrado")
    
    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order: raise HTTPException(status_code=404, detail="Orden de Venta no encontrada")

    if dn.sales_order_id:
        raise HTTPException(status_code=400, detail="El remito ya está vinculado a otra orden.")

    dn.sales_order_id = order.id
    dn.origin_reference = order.number
    
    for match in data.matches:
        dn_line = next((l for l in dn.lines if l.id == match.dn_line_id), None)
        ov_line = db.query(SalesOrderLine).filter(SalesOrderLine.id == match.ov_line_id).first()
        
        if dn_line and ov_line:
            dn_line.source_sales_line_id = ov_line.id
            # Si el remito ya estaba confirmado, impactar en la OV ahora
            if dn.status in [DeliveryNoteStatus.DISPATCHED, DeliveryNoteStatus.INVOICED, DeliveryNoteStatus.PARTIAL]:
                qty = Decimal(str(match.qty))
                ov_line.qty_delivered = Decimal(str(ov_line.qty_delivered or 0)) + qty
    
    if dn.status in [DeliveryNoteStatus.DISPATCHED, DeliveryNoteStatus.INVOICED, DeliveryNoteStatus.PARTIAL]:
        db.flush()
        _update_order_status(db, dn)

    _log_history(db, dn.id, "VINCULACION", f"Vinculación manual a OV {order.number}", current_user=current_user)
    db.commit()

    # Limpiar si no hubo matches reales
    _check_and_cleanup_dn_header_link(db, dn.id)
    db.commit()

    return {"ok": True}


@router.post("/unlink-all/ov/{order_id}", dependencies=[Depends(check_permission("sales_delivery", "edit"))])
def unlink_all_delivery_notes_from_ov(order_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Desvincula TODOS los remitos de una Orden de Venta.
    """
    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order: raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    dns = db.query(DeliveryNote).filter(DeliveryNote.sales_order_id == order_id).all()
    count = 0
    for dn in dns:
        # Reutilizamos la lógica del endpoint individual (sin el commit intermedio)
        if dn.status in [DeliveryNoteStatus.DISPATCHED, DeliveryNoteStatus.INVOICED, DeliveryNoteStatus.PARTIAL]:
            is_sale = dn.note_type == OrderType.SALE
            is_return = dn.delivery_type == DeliveryNoteType.RETURN
            for line in dn.lines:
                qty = Decimal(str(line.qty))
                if is_sale and line.source_sales_line_id:
                    ov_line = db.query(SalesOrderLine).filter(SalesOrderLine.id == line.source_sales_line_id).first()
                    if ov_line:
                        ov_line.qty_delivered = Decimal(str(ov_line.qty_delivered or 0)) + (-qty if not is_return else qty)
                        ov_line.qty_delivered = max(Decimal(0), ov_line.qty_delivered)
            
            db.flush()
            _update_order_status(db, dn)

        dn.sales_order_id = None
        dn.origin_reference = "DESVINCULADO MASIVAMENTE"
        for l in dn.lines:
            l.source_sales_line_id = None
        
        _log_history(db, dn.id, "DESVINCULACION", f"Desvinculación masiva de OV {order.number}", current_user=current_user)
        count += 1
    
    db.commit()
    return {"ok": True, "count": count}


@router.post("/unlink-line/{ov_line_id}", dependencies=[Depends(check_permission("sales_delivery", "edit"))])
def unlink_ov_line(ov_line_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Desvincula un ítem específico de la orden de todos los remitos que lo cargaron.
    Esto hace que el ítem vuelva a figurar como PENDIENTE en la orden.
    """
    ov_line = db.query(SalesOrderLine).filter(SalesOrderLine.id == ov_line_id).first()
    if not ov_line: raise HTTPException(status_code=404, detail="Ítem de orden no encontrado")

    # Buscar todas las líneas de remitos vinculadas
    dn_lines = db.query(DeliveryNoteLine).filter(DeliveryNoteLine.source_sales_line_id == ov_line_id).all()
    count = 0
    dn_ids = set()
    
    for l in dn_lines:
        dn = l.delivery_note
        if not dn: continue
        
        # Revertir contadores si el remito está confirmado
        if dn.status in [DeliveryNoteStatus.DISPATCHED, DeliveryNoteStatus.INVOICED, DeliveryNoteStatus.PARTIAL]:
            qty = Decimal(str(l.qty))
            is_return = dn.delivery_type == DeliveryNoteType.RETURN
            ov_line.qty_delivered = Decimal(str(ov_line.qty_delivered or 0)) + (-qty if not is_return else qty)
            ov_line.qty_delivered = max(Decimal(0), ov_line.qty_delivered)
            dn_ids.add(dn.id)
        
        l.source_sales_line_id = None
        count += 1

    db.flush()
    # Recalcular estado de las órdenes involucradas
    for dn_id in dn_ids:
        dn = db.query(DeliveryNote).get(dn_id)
        if dn: 
            _update_order_status(db, dn)
            _check_and_cleanup_dn_header_link(db, dn.id)

    db.commit()
    return {"ok": True, "unlinked_lines": count}


@router.delete("/{dn_id}", dependencies=[Depends(check_permission("sales_delivery", "delete"))])
def delete_delivery_note(dn_id: str, db: Session = Depends(get_db)):
    """Solo permite borrar remitos DRAFT."""
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
    if not dn: raise HTTPException(status_code=404, detail="Remito no encontrado")
    
    if dn.status != DeliveryNoteStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Solo se pueden eliminar remitos en estado DRAFT. Si está confirmado, anúlelo.")

    # Borrar líneas primero (aunque cascade debería manejarlo, mejor ser explícito si hay dudas)
    for l in dn.lines:
        db.delete(l)
    
    # Borrar el remito
    db.delete(dn)
    db.commit()
    return {"ok": True}


@router.post("/{dn_id}/create-invoice", response_model=document_schemas.DocumentResponse, dependencies=[Depends(check_permission("sales_invoices", "create"))])
def create_invoice_from_delivery_note(
    dn_id: str,
    number: Optional[str] = None,
    pv: Optional[str] = None,
    doc_type: str = "FA",
    db: Session = Depends(get_db),
):
    """Genera una factura (Document) a partir de todas las líneas del remito.
    - `doc_type` por defecto 'FA' (Factura A). Para Factura B usar 'FB'.
    - Si `number` no se envía, se genera con `numbering_service.get_next_number` usando `pv` o '0001'.
    """
    try:
        dn = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
        if not dn:
            raise HTTPException(status_code=404, detail="Remito no encontrado")

        # Preparar líneas de la factura tomando snapshot de las líneas del remito
        doc_lines = []
        total_amount = 0.0
        
        # Validation: Check if DN is already fully invoiced
        if dn.status == DeliveryNoteStatus.INVOICED:
            raise HTTPException(status_code=409, detail="El remito ya se encuentra facturado totalmente")

        for l in dn.lines:
            # Skip lines already invoiced (or warn if the whole DN is requested)
            pending_qty = Decimal(str(l.qty)) - Decimal(str(l.qty_invoiced or 0))
            if pending_qty <= 0:
                continue

            # Ensure we only invoice what is pending
            qty = float(pending_qty)
            unit_price = float(l.unit_price or 0.0)
            net_amount = float(l.net_amount or 0.0)
            vat_rate = float(l.vat_rate or 0.0)
            vat_amount = float(l.vat_amount or 0.0)
            total = float(l.total_amount or (net_amount + vat_amount))
            total_amount += total

            doc_lines.append(document_schemas.DocumentLineCreate(
                description=desc,
                product_id=l.product_id,
                qty=qty,
                unit_price=unit_price,
                discount_pct=float(l.discount_pct or 0.0),
                net_amount=net_amount,
                vat_rate=vat_rate,
                vat_amount=vat_amount,
                total_amount=total,
                line_order=getattr(l, "line_order", 0),
                source_dn_line_id=l.id,
            ))

        # Número de factura y Punto de Venta
        pv_code = pv or (dn.number.split("-")[0] if dn.number and "-" in dn.number else "0001")
        invoice_number = number or numbering_service.get_next_number(db, pv_code, doc_type)

        # Mapeo de doc_type string ("FA", "FB", etc) a Enum + Linea (A, B)
        # Esto es crucial para que el listado muestre el tipo correcto y el numbering funcione en la próxima
        line_code = "A"
        is_purchase = dn.note_type == OrderType.PURCHASE
        
        if doc_type == "FA":
            enum_type = db_models.DocumentType.PURCHASE_INVOICE if is_purchase else db_models.DocumentType.INVOICE
            line_code = "A"
        elif doc_type == "FB":
            enum_type = db_models.DocumentType.PURCHASE_INVOICE if is_purchase else db_models.DocumentType.INVOICE
            line_code = "B"
        elif doc_type == "NCA":
            enum_type = db_models.DocumentType.PURCHASE_CREDIT_NOTE if is_purchase else db_models.DocumentType.CREDIT_NOTE
            line_code = "A"
        elif doc_type == "NCB":
            enum_type = db_models.DocumentType.PURCHASE_CREDIT_NOTE if is_purchase else db_models.DocumentType.CREDIT_NOTE
            line_code = "B"
        elif doc_type == "NDA":
            enum_type = db_models.DocumentType.PURCHASE_DEBIT_NOTE if is_purchase else db_models.DocumentType.DEBIT_NOTE
            line_code = "A"
        elif doc_type == "NDB":
            enum_type = db_models.DocumentType.PURCHASE_DEBIT_NOTE if is_purchase else db_models.DocumentType.DEBIT_NOTE
            line_code = "B"
        else:
            # Fallback
            enum_type = db_models.DocumentType.PURCHASE_INVOICE if is_purchase else db_models.DocumentType.INVOICE
            line_code = "A"

        doc_create = document_schemas.DocumentCreate(
            doc_type=enum_type,
            line=line_code,
            number=invoice_number,
            date=datetime.now(), # Las facturas suelen tener fecha de hoy, no del remito viejo
            currency=dn.currency or db_models.CurrencyType.ARS,
            exchange_rate=dn.exchange_rate or 1.0,
            total_amount=total_amount,
            entity_id=dn.entity_id,
            lines=doc_lines,
            sale_condition_id=dn.sale_condition_id,
        )

        # Reutilizamos la función existente para crear documentos
        created = create_doc_func(doc_create, db)

        # Incrementar numeración en config si usamos numeración automática
        if not number:
            numbering_service.increment_last_number(db, pv_code, doc_type)
        
        db.commit() # Asegurar que el incremento se persiste
        return created
    except Exception as e:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error al crear factura: {str(e)}")
@router.get("/entity/{entity_id}/pending-invoice", response_model=List[dn_schemas.DeliveryNoteResponse], dependencies=[Depends(check_permission("sales_delivery", "view"))])
def get_pending_invoice_delivery_notes(entity_id: str, db: Session = Depends(get_db)):
    """Busca remitos CONFIRMADOS (DISPATCHED) de una entidad que no estén facturados totalmente."""
    dns = db.query(DeliveryNote).filter(
        DeliveryNote.entity_id == entity_id,
        DeliveryNote.status == DeliveryNoteStatus.DISPATCHED,
        DeliveryNote.note_type == OrderType.SALE
    ).all()
    return dns

@router.post("/create-invoice-bulk", response_model=document_schemas.DocumentResponse, dependencies=[Depends(check_permission("sales_invoices", "create"))])
def create_invoice_from_multiple_delivery_notes(
    data: dn_schemas.MultiDeliveryNoteInvoiceCreate,
    db: Session = Depends(get_db),
):
    """Genera una sola factura consolidando varios remitos."""
    try:
        dns = db.query(DeliveryNote).filter(DeliveryNote.id.in_(data.delivery_note_ids)).all()
        if not dns:
            raise HTTPException(status_code=404, detail="No se encontraron los remitos seleccionados")
        
        # Validar misma entidad
        entity_id = dns[0].entity_id
        if any(dn.entity_id != entity_id for dn in dns):
            raise HTTPException(status_code=400, detail="Todos los remitos deben pertenecer al mismo Cliente/Entidad")

        total_amount = Decimal("0")
        doc_lines = []
        
        for dn in dns:
            for l in dn.lines:
                # Solo facturar lo que no se facturó
                pending_qty = Decimal(str(l.qty)) - Decimal(str(l.qty_invoiced))
                if pending_qty <= 0:
                    continue
                
                qty = float(pending_qty)
                up = float(l.unit_price or 0.0)
                disc = float(l.discount_pct or 0.0)
                net = (Decimal(str(qty)) * Decimal(str(up)) * (1 - Decimal(str(disc)) / 100)).quantize(Decimal("0.01"))
                vat_rate = float(l.vat_rate or 0.0)
                vat = (net * Decimal(str(vat_rate))).quantize(Decimal("0.01"))
                total = net + vat
                
                total_amount += total
                
                doc_lines.append(document_schemas.DocumentLineCreate(
                    description=l.description or "",
                    product_id=l.product_id,
                    qty=qty,
                    unit_price=up,
                    discount_pct=disc,
                    net_amount=float(net),
                    vat_rate=vat_rate,
                    vat_amount=float(vat),
                    total_amount=float(total),
                    source_dn_line_id=l.id
                ))
                
                # Update line
                l.qty_invoiced = float(Decimal(str(l.qty_invoiced)) + pending_qty)
            
            # Update DN status
            dn.status = DeliveryNoteStatus.INVOICED
            _log_history(db, dn.id, "FACTURACION", f"Facturado por consolidación masiva", current_user=None)

        if not doc_lines:
            raise HTTPException(status_code=400, detail="No hay ítems pendientes de facturación en los remitos seleccionados")

        # Configuración básica de la factura
        dn_ref = dns[0] # Usar TC y moneda del primero como base
        pv_code = data.pv or (dn_ref.number.split("-")[0] if dn_ref.number and "-" in dn_ref.number else "0001")
        invoice_number = data.number or numbering_service.get_next_number(db, pv_code, data.doc_type)

        # Mapeo a Enum DocumentType (simplificado, se puede extender)
        enum_type = db_models.DocumentType.INVOICE
        line_code = "A"
        if data.doc_type == "FB": line_code = "B"

        doc_create = document_schemas.DocumentCreate(
            doc_type=enum_type,
            line=line_code,
            number=invoice_number,
            date=data.date or datetime.now(),
            currency=dn_ref.currency or db_models.CurrencyType.ARS,
            exchange_rate=float(dn_ref.exchange_rate or 1.0),
            total_amount=float(total_amount),
            entity_id=entity_id,
            lines=doc_lines,
            sale_condition_id=dn_ref.sale_condition_id,
        )

        # Crear Documento
        created = create_doc_func(doc_create, db)

        # Vincular
        for dn in dns:
            link = InvoiceDeliveryNoteLink(document_id=created.id, delivery_note_id=dn.id)
            db.add(link)

        # Incrementar numbering
        if not data.number:
            numbering_service.increment_last_number(db, pv_code, data.doc_type)

        db.commit()
        return created

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error en facturación masiva: {str(e)}")

@router.post("/{dn_id}/email", dependencies=[Depends(check_permission("sales_delivery", "view"))])
def send_delivery_note_email(dn_id: str, payload: EmailPayload, db: Session = Depends(get_db)):
    dn = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
    if not dn:
        raise HTTPException(status_code=404, detail="Remito no encontrado")
    
    pdf_output = export_document_to_pdf(dn, db=db)
    filename = f"Remito_{dn.number}.pdf"
    
    subject = payload.subject or f"Remito {dn.number} - Quintal Agross"
    body = payload.body or f"""
    <p>Estimado/a,</p>
    <p>Adjuntamos el Remito <b>{dn.number}</b> correspondientes a su cuenta.</p>
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
@router.post("/adjust-link")
def adjust_link(req: LinkAdjustmentRequest, db: Session = Depends(get_db)):
    # 1. Buscar línea de remito
    dn_line = db.query(DeliveryNoteLine).filter(DeliveryNoteLine.id == req.line_id).first()
    if not dn_line:
        raise HTTPException(status_code=404, detail="Línea de remito no encontrada")
    
    # 2. Buscar línea de OV
    ov_line = db.query(SalesOrderLine).filter(SalesOrderLine.id == req.source_sales_line_id).first()
    if not ov_line:
        dn_line.source_sales_line_id = None
        db.commit()
        return {"status": "unlinked_orphan"}

    old_qty = Decimal(str(dn_line.qty))
    new_qty = Decimal(str(req.new_qty))
    
    if new_qty == old_qty:
        return {"status": "no_change"}

    # 3. Lógica de "Descruzar" preservando el remito
    if new_qty <= 0:
        # Descruzar TODO: El remito mantiene su cantidad original, pero ya no suma a la OV
        dn_line.source_sales_line_id = None
        ov_line.qty_delivered = Decimal(str(ov_line.qty_delivered)) - old_qty
        _log_history(db, dn_line.delivery_note_id, "DESVINCULACION", f"Línea {dn_line.description} desvinculada de OV")
    
    elif new_qty < old_qty:
        # Descruzar PARCIAL: Dividimos la línea en dos
        # Línea A (Nueva, sin vínculo): La parte que se "descruza"
        remainder_qty = old_qty - new_qty
        
        from app.db.models.commercial_models import DeliveryNoteLine as DNLineModel
        new_unlinked_line = DNLineModel(
            delivery_note_id=dn_line.delivery_note_id,
            product_id=dn_line.product_id,
            description=dn_line.description,
            qty=remainder_qty,
            unit_price=dn_line.unit_price,
            discount_pct=dn_line.discount_pct,
            vat_rate=dn_line.vat_rate,
            net_amount=(dn_line.net_amount / old_qty) * remainder_qty,
            vat_amount=(dn_line.vat_amount / old_qty) * remainder_qty,
            total_amount=(dn_line.total_amount / old_qty) * remainder_qty,
            line_order=dn_line.line_order + 1,
            source_sales_line_id=None,
            unit_cost=dn_line.unit_cost,
            total_cost=(dn_line.unit_cost or 0) * remainder_qty
        )
        db.add(new_unlinked_line)
        
        # Línea B (Original, vinculada): La parte que queda "cruzada"
        dn_line.qty = new_qty
        dn_line.net_amount = (dn_line.net_amount / old_qty) * new_qty
        dn_line.vat_amount = (dn_line.vat_amount / old_qty) * new_qty
        dn_line.total_amount = (dn_line.total_amount / old_qty) * new_qty
        dn_line.total_cost = (dn_line.unit_cost or 0) * new_qty
        
        # Actualizar OV
        ov_line.qty_delivered = Decimal(str(ov_line.qty_delivered)) - remainder_qty
        _log_history(db, dn_line.delivery_note_id, "VINCULO_AJUSTADO", f"Vínculo de {dn_line.description} ajustado de {old_qty} a {new_qty}")
    
    else:
        # new_qty > old_qty No permitido en este modal por seguridad
        raise HTTPException(status_code=400, detail="No se puede aumentar la cantidad desde el gestor de vínculos")
    
    db.commit()
    
    # Limpiar cabecera si no quedan vínculos
    _check_and_cleanup_dn_header_link(db, dn_line.delivery_note_id)

    # Recalcular estados de OV
    from app.modules.sales.sales_order_router import _recalc_status
    _recalc_status(db, ov_line.order_id)
    db.commit()
    
    return {"status": "ok"}
