from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Dict, Any
from datetime import datetime
from app.db.session import get_db
from app.db.models import models
from app.db import commercial_models
from app.db.models.models import Document, Entity, DocumentStatus, DocumentType, DocumentLine, CommissionPayment
from app.db.models.commercial_models import DeliveryNoteStatus, OrderStatus, DeliveryNote, SalesOrder, InvoiceDeliveryNoteLink, SalesOrderLine, DeliveryNoteLine
from pydantic import BaseModel

from app.modules.auth.auth_router import check_permission
router = APIRouter(prefix="/commissions", tags=["Commissions"])

def _get_doc_line_cost(db: Session, line: DocumentLine) -> float:
    """Helper to follow the chain back to SalesOrderLine for cost if missing."""
    if float(getattr(line, 'total_cost', 0) or 0) > 0:
        return float(line.total_cost)
    
    # Try via DeliveryNoteLine
    dn_line_id = getattr(line, 'source_dn_line_id', None)
    if dn_line_id:
        from app.db.models.commercial_models import DeliveryNoteLine, SalesOrderLine
        dnl = db.query(DeliveryNoteLine).filter(DeliveryNoteLine.id == dn_line_id).first()
        if dnl:
            if float(getattr(dnl, 'total_cost', 0) or 0) > 0:
                return float(dnl.total_cost)
            # Try via SalesOrderLine
            ov_line_id = getattr(dnl, 'source_sales_line_id', None)
            if ov_line_id:
                sol = db.query(SalesOrderLine).filter(SalesOrderLine.id == ov_line_id).first()
                if sol:
                    return float(sol.unit_cost or 0) * float(line.qty or 0)
    
    # Fallback: if no direct line link, try to find ANY linked DN and match by product or description
    from app.db.models.commercial_models import InvoiceDeliveryNoteLink, DeliveryNote, SalesOrderLine
    
    # 1. Direct links via link table
    links = db.query(InvoiceDeliveryNoteLink).filter(InvoiceDeliveryNoteLink.document_id == line.document_id).all()
    ov_ids = set()
    for lnk in links:
        dn = db.query(DeliveryNote).filter(DeliveryNote.id == lnk.delivery_note_id).first()
        if dn and dn.sales_order_id:
            ov_ids.add(dn.sales_order_id)
    
    # 2. Heuristic: if no links, find any DN that has this doc number in notes/ref (secondary link)
    if not ov_ids:
        doc = db.query(Document).filter(Document.id == line.document_id).first()
        doc_ref = getattr(doc, 'origin_reference', None) or getattr(doc, 'notes', None)
        if doc and doc_ref and doc_ref.strip():
            dns_with_ref = db.query(DeliveryNote).filter(DeliveryNote.number == doc_ref).all() # Try direct ref
            for dn in dns_with_ref:
                if dn.sales_order_id: ov_ids.add(dn.sales_order_id)

    # Search in all found OVs
    for ov_id in ov_ids:
        sol_query = db.query(SalesOrderLine).filter(SalesOrderLine.order_id == ov_id)
        if line.product_id:
            sol = sol_query.filter(SalesOrderLine.product_id == line.product_id).first()
        else:
            sol = sol_query.filter(func.lower(SalesOrderLine.description) == func.lower(line.description)).first()
        
        if sol:
            return float(sol.unit_cost or 0) * float(line.qty or 0)
                    
    return 0.0

def _get_dn_line_cost(db: Session, line: DeliveryNoteLine) -> float:
    """Helper to find cost for a delivery note line."""
    if float(getattr(line, 'total_cost', 0) or 0) > 0:
        return float(line.total_cost)
    
    # Try via SalesOrderLine
    from app.db.models.commercial_models import SalesOrderLine
    ov_line_id = getattr(line, 'source_sales_line_id', None)
    if ov_line_id:
        sol = db.query(SalesOrderLine).filter(SalesOrderLine.id == ov_line_id).first()
        if sol:
            return float(sol.unit_cost or 0) * float(line.qty or 0)
    return 0.0

@router.get("/debug", dependencies=[Depends(check_permission("users", "edit"))])
def debug_commissions(db: Session = Depends(get_db)):
    """Endpoint de diagnóstico - muestra cuántos registros hay por categoría"""
    from sqlalchemy import distinct
    
    total_docs = db.query(Document).count()
    docs_with_sp = db.query(Document).filter(
        (Document.salesperson_id != None) | (Document.vendedor != None)
    ).count()
    docs_invoice = db.query(Document).filter(
        Document.doc_type.in_([DocumentType.INVOICE, DocumentType.DEBIT_NOTE])
    ).count()
    
    doc_types = [row[0] for row in db.query(distinct(Document.doc_type)).all()]
    doc_statuses = [row[0] for row in db.query(distinct(Document.status)).all()]
    
    total_dns = db.query(DeliveryNote).count()
    dns_with_sp = db.query(DeliveryNote).filter(
        (DeliveryNote.salesperson_id != None) | (DeliveryNote.vendedor != None)
    ).count()
    dn_statuses = [row[0] for row in db.query(distinct(commercial_models.DeliveryNote.status)).all()]
    
    total_ovs = db.query(commercial_models.SalesOrder).count()
    ovs_with_sp = db.query(commercial_models.SalesOrder).filter(
        (commercial_models.SalesOrder.salesperson_id != None) | (commercial_models.SalesOrder.vendedor != None)
    ).count()
    ov_statuses = [row[0] for row in db.query(distinct(commercial_models.SalesOrder.status)).all()]

    return {
        "documents": {
            "total": total_docs,
            "with_salesperson": docs_with_sp,
            "invoice_type": docs_invoice,
            "doc_types_in_db": doc_types,
            "statuses_in_db": doc_statuses,
        },
        "delivery_notes": {
            "total": total_dns,
            "with_salesperson": dns_with_sp,
            "statuses_in_db": dn_statuses,
        },
        "sales_orders": {
            "total": total_ovs,
            "with_salesperson": ovs_with_sp,
            "statuses_in_db": ov_statuses,
        }
    }

class CommissionSummary(BaseModel):
    salesperson_name: str
    salesperson_id: str
    total_sales_net: float      # always in USD
    total_commission: float     # always in USD
    paid_commission: float      # always in USD
    pending_commission: float   # always in USD
    document_count: int
    primary_currency: str = "USD"

@router.get("/debug/{doc_number}", dependencies=[Depends(check_permission("users", "edit"))])
def debug_doc(doc_number: str, db: Session = Depends(get_db)):
    docs = db.query(Document).filter(Document.number.like(f"%{doc_number}%")).all()
    result = []
    for doc in docs:
        lines_info = [{"desc": l.description, "net": float(l.net_amount or 0), "total_cost": float(getattr(l, 'total_cost', 0) or 0)} for l in doc.lines]
        # Check linked DNs
        from app.db.models.commercial_models import InvoiceDeliveryNoteLink
        links = db.query(InvoiceDeliveryNoteLink).filter(InvoiceDeliveryNoteLink.document_id == doc.id).all()
        dn_info = []
        for lnk in links:
            dn = lnk.delivery_note
            if dn:
                dn_cost = float(getattr(dn, 'total_cost', 0) or 0)
                ov_cost = None
                if dn.sales_order_id and dn.sales_order:
                    ov_cost = float(getattr(dn.sales_order, 'total_cost', 0) or 0)
                dn_info.append({"dn_id": dn.id, "dn_total_cost": dn_cost, "ov_cost": ov_cost, "dn_currency": str(dn.currency)})
        
        # Simulate cost calculation
        cost_val = sum(float(getattr(l, 'total_cost', 0) or 0) for l in doc.lines)
        if cost_val == 0 and links:
            for lnk in links:
                dn2 = lnk.delivery_note
                if dn2 and float(getattr(dn2, 'total_cost', 0) or 0) > 0:
                    cost_val = float(dn2.total_cost); break
                elif dn2 and dn2.sales_order_id:
                    ov2 = dn2.sales_order
                    if ov2 and float(getattr(ov2, 'total_cost', 0) or 0) > 0:
                        cost_val = float(ov2.total_cost); break

        result.append({
            "id": doc.id, "number": doc.number, "doc_type": str(doc.doc_type),
            "currency": str(doc.currency), "exchange_rate": float(doc.exchange_rate or 1),
            "total_amount": float(doc.total_amount or 0),
            "commission_amount": float(doc.commission_amount or 0),
            "salesperson_id": doc.salesperson_id, "vendedor": doc.vendedor,
            "entity_id": doc.entity_id, "lines": lines_info,
            "linked_dns": dn_info, "resolved_cost_val": cost_val
        })
    payments = db.query(models.CommissionPayment).all()
    pay_info = [{"id": p.id, "sp_id": p.salesperson_id, "usd": p.amount_usd, "ars": p.amount_ars, "rate": p.exchange_rate} for p in payments]
    return {"documents": result, "commission_payments": pay_info}

@router.get("/summary", response_model=List[CommissionSummary])
def get_commission_summary_route(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    salesperson_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    try:
        # Convert strings to datetime if present
        dt_start = None
        if start_date and start_date.strip():
            dt_start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        
        dt_end = None
        if end_date and end_date.strip():
            dt_end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))

        return get_commission_summary(dt_start, dt_end, salesperson_id, db)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"COMMISSION SUMMARY ERROR:\n{tb}")
        raise HTTPException(status_code=500, detail=str(e) + "\n" + tb)

def get_commission_summary(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    salesperson_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Resumen consolidado basado en Órdenes de Venta."""
    from app.db.models.commercial_models import SalesOrder, OrderStatus, InvoiceDeliveryNoteLink
    from app.db.models.models import Document, DocumentType, DocumentStatus, DocumentLine, CommissionPayment, Entity
    from sqlalchemy import func
    from datetime import timedelta

    stats = {}

    # ── PASO 0: Cargar TODOS los vendedores activos primero ──────────────────
    # Así aparecen aunque no tengan ningún documento todavía.
    seller_query = db.query(Entity).filter(Entity.is_salesperson == True)
    if salesperson_id:
        seller_query = seller_query.filter(Entity.id == salesperson_id)
    active_sellers = seller_query.all()

    print(f"SELLERS FOUND: {[(s.id, s.name) for s in active_sellers]}")

    for seller in active_sellers:
        stats[seller.id] = {
            "name": seller.name,
            "net_usd": 0.0,
            "comm_usd": 0.0,
            "paid_usd": 0.0,
            "count": 0,
        }
    # ─────────────────────────────────────────────────────────────────────────

    # 1. Traer todas las OVs no canceladas (con filtro de fecha opcional)
    query_ov = db.query(SalesOrder).filter(SalesOrder.status != OrderStatus.CANCELLED)
    if start_date:
        query_ov = query_ov.filter(SalesOrder.date >= start_date)
    if end_date:
        query_ov = query_ov.filter(SalesOrder.date < end_date + timedelta(days=1))
    if salesperson_id:
        query_ov = query_ov.filter(SalesOrder.salesperson_id == salesperson_id)
    ovs = query_ov.all()

    def get_key(obj):
        if obj.salesperson_id: return obj.salesperson_id
        if obj.vendedor: return f"name_{obj.vendedor}"
        return None

    # Procesa OVs
    for ov in ovs:
        key = get_key(ov)
        if not key: continue

        if key not in stats:
            name = ov.vendedor or "S/D"
            if ov.salesperson: name = ov.salesperson.name
            elif not ov.vendedor and ov.salesperson_id:
                ent = db.query(Entity).filter(Entity.id == ov.salesperson_id).first()
                if ent: name = ent.name
            
            stats[key] = {
                "name": name,
                "net_usd": 0.0,
                "comm_usd": 0.0,
                "paid_usd": 0.0,
                "count": 0,
            }

        # Sumamos valores de la OV
        stats[key]["net_usd"] += float(ov.total_amount or 0)
        stats[key]["comm_usd"] += float(ov.commission_amount or 0)
        stats[key]["paid_usd"] += float(ov.commission_paid_amount or 0)
        stats[key]["count"] += 1

    # Procesa Facturas Directas (sin OV vinculada) para no omitir nada
    query_doc = db.query(Document).filter(
        Document.doc_type.in_([
            DocumentType.INVOICE, 
            DocumentType.DEBIT_NOTE, 
            DocumentType.FCE_MIPYME,
            DocumentType.LPG_PRIMARY,
            DocumentType.LPG_SECONDARY
        ]),
        Document.status != DocumentStatus.CANCELLED
    )
    if start_date: query_doc = query_doc.filter(Document.date >= start_date)
    if end_date: query_doc = query_doc.filter(Document.date < end_date + timedelta(days=1))
    if salesperson_id: query_doc = query_doc.filter(Document.salesperson_id == salesperson_id)

    docs = query_doc.all()
    for doc in docs:
        # Verificar si ya está cubierta por una OV
        has_ov = db.query(DocumentLine).filter(DocumentLine.document_id == doc.id, DocumentLine.source_sales_line_id != None).first() is not None
        if not has_ov:
            has_ov = db.query(InvoiceDeliveryNoteLink).filter(InvoiceDeliveryNoteLink.document_id == doc.id).first() is not None
        
        if has_ov: continue # Ya contada vía OV

        key = get_key(doc)
        if not key: continue

        if key not in stats:
            name = doc.vendedor or "S/D"
            if doc.salesperson: name = doc.salesperson.name
            stats[key] = {
                "name": name, "net_usd": 0.0, "comm_usd": 0.0, "paid_usd": 0.0, "count": 0
            }
        
        stats[key]["net_usd"] += float(doc.total_amount_ars or 0) / float(doc.exchange_rate or 1.0) if doc.currency != "USD" else float(doc.total_amount or 0)
        stats[key]["comm_usd"] += float(doc.commission_amount or 0)
        stats[key]["paid_usd"] += float(doc.commission_paid_amount or 0)
        stats[key]["count"] += 1

    # 2. Agregar pagos "sueltos" (que no están vinculados a documentos específicos)
    from sqlalchemy.exc import OperationalError
    from sqlalchemy import text
    for key, v in stats.items():
        if key.startswith("name_"): continue
        
        try:
            standalone_paid = db.query(func.sum(CommissionPayment.amount_usd)).filter(
                CommissionPayment.salesperson_id == key,
                CommissionPayment.document_id == None,
                CommissionPayment.delivery_note_id == None,
                CommissionPayment.sales_order_id == None
            ).scalar() or 0.0
        except Exception:
            db.rollback()
            standalone_paid = db.execute(text(
                "SELECT sum(amount_usd) FROM commission_payments "
                "WHERE salesperson_id = :sp_id AND document_id IS NULL AND delivery_note_id IS NULL"
            ), {"sp_id": str(key)}).scalar() or 0.0
        
        v["paid_usd"] += float(standalone_paid)

    # 3. Formatear respuesta final
    result = [
        CommissionSummary(
            salesperson_id=str(sid),
            salesperson_name=v["name"],
            total_sales_net=round(v["net_usd"], 2),
            total_commission=round(v["comm_usd"], 2),
            paid_commission=round(v["paid_usd"], 2),
            pending_commission=round(max(0.0, v["comm_usd"] - v["paid_usd"]), 2),
            document_count=v["count"],
            primary_currency="USD"
        ) for sid, v in stats.items()
    ]
    print(f"COMMISSION ROWS: {[(r.salesperson_name, r.total_commission, r.document_count) for r in result]}")
    return result




class CommissionOrderDetail(BaseModel):
    sales_order_id: str
    sales_order_number: str
    date: datetime
    customer_name: str
    total_amount: float         # Bruto de la OV
    commission_amount: float      # Comisión total pactada
    commission_paid_amount: float # Cuánto se le pagó ya al vendedor
    commission_pending: float    # Cuánto falta pagarle
    customer_paid_pct: float     # 0-100 (cuánto pagó el cliente de sus facturas)
    is_customer_paid: bool       # True si el cliente ya pagó todo
    customer_payment_ref: str = "" # Referencia de pago CLIENTE (Recibo del cliente)
    commission_payment_ref: str = "" # Referencia de pago AL VENDEDOR (OP interna)
    commission_payment_id: str = ""  # ID del documento de pago interno
    status: str                  # Estado de la OV (COMPLETED, etc)
    currency: str = "USD"

class CommissionOrderResponse(BaseModel):
    pending: List[CommissionOrderDetail]
    paid: List[CommissionOrderDetail]

@router.get("/detail/{salesperson_id}", response_model=CommissionOrderResponse)
def get_commission_detail(
    salesperson_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    dt_start = None
    if start_date and start_date.strip():
        dt_start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
    
    dt_end = None
    if end_date and end_date.strip():
        dt_end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))

    from app.db.models.commercial_models import SalesOrder, DeliveryNote, InvoiceDeliveryNoteLink, OrderStatus
    from app.db.models.models import Document, DocumentStatus, DocumentType, DocumentLine
    from sqlalchemy.orm import joinedload

    def to_usd(val, currency, rate):
        curr_str = str(currency).upper()
        if "USD" in curr_str: return float(val)
        return float(val) / float(rate or 1.0)

    # 1. Identificar al vendedor (ID o Nombre Virtual)
    is_virtual = salesperson_id.startswith("name_")
    sp_name = salesperson_id.replace("name_", "") if is_virtual else None
    
    if not is_virtual:
        sp_entity = db.query(models.Entity).filter(models.Entity.id == salesperson_id).first()
        if sp_entity: sp_name = sp_entity.name

    # 2. Consultar Órdenes de Venta (OV)
    query_ov = db.query(SalesOrder).options(
        joinedload(SalesOrder.entity),
        joinedload(SalesOrder.delivery_notes).joinedload(DeliveryNote.invoices).joinedload(InvoiceDeliveryNoteLink.document)
    ).filter(SalesOrder.status != OrderStatus.CANCELLED)
    
    if is_virtual:
        query_ov = query_ov.filter((SalesOrder.vendedor == sp_name) & (SalesOrder.salesperson_id == None))
    else:
        query_ov = query_ov.filter((SalesOrder.salesperson_id == salesperson_id) | 
                                   ((SalesOrder.salesperson_id == None) & (SalesOrder.vendedor == sp_name)))

    if dt_start:
        query_ov = query_ov.filter(SalesOrder.date >= dt_start)
    if dt_end:
        from datetime import timedelta
        query_ov = query_ov.filter(SalesOrder.date < dt_end + timedelta(days=1))

    orders = query_ov.order_by(SalesOrder.date.desc()).all()
    
    # 2.5 Consultar Facturas Directas (sin OV vinculada)
    query_direct_docs = db.query(Document).filter(
        Document.doc_type.in_([DocumentType.INVOICE, DocumentType.DEBIT_NOTE, DocumentType.FCE_MIPYME]),
        Document.status != DocumentStatus.CANCELLED
    )
    if is_virtual:
        query_direct_docs = query_direct_docs.filter((Document.vendedor == sp_name) & (Document.salesperson_id == None))
    else:
        query_direct_docs = query_direct_docs.filter((Document.salesperson_id == salesperson_id) | 
                                                     ((Document.salesperson_id == None) & (Document.vendedor == sp_name)))
    
    if dt_start: query_direct_docs = query_direct_docs.filter(Document.date >= dt_start)
    if dt_end: query_direct_docs = query_direct_docs.filter(Document.date < dt_end + timedelta(days=1))
    
    direct_docs = query_direct_docs.all()

    pending_list = []
    paid_list = []

    for ov in orders:
        total_comm = float(ov.commission_amount or 0)
        
        # --- Lazy Healing for UI display ---
        if total_comm == 0 and db:
            from .sales_order_router import _recalc_total as _force_recalc
            _force_recalc(ov, db)
            db.commit()
            total_comm = float(ov.commission_amount or 0)

        # 3. Calcular Cobro al Cliente (Consolidado de Facturas)
        total_customer_due = 0.0
        total_customer_paid = 0.0
        
        seen_docs = set()
        receipts = set()
        for dn in ov.delivery_notes:
            for lnk in dn.invoices:
                doc = lnk.document
                if doc and doc.id not in seen_docs and doc.status != DocumentStatus.CANCELLED:
                    total_customer_due += float(doc.total_amount or 0)
                    total_customer_paid += float(doc.allocated_amount or 0)
                    seen_docs.add(doc.id)
                    for app in doc.applied_by:
                        if app.from_document and app.from_document.status != DocumentStatus.CANCELLED:
                            receipts.add(app.from_document.number)

        paid_pct = 0.0
        if total_customer_due > 0:
            paid_pct = min(100.0, round((total_customer_paid / total_customer_due) * 100, 1))
        elif ov.status == OrderStatus.COMPLETED or ov.status == OrderStatus.INVOICED:
            # Fallback para órdenes marcadas como completas sin trazabilidad de factura
            paid_pct = 100.0

        is_customer_paid = paid_pct >= 99.9

        # 4. Datos del pago de comisión de la empresa al vendedor
        comm_payment = db.query(models.CommissionPayment).filter(
            models.CommissionPayment.sales_order_id == ov.id
        ).first()
        
        comp_payment_ref = ""
        comp_payment_id = ""
        if comm_payment and comm_payment.source_document:
            comp_payment_ref = comm_payment.source_document.number
            comp_payment_id = comm_payment.source_document_id

        # 5. Crear registro consolidated
        comm_paid = float(ov.commission_paid_amount or 0)
        item = CommissionOrderDetail(
            sales_order_id=ov.id,
            sales_order_number=ov.number,
            date=ov.date,
            customer_name=ov.entity.name if ov.entity else "S/D",
            total_amount=float(ov.total_amount or 0),
            commission_amount=total_comm,
            commission_paid_amount=comm_paid,
            commission_pending=max(0.0, total_comm - comm_paid),
            customer_paid_pct=paid_pct,
            is_customer_paid=is_customer_paid,
            customer_payment_ref=", ".join(receipts) if receipts else "",
            commission_payment_ref=comp_payment_ref,
            commission_payment_id=comp_payment_id,
            status=ov.status.value if hasattr(ov.status, 'value') else str(ov.status),
            currency="USD"
        )

        # 5. Clasificar en las dos tablas del usuario
        if ov.commission_paid or (total_comm - comm_paid) < 0.01:
            paid_list.append(item)
        else:
            pending_list.append(item)

    # 6. Procesar Facturas Directas
    for doc in direct_docs:
        # Check if already linked to some OV/DN to avoid double record
        has_link = db.query(DocumentLine).filter(DocumentLine.document_id == doc.id, DocumentLine.source_sales_line_id != None).first() is not None
        if not has_link:
            has_link = db.query(InvoiceDeliveryNoteLink).filter(InvoiceDeliveryNoteLink.document_id == doc.id).first() is not None
        if has_link: continue

        total_comm = float(doc.commission_amount or 0)
        if total_comm == 0 and db:
            from app.modules.accounting.document_router import _recalc_document_commission
            _recalc_document_commission(doc, db)
            db.commit()
            total_comm = float(doc.commission_amount or 0)
            
        comm_paid = float(doc.commission_paid_amount or 0)
        
        receipts = set()
        for app in doc.applied_by:
            if app.from_document and app.from_document.status != DocumentStatus.CANCELLED:
                receipts.add(app.from_document.number)
        
        # Monto USD de la factura
        total_usd = float(doc.total_amount_ars or 0) / float(doc.exchange_rate or 1.0) if doc.currency != "USD" else float(doc.total_amount or 0)
        # Cobro (allocated_amount ya está en moneda del documento)
        allocated_usd = float(doc.allocated_amount or 0)
        if doc.currency != "USD":
            allocated_usd = allocated_usd / float(doc.exchange_rate or 1.0)
            
        paid_pct = min(100.0, round((allocated_usd / total_usd * 100), 1)) if total_usd > 0 else 100.0
        
        # 3. Datos del pago de comisión de la empresa al vendedor
        comm_payment = db.query(models.CommissionPayment).filter(
            models.CommissionPayment.document_id == doc.id
        ).first()
        
        comp_payment_ref = ""
        comp_payment_id = ""
        if comm_payment and comm_payment.source_document:
            comp_payment_ref = comm_payment.source_document.number
            comp_payment_id = comm_payment.source_document_id

        item = CommissionOrderDetail(
            sales_order_id=doc.id,
            sales_order_number=f"{doc.doc_type.name} {doc.number}",
            date=doc.date,
            customer_name=doc.entity_name if doc.entity_name else doc.entity.name if doc.entity else "S/D",
            total_amount=total_usd,
            commission_amount=total_comm,
            commission_paid_amount=comm_paid,
            commission_pending=max(0.0, total_comm - comm_paid),
            customer_paid_pct=paid_pct,
            is_customer_paid=paid_pct >= 99.9,
            customer_payment_ref=", ".join(receipts) if receipts else "",
            commission_payment_ref=comp_payment_ref,
            commission_payment_id=comp_payment_id,
            status=doc.status.name if hasattr(doc.status, 'name') else str(doc.status),
            currency="USD"
        )
        
        if doc.commission_paid or (total_comm - comm_paid) < 0.01:
            paid_list.append(item)
        else:
            pending_list.append(item)

    return CommissionOrderResponse(
        pending=pending_list,
        paid=paid_list
    )

class CommissionPaymentMethod(BaseModel):
    type: str # CASH, CHECK, TRANSFER, etc
    amount: float
    description: Optional[str] = None
    bank_name: Optional[str] = None
    reference_number: Optional[str] = None
    due_date: Optional[datetime] = None

class PayCommissionRequest(BaseModel):
    amount: float            # in USD
    exchange_rate: float     # TC
    amount_ars: float        # in Pesos
    notes: Optional[str] = None
    payments: Optional[List[CommissionPaymentMethod]] = None

class MassPayCommissionRequest(BaseModel):
    salesperson_id: str
    amount_ars: float
    exchange_rate: float
    notes: Optional[str] = None
    allocations: List[Dict[str, Any]]
    payments: Optional[List[CommissionPaymentMethod]] = None

@router.post("/pay/{doc_id}", dependencies=[Depends(check_permission("payments", "create"))])
def pay_commission(doc_id: str, data: PayCommissionRequest, db: Session = Depends(get_db)):
    # 1. Registrar el pago en la tabla de pagos para el ledger (Excel)
    # Buscamos quién es el vendedor
    sp_id = None
    
    # Try finding in Document
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if doc:
        sp_id = doc.salesperson_id
        doc.commission_paid_amount = (doc.commission_paid_amount or 0) + data.amount
        if doc.commission_paid_amount >= (doc.commission_amount or 0):
            doc.commission_paid = True
        doc.commission_payment_date = datetime.now()
    else:
        # Try finding in DeliveryNote
        dn = db.query(commercial_models.DeliveryNote).filter(commercial_models.DeliveryNote.id == doc_id).first()
        if dn:
            sp_id = dn.salesperson_id
            dn.commission_paid_amount = (float(dn.commission_paid_amount or 0)) + data.amount
            if float(dn.commission_paid_amount or 0) >= float(dn.commission_amount or 0):
                dn.commission_paid = True
            dn.commission_payment_date = datetime.now()
        else:
            # Try finding in SalesOrder
            ov = db.query(commercial_models.SalesOrder).filter(commercial_models.SalesOrder.id == doc_id).first()
            if ov:
                sp_id = ov.salesperson_id
                ov.commission_paid_amount = (float(ov.commission_paid_amount or 0)) + data.amount
                if float(ov.commission_paid_amount or 0) >= float(ov.commission_amount or 0):
                    ov.commission_paid = True
                ov.commission_payment_date = datetime.now()
    
    if not sp_id:
        raise HTTPException(status_code=404, detail="Comprobante no encontrado o sin vendedor")

    # 2. Si vienen medios de pago, creamos un Document de tipo PAYMENT "formal"
    payment_doc_id = None
    if data.payments:
        # Creamos la cabecera del pago
        formal_pay = models.Document(
            entity_id=sp_id,
            doc_type=models.DocumentType.PAYMENT,
            number=f"OP-COMM-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            date=datetime.now(),
            total_amount=data.amount_ars,
            currency=models.CurrencyType.ARS,
            exchange_rate=data.exchange_rate,
            notes=data.notes or f"Pago de comisión sobre {doc_id}",
            status=models.DocumentStatus.CLOSED
        )
        db.add(formal_pay)
        db.flush() # for ID
        payment_doc_id = formal_pay.id
        
        # Agregamos los ítems de pago (medios de pago)
        for pm in data.payments:
            p_item = models.PaymentItem(
                document_id=payment_doc_id,
                type=pm.type,
                amount=pm.amount,
                description=pm.description,
                bank_name=pm.bank_name,
                reference_number=pm.reference_number,
                due_date=pm.due_date
            )
            db.add(p_item)

    # 3. Guardar el registro de pago individual de comisión
    new_pay = models.CommissionPayment(
        document_id=doc_id if doc else None,
        delivery_note_id=doc_id if dn else None,
        sales_order_id=doc_id if ov else None, # <- Nuestro nuevo campo
        source_document_id=payment_doc_id, # Link it to the formal document if created
        salesperson_id=sp_id,
        amount_usd=data.amount,
        exchange_rate=data.exchange_rate,
        amount_ars=data.amount_ars,
        notes=data.notes,
        date=datetime.now()
    )
    db.add(new_pay)
    db.commit()
    return {"ok": True}

@router.post("/sync-all")
def sync_all_commissions(db: Session = Depends(get_db)):
    """
    Recalcula comisiones para todos los comprobantes que no estén pagados.
    Útil después de migraciones o cambios en las alícuotas del vendedor.
    """
    from app.modules.accounting.document_router import _recalc_document_commission
    from .delivery_note_router import _recalc_dn_commission
    from .sales_order_router import _recalc_total as _recalc_ov
    
    # 1. Facturas
    docs = db.query(models.Document).filter(
        models.Document.doc_type.in_([models.DocumentType.INVOICE, models.DocumentType.DEBIT_NOTE, models.DocumentType.CREDIT_NOTE]),
        models.Document.commission_paid == False
    ).all()
    for d in docs:
        _recalc_document_commission(d, db)
        
    # 2. Remitos
    dns = db.query(commercial_models.DeliveryNote).filter(
        commercial_models.DeliveryNote.commission_paid == False
    ).all()
    for dn in dns:
        _recalc_dn_commission(dn, db)
        
    # 3. OVs (con autocuración de trazabilidad y comisiones)
    from .sales_utils import sync_sales_order_traceability
    ovs = db.query(commercial_models.SalesOrder).filter(
        commercial_models.SalesOrder.status != OrderStatus.CANCELLED
    ).all()
    for ov in ovs:
        # Esto repara trazabilidad Y comisiones propagándolas a DNs y Facturas
        sync_sales_order_traceability(db, ov)
        _recalc_ov(ov, db)
        
    # 4. Actualizar estado de los pagos asignados
    cps = db.query(models.CommissionPayment).filter(models.CommissionPayment.source_document_id != None).all()
    doc_amounts = {}
    for cp in cps:
        doc_amounts[cp.source_document_id] = doc_amounts.get(cp.source_document_id, 0.0) + float(cp.amount_usd)

    for doc_id, amount_usd in doc_amounts.items():
        doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
        if doc:
            rate = float(doc.exchange_rate or 1.0)
            doc.allocated_amount = amount_usd if str(doc.currency).upper() == 'USD' else amount_usd * rate
            if doc.allocated_amount >= float(doc.total_amount or 0.0) - 0.01:
                doc.status = DocumentStatus.CLOSED
        
    db.commit()
    return {"ok": True, "counts": {"documents": len(docs), "delivery_notes": len(dns), "sales_orders": len(ovs)}}

@router.post("/mass-pay")
def mass_pay_commission(data: MassPayCommissionRequest, db: Session = Depends(get_db)):
    """
    Registra una liquidación masiva de comisiones para un vendedor.
    """
    sp_id = data.salesperson_id
    
    # 1. Crear Documento formal de Pago
    formal_pay = models.Document(
        entity_id=sp_id,
        doc_type=models.DocumentType.PAYMENT,
        number=f"OP-COMM-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        date=datetime.utcnow(),
        total_amount=data.amount_ars,
        currency=models.CurrencyType.ARS,
        exchange_rate=data.exchange_rate,
        notes=data.notes or f"Liquidación masiva de comisiones",
        status=models.DocumentStatus.CLOSED
    )
    db.add(formal_pay); db.flush()
    
    if data.payments:
        for pm in data.payments:
            db.add(models.PaymentItem(
                document_id=formal_pay.id,
                type=pm.type,
                amount=pm.amount,
                description=pm.description,
                bank_name=pm.bank_name,
                reference_number=pm.reference_number,
                due_date=pm.due_date
            ))

    # 2. Procesar asignaciones
    for alloc in data.allocations:
        doc_id = alloc.get("doc_id")
        amt_usd = float(alloc.get("amount") or 0)
        label = alloc.get("label") or "Comprobante"
        
        found = False
        doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
        if doc:
            doc.commission_paid_amount = (doc.commission_paid_amount or 0) + amt_usd
            if doc.commission_paid_amount >= (doc.commission_amount or 0):
                doc.commission_paid = True
            doc.commission_payment_date = datetime.now()
            found = True
        else:
            dn = db.query(commercial_models.DeliveryNote).filter(commercial_models.DeliveryNote.id == doc_id).first()
            if dn:
                dn.commission_paid_amount = float(dn.commission_paid_amount or 0) + amt_usd
                if float(dn.commission_paid_amount or 0) >= float(dn.commission_amount or 0):
                    dn.commission_paid = True
                dn.commission_payment_date = datetime.now()
                found = True
        
        if found:
            db.add(models.CommissionPayment(
                document_id=doc_id if doc else None,
                delivery_note_id=doc_id if not doc else None,
                source_document_id=formal_pay.id,
                salesperson_id=sp_id,
                amount_usd=amt_usd,
                exchange_rate=data.exchange_rate,
                amount_ars=amt_usd * data.exchange_rate,
                notes=f"Liquidación sobre {label}",
                date=datetime.now()
            ))

    db.commit()
    return {"ok": True, "payment_id": formal_pay.id}

class CommissionApplyRequest(BaseModel):
    payment_doc_id: str
    target_doc_id: str
    amount_usd: float

@router.post("/apply-payment")
def apply_commission_payment(data: CommissionApplyRequest, db: Session = Depends(get_db)):
    """
    Vincula un pago de documento (OP/RE) ya existente con una fila de comisión (FA/RM/OV).
    """
    amount = float(data.amount_usd)
    
    # 1. Buscar el comprobante destino (Factura, Remito u Orden de Venta)
    doc = db.query(models.Document).filter(models.Document.id == data.target_doc_id).first()
    dn = None
    ov = None
    
    sp_id = None
    if doc:
        sp_id = doc.salesperson_id
        doc.commission_paid_amount = (float(doc.commission_paid_amount or 0)) + amount
        if doc.commission_paid_amount >= (float(doc.commission_amount or 0)) - 0.01:
            doc.commission_paid = True
        doc.commission_payment_date = datetime.now()
    else:
        dn = db.query(commercial_models.DeliveryNote).filter(commercial_models.DeliveryNote.id == data.target_doc_id).first()
        if dn:
            sp_id = dn.salesperson_id
            dn.commission_paid_amount = (float(dn.commission_paid_amount or 0)) + amount
            if float(dn.commission_paid_amount or 0) >= float(dn.commission_amount or 0) - 0.01:
                dn.commission_paid = True
            dn.commission_payment_date = datetime.now()
        else:
            ov = db.query(commercial_models.SalesOrder).filter(commercial_models.SalesOrder.id == data.target_doc_id).first()
            if ov:
                sp_id = ov.salesperson_id
                ov.commission_paid_amount = (float(ov.commission_paid_amount or 0)) + amount
                if float(ov.commission_paid_amount or 0) >= float(ov.commission_amount or 0) - 0.01:
                    ov.commission_paid = True
                ov.commission_payment_date = datetime.now()

    if not sp_id:
        raise HTTPException(status_code=404, detail="Comprobante destino no encontrado")

    # 2. Registrar el hito de pago para que aparezca en el ledger
    # Usamos la ID del pago de origen en las notas para trazabilidad
    pay_doc = db.query(models.Document).filter(models.Document.id == data.payment_doc_id).first()
    pay_num = pay_doc.number if pay_doc else "Pago"
    
    if pay_doc:
        doc_currency = str(pay_doc.currency).upper() if pay_doc.currency else "USD"
        rate = float(pay_doc.exchange_rate or 1.0)
        applied_in_doc_curr = amount if doc_currency == "USD" else amount * rate
        
        current_alloc = float(pay_doc.allocated_amount or 0.0)
        new_alloc = current_alloc + applied_in_doc_curr
        pay_doc.allocated_amount = new_alloc
        
        # Consideramos cerrado si se asignó la totalidad (con pequeño margen de error flotante)
        if new_alloc >= float(pay_doc.total_amount or 0.0) - 0.01:
            pay_doc.status = models.DocumentStatus.CLOSED
    
    new_cp = models.CommissionPayment(
        document_id=data.target_doc_id if doc else None,
        delivery_note_id=data.target_doc_id if dn else None,
        source_document_id=data.payment_doc_id,
        salesperson_id=sp_id,
        amount_usd=amount,
        exchange_rate=float(pay_doc.exchange_rate or 1.0) if pay_doc else 1.0,
        amount_ars=amount * (float(pay_doc.exchange_rate or 1.0) if pay_doc else 1.0),
        notes=f"Aplicación desde {pay_num}",
        date=datetime.now()
    )
    db.add(new_cp)
    db.commit()
    return {"ok": True}
