from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from app.db.session import get_db
from app.db.models.models import Entity, EntityType, AccountMovement, Document, Application, DocumentStatus, DocumentType, EntityCRMNote
from app.db.models.finance_models import Cheque
from app.db.models.commercial_models import SaleCondition, DeliveryNote, DeliveryNoteStatus, DeliveryNoteLine, OrderType
from .schemas import EntityCreate, EntityUpdate, Entity as EntitySchema, EntityDashboardSummary, AgeingReportResponse, EntityCRMNote as EntityCRMNoteSchema, EntityCRMNoteCreate
from sqlalchemy import func, case, desc
from datetime import datetime
from app.modules.auth.auth_router import check_permission, get_current_user
from app.db.models.auth_models import User

router = APIRouter(prefix="/entities", tags=["entities"])

@router.post("/{entity_id}/notes", response_model=EntityCRMNoteSchema)
def create_entity_note(
    entity_id: str, 
    note: EntityCRMNoteCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db_entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not db_entity: raise HTTPException(status_code=404, detail="Entity not found")
    
    db_note = EntityCRMNote(
        **note.model_dump(),
        entity_id=entity_id,
        user_id=current_user.id
    )
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    return db_note


@router.get("/crm/tasks", response_model=List[EntityCRMNoteSchema])
def get_crm_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(EntityCRMNote).filter(EntityCRMNote.is_completed == False).order_by(EntityCRMNote.next_follow_up).all()


@router.post("/crm/notes/{note_id}/complete")
def complete_note(note_id: str, db: Session = Depends(get_db)):
    db_note = db.query(EntityCRMNote).filter(EntityCRMNote.id == note_id).first()
    if not db_note: raise HTTPException(404, detail="Note not found")
    db_note.is_completed = True
    db.commit()
    db.refresh(db_note)
    return db_note


@router.get("/", response_model=List[EntitySchema], dependencies=[Depends(check_permission("customers", "view"))])
def read_entities(
    skip: int = 0, 
    limit: int = 2000, 
    q: Optional[str] = None,
    type: Optional[str] = None,
    is_salesperson: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Entity)
    
    if type:
        t_val = type.lower()
        if t_val == "client":
            query = query.filter(Entity.type.in_([EntityType.CLIENT, EntityType.MIXED]))
        elif t_val in ["provider", "supplier"]:
            query = query.filter(Entity.type.in_([EntityType.PROVIDER, EntityType.MIXED]))
        else:
            query = query.filter(Entity.type == type)
    
    if is_salesperson is not None:
        query = query.filter(Entity.is_salesperson == is_salesperson)
        
    if q:
        search = f"%{q}%"
        query = query.filter(
            (Entity.name.ilike(search)) | 
            (Entity.code.ilike(search)) | 
            (Entity.tax_id.ilike(search))
        )
        
    entities = query.offset(skip).limit(limit).all()
    return entities

@router.get("/meta/tax-categories")
def get_tax_categories():
    return [
        {"id": "RESPONSABLE_INSCRIPTO", "label": "Responsable Inscripto"},
        {"id": "MONOTRIBUTO", "label": "Monotributo"},
        {"id": "EXENTO", "label": "Exento"},
        {"id": "CONSUMIDOR_FINAL", "label": "Consumidor Final"},
        {"id": "SUJETO_NO_CATEGORIZADO", "label": "Sujeto No Categorizado"},
        {"id": "EXTERIOR", "label": "Cliente del Exterior"},
    ]


@router.get("/commercial/sale-conditions")
def get_sale_conditions(db: Session = Depends(get_db)):
    conditions = db.query(SaleCondition).all()
    return [{"id": str(c.id), "description": c.description} for c in conditions]


def normalize_tax_id(tax_id: Optional[str]) -> str:
    if not tax_id:
        return ""
    return "".join(c for c in tax_id if c.isdigit())

def _get_next_code(db: Session, type: EntityType) -> str:
    prefix = "C" if type == EntityType.CLIENT else "P"
    last = db.query(Entity).filter(Entity.code.like(f"{prefix}-%")).order_by(Entity.code.desc()).first()
    if not last: return f"{prefix}-0001"
    try:
        parts = last.code.split('-')
        if len(parts) == 2:
            next_num = int(parts[1]) + 1
            return f"{prefix}-{str(next_num).zfill(4)}"
    except: pass
    return f"{prefix}-0001"

@router.post("/", response_model=EntitySchema, dependencies=[Depends(check_permission("customers", "create"))])
def create_entity(entity: EntityCreate, db: Session = Depends(get_db)):
    if not entity.code:
        entity.code = _get_next_code(db, entity.type)
    else:
        exists = db.query(Entity).filter(Entity.code == entity.code).first()
        if exists: raise HTTPException(status_code=400, detail="Entity with this Code already exists")
            
    if entity.tax_id:
        normalized_new = normalize_tax_id(entity.tax_id)
        if normalized_new:
            all_entities = db.query(Entity).filter(Entity.tax_id != None).all()
            for e in all_entities:
                if normalize_tax_id(e.tax_id) == normalized_new:
                    raise HTTPException(
                        status_code=409,
                        detail={
                            "code": "DUPLICATE_TAX_ID",
                            "message": "Ya existe una entidad con ese CUIT.",
                            "existing_entity": {
                                "id": e.id,
                                "name": e.name,
                                "type": e.type.value if hasattr(e.type, 'value') else e.type,
                                "code": e.code,
                                "tax_id": e.tax_id
                            }
                        }
                    )

    db_entity = Entity(**entity.model_dump(exclude={"create_linked"}))
    db.add(db_entity)
    db.commit()
    db.refresh(db_entity)
    
    if entity.create_linked:
        secondary_type = EntityType.PROVIDER if entity.type == EntityType.CLIENT else EntityType.CLIENT
        secondary_code = _get_next_code(db, secondary_type)
        db_linked = Entity(
            name=entity.name, type=secondary_type, code=secondary_code, tax_id=entity.tax_id,
            tax_category=entity.tax_category, email=entity.email, phone=entity.phone,
            contact_name=entity.contact_name, address=entity.address, city=entity.city,
            state=entity.state, zip_code=entity.zip_code, country=entity.country,
            price_list_id=entity.price_list_id, salesperson_id=entity.salesperson_id,
            business_unit=entity.business_unit, is_salesperson=entity.is_salesperson,
            commission_type=entity.commission_type, commission_pct=entity.commission_pct,
            notes=entity.notes, linked_entity_id=db_entity.id
        )
        db.add(db_linked)
        db.commit()
        db.refresh(db_linked)
        db_entity.linked_entity_id = db_linked.id
        db.add(db_entity)
        db.commit()
    return db_entity

@router.get("/{entity_id}", response_model=EntitySchema, dependencies=[Depends(check_permission("customers", "view"))])
def read_entity(entity_id: str, db: Session = Depends(get_db)):
    db_entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if db_entity is None: raise HTTPException(status_code=404, detail="Entity not found")
    return db_entity

@router.put("/{entity_id}", response_model=EntitySchema, dependencies=[Depends(check_permission("customers", "edit"))])
def update_entity(entity_id: str, entity: EntityUpdate, db: Session = Depends(get_db)):
    db_entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if db_entity is None: raise HTTPException(status_code=404, detail="Entity not found")
    
    if entity.tax_id is not None:
        normalized_new = normalize_tax_id(entity.tax_id)
        if normalized_new:
            all_entities = db.query(Entity).filter(Entity.id != entity_id, Entity.tax_id != None).all()
            for e in all_entities:
                if normalize_tax_id(e.tax_id) == normalized_new:
                    raise HTTPException(
                        status_code=409,
                        detail={
                            "code": "DUPLICATE_TAX_ID",
                            "message": "Ya existe una entidad con ese CUIT.",
                            "existing_entity": {
                                "id": e.id,
                                "name": e.name,
                                "type": e.type.value if hasattr(e.type, 'value') else e.type,
                                "code": e.code,
                                "tax_id": e.tax_id
                            }
                        }
                    )

    update_data = entity.model_dump(exclude_unset=True)
    for key, value in update_data.items(): setattr(db_entity, key, value)
    db.commit()
    db.refresh(db_entity)
    return db_entity

@router.patch("/{entity_id}/convert-to-mixed", response_model=EntitySchema, dependencies=[Depends(check_permission("customers", "edit"))])
def convert_to_mixed(entity_id: str, db: Session = Depends(get_db)):
    db_entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if db_entity is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    if db_entity.type == EntityType.MIXED:
        return db_entity
    if db_entity.type == EntityType.EMPLOYEE:
        raise HTTPException(
            status_code=400,
            detail="No se puede convertir automáticamente un empleado a entidad mixta."
        )
    db_entity.type = EntityType.MIXED
    db.commit()
    db.refresh(db_entity)
    return db_entity

@router.get("/{entity_id}/dashboard", response_model=EntityDashboardSummary)
def get_entity_dashboard(entity_id: str, cost_center: Optional[int] = None, db: Session = Depends(get_db)):
    db_entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not db_entity: raise HTTPException(status_code=404, detail="Entidad no encontrada")

    debit_types = [DocumentType.INVOICE, DocumentType.DEBIT_NOTE, DocumentType.PURCHASE_INVOICE]
    total_balance_query = db.query(func.sum(
        case(
            (Document.doc_type.in_(debit_types), Document.total_amount_ars),
            else_=-Document.total_amount_ars
        )
    )).filter(Document.entity_id == entity_id)
    if cost_center:
        total_balance_query = total_balance_query.filter(Document.cost_center == cost_center)
    total_balance = total_balance_query.scalar() or 0.0
    
    # Total Balance USD (strictly only USD documents)
    total_balance_usd_query = db.query(func.sum(
        case(
            (Document.doc_type.in_(debit_types), Document.total_amount),
            else_=-Document.total_amount
        )
    )).filter(Document.entity_id == entity_id, Document.currency == "USD")
    if cost_center:
        total_balance_usd_query = total_balance_usd_query.filter(Document.cost_center == cost_center)
    total_balance_usd = total_balance_usd_query.scalar() or 0.0

    now = datetime.now()
    open_docs_query = db.query(Document).filter(
        Document.entity_id == entity_id,
        Document.status.in_([DocumentStatus.OPEN, DocumentStatus.PARTIAL])
    )
    if cost_center:
        open_docs_query = open_docs_query.filter(Document.cost_center == cost_center)
        
    open_docs = open_docs_query.all()

    overdue_balance = 0.0
    aging_bins = {"A vencer": 0.0, "0-30 días": 0.0, "31-60 días": 0.0, "61-90 días": 0.0, "90+ días": 0.0}

    for doc in open_docs:
        applied = db.query(func.sum(Application.amount_applied)).filter(Application.to_document_id == doc.id).scalar() or 0.0
        pending_amount = float(doc.total_amount or 0.0) - float(applied)
        if pending_amount <= 0.01: continue
        if doc.due_date and doc.due_date < now:
            overdue_balance += float(pending_amount)
            days_overdue = (now - doc.due_date).days
            if days_overdue <= 30: aging_bins["0-30 días"] += float(pending_amount)
            elif days_overdue <= 60: aging_bins["31-60 días"] += float(pending_amount)
            elif days_overdue <= 90: aging_bins["61-90 días"] += float(pending_amount)
            else: aging_bins["90+ días"] += float(pending_amount)
        else: aging_bins["A vencer"] += float(pending_amount)

    checks_pending_query = db.query(func.sum(Cheque.importe)).filter(
        Cheque.cliente_dador == db_entity.name,
        Cheque.estado.in_(["PENDIENTE", "EN_CARTERA"])
    )
    if cost_center:
        checks_pending_query = checks_pending_query.filter(Cheque.cost_center == cost_center)
        
    checks_pending = checks_pending_query.scalar() or 0.0

    # Unbilled Delivery Notes
    unbilled_query = db.query(DeliveryNote).filter(
        DeliveryNote.entity_id == entity_id,
        DeliveryNote.status.in_([DeliveryNoteStatus.DISPATCHED, DeliveryNoteStatus.PARTIAL])
    ).all()
    
    unbilled_balance = 0.0
    unbilled_balance_usd = 0.0
    for note in unbilled_query:
        sign = -1.0 if note.note_type == OrderType.PURCHASE else 1.0
        tc = float(note.exchange_rate or 1.0)
        is_usd = str(note.currency) in ("USD", "CurrencyType.USD")
        
        note_unbilled = 0.0
        note_unbilled_usd = 0.0
        for line in note.lines:
            qty_rem = float(line.qty or 0.0) - float(line.qty_invoiced or 0.0)
            
            # Cross-check with original order (Sales or Purchase)
            if line.source_sales_line_id:
                from app.db.models.commercial_models import SalesOrderLine
                sl = db.query(SalesOrderLine).filter(SalesOrderLine.id == line.source_sales_line_id).first()
                if sl:
                    order_qty_rem = max(0.0, float(sl.qty or 0.0) - float(sl.qty_invoiced or 0.0))
                    qty_rem = min(qty_rem, order_qty_rem)
            elif line.source_purchase_line_id:
                from app.db.models.commercial_models import PurchaseOrderLine
                pl = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == line.source_purchase_line_id).first()
                if pl:
                    order_qty_rem = max(0.0, float(pl.qty or 0.0) - float(pl.qty_invoiced or 0.0))
                    qty_rem = min(qty_rem, order_qty_rem)

            if qty_rem > 0.01:
                price = float(line.unit_price or 0.0)
                disc = float(line.discount_pct or 0.0) / 100.0
                vat = float(line.vat_rate or 0.21)
                net = float(price) * (1.0 - float(disc))
                gross = net * (1.0 + float(vat))
                line_amt = float(gross) * float(qty_rem)
                
                if is_usd:
                    note_unbilled_usd += line_amt
                    note_unbilled += (line_amt * float(tc))
                else:
                    note_unbilled += line_amt
                    
        unbilled_balance += (float(note_unbilled) * sign)
        unbilled_balance_usd += (float(note_unbilled_usd) * sign)

    # 6. Recent Activity
    recent_activity = []
    docs_query = db.query(Document).filter(Document.entity_id == entity_id)
    if cost_center:
        docs_query = docs_query.filter(Document.cost_center == cost_center)
        
    docs = docs_query.order_by(Document.date.desc()).limit(10).all()
    for d in docs:
        recent_activity.append({
            "id": d.id, "type": "DOCUMENT", "doc_type": d.doc_type, "number": d.number,
            "date": d.date.isoformat(), "amount": float(d.total_amount),
            "currency": d.currency, "status": d.status
        })

    # 7. History (Last 6 months)
    history = []
    from datetime import timedelta
    for i in range(5, -1, -1):
        # Simple month substract
        target_date = now - timedelta(days=i*30)
        m_start = target_date.replace(day=1, hour=0, minute=0, second=0)
        m_end = now if i == 0 else m_start + timedelta(days=31)
        
        # Calculate monthly volume (sales or purchases) in ARS/USD mixed or normalized
        # For simplicity, we use total_amount_ars of documents in that month
        vol_query = db.query(func.sum(Document.total_amount_ars)).filter(
            Document.entity_id == entity_id,
            Document.date >= m_start,
            Document.date <= m_end,
            Document.doc_type.in_(debit_types)
        )
        if cost_center:
            vol_query = vol_query.filter(Document.cost_center == cost_center)
            
        vol = vol_query.scalar() or 0.0
        
        history.append({
            "month": m_start.strftime("%b"),
            "amount": float(vol)
        })

    # 8. Top Products & Consumption Mix (D1)
    from app.db.models.models import DocumentLine
    top_prods_query = db.query(
        DocumentLine.description,
        func.sum(DocumentLine.qty).label("total_qty"),
        func.sum(DocumentLine.total_amount).label("total_val")
    ).join(Document).filter(
        Document.entity_id == entity_id,
        Document.doc_type.in_(debit_types)
    )
    if cost_center:
        top_prods_query = top_prods_query.filter(Document.cost_center == cost_center)
        
    top_prods_results = top_prods_query.group_by(DocumentLine.description).order_by(func.sum(DocumentLine.total_amount).desc()).limit(5).all()

    top_products = []
    for p in top_prods_results:
        top_products.append({
            "name": p.description,
            "qty": float(p.total_qty),
            "amount": float(p.total_val)
        })

    # Group by Business Unit for the circular chart (D1)
    mix_query = db.query(
        Document.unidad_negocio,
        func.sum(Document.total_amount_ars).label("total")
    ).filter(
        Document.entity_id == entity_id,
        Document.doc_type.in_(debit_types)
    ).group_by(Document.unidad_negocio).all()

    consumption_mix = []
    for m in mix_query:
        consumption_mix.append({
            "category": m.unidad_negocio or "Otros",
            "value": float(m.total or 0.0)
        })

    # 9. CRM Notes
    crm_notes = db.query(EntityCRMNote).filter(EntityCRMNote.entity_id == entity_id).order_by(desc(EntityCRMNote.date)).limit(10).all()

    # 10. Payment Performance (Avg Days to Pay)
    # Auditar últimos 20 pagos para determinar demora promedio vs vencimiento
    perf_query = db.query(
        Document.due_date,
        Application.created_at.label("pay_date")
    ).join(Application, Application.to_document_id == Document.id).filter(
        Document.entity_id == entity_id,
        Document.doc_type == DocumentType.INVOICE,
        Document.status == DocumentStatus.CLOSED
    ).order_by(Document.date.desc()).limit(20).all()
    
    delays = [(p.pay_date - p.due_date).days for p in perf_query if p.pay_date and p.due_date]
    avg_delay = round(sum(delays) / len(delays), 1) if delays else 0.0

    # 11. Performance Score (Mock 1-100 based on aging and debt)
    perf_score = 100.0
    if overdue_balance > 0:
        perf_score -= min(40, (overdue_balance / (total_balance or 1) * 50))
    if avg_delay > 15:
        perf_score -= min(30, (avg_delay - 15) * 2)
    perf_score = max(0, perf_score)

    # 12. List of Pending Logistics & Orders for the 360 side-panel
    pending_logs = []
    for dn in unbilled_query[:5]:
        dn_total = sum((float(l.unit_price or 0) * (1 - float(l.discount_pct or 0) / 100) * (1 + float(l.vat_rate or 0.21)) * float(l.qty or 0)) for l in dn.lines)
        if str(dn.currency) in ("USD", "CurrencyType.USD"):
            dn_total *= float(dn.exchange_rate or 1.0)
            
        pending_logs.append({
            "id": dn.id, "number": dn.number, "date": dn.date.isoformat(), 
            "amount": float(dn_total), "status": "Pendiente"
        })

    from app.db.models.commercial_models import SalesOrder, OrderStatus
    open_orders_list = db.query(SalesOrder).filter(
        SalesOrder.entity_id == entity_id,
        SalesOrder.status.ilike("%PARTIAL%") | (SalesOrder.status == OrderStatus.CONFIRMED)
    ).order_by(SalesOrder.date.desc()).limit(5).all()
    
    orders_data = []
    for so in open_orders_list:
        orders_data.append({
            "id": so.id, "number": so.number, "date": so.date.isoformat(), 
            "status": so.status, "amount": float(so.total_amount)
        })

    return {
        "id": db_entity.id,
        "name": db_entity.name,
        "type": db_entity.type.value if hasattr(db_entity.type, 'value') else db_entity.type,
        "tax_id": db_entity.tax_id,
        "email": db_entity.email,
        "phone": db_entity.phone,
        "address": db_entity.address,
        "total_balance": float(total_balance), 
        "total_balance_usd": float(total_balance_usd),
        "overdue_balance": float(overdue_balance),
        "unbilled_balance": float(unbilled_balance),
        "unbilled_balance_usd": float(unbilled_balance_usd),
        "checks_pending": float(checks_pending), 
        "credit_limit": float(db_entity.credit_limit or 0),
        "credit_status": db_entity.credit_status or "OK",
        "avg_days_to_pay": avg_delay,
        "performance_score": perf_score,
        "aging": [{"label": k, "amount": v} for k, v in aging_bins.items()],
        "recent_activity": sorted(recent_activity, key=lambda x: x["date"], reverse=True),
        "history": history,
        "top_products": top_products,
        "consumption_mix": consumption_mix,
        "pending_logistics": pending_logs,
        "open_orders": orders_data,
        "crm_notes": crm_notes
    }

@router.delete("/{entity_id}", dependencies=[Depends(check_permission("customers", "delete"))])
def delete_entity(entity_id: str, db: Session = Depends(get_db)):
    db_entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if db_entity is None: raise HTTPException(status_code=404, detail="Entity not found")
    
    from app.db.models.commercial_models import SalesOrder, PurchaseOrder
    from app.db.models.models import ExpenseClaim

    docs_count = db.query(Document).filter((Document.entity_id == entity_id) | (Document.salesperson_id == entity_id)).count()
    movements_count = db.query(AccountMovement).filter(AccountMovement.entity_id == entity_id).count()
    sales_orders_count = db.query(SalesOrder).filter((SalesOrder.entity_id == entity_id) | (SalesOrder.salesperson_id == entity_id)).count()
    delivery_notes_count = db.query(DeliveryNote).filter((DeliveryNote.entity_id == entity_id) | (DeliveryNote.salesperson_id == entity_id)).count()
    purchase_orders_count = db.query(PurchaseOrder).filter((PurchaseOrder.entity_id == entity_id) | (PurchaseOrder.salesperson_id == entity_id)).count()
    cheques_count = db.query(Cheque).filter((Cheque.entity_id == entity_id) | (Cheque.endorsee_id == entity_id)).count()
    expense_claims_count = db.query(ExpenseClaim).filter(ExpenseClaim.entity_id == entity_id).count()

    total_deps = (
        docs_count + movements_count + sales_orders_count + 
        delivery_notes_count + purchase_orders_count + cheques_count + 
        expense_claims_count
    )

    if total_deps > 0:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "ENTITY_HAS_DEPENDENCIES",
                "message": "No se puede eliminar la entidad porque tiene operaciones asociadas.",
                "dependencies": {
                    "documents": docs_count,
                    "account_movements": movements_count,
                    "sales_orders": sales_orders_count,
                    "delivery_notes": delivery_notes_count,
                    "purchase_orders": purchase_orders_count,
                    "cheques": cheques_count,
                    "expense_claims": expense_claims_count
                }
            }
        )

    if db_entity.linked_entity_id:
        linked_entity = db.query(Entity).filter(Entity.id == db_entity.linked_entity_id).first()
        if linked_entity: linked_entity.linked_entity_id = None
    db.delete(db_entity)
    db.commit()
    return {"ok": True}

def safe_float(value, default=0.0):
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default

@router.get("/reports/ageing", response_model=AgeingReportResponse)
def get_ageing_report(
    type: Optional[str] = Query("client", description="client or provider"),
    cost_center: Optional[int] = None,
    db: Session = Depends(get_db)
):
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        now = datetime.now()
        debit_types = [
            DocumentType.INVOICE, DocumentType.DEBIT_NOTE, 
            DocumentType.PURCHASE_INVOICE, DocumentType.PURCHASE_DEBIT_NOTE,
            DocumentType.LPG_PRIMARY, DocumentType.LPG_SECONDARY
        ]

        total_ars_expr = case(
            (Document.currency.notin_(["USD", "CurrencyType.USD"]), func.coalesce(Document.total_amount, 0.0)),
            else_=0.0
        )
        total_usd_expr = case(
            (Document.currency.in_(["USD", "CurrencyType.USD"]), func.coalesce(Document.total_amount, 0.0)),
            else_=0.0
        )
        total_converted_expr = func.coalesce(
            Document.total_amount_ars,
            case(
                (Document.currency.in_(["USD", "CurrencyType.USD"]), Document.total_amount * func.coalesce(Document.exchange_rate, 1.0)),
                else_=func.coalesce(Document.total_amount, 0.0)
            )
        )

        def get_balance_expr(expr):
            return func.sum(case((Document.doc_type.in_(debit_types), expr), else_=-expr))

        balances_query = db.query(
            Document.entity_id,
            get_balance_expr(total_converted_expr).label("balance_converted"),
            get_balance_expr(total_ars_expr).label("balance_ars"),
            get_balance_expr(total_usd_expr).label("balance_usd")
        ).filter(Document.status != DocumentStatus.CANCELLED)
        
        if cost_center in [1, 2]:
            balances_query = balances_query.filter(Document.cost_center == cost_center)
            
        balances_results = balances_query.group_by(Document.entity_id).all()
        
        # balances_map stores dict with all balances
        balances_map = {}
        for b in balances_results:
            if b.entity_id and (abs(safe_float(b.balance_converted)) > 0.01 or abs(safe_float(b.balance_ars)) > 0.01 or abs(safe_float(b.balance_usd)) > 0.01):
                balances_map[b.entity_id] = {
                    "balance_converted": safe_float(b.balance_converted),
                    "balance_ars": safe_float(b.balance_ars),
                    "balance_usd": safe_float(b.balance_usd)
                }

        open_docs_query = db.query(Document).filter(
            Document.status.in_([DocumentStatus.OPEN, DocumentStatus.PARTIAL]),
            Document.entity_id.in_(balances_map.keys())
        )
        if cost_center in [1, 2]:
            open_docs_query = open_docs_query.filter(Document.cost_center == cost_center)
            
        open_docs = open_docs_query.all()

        doc_ids = [d.id for d in open_docs]
        
        apps_map_ars = {}
        apps_map_usd = {}
        if doc_ids:
            apps_query = db.query(Application).filter(Application.to_document_id.in_(doc_ids)).all()
            for app in apps_query:
                # amount_applied is in the to_document's currency
                amount_applied = safe_float(app.amount_applied)
                apps_map_usd[app.to_document_id] = apps_map_usd.get(app.to_document_id, 0.0) + amount_applied
                
                if app.amount_applied_ars is None:
                    app_tc = safe_float(app.exchange_rate, 1.0)
                    if app_tc <= 0: app_tc = 1.0
                    val_ars = amount_applied * app_tc
                else:
                    val_ars = safe_float(app.amount_applied_ars)
                
                apps_map_ars[app.to_document_id] = apps_map_ars.get(app.to_document_id, 0.0) + val_ars

        entity_buckets: Dict[str, Dict[str, Any]] = {}
        for doc in open_docs:
            if not doc.id or not doc.entity_id:
                logger.warning(f"Documento imposible saltado en ageing report (falta id o entity_id): {getattr(doc, 'id', None)}")
                continue

            doc_currency = doc.currency.value if hasattr(doc.currency, "value") else str(doc.currency or "ARS")
            total_amount = safe_float(doc.total_amount)
            doc_tc = safe_float(doc.exchange_rate, 1.0)
            if doc_tc <= 0: doc_tc = 1.0

            if doc.total_amount_ars is None:
                if doc_currency == "USD":
                    doc_total_ars = total_amount * doc_tc
                else:
                    doc_total_ars = total_amount
            else:
                doc_total_ars = safe_float(doc.total_amount_ars)

            applied_ars = apps_map_ars.get(doc.id, 0.0)
            pending_ars = doc_total_ars - applied_ars
            
            applied_usd = apps_map_usd.get(doc.id, 0.0)
            
            pending_real_ars = 0.0
            pending_real_usd = 0.0
            
            if doc_currency == "USD":
                pending_real_usd = total_amount - applied_usd
            else:
                pending_real_ars = total_amount - applied_usd # For ARS docs, amount_applied is in ARS

            if pending_ars <= 0.01 and pending_real_usd <= 0.01 and pending_real_ars <= 0.01: continue
            
            eid = str(doc.entity_id)
            cond_id = str(doc.sale_condition_id or "NONE")
            
            if eid not in entity_buckets:
                entity_buckets[eid] = {
                    "overdue": 0.0,
                    "overdue_ars": 0.0,
                    "overdue_usd": 0.0,
                    "buckets": {"A vencer": 0.0, "0-30 días": 0.0, "31-60 días": 0.0, "61-90 días": 0.0, "90+ días": 0.0},
                    "conditions": {}
                }
            
            ent_data = entity_buckets[eid]
            if cond_id not in ent_data["conditions"]:
                ent_data["conditions"][cond_id] = {
                    "total": 0.0, "overdue": 0.0,
                    "overdue_ars": 0.0, "overdue_usd": 0.0,
                    "buckets": {"A vencer": 0.0, "0-30 días": 0.0, "31-60 días": 0.0, "61-90 días": 0.0, "90+ días": 0.0}
                }
            
            cond_data = ent_data["conditions"][cond_id]
            cond_data["total"] += pending_ars
            
            is_overdue = False
            bucket_key = "A vencer"
            if doc.due_date and doc.due_date < now:
                is_overdue = True
                days = (now - doc.due_date).days
                if days <= 30: bucket_key = "0-30 días"
                elif days <= 60: bucket_key = "31-60 días"
                elif days <= 90: bucket_key = "61-90 días"
                else: bucket_key = "90+ días"
                
            ent_data["buckets"][bucket_key] += pending_ars
            cond_data["buckets"][bucket_key] += pending_ars
            if is_overdue:
                ent_data["overdue"] += pending_ars
                ent_data["overdue_ars"] += pending_real_ars
                ent_data["overdue_usd"] += pending_real_usd
                cond_data["overdue"] += pending_ars
                cond_data["overdue_ars"] += pending_real_ars
                cond_data["overdue_usd"] += pending_real_usd

        condition_names = {c.id: c.description for c in db.query(SaleCondition).all()}

        if type == "client": entities_query = db.query(Entity).filter(Entity.type.in_([EntityType.CLIENT, EntityType.MIXED]))
        elif type == "provider": entities_query = db.query(Entity).filter(Entity.type.in_([EntityType.PROVIDER, EntityType.MIXED]))
        elif type == "mixed": entities_query = db.query(Entity).filter(Entity.type == EntityType.MIXED)
        else: entities_query = db.query(Entity)
            
        all_entities = entities_query.filter(Entity.id.in_(balances_map.keys())).all()
        report_data = []
        total_debt_global = 0.0
        total_overdue_global = 0.0
        total_ars_global = 0.0
        total_usd_global = 0.0
        overdue_ars_global = 0.0
        overdue_usd_global = 0.0

        from app.modules.entities.account_statement_service import build_entity_ledger

        for ent in all_entities:
            if not ent.id:
                logger.warning("Entidad imposible saltada en ageing report (falta id)")
                continue

            if ent.credit_limit is None:
                logger.warning(f"Ageing report fallback: entity_id={ent.id} field=credit_limit value=None")

            balance_data = balances_map.get(ent.id, {"balance_converted": 0.0, "balance_ars": 0.0, "balance_usd": 0.0})
            
            # Fetch true ledger balances to guarantee consistency with Resumen de Cuenta
            ledger_view = "customer"
            if type == "provider": ledger_view = "supplier"
            elif type == "mixed": ledger_view = "consolidated"
            
            try:
                ledger = build_entity_ledger(db=db, entity_id=ent.id, view=ledger_view, cost_center=cost_center)
                if ledger and len(ledger) > 0:
                    last_row = ledger[-1]
                    balance_data["balance_ars"] = last_row.get("balance_ars", 0.0)
                    balance_data["balance_usd"] = last_row.get("balance_usd", 0.0)
            except Exception as e:
                logger.error(f"Error building ledger for entity {ent.id}: {e}")

            eb = entity_buckets.get(ent.id, {
                "overdue": 0.0,
                "overdue_ars": 0.0,
                "overdue_usd": 0.0,
                "buckets": {"A vencer": 0.0, "0-30 días": 0.0, "31-60 días": 0.0, "61-90 días": 0.0, "90+ días": 0.0},
                "conditions": {}
            })

            cond_list = []
            for cid, cdata in eb["conditions"].items():
                name = condition_names.get(cid, "Sin Condición Asignada") if cid != "NONE" else "Sin Condición Asignada"
                cond_list.append({
                    "name": name, "total_balance": safe_float(cdata["total"]), "overdue_balance": safe_float(cdata["overdue"]),
                    "aging_buckets": [{"label": k, "amount": safe_float(v)} for k, v in cdata["buckets"].items()]
                })

            report_data.append({
                "id": ent.id, "name": ent.name, "code": ent.code, 
                "total_balance": balance_data["balance_ars"],
                "overdue_balance": eb["overdue_ars"],
                "balance_ars": balance_data["balance_ars"],
                "balance_usd": balance_data["balance_usd"],
                "overdue_ars": eb["overdue_ars"],
                "overdue_usd": eb["overdue_usd"],
                "total_converted_ars": balance_data["balance_converted"],
                "aging_buckets": [{"label": k, "amount": v} for k, v in eb["buckets"].items()],
                "credit_limit": safe_float(ent.credit_limit), "credit_status": str(ent.credit_status or ""),
                "conditions": cond_list
            })
            total_debt_global += balance_data["balance_converted"]
            total_overdue_global += eb["overdue"]
            total_ars_global += balance_data["balance_ars"]
            total_usd_global += balance_data["balance_usd"]
            overdue_ars_global += eb["overdue_ars"]
            overdue_usd_global += eb["overdue_usd"]

        return {
            "report_date": now, "type": type or "all",
            "summary": {
                "total_debt": total_debt_global, 
                "total_overdue": total_overdue_global,
                "total_ars": total_ars_global,
                "total_usd": total_usd_global,
                "overdue_ars": overdue_ars_global,
                "overdue_usd": overdue_usd_global
            },
            "data": sorted(report_data, key=lambda x: x["overdue_balance"], reverse=True)
        }
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Ageing Report Error: {e}", exc_info=True)
        # Even if error occurs at top level, try to return empty valid format rather than 500
        return {
            "report_date": datetime.now(), "type": type or "all",
            "summary": {"total_debt": 0.0, "total_overdue": 0.0},
            "data": []
        }
