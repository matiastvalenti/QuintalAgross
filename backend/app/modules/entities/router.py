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
    update_data = entity.model_dump(exclude_unset=True)
    for key, value in update_data.items(): setattr(db_entity, key, value)
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
    movements_count = db.query(AccountMovement).filter(AccountMovement.entity_id == entity_id).count()
    documents_count = db.query(Document).filter(Document.entity_id == entity_id).count()
    if movements_count > 0 or documents_count > 0:
        raise HTTPException(status_code=400, detail=f"No se puede eliminar: Tiene movimientos/documentos asociados.")
    if db_entity.linked_entity_id:
        linked_entity = db.query(Entity).filter(Entity.id == db_entity.linked_entity_id).first()
        if linked_entity: linked_entity.linked_entity_id = None
    db.delete(db_entity)
    db.commit()
    return {"ok": True}

@router.get("/reports/ageing", response_model=AgeingReportResponse)
def get_ageing_report(
    type: Optional[str] = Query("client", description="client or provider"),
    cost_center: Optional[int] = None,
    db: Session = Depends(get_db)
):
    try:
        now = datetime.now()
        debit_types = [
            DocumentType.INVOICE, DocumentType.DEBIT_NOTE, 
            DocumentType.PURCHASE_INVOICE, DocumentType.PURCHASE_DEBIT_NOTE,
            DocumentType.LPG_PRIMARY, DocumentType.LPG_SECONDARY
        ]

        balances_query = db.query(
            Document.entity_id,
            func.sum(case(
                (Document.doc_type.in_(debit_types), func.coalesce(Document.total_amount_ars, 0.0)),
                else_=-func.coalesce(Document.total_amount_ars, 0.0)
            )).label("balance")
        ).filter(Document.status != DocumentStatus.CANCELLED)
        
        if cost_center:
            balances_query = balances_query.filter(Document.cost_center == cost_center)
            
        balances_results = balances_query.group_by(Document.entity_id).all()
        
        balances_map = {b.entity_id: float(b.balance or 0.0) for b in balances_results if b.entity_id and abs(float(b.balance or 0.0)) > 0.01}

        open_docs_query = db.query(Document).filter(
            Document.status.in_([DocumentStatus.OPEN, DocumentStatus.PARTIAL]),
            Document.entity_id.in_(balances_map.keys())
        )
        if cost_center:
            open_docs_query = open_docs_query.filter(Document.cost_center == cost_center)
            
        open_docs = open_docs_query.all()

        doc_ids = [d.id for d in open_docs]
        apps_query = db.query(
            Application.to_document_id,
            func.sum(Application.amount_applied_ars).label("total_applied_ars")
        ).filter(Application.to_document_id.in_(doc_ids)).group_by(Application.to_document_id).all()
        apps_map = {a.to_document_id: float(a.total_applied_ars) for a in apps_query}

        entity_buckets: Dict[str, Dict[str, Any]] = {}
        for doc in open_docs:
            applied_ars = apps_map.get(doc.id, 0.0)
            pending_ars = float(doc.total_amount_ars or 0.0) - applied_ars
            if pending_ars <= 0.01: continue
            
            eid = str(doc.entity_id)
            cond_id = str(doc.sale_condition_id or "NONE")
            
            if eid not in entity_buckets:
                entity_buckets[eid] = {
                    "overdue": 0.0,
                    "buckets": {"A vencer": 0.0, "0-30 días": 0.0, "31-60 días": 0.0, "61-90 días": 0.0, "90+ días": 0.0},
                    "conditions": {}
                }
            
            ent_data = entity_buckets[eid]
            if cond_id not in ent_data["conditions"]:
                ent_data["conditions"][cond_id] = {
                    "total": 0.0, "overdue": 0.0,
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
                cond_data["overdue"] += pending_ars

        condition_names = {c.id: c.description for c in db.query(SaleCondition).all()}

        if type == "client": entities_query = db.query(Entity).filter(Entity.type.in_([EntityType.CLIENT, EntityType.MIXED]))
        elif type == "provider": entities_query = db.query(Entity).filter(Entity.type.in_([EntityType.PROVIDER, EntityType.MIXED]))
        else: entities_query = db.query(Entity)
            
        all_entities = entities_query.filter(Entity.id.in_(balances_map.keys())).all()
        report_data = []
        total_debt_global = 0.0
        total_overdue_global = 0.0

        for ent in all_entities:
            balance = balances_map.get(ent.id, 0.0)
            eb = entity_buckets.get(ent.id, {
                "overdue": 0.0,
                "buckets": {"A vencer": 0.0, "0-30 días": 0.0, "31-60 días": 0.0, "61-90 días": 0.0, "90+ días": 0.0},
                "conditions": {}
            })

            cond_list = []
            for cid, cdata in eb["conditions"].items():
                name = condition_names.get(cid, "Sin Condición Asignada") if cid != "NONE" else "Sin Condición Asignada"
                cond_list.append({
                    "name": name, "total_balance": float(cdata["total"]), "overdue_balance": float(cdata["overdue"]),
                    "aging_buckets": [{"label": k, "amount": float(v)} for k, v in cdata["buckets"].items()]
                })

            report_data.append({
                "id": ent.id, "name": ent.name, "code": ent.code, "total_balance": balance,
                "overdue_balance": eb["overdue"],
                "aging_buckets": [{"label": k, "amount": v} for k, v in eb["buckets"].items()],
                "credit_limit": ent.credit_limit, "credit_status": ent.credit_status,
                "conditions": cond_list
            })
            total_debt_global += float(balance)
            total_overdue_global += float(eb["overdue"])

        return {
            "report_date": now, "type": type or "all",
            "summary": {"total_debt": total_debt_global, "total_overdue": total_overdue_global},
            "data": sorted(report_data, key=lambda x: x["overdue_balance"], reverse=True)
        }
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Ageing Report Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
