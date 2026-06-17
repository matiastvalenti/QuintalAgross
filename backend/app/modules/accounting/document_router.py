from fastapi import APIRouter, Depends, HTTPException, Response
from datetime import datetime, timedelta
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, case, or_
from typing import List, Optional
from app.db.session import get_db
from app.db import models, grain_models
from app.modules.accounting import document_schemas
from app.modules.accounting.ledger_engine import create_journal_entry_for_document
from app.modules.accounting.fx_service import generate_fx_adjustment
import uuid
from app.db.models.commercial_models import (
    Account, generate_uuid, DeliveryNote, DeliveryNoteStatus, 
    DeliveryNoteLine, InvoiceDeliveryNoteLink, Product, Container,
    SalesOrder, SalesOrderLine, PurchaseOrder, PurchaseOrderLine
)
from app.db.models.models import Document, DocumentHistory, CurrencyType, DocumentStatus, DocumentType, Application, DocumentLine, Entity, User, CommissionPayment
from app.modules.auth.auth_router import get_current_user, check_permission
from app.modules.finance.pdf_export import export_document_to_pdf
from app.modules.finance.mailer import send_email
from pydantic import BaseModel
import logging
import traceback

logger = logging.getLogger(__name__)

class EmailPayload(BaseModel):
    to_email: str
    subject: Optional[str] = None
    body: Optional[str] = None

class LinkAdjustmentRequest(BaseModel):
    line_id: str
    new_qty: float
    source_sales_line_id: str

class BulkInvoiceRequest(BaseModel):
    delivery_note_ids: List[str]
    doc_type: Optional[DocumentType] = DocumentType.INVOICE
    letter: Optional[str] = "A"
    pv: Optional[str] = "0003"
    date: Optional[datetime] = None
    currency: Optional[CurrencyType] = CurrencyType.ARS
    exchange_rate: Optional[float] = 1000.0
    notes: Optional[str] = None
    vendedor: Optional[str] = None
    salesperson_id: Optional[str] = None

class BulkEmailRequest(BaseModel):
    document_ids: List[str]
    subject: Optional[str] = None
    body: Optional[str] = None

router = APIRouter(prefix="/documents", tags=["documents"])

def _log_history(db: Session, doc_id: str, action: str, details: Optional[str] = None, current_user: Optional[User] = None):
    """Registra una entrada en el historial del documento."""
    username = "Sistema"
    if current_user:
        if hasattr(current_user, 'username'):
            username = current_user.username
        elif hasattr(current_user, 'name'):
            username = current_user.name
        else:
            username = str(current_user)

    history = DocumentHistory(
        document_id=doc_id,
        user=username,
        action=action,
        details=details
    )
    db.add(history)
    
def _recalc_document_commission(doc: Document, db: Session):
    """
    Recalcula la comisión del documento:
    1. El monto total a pagar (Accrual) basado en el perfil del vendedor.
    2. El monto ya pagado (Payment status) basado en los registros de CommissionPayment.
    """
    if not doc:
        return
        
    # 1. Calcular Monto a Pagar (Accrual)
    # Solo recalcular automáticamente si el monto es exactamente 0 (asume intervención manual si es > 0)
    sp = None
    if doc.salesperson_id:
        sp = db.query(Entity).filter(Entity.id == doc.salesperson_id).first()
    elif getattr(doc, 'vendedor', None) and doc.vendedor.strip():
        # Soporte para vendedores por nombre (Virtuales)
        name_norm = doc.vendedor.strip().lower()
        sp = db.query(Entity).filter(
            func.trim(func.lower(Entity.name)) == name_norm,
            Entity.is_salesperson == True
        ).first()

    if sp:
        pct_val = float(sp.commission_pct or 0.0)
            
        if sp.commission_type == 'fixed':
            total_net = sum(float(l.net_amount or 0) for l in doc.lines)
            doc.commission_amount = round(float(total_net) * (pct_val / 100.0), 2)
        elif sp.commission_type == 'markup':
            total_markup = 0.0
            for l in doc.lines:
                cost = float(l.unit_cost or 0)
                if cost == 0 and l.product_id:
                    p = db.query(Product).filter(Product.id == l.product_id).first()
                    if p: cost = float(p.cost_price or 0)
                total_markup += float(l.net_amount or 0) - (cost * float(l.qty or 0))
            doc.commission_amount = round(total_markup * (pct_val / 100.0), 2)
        else:
            # Lógica por defecto: margen basado en diferencia o neto total
            total_net = sum(float(l.net_amount or 0) for l in doc.lines)
            total_cost = sum(float(l.total_cost or 0) for l in doc.lines)
            doc.commission_amount = round((total_net - total_cost) * (pct_val / 100.0), 2)
    else:
        doc.commission_amount = 0.0

    # 2. Calcular Monto Pagado (status)
    # Sumar comisiones liquidadas para esta factura/remito/OV
    # (Usamos amount_usd como moneda base para el control de pago)
    total_paid = db.query(func.sum(CommissionPayment.amount_usd)).filter(
        or_(
            CommissionPayment.document_id == doc.id,
            CommissionPayment.delivery_note_id == doc.id 
        )
    ).scalar() or 0.0
    
    doc.commission_paid_amount = float(total_paid)
    
    # Marcamos como paga si el total pagado iguala o supera el monto a pagar (con margen)
    if (doc.commission_amount or 0) > 0:
        doc.commission_paid = float(total_paid) >= (float(doc.commission_amount) - 0.01)
    else:
        doc.commission_paid = False
    
    db.flush()


def _sanitize_document_for_response(doc: models.Document, db: Session):
    """
    Inyecta datos adicionales necesarios para el frontend en el objeto Document
    (ej: remitos vinculados, órdenes de venta, etc.) para que pydantic los serialice.
    """
    # 1. Remitos Vinculados
    links = db.query(InvoiceDeliveryNoteLink).filter(InvoiceDeliveryNoteLink.document_id == doc.id).all()
    doc.delivery_notes = []
    seen_ov = set()
    doc.sales_orders = []
    
    for lnk in links:
        dn = lnk.delivery_note
        if dn:
            doc.delivery_notes.append({
                "id": dn.id,
                "number": dn.number,
                "date": dn.date
            })
            # 2. Órdenes de Venta Vinculadas (via remitos)
            if dn.sales_order_id and dn.sales_order_id not in seen_ov:
                so = dn.sales_order
                if so:
                    doc.sales_orders.append({
                        "id": so.id,
                        "number": so.number,
                        "date": so.date
                    })
                    seen_ov.add(so.id)
    return doc


def _recalc_document_status(doc: models.Document, db: Session):
    """
    Recalcula el estado de un documento basándose en sus aplicaciones (financieras)
    y, si es un Pago/Recibo, también en sus pagos de comisiones asociados.
    Asegura consistencia de monedas al comparar usage vs total_amount.
    """
    if not doc or doc.status == DocumentStatus.CANCELLED:
        return

    usage = 0.0
    credit_types = [
        DocumentType.RECEIPT, 
        DocumentType.PAYMENT, 
        DocumentType.CREDIT_NOTE, 
        DocumentType.PURCHASE_CREDIT_NOTE
    ]
    
    is_usd = str(doc.currency) in ("USD", "CurrencyType.USD")
    
    if doc.doc_type in credit_types:
        # Documentos que "entregan" saldo (Recibo, Pago, NC)
        # Queremos saber cuánto de este comprobante se usó, en su propia moneda.
        if is_usd:
            # Sumar aplicaciones convertidas a USD (amount_applied_ars / exchange_rate)
            # Usamos el exchange_rate de cada aplicación para la reversión exacta.
            total_applied_fin = db.query(func.sum(Application.amount_applied_ars / func.nullif(Application.exchange_rate, 0))).filter(
                Application.from_document_id == doc.id
            ).scalar() or 0.0
            
            # Sumar comisiones en USD
            total_comm = db.query(func.sum(CommissionPayment.amount_usd)).filter(
                CommissionPayment.source_document_id == doc.id
            ).scalar() or 0.0
            
            usage = float(total_applied_fin) + float(total_comm)
        else:
            # Sumar aplicaciones en ARS (amount_applied_ars)
            total_applied_fin = db.query(func.sum(Application.amount_applied_ars)).filter(
                Application.from_document_id == doc.id
            ).scalar() or 0.0
            
            # Sumar comisiones en ARS
            total_comm = db.query(func.sum(CommissionPayment.amount_ars)).filter(
                CommissionPayment.source_document_id == doc.id
            ).scalar() or 0.0
            
            usage = float(total_applied_fin) + float(total_comm)
    else:
        # Documentos que "reciben" saldo (Factura, ND, Factura Compra)
        # amount_applied siempre se guarda en la moneda del to_document_id
        # por lo que podemos sumarlo directamente.
        total_received_fin = db.query(func.sum(Application.amount_applied)).filter(
            Application.to_document_id == doc.id
        ).scalar() or 0.0
        usage = float(total_received_fin)
    
    total_amount = float(doc.total_amount or 0)
    
    # Tolerancia para redondeos
    TOLERANCE = 0.015 if is_usd else 0.5 # 1.5 centavos USD o 50 centavos ARS
    
    if usage >= (total_amount - TOLERANCE):
        doc.status = DocumentStatus.CLOSED
    elif usage > TOLERANCE:
        doc.status = DocumentStatus.PARTIAL
    else:
        doc.status = DocumentStatus.OPEN

def _sanitize_document_for_response(doc, db: Session = None):
    """Asegura que campos requeridos no sean nulos para el schema de respuesta."""
    if not doc: return
    # Campos cabecera
    if getattr(doc, "total_amount_ars", None) is None: doc.total_amount_ars = 0.0
    if getattr(doc, "total_amount", None) is None: doc.total_amount = 0.0
    if getattr(doc, "exchange_rate", None) is None: doc.exchange_rate = 1.0
    
    # Inyectar info de entidad
    if getattr(doc, "entity", None):
        # entity_name es una property en el modelo, no se puede setear
        doc.entity_tax_id = doc.entity.tax_id
        doc.entity_code = doc.entity.code

    # Traceabilidad para aplicaciones (especialmente para recibos)
    from sqlalchemy.orm import object_session
    for app in getattr(doc, "applied_to", []):
        if getattr(app, "to_document", None):
            app.to_document_number = app.to_document.number
            app.to_document_date = app.to_document.date
            app.to_document_total = app.to_document.total_amount
            app.to_document_currency = app.to_document.currency
            # Calcular cuánto se aplicó ya a esa factura (incluyendo otros recibos)
            use_db = db or object_session(app)
            if use_db:
                from sqlalchemy import func as sa_func
                total_applied = use_db.query(sa_func.sum(models.Application.amount_applied)).filter(
                    models.Application.to_document_id == app.to_document_id
                ).scalar() or 0.0
                app.to_document_applied = total_applied

    for line in getattr(doc, "lines", []):
        if getattr(line, "description", None) is None: line.description = ""
        if getattr(line, "net_amount", None) is None: line.net_amount = 0.0
        if getattr(line, "vat_amount", None) is None: line.vat_amount = 0.0
        if getattr(line, "total_amount", None) is None: line.total_amount = 0.0
        if getattr(line, "vat_rate", None) is None: line.vat_rate = 0.21
        
        # Inyectar info de producto para equivalencias (ahora gestionado por Pydantic via joinedload)
        if getattr(line, "product", None):
             # Ensure Pydantic sees it. If validation_alias is product_info, 
             # we can just leave it to default to the field name 'product' 
             # since it's already an attribute of line.
             pass
        # No need for manual product_info injection as the schema is updated

    if hasattr(doc, "lines") and getattr(doc, "lines", []):
        use_db = db or object_session(doc)
        if use_db:
            from sqlalchemy.orm import joinedload
            from app.db.models.commercial_models import (
                SalesOrder, SalesOrderLine, OrderStatus, DeliveryNote, 
                DeliveryNoteLine, DeliveryNoteStatus, SalesOrderHistory,
                PurchaseOrder, PurchaseOrderLine, InvoiceDeliveryNoteLink
            )
            from app.modules.sales.sales_utils import recalc_sales_order_status, recalc_purchase_order_status
            so_lines = [l.source_sales_line_id for l in doc.lines if getattr(l, "source_sales_line_id", None)]
            
            doc.sales_orders = []
            doc.delivery_notes = []
            
            if so_lines:
                sales_orders = use_db.query(SalesOrder).join(SalesOrderLine).filter(SalesOrderLine.id.in_(so_lines)).distinct().all()
                doc.sales_orders = [{"id": so.id, "number": so.number, "date": so.date.isoformat() if so.date else None, "status": so.status} for so in sales_orders]
            
            # 1. Por vínculos a nivel ítem (si existen)
            dn_item_ids = [l.source_dn_line_id for l in doc.lines if getattr(l, "source_dn_line_id", None)]
            dn_ids = set()
            if dn_item_ids:
                dn_from_items = use_db.query(DeliveryNote.id).join(DeliveryNoteLine).filter(DeliveryNoteLine.id.in_(dn_item_ids)).all()
                for (did,) in dn_from_items: dn_ids.add(did)
            
            # 2. Por tabla puente global (InvoiceDeliveryNoteLink) - El vínculo más común
            bridge_links = use_db.query(DeliveryNote.id).join(InvoiceDeliveryNoteLink).filter(InvoiceDeliveryNoteLink.document_id == doc.id).all()
            for (did,) in bridge_links: dn_ids.add(did)

            # 3. Indirectamente vía Pedidos (si el pedido del documento tiene remitos)
            if so_lines:
                # Buscar todos los remitos asociados a los pedidos que originaron esta factura
                so_ids = use_db.query(SalesOrder.id).join(SalesOrderLine).filter(SalesOrderLine.id.in_(so_lines)).all()
                so_id_list = [sid for (sid,) in so_ids]
                if so_id_list:
                    dn_via_so = use_db.query(DeliveryNote.id).filter(DeliveryNote.sales_order_id.in_(so_id_list)).all()
                    for (did,) in dn_via_so: dn_ids.add(did)

            # 4. Poblar lista de remitos vinculados
            doc.delivery_notes = []
            if dn_ids:
                delivery_notes = use_db.query(DeliveryNote).filter(DeliveryNote.id.in_(dn_ids)).all()
                doc.delivery_notes = [{"id": dn.id, "number": dn.number, "date": dn.date.isoformat() if dn.date else None, "status": dn.status.value if hasattr(dn.status, 'value') else str(dn.status)} for dn in delivery_notes]

            # 5. Calcular porcentajes de progreso para el documento actual (Traceabilidad)
            total_qty = sum(float(l.qty or 0) for l in doc.lines)
            
            # Un documento de tipo factura ya está "facturado" al 100%
            if doc.doc_type in [models.DocumentType.INVOICE, models.DocumentType.DEBIT_NOTE, models.DocumentType.FCE_MIPYME, models.DocumentType.PURCHASE_INVOICE]:
                doc.invoiced_pct = 100.0
                if total_qty > 0:
                    delivered_qty = sum(float(l.qty or 0) for l in doc.lines if l.source_dn_line_id)
                    if delivered_qty > 0:
                        doc.delivered_pct = round((delivered_qty / total_qty) * 100, 1)
                    else:
                        # Fallback: si los remitos están vinculados por tabla puente (no a nivel línea), considerar 100%
                        doc.delivered_pct = 100.0 if dn_ids else 0.0
                else:
                    # Fallback si no hay líneas pero hay remitos vinculados globalmente
                    doc.delivered_pct = 100.0 if dn_ids else 0.0
            elif doc.doc_type in [models.DocumentType.RECEIPT, models.DocumentType.PAYMENT]:
                # Para recibos/pagos, el flujo de items no aplica usualmente, marcamos como completo su parte
                doc.invoiced_pct = 100.0
                doc.delivered_pct = 100.0
            else:
                doc.invoiced_pct = 0.0
                doc.delivered_pct = 100.0 if dn_ids else 0.0
            
            # Pago basado en aplicaciones recibidas
            total_paid = sum([float(app.amount_applied or 0) for app in getattr(doc, "applied_by", [])])
            if doc.total_amount > 0:
                doc.paid_pct = min(100.0, round((total_paid / doc.total_amount * 100), 1))
                # Si está cerrado financieramente, forzamos 100% para evitar errores de redondeo en UI
                if doc.status == models.DocumentStatus.CLOSED:
                    doc.paid_pct = 100.0
            else:
                doc.paid_pct = 100.0 if doc.status == models.DocumentStatus.CLOSED else 0.0

            if dn_ids:
                # Usar joinedload para evitar N+1 en las entidades de los remitos
                delivery_notes = use_db.query(DeliveryNote).options(joinedload(DeliveryNote.entity)).filter(DeliveryNote.id.in_(list(dn_ids))).all()
                doc.delivery_notes = []
                for dn in delivery_notes:
                    # Simplificación: un remito individual está 100% entregado por definición, 
                    # pero puede estar facturado o no.
                    dn_doc = use_db.query(models.Document).filter(models.Document.number == dn.number).first()
                    dn_paid_pct = 0.0
                    if dn_doc:
                        dn_total_paid = sum([app.amount_applied for app in getattr(dn_doc, "applied_by", [])])
                        dn_paid_pct = (dn_total_paid / dn_doc.total_amount * 100) if dn_doc.total_amount > 0 else 0.0

                    doc.delivery_notes.append({
                        "id": dn.id, 
                        "number": dn.number, 
                        "date": dn.date.isoformat() if dn.date else None, 
                        "status": dn.status,
                        "entity_name": dn.entity.name if dn.entity else "S/D",
                        "delivered_pct": 100.0,
                        "invoiced_pct": 100.0 if dn.status == DeliveryNoteStatus.INVOICED else 50.0 if dn.status == DeliveryNoteStatus.PARTIAL else 0.0,
                        "paid_pct": dn_paid_pct
                    })
            
            if doc.sales_orders:
                # Enriquecer pedidos con porcentajes reales si es posible
                for so_dict in doc.sales_orders:
                    status = so_dict.get("status")
                    # Intentamos inferir el progreso del estado si no tenemos la entidad SO completa aquí
                    if status == "COMPLETED":
                        so_dict["delivered_pct"] = 100.0
                        so_dict["invoiced_pct"] = 100.0
                        so_dict["paid_pct"] = 100.0
                    elif status == "FULLY_DELIVERED":
                        so_dict["delivered_pct"] = 100.0
                        so_dict["invoiced_pct"] = 0.0
                        so_dict["paid_pct"] = 0.0
                    elif status == "INVOICED":
                        so_dict["delivered_pct"] = 0.0
                        so_dict["invoiced_pct"] = 100.0
                        so_dict["paid_pct"] = 0.0
                    elif "PARTIALLY" in (status or ""):
                        # Estimación grosera para estados parciales
                        so_dict["delivered_pct"] = 50.0 if "DELIVERED" in status else 0.0
                        so_dict["invoiced_pct"] = 50.0 if "INVOICED" in status else 0.0
                        so_dict["paid_pct"] = 0.0
                    else:
                        so_dict["delivered_pct"] = 0.0
                        so_dict["invoiced_pct"] = 0.0
                        so_dict["paid_pct"] = 0.0

    return doc

@router.post("/", response_model=document_schemas.DocumentResponse)
def create_document(
    doc: document_schemas.DocumentCreate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    from app.modules.sales.sales_utils import recalc_sales_order_status, recalc_purchase_order_status
    
    # 0. Check Permission based on type
    is_purchase = doc.doc_type in [
        models.DocumentType.PURCHASE_INVOICE, 
        models.DocumentType.PURCHASE_DEBIT_NOTE, 
        models.DocumentType.PURCHASE_CREDIT_NOTE
    ]
    
    # Manual permission check inside
    module = "purchase_invoices" if is_purchase else "sales_invoices"
    # Admin and Owner always pass
    if not ("admin" in current_user.roles or "owner" in current_user.roles):
        from app.modules.auth.auth_router import get_effective_permissions
        perms = get_effective_permissions(current_user, db)
        if not perms.get(module, {}).get("create", False):
            raise HTTPException(
                status_code=403, 
                detail=f"No tiene permiso para crear en el módulo {module}"
            )

    # 0. Validar Entidad
    entity = db.query(models.Entity).filter(models.Entity.id == doc.entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="La entidad especificada no existe")

    # 0.0 Validar Diferencia de Cambio
    if doc.reason_type == models.DocumentReasonType.EXCHANGE_DIFFERENCE:
        doc.is_exchange_difference = True
        if not doc.source_invoice_id:
            raise HTTPException(status_code=400, detail="La factura origen es obligatoria para Notas por Diferencia de Cambio.")
        if not doc.lines or len(doc.lines) == 0:
            raise HTTPException(status_code=400, detail="Debe incluir al menos un concepto para la diferencia de cambio.")
        if doc.total_amount <= 0:
            raise HTTPException(status_code=400, detail="El importe de la diferencia de cambio debe ser mayor a 0.")

    # 0.0.1 Validar Nota de Crédito
    if doc.doc_type == models.DocumentType.CREDIT_NOTE:
        if not doc.source_invoice_id:
            raise HTTPException(status_code=400, detail="La factura origen es obligatoria para Notas de Crédito.")
            
    # 0.0.2 Validar Cuentas Contables se hace más adelante, durante la inferencia.

    # 0.1 Validar Límite de Crédito (solo para Clientes y facturas/notas de débito)
    if doc.doc_type in [models.DocumentType.INVOICE, models.DocumentType.DEBIT_NOTE] and entity.type in [models.EntityType.CLIENT, models.EntityType.MIXED]:
        if (entity.credit_limit or 0) > 0:
            from sqlalchemy import func as sa_func
            current_balance = db.query(sa_func.sum(models.AccountMovement.debit - models.AccountMovement.credit)).filter(
                models.AccountMovement.entity_id == entity.id
            ).scalar() or 0.0
            
            # Si el nuevo documento excede el límite
            if (current_balance + doc.total_amount) > entity.credit_limit:
                if entity.credit_status == "BLOCKED":
                    raise HTTPException(status_code=403, detail=f"Límite de crédito excedido (${entity.credit_limit}). Operación BLOQUEADA.")
                # Si es WARNING o OK con límite, permitimos pero podríamos loguear o avisar (el frontend manejará la advertencia visual)
                pass

    # 1. Calcular monto en ARS al momento del alta
    total_amount_ars = doc.total_amount * doc.exchange_rate if doc.currency == models.CurrencyType.USD else doc.total_amount
    
    # 2. Numeración automática para Recibos y Pagos (Mover de antes de flush)
    doc_number = doc.number
    pv_to_inc = None
    doc_tag_to_inc = None

    if doc.doc_type in [models.DocumentType.RECEIPT, models.DocumentType.PAYMENT]:
        from app.modules.sales import numbering_service
        doc_tag = "RECIBO" if doc.doc_type == models.DocumentType.RECEIPT else "PAGO"
        default_pv = "0001"
        
        if not doc_number or doc_number == "AUTO":
           doc_number = numbering_service.get_next_number(db, default_pv, doc_tag)
        
        if "-" in (doc_number or ""):
            pv_to_inc = doc_number.split("-")[0]
            doc_tag_to_inc = doc_tag

    if doc_number and doc_number.endswith("-00000000"):
        raise HTTPException(status_code=400, detail="El número de comprobante no puede ser 00000000. Genere un número válido.")
        
    if doc_number:
        existing = db.query(models.Document).filter(models.Document.doc_type == doc.doc_type, models.Document.number == doc_number).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Ya existe un comprobante con el número {doc_number}.")

    # 3. Excluir campos que no pertenecen al modelo Document 
    doc_data = doc.model_dump(exclude={"lines", "payments", "applications", "vehicle_expenses", "perceptions", "retentions", "reimbursement_entity_id", "number"})
    
    db_doc = models.Document(
        **doc_data,
        number=doc_number,
        total_amount_ars=total_amount_ars,
        created_by="Sistema" # Placeholder
    )
    
    # Calcular comision
    if doc.salesperson_id and db_doc.status != models.DocumentStatus.DRAFT:
        seller = db.query(models.Entity).filter(models.Entity.id == doc.salesperson_id).first()
        if seller:
            pct = seller.commission_pct or 0
            if doc.doc_type == models.DocumentType.INVOICE or (doc.doc_type == models.DocumentType.DEBIT_NOTE and doc.reason_type == models.DocumentReasonType.COMMERCIAL_ADJUSTMENT):
                db_doc.commission_amount = (doc.net_amount * pct) / 100.0
            elif doc.doc_type == models.DocumentType.CREDIT_NOTE:
                db_doc.commission_amount = -((doc.net_amount * pct) / 100.0)

    try:
        db.add(db_doc)
        db.flush()  # Ahora sí, el número ya es real y no "AUTO"

        # Log creation
        _log_history(db, db_doc.id, "CREACION", f"Documento {db_doc.doc_type} {db_doc.number} creado", current_user=current_user)
        
        # Incrementar contador si aplica
        if pv_to_inc and doc_tag_to_inc:
            numbering_service.increment_last_number(db, pv_to_inc, doc_tag_to_inc)


        # Crear pagos si se proporcionan
        if doc.payments:
            from app.db import finance_models
            for pay in doc.payments:
                db_pay = models.PaymentItem(
                    document_id=db_doc.id,
                    **pay.model_dump()
                )
                db.add(db_pay)

                # INTEGRACIÓN CON MÓDULO DE CHEQUES
                if pay.type == models.PaymentMethod.CHECK:
                    if db_doc.doc_type == models.DocumentType.RECEIPT:
                        # Crear el cheque en la cartera si es un recibo
                        new_cheque = finance_models.Cheque(
                            entity_id=db_doc.entity_id,
                            source_document_id=db_doc.id,
                            banco=pay.bank_name or pay.description or "S/D",
                            nro_cheque=pay.reference_number or "0",
                            importe=pay.amount,
                            moneda=db_doc.currency,
                            f_pago=pay.due_date.date() if pay.due_date else datetime.now().date(),
                            cliente_dador=entity.name,
                            cuit_emisor="", # Se podría ampliar el schema para pedir CUIT
                            estado="EN_CARTERA",
                            cost_center=db_doc.cost_center
                        )
                        db.add(new_cheque)
                    elif db_doc.doc_type == models.DocumentType.PAYMENT:
                        # Intentar marcar como endosado un cheque existente en cartera
                        import logging
                        # Usar el logger global en lugar de redefinirlo localmente
                        logger.info(f"BUSCANDO CHEQUE PARA ENDOSO: Nro={pay.reference_number}, Importe={pay.amount}")
                        
                        from sqlalchemy import func, cast, Integer
                        
                        # Limpiar el número de referencia para la búsqueda (quitar ceros a la izquierda)
                        ref_num_str = str(pay.reference_number or "0").strip().lstrip('0')
                        if not ref_num_str: ref_num_str = "0"

                        existing_ch = db.query(finance_models.Cheque).filter(
                            # Comparamos el nro_cheque quitando ceros a la izquierda también en la DB
                            func.ltrim(finance_models.Cheque.nro_cheque, '0') == ref_num_str,
                            # Usamos un rango pequeño para evitar problemas de precisión en Numeric
                            finance_models.Cheque.importe >= float(pay.amount) - 0.05,
                            finance_models.Cheque.importe <= float(pay.amount) + 0.05,
                            # Aceptamos EN_CARTERA o PENDIENTE (limpieza automática)
                            finance_models.Cheque.estado.in_(["EN_CARTERA", "PENDIENTE"])
                        ).first()
                        
                        if existing_ch:
                            logger.info(f"CHEQUE ENCONTRADO: ID={existing_ch.id}, Nro={existing_ch.nro_cheque}, Nuevo Estado=ENDOSADO")
                            existing_ch.estado = "ENDOSADO"
                            existing_ch.endorsee_id = db_doc.entity_id
                            existing_ch.endorsement_date = db_doc.date
                            existing_ch.entregado_a = entity.name
                            existing_ch.fecha_entrega = db_doc.date.date() if db_doc.date else datetime.now().date()
                            existing_ch.nro_orden_pago = db_doc.number
                        else:
                            logger.warning(f"CHEQUE NO ENCONTRADO PARA ENDOSO: Nro={pay.reference_number}, Importe={pay.amount}")

        # Guardar Percepciones si se proporcionan
        if doc.perceptions:
            for p in doc.perceptions:
                db_p = models.DocumentPerception(
                    document_id=db_doc.id,
                    **p.model_dump()
                )
                db.add(db_p)

        # Guardar Retenciones si se proporcionan
        if doc.retentions:
            for r in doc.retentions:
                db_r = models.DocumentRetention(
                    document_id=db_doc.id,
                    **r.model_dump()
                )
                db.add(db_r)

        # Crear líneas si se proporcionan
        dn_ids_to_check = set()
        if doc.lines:
            def _infer_account_code(description: str, db: Session, default_prefix: str = "6") -> str:
                if not description:
                    description = "Gasto varios"
                txt = description.lower()
                mapping = {
                    "combustible": f"{default_prefix}.FUEL",
                    "nafta": f"{default_prefix}.FUEL",
                    "gasolina": f"{default_prefix}.FUEL",
                    "estacion": f"{default_prefix}.FUEL",
                    "comida": f"{default_prefix}.MEALS",
                    "almuerzo": f"{default_prefix}.MEALS",
                    "viatico": f"{default_prefix}.TRAVEL",
                    "hotel": f"{default_prefix}.TRAVEL",
                    "servicio": f"{default_prefix}.SERVICES",
                    "honorario": f"{default_prefix}.SERVICES",
                    "ticket": f"{default_prefix}.TICKET",
                    "ticketera": f"{default_prefix}.TICKET",
                }
                for k, code in mapping.items():
                    if k in txt:
                        acc = db.query(Account).filter(Account.code == code).first()
                        if not acc:
                            acc = Account(id=generate_uuid(), code=code, name=code, active=True)
                            db.add(acc); db.flush()
                        return acc.id
                gen_code = f"{default_prefix}.OTHER"
                acc = db.query(Account).filter(Account.code == gen_code).first()
                if not acc:
                    acc = Account(id=generate_uuid(), code=gen_code, name="Gastos Varios", active=True)
                    db.add(acc); db.flush()
                return acc.id

            for i, line in enumerate(doc.lines):
                line_data = line.model_dump()
                source_dn_line_id = line_data.pop("source_dn_line_id", None)
                source_sales_line_id = line_data.pop("source_sales_line_id", None)
                source_purchase_line_id = line_data.pop("source_purchase_line_id", None)
                line_data.pop("cost_price", None) # Eliminar alias de frontend
                line_data.pop("unit_cost", None) # Evitar duplicación al crear db_line
                
                if not line_data.get("accounting_account_id") and line_data.get("product_id"):
                    prod = db.query(Product).filter(Product.id == line_data.get("product_id")).first()
                    if prod:
                        # Si es factura de compra, usar purchase_account_id, si no, sales_account_id
                        if doc.doc_type == models.DocumentType.PURCHASE_INVOICE:
                            line_data["accounting_account_id"] = prod.purchase_account_id
                        else:
                            line_data["accounting_account_id"] = prod.sales_account_id
                if not line_data.get("accounting_account_id"):
                    # Diferenciar prefijo según si es Proveedor (2. o 6.) o Cliente (4.)
                    is_purchase = doc.doc_type == models.DocumentType.PURCHASE_INVOICE or entity.type == "supplier"
                    default_pref = "2" if is_purchase else "4"
                    line_data["accounting_account_id"] = _infer_account_code(line_data.get("description"), db, default_prefix=default_pref)
                
                if not line_data.get("accounting_account_id"):
                    # Si tiene product_id y no se pudo inferir, es porque el producto no la tiene
                    if line_data.get("product_id") and prod:
                        raise HTTPException(status_code=400, detail=f"El producto '{prod.name}' no tiene cuenta contable de venta asignada.")
                    # Si no tiene producto ni se pudo inferir
                    raise HTTPException(status_code=400, detail=f"La línea {i+1} no tiene cuenta contable asignada.")
                provided_line_order = line_data.pop("line_order", None)
                computed_line_order = provided_line_order if provided_line_order is not None else i
                # Priorizar costo manual del formulario si existe
                unit_cost = float(line_data.get("cost_price") if line_data.get("cost_price") is not None else (line_data.get("unit_cost") or 0.0))
                
                qty = float(line_data.get("qty", 1.0) or 1.0)
                unit_price = float(line_data.get("unit_price", 0.0) or 0.0)
                discount_pct = float(line_data.get("discount_pct", 0.0) or 0.0)
                vat_rate = float(line_data.get("vat_rate", 0.21) or 0.21)

                qty_packages = line_data.get("qty_packages")
                package_size = line_data.get("package_size")
                
                if line_data.get("product_id"):
                    prod_tmp = db.query(Product).filter(Product.id == line_data["product_id"]).first()
                    if prod_tmp and prod_tmp.quantity_per_container and float(prod_tmp.quantity_per_container) > 1:
                        package_size = float(prod_tmp.quantity_per_container)

                from app.utils.pricing import calculate_line_totals
                totals = calculate_line_totals(
                    qty_packages=qty_packages,
                    package_size=package_size,
                    fallback_qty=qty,
                    unit_price=unit_price,
                    discount_pct=discount_pct,
                    vat_rate=vat_rate
                )

                line_data["qty_packages"] = totals["qty_packages"]
                line_data["package_size"] = totals["package_size"]
                line_data["qty"] = totals["qty"]
                line_data["net_amount"] = totals["net_amount"]
                line_data["vat_amount"] = totals["vat_amount"]
                line_data["total_amount"] = totals["total_amount"]
                
                if unit_cost == 0:
                    if source_dn_line_id:
                        dn_line = db.query(DeliveryNoteLine).filter(DeliveryNoteLine.id == source_dn_line_id).first()
                        if dn_line:
                            if float(getattr(dn_line, 'unit_cost', 0) or 0) > 0:
                                unit_cost = float(dn_line.unit_cost)
                            elif dn_line.source_sales_line_id:
                                from app.db.models.commercial_models import SalesOrderLine
                                ovl = db.query(SalesOrderLine).filter(SalesOrderLine.id == dn_line.source_sales_line_id).first()
                                if ovl: unit_cost = float(ovl.unit_cost or 0)
                    elif source_sales_line_id:
                        from app.db.models.commercial_models import SalesOrderLine
                        ovl = db.query(SalesOrderLine).filter(SalesOrderLine.id == source_sales_line_id).first()
                        if ovl: unit_cost = float(ovl.unit_cost or 0)
                    elif source_purchase_line_id:
                        from app.db.models.commercial_models import PurchaseOrderLine
                        pol = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == source_purchase_line_id).first()
                        if pol: unit_cost = float(pol.unit_cost or 0)
                
                if unit_cost == 0 and line_data.get("product_id"):
                    prod = db.query(Product).filter(Product.id == line_data.get("product_id")).first()
                    if prod: unit_cost = float(prod.cost_price or 0)

                db_line = models.DocumentLine(
                    document_id=db_doc.id,
                    **line_data,
                    source_dn_line_id=source_dn_line_id,
                    source_sales_line_id=source_sales_line_id,
                    source_purchase_line_id=source_purchase_line_id,
                    line_order=computed_line_order,
                    unit_cost=unit_cost,
                    total_cost=unit_cost * float(line_data.get("qty", 0))
                )
                db.add(db_line)
                db.flush()
                
                # Generar movimiento de stock para facturas directas (sin remito)
                if db_doc.status != models.DocumentStatus.DRAFT and db_doc.warehouse_id and not source_dn_line_id and line_data.get("product_id") and not doc.is_exchange_difference:
                    prod = db.query(Product).filter(Product.id == line_data.get("product_id")).first()
                    if prod and getattr(prod, 'is_service', False) == False:
                        from app.db.models.commercial_models import StockMovement, StockMovementType
                        from app.modules.inventory.stock_utils import get_or_create_stock_item
                        from decimal import Decimal
                        
                        # Reglas de stock para documentos
                        # ND -> Nunca toca stock
                        if doc.doc_type == models.DocumentType.DEBIT_NOTE:
                            continue
                            
                        # NC -> Solo toca stock si es devolución física
                        if doc.doc_type == models.DocumentType.CREDIT_NOTE:
                            if not (doc.reason_type == models.DocumentReasonType.RETURN and doc.return_stock):
                                continue
                                
                        item = get_or_create_stock_item(db, prod.id, db_doc.warehouse_id)
                        qty = Decimal(str(line_data.get("qty", 0)))
                        is_in = doc.doc_type in [models.DocumentType.PURCHASE_INVOICE, models.DocumentType.CREDIT_NOTE]
                        
                        sm = StockMovement(
                            id=generate_uuid(),
                            stock_item_id=item.id,
                            qty=qty,
                            movement_type=StockMovementType.IN if is_in else StockMovementType.OUT,
                            reference_type=db_doc.doc_type,
                            reference_id=db_doc.id,
                            date=db_doc.date or datetime.now()
                        )
                        db.add(sm)
                        
                        # Actualizar qty_on_hand
                        if is_in:
                            item.qty_on_hand += qty
                        else:
                            item.qty_on_hand -= qty
                            
                        db.flush()
                        db_line.stock_movement_id = sm.id

                if source_dn_line_id:
                    dn_line = db.query(DeliveryNoteLine).filter(DeliveryNoteLine.id == source_dn_line_id).first()
                    if dn_line:
                        from decimal import Decimal
                        dn_line.qty_invoiced = Decimal(str(dn_line.qty_invoiced or 0)) + Decimal(str(line.qty))
                        
                        # Also update the origin Order Line (OV or OC)
                        if dn_line.source_sales_line_id:
                            from app.db.models.commercial_models import SalesOrderLine
                            ovl = db.query(SalesOrderLine).filter(SalesOrderLine.id == dn_line.source_sales_line_id).first()
                            if ovl:
                                # Data Integrity: Check for over-invoicing
                                pending_ov = Decimal(str(ovl.qty)) - Decimal(str(ovl.qty_invoiced or 0))
                                ovl.qty_invoiced = Decimal(str(ovl.qty_invoiced or 0)) + Decimal(str(line.qty))
                                db.flush()
                                recalc_sales_order_status(db, ovl.order_id)
                        elif dn_line.source_purchase_line_id:
                            from app.db.models.commercial_models import PurchaseOrderLine
                            ocl = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == dn_line.source_purchase_line_id).first()
                            if ocl:
                                ocl.qty_invoiced = Decimal(str(ocl.qty_invoiced or 0)) + Decimal(str(line.qty))
                                db.flush()
                                recalc_purchase_order_status(db, ocl.order_id)

                        dn_ids_to_check.add(dn_line.delivery_note_id)
                        exists = db.query(InvoiceDeliveryNoteLink).filter(
                            InvoiceDeliveryNoteLink.document_id == db_doc.id,
                            InvoiceDeliveryNoteLink.delivery_note_id == dn_line.delivery_note_id
                        ).first()
                        if not exists:
                            db.add(InvoiceDeliveryNoteLink(document_id=db_doc.id, delivery_note_id=dn_line.delivery_note_id))
                elif source_sales_line_id:
                    from app.db.models.commercial_models import SalesOrderLine, SalesOrderHistory, SalesOrder
                    from app.modules.sales.sales_order_router import _recalc_total
                    from decimal import Decimal
                    ovl = db.query(SalesOrderLine).filter(SalesOrderLine.id == source_sales_line_id).first()
                    if ovl:
                        ovl.qty_invoiced = Decimal(str(ovl.qty_invoiced or 0)) + Decimal(str(line.qty))
                        
                        # --- PRICE SYNC LOGIC ---
                        new_price = Decimal(str(line_data.get('unit_price', 0)))
                        old_price = Decimal(str(ovl.unit_price))
                        
                        if new_price != old_price:
                            ovl.unit_price = float(new_price)
                            
                            # Recalc line
                            discount = Decimal(str(ovl.discount_pct or 0))
                            vat_rate = Decimal(str(ovl.vat_rate or 0.21))
                            qty = Decimal(str(ovl.qty))
                            sub = qty * new_price
                            bonif = sub * (discount / Decimal('100'))
                            net = sub - bonif
                            vat = net * vat_rate
                            total = net + vat
                            
                            ovl.net_amount = float(net)
                            ovl.vat_amount = float(vat)
                            ovl.total_amount = float(total)
                            
                            user_name = "Sistema"
                            if current_user:
                                user_name = getattr(current_user, 'username', getattr(current_user, 'name', "Sistema"))
                                
                            prod_name = ovl.product.name if ovl.product else 'Ítem'
                            
                            db.add(SalesOrderHistory(
                                order_id=ovl.order_id,
                                user=user_name,
                                action="MODIFICACION_PRECIO_FACTURA",
                                details=f"Factura {db_doc.number}: Precio modificado en {prod_name}. Anterior: USD {old_price} -> Nuevo: USD {new_price}"
                            ))
                            db.flush()
                            
                            ov = db.query(SalesOrder).filter(SalesOrder.id == ovl.order_id).first()
                            if ov:
                                _recalc_total(ov, db)
                        # --- END PRICE SYNC ---
                        
                        db.flush()
                        recalc_sales_order_status(db, ovl.order_id)
                elif source_purchase_line_id:
                    from app.db.models.commercial_models import PurchaseOrderLine
                    from decimal import Decimal
                    ocl = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == source_purchase_line_id).first()
                    if ocl:
                        ocl.qty_invoiced = Decimal(str(ocl.qty_invoiced or 0)) + Decimal(str(line.qty))
                        db.flush()
                        recalc_purchase_order_status(db, ocl.order_id)

            for dn_id in dn_ids_to_check:
                dn = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
                if dn:
                    all_invoiced = True
                    some_invoiced = False
                    for dl in dn.lines:
                        if dl.qty_invoiced >= dl.qty: some_invoiced = True
                        else: all_invoiced = False
                    if all_invoiced: dn.status = DeliveryNoteStatus.INVOICED
                    elif some_invoiced: dn.status = DeliveryNoteStatus.PARTIAL
                    
                    # Recalc status of parent order if exists
                    if dn.sales_order_id:
                        recalc_sales_order_status(db, dn.sales_order_id)
                    elif dn.purchase_order_id:
                        recalc_purchase_order_status(db, dn.purchase_order_id)

        # 4. Procesar aplicaciones atómicas si vienen adjuntas (típico de Recibos)
        docs_to_recalc = set()
        if doc.applications:
            for app_data in doc.applications:
                to_doc = db.query(models.Document).filter(models.Document.id == app_data.to_document_id).first()
                if to_doc:
                    # Determinar TC de la aplicación (usa el del recibo si no viene uno específico)
                    app_rate = app_data.exchange_rate if app_data.exchange_rate is not None else db_doc.exchange_rate
                    # ARS aplicado = monto moneda original * TC (si el destino es USD, si no es directo)
                    amount_applied_ars = app_data.amount_applied * app_rate if to_doc.currency == models.CurrencyType.USD else app_data.amount_applied

                    # DETERMINAR SI ES APLICACION DE DEUDA O PAGO DE COMISION
                    # Payment (Egreso) -> Factura Venta (Deuda Cliente) = Pago de Comisión
                    # Receipt (Ingreso) -> Factura Venta (Deuda Cliente) = Cobro a Cliente
                    # Payment (Egreso) -> Factura Compra (Deuda Prov) = Pago a Proveedor
                    is_commission_payout = (db_doc.doc_type == models.DocumentType.PAYMENT and 
                                           to_doc.doc_type in [models.DocumentType.INVOICE, models.DocumentType.DEBIT_NOTE])

                    if not is_commission_payout:
                        db_app = models.Application(
                            from_document_id=db_doc.id,
                            to_document_id=app_data.to_document_id,
                            amount_applied=app_data.amount_applied,
                            amount_applied_ars=amount_applied_ars,
                            exchange_rate=app_rate
                        )
                        db.add(db_app)
                        db.flush() # Ensure ID is available for FX adjustment
                        
                        # Trigger FX adjustment if needed (destination is USD)
                        try:
                            if str(to_doc.currency) in ("USD", "CurrencyType.USD"):
                                generate_fx_adjustment(db_app.id, db)
                        except Exception as e:
                            logger.error(f"Error generando ajuste FX en create_document: {e}")

                        docs_to_recalc.add(app_data.to_document_id)

                    # ── INTEGRACIÓN COMISIONES ──
                    # Si el documento destino tiene comisión, registrar el pago de la misma
                    # (Esto se corre independientemente de si hubo aplicación financiera o no)
                    if (to_doc.commission_amount or 0) > 0 and db_doc.doc_type == models.DocumentType.PAYMENT:
                        to_doc.commission_paid_amount = (float(to_doc.commission_paid_amount or 0)) + float(app_data.amount_applied)
                        if to_doc.commission_paid_amount >= (float(to_doc.commission_amount or 0)) - 0.01:
                            to_doc.commission_paid = True
                        to_doc.commission_payment_date = datetime.now()
                        
                        db.add(models.CommissionPayment(
                            document_id=to_doc.id,
                            source_document_id=db_doc.id, # Link back to this OP
                            salesperson_id=to_doc.salesperson_id or db_doc.entity_id,
                            amount_usd=app_data.amount_applied,
                            exchange_rate=app_rate,
                            amount_ars=app_data.amount_applied * app_rate,
                            notes=f"Liquidación comisión desde {db_doc.number}",
                            date=datetime.now()
                        ))
                else:
                    # ── INTEGRACIÓN COMISIONES (REMITOS/OV) ──
                    # Si no es un Document (Factura), podría ser un Remito u OV (comunes en liquidaciones de comisiones)
                    dn = db.query(DeliveryNote).filter(DeliveryNote.id == app_data.to_document_id).first()
                    if dn and db_doc.doc_type == models.DocumentType.PAYMENT:
                        dn.commission_paid_amount = (float(dn.commission_paid_amount or 0)) + float(app_data.amount_applied)
                        if float(dn.commission_paid_amount or 0) >= float(dn.commission_amount or 0) - 0.01:
                            dn.commission_paid = True
                        dn.commission_payment_date = datetime.now()
                        
                        db.add(models.CommissionPayment(
                            delivery_note_id=dn.id,
                            source_document_id=db_doc.id, # Link back to this OP
                            salesperson_id=dn.salesperson_id or entity.id,
                            amount_usd=app_data.amount_applied,
                            exchange_rate=db_doc.exchange_rate,
                            amount_ars=app_data.amount_applied * db_doc.exchange_rate,
                            notes=f"Liquidación desde {db_doc.number}",
                            date=datetime.now()
                        ))
                    else:
                        from app.db.models.commercial_models import SalesOrder
                        ov = db.query(SalesOrder).filter(SalesOrder.id == app_data.to_document_id).first()
                        if ov and db_doc.doc_type == models.DocumentType.PAYMENT:
                            ov.commission_paid_amount = (float(ov.commission_paid_amount or 0)) + float(app_data.amount_applied)
                            if float(ov.commission_paid_amount or 0) >= float(ov.commission_amount or 0) - 0.01:
                                ov.commission_paid = True
                            ov.commission_payment_date = datetime.now()
                            
                            db.add(models.CommissionPayment(
                                source_document_id=db_doc.id, # Link back to this OP
                                salesperson_id=ov.salesperson_id or entity.id,
                                amount_usd=app_data.amount_applied,
                                exchange_rate=db_doc.exchange_rate,
                                amount_ars=app_data.amount_applied * db_doc.exchange_rate,
                                notes=f"Liquidación desde {db_doc.number} (OV)",
                                date=datetime.now()
                            ))
        
        # Calcular Vencimiento si hay Condición
        if db_doc.sale_condition_id:
            from app.db.models.commercial_models import SaleCondition
            cond = db.query(SaleCondition).filter(SaleCondition.id == db_doc.sale_condition_id).first()
            if cond and cond.due_days:
                from datetime import timedelta
                base_date = db_doc.date or datetime.now()
                # Sobreescribimos porque el frontend suele mandar due_date=date por defecto
                db_doc.due_date = base_date + timedelta(days=cond.due_days)

        # 5. Guardar gastos por vehículo
        if doc.vehicle_expenses:
            for ve in doc.vehicle_expenses:
                db_ve = models.DocumentVehicleExpense(
                    id=generate_uuid(),
                    document_id=db_doc.id,
                    **ve.model_dump()
                )
                db.add(db_ve)

        # ── Herencia de Vendedor si viene de remitos ──
        if not db_doc.salesperson_id and dn_ids_to_check:
            first_dn = db.query(DeliveryNote).filter(DeliveryNote.id == list(dn_ids_to_check)[0]).first()
            if first_dn:
                db_doc.salesperson_id = first_dn.salesperson_id
                db_doc.vendedor = first_dn.vendedor

        # ── Reembolso (Pagado por Empleado) ──
        if doc.reimbursement_entity_id and db_doc.doc_type == models.DocumentType.PURCHASE_INVOICE:
            # 1. Crear Orden de Pago para el proveedor (saldo 0)
            provider_payment = models.Document(
                id=generate_uuid(),
                entity_id=db_doc.entity_id,
                doc_type=models.DocumentType.PAYMENT,
                number=f"REND-{db_doc.number}",
                date=db_doc.date,
                currency=db_doc.currency,
                exchange_rate=db_doc.exchange_rate,
                total_amount=db_doc.total_amount,
                total_amount_ars=db_doc.total_amount_ars,
                status=models.DocumentStatus.CLOSED,
                notes=f"Gasto pagado por: {doc.reimbursement_entity_id} (automatizado)"
            )
            db.add(provider_payment)
            db.flush()
            
            # Linkar OP con la Factura Compra del proveedor
            app_prov = models.Application(
                from_document_id=provider_payment.id,
                to_document_id=db_doc.id,
                amount_applied=db_doc.total_amount,
                amount_applied_ars=db_doc.total_amount_ars,
                exchange_rate=db_doc.exchange_rate
            )
            db.add(app_prov)
            db_doc.status = models.DocumentStatus.CLOSED
            
            # 2. Crear Factura Compra (Deuda) para el empleado
            # El empleado ahora tiene una cuenta corriente donde se le debe este dinero
            employee_invoice = models.Document(
                id=generate_uuid(),
                entity_id=doc.reimbursement_entity_id,
                doc_type=models.DocumentType.PURCHASE_INVOICE,
                number=f"REND-{db_doc.number}",
                date=db_doc.date,
                currency=db_doc.currency,
                exchange_rate=db_doc.exchange_rate,
                total_amount=db_doc.total_amount,
                total_amount_ars=db_doc.total_amount_ars,
                status=models.DocumentStatus.OPEN,
                notes=f"Reintegro gasto: {entity.name} - {db_doc.number}"
            )
            db.add(employee_invoice)
            db.flush()
            
            # Línea de la factura del empleado (Concepto genérico de rendición)
            db_line_emp = models.DocumentLine(
                document_id=employee_invoice.id,
                description=f"Rendición de Gtos: {entity.name} - {db_doc.number}",
                qty=1.0,
                unit_price=db_doc.total_amount,
                net_amount=db_doc.total_amount,
                vat_rate=0.0,
                vat_amount=0.0,
                total_amount=db_doc.total_amount,
                account_code="2.TRAVEL", # O una cuenta genérica de pasivos con empleados
                line_order=0
            )
            db.add(db_line_emp)
        
        # 6. Recalcular estados (del propio comprobante y destinos si hubo aplicaciones)
        db.flush()
        _recalc_document_status(db_doc, db)
        
        # También recalculamos los documentos que recibieron aplicaciones (ej: las facturas cobradas)
        for target_id in docs_to_recalc:
             target_doc = db.query(models.Document).filter(models.Document.id == target_id).first()
             if target_doc:
                 _recalc_document_status(target_doc, db)

        # ── Recalcular comisiones finales de la factura ──
        _recalc_document_commission(db_doc, db)

        # ── GENERAR ASIENTO CONTABLE AUTOMÁTICO ──
        try:
            create_journal_entry_for_document(db, db_doc)
        except Exception as ledger_err:
            logger.error(f"Error generando asiento contable: {ledger_err}")
            # No bloqueamos la creación del documento por un error en el asiento,
            # pero lo ideal sería loguearlo.
            pass

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

    db.refresh(db_doc)
    return db_doc

@router.get("/", response_model=List[document_schemas.DocumentResponse])
def get_documents(
    doc_type: Optional[models.DocumentType] = None,
    entity_id: Optional[str] = None, 
    cost_center: Optional[int] = None, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Check permissions dynamically based on requested type
    # For now, allow view if they have any commercial permission, or refine later
    if not ("admin" in current_user.roles or "owner" in current_user.roles):
        # Allow if user has sales_invoices, purchase_invoices, or payments permission
        from app.modules.auth.auth_router import get_effective_permissions
        perms = get_effective_permissions(current_user, db)
        has_any = any(perms.get(m, {}).get("view", False) for m in ["sales_invoices", "purchase_invoices", "payments", "cash", "cheques"])
        if not has_any:
            raise HTTPException(status_code=403, detail="No tiene permisos para ver documentos")

    query = db.query(models.Document).options(joinedload(models.Document.entity))
    
    if doc_type:
        query = query.filter(models.Document.doc_type == doc_type)
    if entity_id:
        query = query.filter(models.Document.entity_id == entity_id)
    if cost_center:
        query = query.filter(models.Document.cost_center == cost_center)
        
    items = query.order_by(models.Document.date.desc()).limit(1000).all() # Limit for performance
    for it in items:
        _sanitize_document_for_response(it, db=db)
    return items

@router.post("/bulk-invoice")
def bulk_invoice_delivery_notes(
    req: BulkInvoiceRequest, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Consolida múltiples remitos en una sola factura.
    Ideal para cierres de mes o facturación por cuenta corriente.
    """
    from app.modules.sales import numbering_service
    from app.modules.sales.sales_utils import recalc_sales_order_status
    from decimal import Decimal

    if not req.delivery_note_ids:
        raise HTTPException(status_code=400, detail="Debe seleccionar al menos un remito")

    # 1. Cargar Remitos y Validar Entidad
    dns = db.query(DeliveryNote).filter(DeliveryNote.id.in_(req.delivery_note_ids)).all()
    if len(dns) != len(req.delivery_note_ids):
        raise HTTPException(status_code=404, detail="Algún remito no fue encontrado")

    entity_ids = set(dn.entity_id for dn in dns)
    if len(entity_ids) > 1:
        raise HTTPException(status_code=400, detail="Todos los remitos deben pertenecer a la misma entidad para ser consolidados")

    entity_id = list(entity_ids)[0]
    
    # 2. Generar Número de Documento
    full_number = numbering_service.get_next_number(db, req.pv, req.doc_type.value if hasattr(req.doc_type, 'value') else str(req.doc_type))
    
    # 3. Crear el Documento (Factura)
    new_doc = models.Document(
        id=str(uuid.uuid4()),
        doc_type=req.doc_type,
        line=req.letter,
        number=full_number,
        date=req.date or datetime.now(),
        currency=req.currency,
        exchange_rate=req.exchange_rate,
        entity_id=entity_id,
        status=models.DocumentStatus.OPEN,
        notes=req.notes or f"Resumen de remitos: {', '.join(dn.number for dn in dns)}",
        vendedor=req.vendedor,
        salesperson_id=req.salesperson_id
    )
    db.add(new_doc)
    db.flush()

    total_amount = Decimal("0.0")
    orders_to_recalc = set()

    # 4. Procesar cada Remito y sus líneas
    for dn in dns:
        # 4.1 Crear vínculo Factura-Remito
        link = InvoiceDeliveryNoteLink(
            document_id=new_doc.id,
            delivery_note_id=dn.id
        )
        db.add(link)

        # 4.2 Crear Líneas de Documento (1 a 1 para trazabilidad máxima)
        for line in dn.lines:
            # Calcular pendiente de facturar en esta línea de remito
            qty_to_invoice = Decimal(str(line.qty)) - Decimal(str(line.qty_invoiced or 0))
            if qty_to_invoice <= 0: continue # Ya fue facturada por otra vía

            # Obtener precio y moneda de la línea original si es posible
            # (Si el remito no tiene precio, intentamos buscar en la Orden de Venta)
            up = Decimal(str(line.unit_price or 0))
            if up == 0 and line.source_sales_line_id:
                ov_line = db.query(SalesOrderLine).filter(SalesOrderLine.id == line.source_sales_line_id).first()
                if ov_line: up = Decimal(str(ov_line.unit_price or 0))

            # Facturamos la cantidad completa del remito (o el remanente)
            # Todo el monto financiero se calcula en la moneda del Documento destino (Factura)
            subtotal = (qty_to_invoice * up).quantize(Decimal("0.01"))
            vat_amount = (subtotal * Decimal(str(line.vat_rate or 0.21))).quantize(Decimal("0.01"))
            line_total = subtotal + vat_amount

            doc_line = models.DocumentLine(
                id=str(uuid.uuid4()),
                document_id=new_doc.id,
                product_id=line.product_id,
                description=line.description or dn.number,
                qty=float(qty_to_invoice),
                unit_price=float(up),
                vat_rate=float(line.vat_rate or 0.21),
                net_amount=float(subtotal),
                vat_amount=float(vat_amount),
                total_amount=float(line_total),
                source_dn_line_id=line.id,
                source_sales_line_id=line.source_sales_line_id
            )
            db.add(doc_line)
            
            # Actualizar progreso en el remito
            line.qty_invoiced = float(Decimal(str(line.qty_invoiced or 0)) + qty_to_invoice)
            
            # Actualizar progreso en la orden de venta (si existe)
            if line.source_sales_line_id:
                ov_line = db.query(SalesOrderLine).filter(SalesOrderLine.id == line.source_sales_line_id).first()
                if ov_line:
                    ov_line.qty_invoiced = float(Decimal(str(ov_line.qty_invoiced or 0)) + qty_to_invoice)
                    orders_to_recalc.add(ov_line.order_id)

            total_amount += line_total

        # 4.3 Marcar Remito como INVOICED si corresponde
        dn.status = DeliveryNoteStatus.INVOICED # Asumimos remito completo para esta lógica de consolidación
        _log_history(db, new_doc.id, "VINCULO_LOGISTICO", f"Se incluyó el remito {dn.number} en esta factura.", current_user=current_user)

    # 5. Finalizar Totales e Historial
    new_doc.total_amount = float(total_amount)
    # IMPACTO FINANCIERO: total_amount_ars para el ledger
    if new_doc.currency == CurrencyType.ARS:
        new_doc.total_amount_ars = new_doc.total_amount
    else:
        new_doc.total_amount_ars = round(new_doc.total_amount * req.exchange_rate, 2)
        
    _log_history(db, new_doc.id, "CREACION", f"Factura masiva generada a partir de {len(dns)} remitos.", current_user=current_user)

    # 6. Recalcular Órdenes de Venta
    for ov_id in orders_to_recalc: recalc_sales_order_status(db, ov_id)
    db.commit(); db.refresh(new_doc)
    return new_doc

@router.post("/bulk-email")
def bulk_email_documents(req: BulkEmailRequest, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Envía múltiples documentos por correo de forma masiva."""
    results = []
    for doc_id in req.document_ids:
        doc = db.query(models.Document).options(joinedload(models.Document.entity)).filter(models.Document.id == doc_id).first()
        if not doc:
            results.append({"id": doc_id, "status": "error", "message": "No encontrado"})
            continue
        
        email = doc.entity.email if doc.entity else None
        if not email:
            results.append({"id": doc_id, "number": doc.number, "status": "error", "message": "Entidad no tiene email"})
            continue
        
        try:
            pdf_internal = export_document_to_pdf(doc, db=db)
            attachments = [{"filename": f"{doc.number}.pdf", "content": pdf_internal}]
            
            subject = req.subject or f"Comprobante {doc.number} - Quintal Agross"
            body = req.body or f"Estimado {doc.entity.name},\n\nAdjuntamos el comprobante {doc.number} para su gestión.\n\nSaludos cordiales,\nEquipo de Administración de Quintal Agross"
            
            res = send_email(subject, body, attachments=attachments, to_email=email)
            if res.get("sent"):
                _log_history(db, doc_id, "ENVIO_EMAIL", f"PDF enviado con éxito a {email}", current_user=current_user)
                results.append({"id": doc_id, "number": doc.number, "status": "ok"})
            else:
                results.append({"id": doc_id, "number": doc.number, "status": "error", "message": res.get("reason", "Error SMTP")})
        except Exception as e:
            results.append({"id": doc_id, "number": doc.number, "status": "error", "message": str(e)})
    
    db.commit()
    return results

@router.delete("/{id}")
def delete_document(id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    doc = db.query(models.Document).filter(models.Document.id == id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
        
    # Check Permission based on type
    is_purchase = doc.doc_type in [
        models.DocumentType.PURCHASE_INVOICE, 
        models.DocumentType.PURCHASE_DEBIT_NOTE, 
        models.DocumentType.PURCHASE_CREDIT_NOTE
    ]
    is_finance = doc.doc_type in [
        models.DocumentType.RECEIPT, 
        models.DocumentType.PAYMENT
    ]
    
    module = "purchase_invoices" if is_purchase else "finance" if is_finance else "sales_invoices"
    
    # Admin and Owner always pass
    if not ("admin" in current_user.roles or "owner" in current_user.roles):
        from app.modules.auth.auth_router import get_effective_permissions
        perms = get_effective_permissions(current_user, db)
        if not perms.get(module, {}).get("delete", False):
            raise HTTPException(
                status_code=403, 
                detail=f"No tiene permiso para eliminar en el módulo {module}"
            )

    if doc.cae:
        raise HTTPException(status_code=403, detail="No se puede eliminar un documento autorizado en ARCA (posee CAE)")
    
    # 1. Recalcular destinos de aplicaciones y revertir impactos en órdenes/remitos
    targets_to_recalc = set()
    dns_to_recalc = set()
    orders_to_recalc = set()
    
    from app.modules.sales.sales_utils import recalc_sales_order_status, recalc_purchase_order_status

    # 1.1 Revertir qty_invoiced en remitos y órdenes (OV/OC)
    for line in doc.lines:
        if line.source_dn_line_id:
            dn_line = db.query(DeliveryNoteLine).filter(DeliveryNoteLine.id == line.source_dn_line_id).first()
            if dn_line:
                from decimal import Decimal
                diff = Decimal(str(line.qty))
                dn_line.qty_invoiced = max(Decimal(0), Decimal(str(dn_line.qty_invoiced or 0)) - diff)
                dns_to_recalc.add(dn_line.delivery_note_id)
        
        if line.source_sales_line_id:
            ov_line = db.query(SalesOrderLine).filter(SalesOrderLine.id == line.source_sales_line_id).first()
            if ov_line:
                from decimal import Decimal
                diff = Decimal(str(line.qty))
                ov_line.qty_invoiced = max(Decimal(0), Decimal(str(ov_line.qty_invoiced or 0)) - diff)
                orders_to_recalc.add(("OV", ov_line.order_id))
        elif line.source_purchase_line_id:
            oc_line = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == line.source_purchase_line_id).first()
            if oc_line:
                from decimal import Decimal
                diff = Decimal(str(line.qty))
                oc_line.qty_invoiced = max(Decimal(0), Decimal(str(oc_line.qty_invoiced or 0)) - diff)
                orders_to_recalc.add(("OC", oc_line.order_id))

    # 1.2 Info para recalcular aplicaciones financieras
    for app in doc.applied_to:
        targets_to_recalc.add(app.to_document_id)
    for app in doc.applied_by:
        targets_to_recalc.add(app.from_document_id)

    # 1.3 Revertir comisiones
    comm_payments = db.query(CommissionPayment).filter(CommissionPayment.source_document_id == id).all()
    for cp in comm_payments:
        if cp.document_id:
            target_doc = db.query(models.Document).filter(models.Document.id == cp.document_id).first()
            if target_doc:
                target_doc.commission_paid_amount = max(0.0, float(target_doc.commission_paid_amount or 0) - float(cp.amount_usd))
                target_doc.commission_paid = False
                targets_to_recalc.add(target_doc.id)
        if cp.delivery_note_id:
            target_dn = db.query(DeliveryNote).filter(DeliveryNote.id == cp.delivery_note_id).first()
            if target_dn:
                target_dn.commission_paid_amount = max(0.0, float(target_dn.commission_paid_amount or 0) - float(cp.amount_usd))
                target_dn.commission_paid = False
        db.delete(cp)

    # 2. Borrar el documento
    db.delete(doc)
    db.flush()
    
    # 3. Recalcular todo lo afectado
    # 3.1 Recalcular Remitos
    for dn_id in dns_to_recalc:
        dn_obj = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
        if dn_obj:
            all_invoiced = True
            some_invoiced = False
            for dl in dn_obj.lines:
                if (dl.qty_invoiced or 0) >= dl.qty: some_invoiced = True
                else: all_invoiced = False
            if all_invoiced: dn_obj.status = DeliveryNoteStatus.INVOICED
            elif some_invoiced: dn_obj.status = DeliveryNoteStatus.PARTIAL
            else: dn_obj.status = DeliveryNoteStatus.DISPATCHED

    # 3.2 Recalcular Órdenes
    for o_type, o_id in orders_to_recalc:
        if o_type == "OV":
            recalc_sales_order_status(db, o_id)
        else:
            recalc_purchase_order_status(db, o_id)

    # 3.3 Recalcular otros documentos financieros
    for t_id in targets_to_recalc:
        if t_id == doc.id: continue
        target = db.query(models.Document).filter(models.Document.id == t_id).first()
        if target:
            _recalc_document_status(target, db)

    db.commit()
    return {"ok": True}


@router.get("/{id}", response_model=document_schemas.DocumentWithLinesResponse, dependencies=[Depends(check_permission("sales_invoices", "view"))])
def get_document(id: str, db: Session = Depends(get_db)):
    doc = db.query(models.Document).options(
        joinedload(models.Document.entity),
        joinedload(models.Document.lines).joinedload(models.DocumentLine.product).joinedload(Product.container).joinedload(Container.unit),
        joinedload(models.Document.perceptions),
        joinedload(models.Document.payments),
        joinedload(models.Document.history)
    ).filter(models.Document.id == id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    _sanitize_document_for_response(doc, db=db)
    return doc

@router.get("/{id}/pdf")
def get_document_pdf(id: str, db: Session = Depends(get_db)):
    doc = db.query(models.Document).options(
        joinedload(models.Document.entity),
        joinedload(models.Document.lines),
        joinedload(models.Document.perceptions),
        joinedload(models.Document.payments),
        joinedload(models.Document.applied_to).joinedload(models.Application.to_document),
        joinedload(models.Document.grain_settlement).options(
            joinedload(grain_models.GrainSettlement.items),
            joinedload(grain_models.GrainSettlement.taxes),
            joinedload(grain_models.GrainSettlement.movements)
        )
    ).filter(models.Document.id == id).first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
        
    pdf_output = export_document_to_pdf(doc, db=db)
    
    filename = f"{doc.doc_type}_{doc.number}.pdf"
    return Response(
        content=pdf_output.getvalue(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

@router.post("/{id}/email")
def send_document_email(id: str, payload: EmailPayload, db: Session = Depends(get_db)):
    doc = db.query(models.Document).options(
        joinedload(models.Document.entity),
        joinedload(models.Document.lines),
        joinedload(models.Document.payments),
        joinedload(models.Document.applied_to).joinedload(models.Application.to_document),
        joinedload(models.Document.grain_settlement).options(
            joinedload(grain_models.GrainSettlement.items),
            joinedload(grain_models.GrainSettlement.taxes),
            joinedload(grain_models.GrainSettlement.movements)
        )
    ).filter(models.Document.id == id).first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
        
    pdf_output = export_document_to_pdf(doc, db=db)
    filename = f"{doc.doc_type}_{doc.number}.pdf"
    
    doc_label = "Documento"
    if doc.doc_type.startswith("INV"): doc_label = "Factura"
    elif doc.doc_type == "REC": doc_label = "Recibo"
    elif doc.doc_type == "PAY": doc_label = "Orden de Pago"
    elif doc.doc_type == "LPG_PRIMARY": doc_label = "LPG Primaria"
    elif doc.doc_type == "LPG_SECONDARY": doc_label = "LPG Secundaria"
    
    subject = payload.subject or f"{doc_label} {doc.number} - Quintal Agross"
    body = payload.body or f"""
    <p>Estimado/a,</p>
    <p>Adjuntamos su <b>{doc_label} {doc.number}</b>.</p>
    <p>Saludos cordiales,<br>Quintal Agross</p>
    """
    
    attachment = {
        "filename": filename,
        "content": pdf_output
    }
    
    res = send_email(subject, body, attachments=[attachment], to_email=payload.to_email)
    
    # Log history of email send
    try:
        current_user = get_current_user(db, Response())
    except Exception:
        current_user = None

    _log_history(db, id, "ENVIO_EMAIL", f"Documento enviado por email a {payload.to_email}", current_user=current_user)
    db.commit()

    if not res.get("sent"):
        raise HTTPException(status_code=500, detail=f"Error enviando correo: {res.get('reason') or res.get('error')}")
    
    return {"message": "Correo enviado con éxito"}

@router.post("/applications", response_model=document_schemas.ApplicationResponse)
def create_application(app: document_schemas.ApplicationCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # 1. Verificar existencia de ambos documentos
    from_doc = db.query(models.Document).filter(models.Document.id == app.from_document_id).first()
    to_doc = db.query(models.Document).filter(models.Document.id == app.to_document_id).first()
    
    if not from_doc or not to_doc:
        raise HTTPException(status_code=404, detail="One or both documents not found")
    
    # 2. Determinar TC de la aplicación
    # Si el usuario envía TC explícito, usarlo; si no, usar TC del doc crédito
    app_exchange_rate = app.exchange_rate if app.exchange_rate is not None else from_doc.exchange_rate
    
    # 3. Calcular monto aplicado en ARS
    amount_applied_ars = app.amount_applied * app_exchange_rate if to_doc.currency == models.CurrencyType.USD else app.amount_applied

    # DETERMINAR SI ES APLICACION DE DEUDA O PAGO DE COMISION
    is_commission_payout = (from_doc.doc_type == models.DocumentType.PAYMENT and 
                           to_doc.doc_type in [models.DocumentType.INVOICE, models.DocumentType.DEBIT_NOTE])

    db_app = None
    if not is_commission_payout:
        # 4. Persistir aplicación financiera (solo si no es comisión)
        db_app = models.Application(
            from_document_id=app.from_document_id,
            to_document_id=app.to_document_id,
            amount_applied=app.amount_applied,
            amount_applied_ars=amount_applied_ars,
            exchange_rate=app_exchange_rate,
        )
        db.add(db_app)
        db.flush()
        
        # 5. Recalcular estado del documento destino (deuda)
        _recalc_document_status(to_doc, db)

    # ── INTEGRACIÓN COMISIONES (Manual) ──
    if (to_doc.commission_amount or 0) > 0 and from_doc.doc_type == models.DocumentType.PAYMENT:
        to_doc.commission_paid_amount = (float(to_doc.commission_paid_amount or 0)) + float(app.amount_applied)
        if to_doc.commission_paid_amount >= (float(to_doc.commission_amount or 0)) - 0.01:
            to_doc.commission_paid = True
        to_doc.commission_payment_date = datetime.now()
        
        db.add(models.CommissionPayment(
            document_id=to_doc.id,
            source_document_id=from_doc.id, # Link back to the payment
            salesperson_id=to_doc.salesperson_id or from_doc.entity_id,
            amount_usd=app.amount_applied,
            exchange_rate=app_exchange_rate,
            amount_ars=app.amount_applied * app_exchange_rate,
            notes=f"Liquidación comisión manual desde {from_doc.number}",
            date=datetime.now()
        ))
    
    # Recalcular estado del documento origen (el que paga)
    db.flush()
    _recalc_document_status(from_doc, db)

    # Log application
    _log_history(db, from_doc.id, "APLICACION_FINANCIERA", f"Aplicación de {app.amount_applied} {from_doc.currency} a {to_doc.doc_type} {to_doc.number}", current_user=current_user)
    _log_history(db, to_doc.id, "COBRO_APLICADO", f"Recibida aplicación de {app.amount_applied} {from_doc.currency} desde {from_doc.doc_type} {from_doc.number}", current_user=current_user)

    db.commit()
    
    if db_app:
        db.refresh(db_app)
        return db_app
    
    # Si fue solo comisión, devolvemos un objeto Application ficticio para el frontend
    return models.Application(
        id="COMM-"+from_doc.id[:8],
        from_document_id=from_doc.id,
        to_document_id=to_doc.id,
        amount_applied=app.amount_applied,
        amount_applied_ars=amount_applied_ars,
        exchange_rate=app_exchange_rate
    )

    db.commit()
    db.refresh(db_app)
    return db_app

@router.get("/{id}/balance")
def get_document_balance(id: str, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.id == id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    total_applied = db.query(func.sum(models.Application.amount_applied)).filter(
        models.Application.to_document_id == id
    ).scalar() or 0.0
    
    return {
        "total_amount": doc.total_amount,
        "total_applied": total_applied,
        "remaining_balance": doc.total_amount - total_applied,
        "status": doc.status
    }

@router.get("/{id}/applications", response_model=List[document_schemas.ApplicationDetailResponse])
def get_document_applications(id: str, db: Session = Depends(get_db)):
    apps = db.query(models.Application).filter(
        (models.Application.from_document_id == id) | 
        (models.Application.to_document_id == id)
    ).all()
    
    results = []
    for app in apps:
        item = document_schemas.ApplicationDetailResponse.model_validate(app)
        item.from_doc_number = app.from_document.number
        item.from_doc_type = app.from_document.doc_type
        item.from_doc_currency = app.from_document.currency
        item.to_doc_number = app.to_document.number
        item.to_doc_type = app.to_document.doc_type
        item.to_doc_currency = app.to_document.currency
        results.append(item)
    return results

@router.get("/entities/{entity_id}/applications", response_model=List[document_schemas.ApplicationDetailResponse])
def get_entity_applications(entity_id: str, db: Session = Depends(get_db)):
    # Buscar aplicaciones financieras
    apps = db.query(models.Application).join(
        models.Document, models.Application.from_document_id == models.Document.id
    ).filter(
        models.Document.entity_id == entity_id
    ).order_by(models.Application.created_at.desc()).limit(100).all()
    
    results = []
    for app in apps:
        item = document_schemas.ApplicationDetailResponse.model_validate(app)
        item.from_doc_number = app.from_document.number
        item.from_doc_type = app.from_document.doc_type
        item.from_doc_currency = app.from_document.currency
        item.to_doc_number = app.to_document.number
        item.to_doc_type = app.to_document.doc_type
        item.to_doc_currency = app.to_document.currency
        results.append(item)
    
    # Pendiente: Podríamos sumar CommissionPayments aquí transformándolos a este esquema
    # por ahora enviamos solo las financieras automáticas
    return results

@router.delete("/applications/{id}", dependencies=[Depends(check_permission("sales_invoices", "edit"))])

def delete_application(id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    app = db.query(models.Application).filter(models.Application.id == id).first()
    if not app:
        # Quizás es una comisión "ficticia" (empieza con COMM-)
        if id.startswith("COMM-"):
             # Borrar el registro de CommissionPayment correspondiente
             # Por ahora no tenemos el ID exacto aquí pero podríamos buscarlo
             raise HTTPException(status_code=400, detail="Use el módulo de comisiones para borrar liquidaciones")
        raise HTTPException(status_code=404, detail="Aplicación no encontrada")
    
    from_doc = app.from_document
    to_doc = app.to_document
    
    # 1. Si tenía ajuste de cambio, manejarlo
    if app.fx_link:
        gen_doc = app.fx_link.generated_document
        if gen_doc and not gen_doc.cae:
            # Si no tiene CAE, borramos el documento de ajuste generado
            db.delete(gen_doc)
    
    # 2. Borrar aplicación (fx_link se borra por cascade)
    db.delete(app)
    db.flush()
    
    # 3. Recalcular estados
    _recalc_document_status(from_doc, db)
    _recalc_document_status(to_doc, db)
    
    # Log deletion
    if from_doc:
        _log_history(db, from_doc.id, "ELIMINACION_APLICACION", f"Se eliminó aplicación a {to_doc.number if to_doc else '?'}", current_user=current_user)
    if to_doc:
        _log_history(db, to_doc.id, "ELIMINACION_COBRO", f"Se eliminó aplicación desde {from_doc.number if from_doc else '?'}", current_user=current_user)

    db.commit()
    return {"ok": True}

from app.modules.sales import numbering_service

@router.get("/next-number")
def get_next_document_number(pv: str, doc_type: str, db: Session = Depends(get_db)):
    """
    Retorna el próximo número sugerido para un comprobante y punto de venta.
    """
    doc_tag = doc_type
    if doc_type in ['INVOICE']: doc_tag = 'FA' # Default to FA for now or whatever doc_type is passed
    if doc_type == 'PURCHASE_INVOICE': doc_tag = 'FC'
    # Use exact doc_type passed by frontend, since frontend can pass 'FA', 'FB', etc.
    if len(doc_type) <= 4:
        doc_tag = doc_type
    
    next_num = numbering_service.get_next_number(db, pv, doc_tag)
    return {"next_number": next_num.split('-')[-1], "full_number": next_num}

@router.put("/{id}", response_model=document_schemas.DocumentResponse, dependencies=[Depends(check_permission("sales_invoices", "edit"))])
def update_document(id: str, data: document_schemas.DocumentUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    try:
        print(f"UPDATE DOCUMENT PAYLOAD: {data.model_dump()}")
        doc = db.query(models.Document).filter(models.Document.id == id).first()
        if not doc:
            raise HTTPException(status_code=404, detail="Documento no encontrado")
        
        # Solo permitir editar si no tiene aplicaciones (pagos/cobros) vinculadas
        has_apps = db.query(models.Application).filter(
            (models.Application.from_document_id == id) | (models.Application.to_document_id == id)
        ).first()
        if has_apps:
            raise HTTPException(status_code=409, detail="No se puede editar un documento con pagos aplicados")

        if doc.cae:
            raise HTTPException(status_code=403, detail="No se puede editar un documento autorizado en ARCA (posee CAE)")

        if data.number and data.number.endswith("-00000000"):
            raise HTTPException(status_code=400, detail="El número de comprobante no puede ser 00000000. Genere un número válido.")
            
        if data.number and data.number != doc.number:
            existing = db.query(models.Document).filter(models.Document.doc_type == doc.doc_type, models.Document.number == data.number).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Ya existe un comprobante con el número {data.number}.")

        update_data = data.model_dump(exclude_unset=True)
        
        # Validar Diferencia de Cambio en Update
        reason_type = update_data.get('reason_type', doc.reason_type)
        if reason_type == models.DocumentReasonType.EXCHANGE_DIFFERENCE:
            update_data['is_exchange_difference'] = True
            source_invoice_id = update_data.get('source_invoice_id', doc.source_invoice_id)
            if not source_invoice_id:
                raise HTTPException(status_code=400, detail="La factura origen es obligatoria para Notas por Diferencia de Cambio.")
            total_amount = update_data.get('total_amount', doc.total_amount)
            if total_amount <= 0:
                raise HTTPException(status_code=400, detail="El importe de la diferencia de cambio debe ser mayor a 0.")

        lines_data = update_data.pop("lines", None)
        payments_data = update_data.pop("payments", None)
        vehicle_expenses_data = update_data.pop("vehicle_expenses", None)
        perceptions_data = update_data.pop("perceptions", None)

        for key, value in update_data.items():
            setattr(doc, key, value)
        
        if doc.currency == models.CurrencyType.USD:
            doc.total_amount_ars = doc.total_amount * doc.exchange_rate
        else:
            doc.total_amount_ars = doc.total_amount

        if lines_data is not None:
            # Si tiene vínculos a OV/OC, bloqueamos el cambio de cantidades por integridad
            is_linked = any(line.source_sales_line_id is not None for line in doc.lines)
            if is_linked:
                if len(lines_data) != len(doc.lines):
                    raise HTTPException(status_code=409, detail="No se pueden añadir/quitar ítems de un documento vinculado a una orden. Use el gestor de vínculos.")
                
                for i, ld in enumerate(lines_data):
                    old_l = doc.lines[i]
                    new_q = float(ld.get("qty") if isinstance(ld, dict) else getattr(ld, "qty", 0))
                    if abs(new_q - float(old_l.qty)) > 0.0001:
                        raise HTTPException(status_code=409, detail=f"Línea {i+1}: Cantidad protegida por vínculo. Use el gestor de vínculos.")
                    
                    new_p = ld.get("product_id") if isinstance(ld, dict) else getattr(ld, "product_id", None)
                    if str(new_p) != str(old_l.product_id):
                        raise HTTPException(status_code=409, detail=f"Línea {i+1}: Producto protegido por vínculo.")

            # Borrar y crear líneas
            for old_line in doc.lines:
                db.delete(old_line)
            db.flush()
            for i, line_dict in enumerate(lines_data):
                provided_line_order = line_dict.pop("line_order", None)
                line_dict.pop("cost_price", None) # Eliminar alias de frontend para evitar TypeError
                computed_line_order = provided_line_order if provided_line_order is not None else i

                # Calcular montos derivados
                qty = float(line_dict.get("qty", 1.0) or 1.0)
                unit_price = float(line_dict.get("unit_price", 0.0) or 0.0)
                discount_pct = float(line_dict.get("discount_pct", 0.0) or 0.0)
                vat_rate = float(line_dict.get("vat_rate", 0.21) or 0.21)

                qty_packages = line_dict.get("qty_packages")
                package_size = line_dict.get("package_size")
                
                if line_dict.get("product_id"):
                    prod_tmp = db.query(Product).filter(Product.id == line_dict["product_id"]).first()
                    if prod_tmp and prod_tmp.quantity_per_container and float(prod_tmp.quantity_per_container) > 1:
                        package_size = float(prod_tmp.quantity_per_container)

                from app.utils.pricing import calculate_line_totals
                totals = calculate_line_totals(
                    qty_packages=qty_packages,
                    package_size=package_size,
                    fallback_qty=qty,
                    unit_price=unit_price,
                    discount_pct=discount_pct,
                    vat_rate=vat_rate
                )

                line_dict["qty_packages"] = totals["qty_packages"]
                line_dict["package_size"] = totals["package_size"]
                line_dict["qty"] = totals["qty"]
                line_dict["net_amount"] = totals["net_amount"]
                line_dict["vat_amount"] = totals["vat_amount"]
                line_dict["total_amount"] = totals["total_amount"]

                # Costo unitario: priorizar entrada manual del formulario
                unit_val = line_dict.get("cost_price") if line_dict.get("cost_price") is not None else line_dict.get("unit_cost")
                unit_cost = float(unit_val or 0.0)
                
                if unit_cost == 0 and line_dict.get("product_id"):
                    prod = db.query(Product).filter(Product.id == line_dict["product_id"]).first()
                    if prod:
                        unit_cost = float(prod.cost_price or 0)
                line_dict["unit_cost"] = unit_cost
                line_dict["total_cost"] = unit_cost * qty

                if not line_dict.get("accounting_account_id") and line_dict.get("product_id"):
                    prod = db.query(Product).filter(Product.id == line_dict.get("product_id")).first()
                    if prod:
                        if doc.doc_type == models.DocumentType.PURCHASE_INVOICE:
                            line_dict["accounting_account_id"] = prod.purchase_account_id
                        else:
                            line_dict["accounting_account_id"] = prod.sales_account_id
                if not line_dict.get("accounting_account_id"):
                    if line_dict.get("product_id") and prod:
                        raise HTTPException(status_code=400, detail=f"El producto '{prod.name}' no tiene cuenta contable de venta asignada.")
                    raise HTTPException(status_code=400, detail=f"La línea {i+1} no tiene cuenta contable asignada.")

                db_line = models.DocumentLine(
                    document_id=doc.id,
                    **line_dict,
                    line_order=computed_line_order
                )
                db.add(db_line)

        if payments_data is not None:
            # Borrar y crear pagos
            for old_pay in doc.payments:
                db.delete(old_pay)
            db.flush()
            for pay_dict in payments_data:
                db_pay = models.PaymentItem(
                    document_id=doc.id,
                    **pay_dict
                )
                db.add(db_pay)

        if vehicle_expenses_data is not None:
            # Borrar y crear
            db.query(models.DocumentVehicleExpense).filter(models.DocumentVehicleExpense.document_id == doc.id).delete()
            for ve_dict in vehicle_expenses_data:
                db_ve = models.DocumentVehicleExpense(
                    id=generate_uuid(),
                    document_id=doc.id,
                    **ve_dict
                )
                db.add(db_ve)

        if doc.sale_condition_id:
            from app.db.models.commercial_models import SaleCondition
            cond = db.query(SaleCondition).filter(SaleCondition.id == doc.sale_condition_id).first()
            if cond and cond.due_days:
                from datetime import timedelta
                base_date = doc.date or datetime.now()
                doc.due_date = base_date + timedelta(days=cond.due_days)

        doc.updated_by = "Sistema"
        _log_history(db, doc.id, "MODIFICACION", "Cambios en cabecera, ítems o gastos de flota", current_user=current_user)

        # Recalcular comisión
        if doc.salesperson_id and doc.status != models.DocumentStatus.DRAFT and doc.status != models.DocumentStatus.CANCELLED:
            seller = db.query(models.Entity).filter(models.Entity.id == doc.salesperson_id).first()
            if seller:
                pct = seller.commission_pct or 0
                if doc.doc_type == models.DocumentType.INVOICE or (doc.doc_type == models.DocumentType.DEBIT_NOTE and doc.reason_type == models.DocumentReasonType.COMMERCIAL_ADJUSTMENT):
                    doc.commission_amount = (doc.net_amount * pct) / 100.0
                elif doc.doc_type == models.DocumentType.CREDIT_NOTE:
                    doc.commission_amount = -((doc.net_amount * pct) / 100.0)
                else:
                    doc.commission_amount = 0
        else:
            doc.commission_amount = 0

        db.commit()
        db.refresh(doc)
        return doc
    except Exception as e:
        db.rollback()
        print(f"ERROR: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{id}/history")
def get_document_history(id: str, db: Session = Depends(get_db)):
    """Retorna el historial de cambios de un documento."""
    history = db.query(models.DocumentHistory).filter(models.DocumentHistory.document_id == id).order_by(models.DocumentHistory.date.desc()).all()
    return history

@router.post("/{id}/annul")
def annul_document(id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Anula un documento de forma trazable.
    Revierte aplicaciones, comisiones, remitos y órdenes.
    """
    doc = db.query(models.Document).filter(models.Document.id == id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    
    # --- LÓGICA DE ANULACIÓN FISCAL INTELIGENTE (OPCIÓN 2) ---
    has_cae = bool(getattr(doc, "cae", None))
    is_invoice_type = doc.doc_type in [models.DocumentType.INVOICE, models.DocumentType.DEBIT_NOTE, models.DocumentType.FCE_MIPYME]
    
    generated_nc_msg = ""
    if has_cae and is_invoice_type:
        from app.modules.sales import numbering_service
        from app.db.models.models import DocumentType, DocumentStatus
        
        # 1. Determinar el tipo de NC compensatoria
        nc_type = DocumentType.CREDIT_NOTE
        # Determinar letra y PV (basado en el número actual: "A0003-00000123")
        pv = "0003" # Default
        if "-" in (doc.number or ""):
            pv_part = doc.number.split("-")[0]
            # La letra está al final del prefijo o al principio? Usualmente A, B, C etc.
            # En este sistema parece que se maneja el PV limpio en numbering_service.
            # Intentamos extraer PV numérico.
            import re
            pv_match = re.search(r'\d+', pv_part)
            if pv_match: pv = pv_match.group().zfill(4)
        
        nc_number = numbering_service.get_next_number(db, pv, "CREDITO")
        
        # 2. Crear la Nota de Crédito (Cabecera Espejo)
        new_nc = models.Document(
            id=str(uuid.uuid4()),
            entity_id=doc.entity_id,
            doc_type=nc_type,
            number=nc_number,
            date=datetime.now(),
            due_date=datetime.now(),
            currency=doc.currency,
            exchange_rate=doc.exchange_rate,
            total_amount=doc.total_amount,
            total_amount_ars=doc.total_amount_ars,
            status=DocumentStatus.CLOSED, # Se cierra al nacer aplicada
            notes=f"ANULACIÓN AUTOMÁTICA de {doc.doc_type} {doc.number}",
            cae="SIM-NC-" + str(uuid.uuid4())[:8].upper(), # Simulación de CAE
            cae_due_date=datetime.now() + timedelta(days=10),
            created_by=current_user.username if current_user else "Sistema",
            cost_center=doc.cost_center,
            vendedor=doc.vendedor,
            salesperson_id=doc.salesperson_id
        )
        db.add(new_nc)
        db.flush()
        
        # 3. Clonar Líneas (Items espejo)
        for line in doc.lines:
            db.add(models.DocumentLine(
                id=str(uuid.uuid4()),
                document_id=new_nc.id,
                product_id=line.product_id,
                description=line.description,
                qty=line.qty,
                unit_price=line.unit_price,
                discount_pct=line.discount_pct,
                net_amount=line.net_amount,
                vat_rate=line.vat_rate,
                vat_amount=line.vat_amount,
                total_amount=line.total_amount,
                unit_cost=line.unit_cost,
                total_cost=line.total_cost,
                line_order=line.line_order,
                account_code=line.account_code
            ))
            
        # 4. Aplicar Financieramente (NC compensa Factura)
        db.add(models.Application(
            from_document_id=new_nc.id,
            to_document_id=doc.id,
            amount_applied=doc.total_amount,
            amount_applied_ars=doc.total_amount_ars,
            exchange_rate=doc.exchange_rate
        ))
        
        # 5. Incrementar contador y Logear
        numbering_service.increment_last_number(db, pv, "CREDITO")
        _log_history(db, doc.id, "ANULACION_FISCAL", f"Se generó automáticamente la NC {new_nc.number} para anulación fiscal.", current_user=current_user)
        generated_nc_msg = f". Se generó NC {new_nc.number} de anulación"

    # --- LÓGICA DE REVERSIÓN ESTÁNDAR ---
    # 1. Revertir stocks / remitos / órdenes si corresponde
    orders_to_recalc = set()
    dns_to_recalc = set()
    from app.modules.sales.sales_utils import recalc_sales_order_status, recalc_purchase_order_status

    for line in doc.lines:
        if line.source_dn_line_id:
            dn_line = db.query(DeliveryNoteLine).filter(DeliveryNoteLine.id == line.source_dn_line_id).first()
            if dn_line:
                from decimal import Decimal
                diff_qty = Decimal(str(line.qty))
                dn_line.qty_invoiced = max(Decimal(0), Decimal(str(dn_line.qty_invoiced or 0)) - diff_qty)
                dns_to_recalc.add(dn_line.delivery_note_id)
        
        if line.source_sales_line_id:
            ov_line = db.query(SalesOrderLine).filter(SalesOrderLine.id == line.source_sales_line_id).first()
            if ov_line:
                from decimal import Decimal
                diff_qty = Decimal(str(line.qty))
                ov_line.qty_invoiced = max(Decimal(0), Decimal(str(ov_line.qty_invoiced or 0)) - diff_qty)
                orders_to_recalc.add(("OV", ov_line.order_id))
        elif line.source_purchase_line_id:
            oc_line = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == line.source_purchase_line_id).first()
            if oc_line:
                from decimal import Decimal
                diff_qty = Decimal(str(line.qty))
                oc_line.qty_invoiced = max(Decimal(0), Decimal(str(oc_line.qty_invoiced or 0)) - diff_qty)
                orders_to_recalc.add(("OC", oc_line.order_id))

    # 2. Revertir aplicaciones y comisiones
    apps_from = db.query(models.Application).filter(models.Application.from_document_id == id).all()
    apps_to = db.query(models.Application).filter(models.Application.to_document_id == id).all()
    targets_to_recalc = set()
    for app in apps_from: targets_to_recalc.add(app.to_document_id); db.delete(app)
    for app in apps_to: targets_to_recalc.add(app.from_document_id); db.delete(app)
    
    # Comisiones
    db.query(models.CommissionPayment).filter(models.CommissionPayment.source_document_id == id).delete()
    db.query(InvoiceDeliveryNoteLink).filter(InvoiceDeliveryNoteLink.document_id == id).delete()

    # 3. Estado Final e Historia
    doc.status = models.DocumentStatus.CANCELLED
    _log_history(db, id, "ANULACION", "Documento anulado. Se revirtieron impactos comerciales" + generated_nc_msg, current_user=current_user)
    
    db.flush()
    
    # 4. Recalcular involucrados
    for dn_id in dns_to_recalc:
        dn_obj = db.query(DeliveryNote).filter(DeliveryNote.id == dn_id).first()
        if dn_obj:
            all_invoiced = True
            for dl in dn_obj.lines:
                if (dl.qty_invoiced or 0) < dl.qty: all_invoiced = False
            dn_obj.status = DeliveryNoteStatus.INVOICED if all_invoiced else DeliveryNoteStatus.PARTIAL

    for o_type, o_id in orders_to_recalc:
        if o_type == "OV": recalc_sales_order_status(db, o_id)
        else: recalc_purchase_order_status(db, o_id)
            
    for t_id in targets_to_recalc:
        target = db.query(models.Document).filter(models.Document.id == t_id).first()
        if target: _recalc_document_status(target, db)

    db.commit()
    return {"status": "ok", "message": "Documento anulado"}

@router.get("/{id}/timeline")
def get_document_timeline(id: str, db: Session = Depends(get_db)):
    """
    Retorna una línea de tiempo unificada (Auditoría + Trazabilidad) del ciclo de vida del documento.
    Combina registros de historia (logs) con vínculos reales a otros documentos (Remitos, Órdenes, Pagos).
    """
    doc = db.query(models.Document).filter(models.Document.id == id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
        
    timeline = []
    
    # 1. Eventos de Auditoría (DocumentHistory)
    history = db.query(models.DocumentHistory).filter(models.DocumentHistory.document_id == id).order_by(models.DocumentHistory.date.asc()).all()
    for h in history:
        timeline.append({
            "type": "AUDIT",
            "date": h.date,
            "user": h.user,
            "action": h.action,
            "details": h.details
        })
        
    # 2. Vínculos a Origen (Sales Orders / Purchase Orders)
    # Extraído de las líneas
    so_ids = db.query(SalesOrder).join(SalesOrderLine).filter(SalesOrderLine.id.in_([l.source_sales_line_id for l in doc.lines if l.source_sales_line_id])).distinct().all()
    for so in so_ids:
        timeline.append({
            "type": "LINK_ORIGIN",
            "date": so.date,
            "doc_type": "Orden de Venta",
            "number": so.number,
            "status": so.status,
            "details": f"Documento originado desde la orden {so.number}"
        })
        
    # 3. Remitos Vinculados
    dn_links = db.query(DeliveryNote).join(InvoiceDeliveryNoteLink).filter(InvoiceDeliveryNoteLink.document_id == id).all()
    for dn in dn_links:
        timeline.append({
            "type": "LINK_LOGISTICS",
            "date": dn.date,
            "doc_type": "Remito",
            "number": dn.number,
            "status": dn.status.value if hasattr(dn.status, 'value') else str(dn.status),
            "details": "Mercadería vinculada a este comprobante"
        })
        
    # 4. Pagos Recibidos (Applications into this document)
    apps_received = db.query(models.Application).filter(models.Application.to_document_id == id).all()
    for app in apps_received:
        from_doc = app.from_document
        if from_doc:
            timeline.append({
                "type": "LINK_FINANCE",
                "date": app.created_at,
                "doc_type": from_doc.doc_type,
                "number": from_doc.number,
                "amount": app.amount_applied,
                "currency": doc.currency,
                "details": f"Pago/Cobro aplicado: {from_doc.number}"
            })

    # 5. Aplicaciones Realizadas (If this doc is Recibo/Pago, where did it go?)
    apps_issued = db.query(models.Application).filter(models.Application.from_document_id == id).all()
    for app in apps_issued:
        to_doc = app.to_document
        if to_doc:
            timeline.append({
                "type": "LINK_APPLICATION",
                "date": app.created_at,
                "doc_type": to_doc.doc_type,
                "number": to_doc.number,
                "amount": app.amount_applied,
                "currency": to_doc.currency,
                "details": f"Aplicado a {to_doc.doc_type} {to_doc.number}"
            })

    # Ordenar cronológicamente (más antiguo primero para la lectura de arriba hacia abajo)
    timeline.sort(key=lambda x: x["date"])
    
    return timeline


@router.post("/bulk-import")
def bulk_import_documents(batch: List[document_schemas.DocumentCreate], db: Session = Depends(get_db)):
    """Importa múltiples documentos de una vez (para saldos iniciales)."""
    results = []
    for doc in batch:
        try:
            # 1. Validar Entidad
            entity = db.query(models.Entity).filter(models.Entity.id == doc.entity_id).first()
            if not entity:
                results.append({"number": doc.number, "ok": False, "error": "Entidad no existe"})
                continue

            # 2. Calcular montos
            total_amount_ars = doc.total_amount * doc.exchange_rate if doc.currency == models.CurrencyType.USD else doc.total_amount
            
            # 3. Crear cabecera
            doc_data = doc.model_dump(exclude={"lines", "payments", "applications", "vehicle_expenses", "is_initial_load"})
            db_doc = models.Document(
                **doc_data,
                total_amount_ars=total_amount_ars,
                is_initial_load=doc.is_initial_load,
                created_by="Migración"
            )
            # Marcar estado según se deba
            db_doc.status = models.DocumentStatus.OPEN
            
            db.add(db_doc)
            db.flush()

            # 4. Crear línea única de saldo si no hay líneas
            if not doc.lines:
                db_line = models.DocumentLine(
                    document_id=db_doc.id,
                    description="SALDO INICIAL - CARGA MASIVA",
                    qty=1.0,
                    unit_price=doc.total_amount,
                    net_amount=doc.total_amount,
                    vat_rate=0.0,
                    vat_amount=0.0,
                    total_amount=doc.total_amount,
                    line_order=0
                )
                db.add(db_line)
            else:
                for idx, l in enumerate(doc.lines):
                    db_line = models.DocumentLine(
                        document_id=db_doc.id,
                        **l.model_dump(),
                        line_order=idx
                    )
                    db.add(db_line)

            results.append({"number": db_doc.number, "ok": True, "id": db_doc.id})
        except Exception as e:
            db.rollback()
            results.append({"number": doc.number, "ok": False, "error": str(e)})
            continue
            
    db.commit()
    return results

@router.get("/entities/{entity_id}/open-items", response_model=List[document_schemas.OpenItemResponse])
def get_entities_open_items(entity_id: str, cost_center: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(models.Document).filter(
        models.Document.entity_id == entity_id,
        models.Document.status != models.DocumentStatus.CLOSED,
        models.Document.status != models.DocumentStatus.CANCELLED
    )
    if cost_center:
        query = query.filter(models.Document.cost_center == cost_center)
    docs = query.all()
    
    results = []
    for doc in docs:
        is_credit = doc.doc_type in [
            models.DocumentType.CREDIT_NOTE, 
            models.DocumentType.PAYMENT, 
            models.DocumentType.RECEIPT,
            models.DocumentType.LPG_PRIMARY
        ]
        
        if is_credit:
             applied = db.query(func.sum(models.Application.amount_applied)).filter(
                models.Application.from_document_id == doc.id
            ).scalar() or 0.0
        else:
             applied = db.query(func.sum(models.Application.amount_applied)).filter(
                models.Application.to_document_id == doc.id
            ).scalar() or 0.0
            
        remaining = float(doc.total_amount) - applied
        if remaining > 0.001:
            results.append(document_schemas.OpenItemResponse(
                id=doc.id,
                number=doc.number,
                date=doc.date,
                doc_type=doc.doc_type,
                total_amount=float(doc.total_amount),
                applied_amount=applied,
                remaining=remaining,
                currency=doc.currency,
                exchange_rate=float(doc.exchange_rate or 1.0),
                payment_items=doc.payments if is_credit else None,
                entity_name=doc.entity.name if doc.entity else None
            ))
    return results
@router.get("/vat-ledger")
def get_vat_ledger(
    month: int,
    year: int,
    category: str = "sales",  # "sales" or "purchases"
    cost_center: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from datetime import datetime
    import calendar
    
    start_date = datetime(year, month, 1)
    _, last_day = calendar.monthrange(year, month)
    end_date = datetime(year, month, last_day, 23, 59, 59)

    # Identificar tipos de documentos segun categoria
    if category == "sales":
        types = [
            models.DocumentType.INVOICE, 
            models.DocumentType.DEBIT_NOTE, 
            models.DocumentType.CREDIT_NOTE
        ]
    else:
        types = [
            models.DocumentType.PURCHASE_INVOICE
        ]

    query = db.query(models.Document).filter(
        models.Document.date >= start_date,
        models.Document.date <= end_date,
        models.Document.doc_type.in_(types)
    )
    if cost_center:
        query = query.filter(models.Document.cost_center == cost_center)
    
    docs = query.all()

    result = []
    for d in docs:
        vat_breakdown = {}
        total_net = 0.0
        total_vat = 0.0
        
        for l in d.lines:
            rate = str(round(l.vat_rate, 3))
            if rate not in vat_breakdown:
                vat_breakdown[rate] = {"net": 0.0, "vat": 0.0}
            
            vat_breakdown[rate]["net"] += float(l.net_amount or 0)
            vat_breakdown[rate]["vat"] += float(l.vat_amount or 0)
            total_net += float(l.net_amount or 0)
            total_vat += float(l.vat_amount or 0)

        result.append({
            "id": d.id,
            "date": d.date.strftime("%Y-%m-%d"),
            "doc_type": d.doc_type.value,
            "number": d.number,
            "entity_name": d.entity.name if d.entity else "S/D",
            "entity_tax_id": d.entity.tax_id if d.entity else "",
            "currency": d.currency.value,
            "exchange_rate": float(d.exchange_rate or 1.0),
            "total_net": round(total_net, 2),
            "total_vat": round(total_vat, 2),
            "total_amount": float(d.total_amount or 0),
            "total_amount_ars": float(d.total_amount_ars or 0),
            "vat_breakdown": vat_breakdown
        })
    
    return result
    
@router.post("/{id}/register-afip")
def register_document_afip(id: str, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """
    Autoriza el comprobante ante AFIP/ARCA.
    Por ahora es un simulador robusto que actualiza los campos del modelo.
    """
    doc = db.query(models.Document).filter(models.Document.id == id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    
    if doc.cae:
        raise HTTPException(status_code=400, detail="El documento ya posee CAE")
    
    if doc.doc_type not in [models.DocumentType.INVOICE, models.DocumentType.DEBIT_NOTE, models.DocumentType.CREDIT_NOTE]:
        raise HTTPException(status_code=400, detail="Este tipo de documento no requiere validación fiscal ARCA")

    # Simulación de respuesta ARCA vía Service
    from app.modules.accounting.afip_wsfe_service import AfipWsfeService
    try:
        # Prepare data for AFIP
        afip_payload = {
            "number": doc.number,
            "tax_id": doc.entity.tax_id if doc.entity else None,
            "total_amount": float(doc.total_amount),
            "doc_type": doc.doc_type,
            "perceptions": [
                {
                    "tax_name": p.tax_name,
                    "jurisdiction": p.jurisdiction,
                    "amount": float(p.amount)
                } for p in (doc.perceptions or [])
            ]
        }
        
        # Call the service
        afip_res = AfipWsfeService.authorize_invoice(afip_payload)
        
        if not afip_res["success"]:
            doc.afip_status = "REJECTED"
            doc.afip_xml_response = f"<Error>{afip_res.get('error')}</Error>"
            db.commit()
            raise HTTPException(status_code=400, detail=afip_res.get("error"))

        # Update document with AFIP data
        doc.cae = afip_res["cae"]
        doc.cae_due_date = afip_res["cae_due_date"]
        doc.afip_status = afip_res["status"]
        doc.afip_xml_request = afip_res["afip_xml_request"]
        doc.afip_xml_response = afip_res["afip_xml_response"]
        
        _log_history(db, doc.id, "AFIP_AUTH", f"Comprobante autorizado por ARCA. CAE: {doc.cae}", current_user=current_user)
        
        db.commit()
        db.refresh(doc)
        return {"ok": True, "cae": doc.cae, "vencimiento": doc.cae_due_date, "status": doc.afip_status}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error en comunicación con ARCA: {str(e)}")

@router.get("/entities/{entity_id}/calculate-perceptions")
def calculate_entity_perceptions(entity_id: str, net_amount: float, db: Session = Depends(get_db)):
    """
    Calcula las percepciones automáticas para una entidad dado un monto neto.
    Se usa desde el frontend al armar el comprobante.
    """
    from app.modules.accounting.perception_service import PerceptionService
    results = PerceptionService.calculate_perceptions(db, entity_id, net_amount)
    return results

@router.get("/entities/{entity_id}/commissions/history", response_model=List[document_schemas.CommissionPaymentDetailResponse])
def get_entity_commissions_history(entity_id: str, db: Session = Depends(get_db)):
    # Buscar liquidaciones de comisiones
    # Intentamos por ID del vendedor
    query = db.query(models.CommissionPayment).options(
        joinedload(models.CommissionPayment.document),
        joinedload(models.CommissionPayment.source_document),
        joinedload(models.CommissionPayment.salesperson)
    )
    
    # Intentar encontrar por UUID
    comms = query.filter(models.CommissionPayment.salesperson_id == entity_id).order_by(models.CommissionPayment.date.desc()).limit(100).all()
    
    # Si no hay nada y el entity_id dado no parece un UUID, intentar por nombre
    if not comms and not ("-" in entity_id):
        ent = db.query(models.Entity).filter(models.Entity.name == entity_id).first()
        if ent:
            comms = query.filter(models.CommissionPayment.salesperson_id == ent.id).order_by(models.CommissionPayment.date.desc()).limit(100).all()
    
    results = []
    for c in comms:
        try:
            # Info del documento destino (Factura o Remito)
            doc_num = "S/D"
            doc_type = None
            if c.document:
                doc_num = c.document.number
                doc_type = c.document.doc_type
            elif c.delivery_note_id:
                # Cargar remito si no hay documento fiscal
                dn = db.query(DeliveryNote).filter(DeliveryNote.id == c.delivery_note_id).first()
                if dn:
                    doc_num = dn.number
                    doc_type = "DELIVERY_NOTE"

            res = document_schemas.CommissionPaymentDetailResponse(
                id=c.id,
                document_id=c.document_id,
                source_document_id=c.source_document_id,
                salesperson_id=c.salesperson_id,
                date=c.date,
                amount_usd=c.amount_usd,
                exchange_rate=c.exchange_rate,
                amount_ars=c.amount_ars,
                notes=c.notes,
                created_at=c.created_at or c.date,
                doc_number=doc_num,
                doc_type=doc_type,
                source_doc_number=c.source_document.number if c.source_document else "Manual/Pago",
                source_doc_type=c.source_document.doc_type if c.source_document else None,
                salesperson_name=c.salesperson.name if c.salesperson else "S/D"
            )
            results.append(res)
        except Exception as e:
            logger.error(f"Error validating comm history item {c.id}: {e}")
            continue
            
    return results

@router.delete("/commissions/{id}")
def delete_commission_payment(id: str, db: Session = Depends(get_db)):
    comm = db.query(models.CommissionPayment).filter(models.CommissionPayment.id == id).first()
    if not comm:
        raise HTTPException(status_code=404, detail="Liquidación no encontrada")
    
    source_doc_id = comm.source_document_id # El Pago/Recibo
    target_doc_id = comm.document_id # La Factura/ND
    
    db.delete(comm)
    db.flush()
    
    # 1. Recalcular estado del Pago/Recibo
    if source_doc_id:
        source_doc = db.query(models.Document).filter(models.Document.id == source_doc_id).first()
        if source_doc:
            _recalc_document_status(source_doc, db)
    
    # 2. Recalcular saldo de comisión en la factura destino
    if target_doc_id:
        target_doc = db.query(models.Document).filter(models.Document.id == target_doc_id).first()
        if target_doc:
            _recalc_document_commission(target_doc, db)
    
    db.commit()
    return {"ok": True}
@router.post("/adjust-link")
def adjust_link(req: LinkAdjustmentRequest, db: Session = Depends(get_db)):
    # 1. Buscar línea de factura (DocumentLine)
    doc_line = db.query(models.DocumentLine).filter(models.DocumentLine.id == req.line_id).first()
    if not doc_line:
        raise HTTPException(status_code=404, detail="Línea de factura no encontrada")
    
    # 2. Buscar línea de OV
    from app.db.models.commercial_models import SalesOrderLine
    ov_line = db.query(SalesOrderLine).filter(SalesOrderLine.id == req.source_sales_line_id).first()
    if not ov_line:
        doc_line.source_sales_line_id = None
        db.commit()
        return {"status": "unlinked_orphan"}

    from decimal import Decimal
    old_qty = Decimal(str(doc_line.qty))
    new_qty = Decimal(str(req.new_qty))
    
    if new_qty == old_qty:
        return {"status": "no_change"}
    
    # 3. Lógica de "Descruzar" preservando la factura
    if new_qty <= 0:
        # Descruzar TODO: La factura mantiene su cantidad original, pero ya no resta a la OV
        doc_line.source_sales_line_id = None
        ov_line.qty_invoiced = Decimal(str(ov_line.qty_invoiced or 0)) - old_qty
    
    elif new_qty < old_qty:
        # Descruzar PARCIAL: Dividimos la línea en dos
        remainder_qty = old_qty - new_qty
        
        # Línea A (Nueva, sin vínculo)
        new_unlinked_line = models.DocumentLine(
            document_id=doc_line.document_id,
            product_id=doc_line.product_id,
            description=doc_line.description,
            qty=remainder_qty,
            unit_price=doc_line.unit_price,
            discount_pct=doc_line.discount_pct,
            vat_rate=doc_line.vat_rate,
            net_amount=(doc_line.net_amount / old_qty) * remainder_qty,
            vat_amount=(doc_line.vat_amount / old_qty) * remainder_qty,
            total_amount=(doc_line.total_amount / old_qty) * remainder_qty,
            line_order=doc_line.line_order + 1,
            source_sales_line_id=None
        )
        db.add(new_unlinked_line)
        
        # Línea B (Original, vinculada): Reflejamos la parte que queda cruzada
        doc_line.qty = new_qty
        doc_line.net_amount = (doc_line.net_amount / old_qty) * new_qty
        doc_line.vat_amount = (doc_line.vat_amount / old_qty) * new_qty
        doc_line.total_amount = (doc_line.total_amount / old_qty) * new_qty
        
        # Actualizar OV
        ov_line.qty_invoiced = Decimal(str(ov_line.qty_invoiced or 0)) - remainder_qty
    
    else:
        # Incrementar no permitido aquí
        raise HTTPException(status_code=400, detail="No se puede aumentar la cantidad desde el gestor de vínculos")
    
    db.commit()
    
    # Recalcular estados de OV
    from app.modules.sales.sales_order_router import _recalc_status
    _recalc_status(db, ov_line.order_id)
    db.commit()
    
    return {"status": "ok"}


# ═══════════════════════════════════════════
# PATCH LINE (Actualizar campo de línea individualmente)
# ═══════════════════════════════════════════
class DocumentLinePatch(BaseModel):
    unit_cost: Optional[float] = None
    unit_price: Optional[float] = None
    discount_pct: Optional[float] = None

@router.patch("/{doc_id}/lines/{line_id}", dependencies=[Depends(check_permission("accounting_documents", "edit"))])
def patch_document_line(
    doc_id: str,
    line_id: str,
    data: DocumentLinePatch,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Actualiza campos individuales de una línea de Factura/Documento (ej: unit_cost).
    Permite editar datos de gestión interna incluso en documentos procesados.
    """
    line = db.query(models.DocumentLine).filter(
        models.DocumentLine.id == line_id,
        models.DocumentLine.document_id == doc_id
    ).first()

    if not line:
        raise HTTPException(status_code=404, detail="Línea de documento no encontrada")

    updated = False
    if data.unit_cost is not None:
        line.unit_cost = data.unit_cost
        updated = True

    if data.unit_price is not None:
        line.unit_price = data.unit_price
        updated = True

    if data.discount_pct is not None:
        line.discount_pct = data.discount_pct
        updated = True

    if updated:
        # Recalcular totales si es necesario (normalmente unit_cost no afecta el total facturado, solo el margen)
        db.commit()
        _log_history(
            db, doc_id, "EDICION_LINEA",
            f"Línea actualizada: unit_cost={data.unit_cost}",
            current_user=current_user
        )
        db.commit()

    return {"ok": True, "line_id": line_id}

