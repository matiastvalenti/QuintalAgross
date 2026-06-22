from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime
from fastapi import HTTPException

from app.db.models.models import (
    Document, DocumentStatus, Application, Entity
)
from app.db.models.commercial_models import SaleCondition

def build_entity_ledger(
    db: Session,
    entity_id: str,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    currency: Optional[str] = None,
    doc_type: Optional[str] = None,
    cost_center: Optional[int] = None,
    only_unapplied: bool = False,
    only_overdue: bool = False,
    sale_condition: Optional[str] = None,
    view: Optional[str] = None,
) -> List[dict]:
    # Importar internamente para evitar dependencias circulares si las hay
    from app.modules.entities.accounts_router import DEBIT_TYPES
    from app.db.models.models import DocumentType

    # 0. Cache for sale conditions to ensure they show up even if relationship is tricky
    all_sc = db.query(SaleCondition).all()
    sc_map = {str(sc.id).lower().strip(): sc.description for sc in all_sc}
    sc_map.update({str(sc.description).lower().strip(): sc.description for sc in all_sc})

    # 1. Validar entidad
    entity = db.query(Entity).filter(Entity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entidad no encontrada")

    # TODO: Implementar vista_cliente, vista_proveedor, vista_consolidada según el tipo de entidad
    # TODO: Manejar debe/haber por moneda estrictamente

    # 2. Levantar todos los documentos de la entidad (no cancelados)
    query = db.query(Document).options(joinedload(Document.sale_condition)).filter(
        Document.entity_id == entity_id,
        Document.status != DocumentStatus.CANCELLED
    )

    if view == 'customer':
        customer_types = {
            DocumentType.INVOICE, DocumentType.FCE_MIPYME, DocumentType.DEBIT_NOTE,
            DocumentType.CREDIT_NOTE, DocumentType.RECEIPT
        }
        query = query.filter(Document.doc_type.in_(customer_types))
    elif view == 'supplier':
        supplier_types = {
            DocumentType.PURCHASE_INVOICE, DocumentType.PURCHASE_DEBIT_NOTE,
            DocumentType.PURCHASE_CREDIT_NOTE, DocumentType.PAYMENT, DocumentType.LPG_PRIMARY
        }
        query = query.filter(Document.doc_type.in_(supplier_types))

    # Filtro por centro de costo
    if cost_center is not None:
        query = query.filter(Document.cost_center == cost_center)

    # Filtros opcionales por fecha
    if from_date:
        try:
            query = query.filter(Document.date >= datetime.fromisoformat(from_date))
        except Exception:
            pass
    if to_date:
        try:
            query = query.filter(Document.date <= datetime.fromisoformat(to_date + "T23:59:59"))
        except Exception:
            pass

    # Filtro por moneda
    if currency:
        query = query.filter(Document.currency == currency)

    # Filtro por tipo de doc
    if doc_type:
        query = query.filter(Document.doc_type == doc_type)

    # Filtro por condición de venta
    if sale_condition:
        query = query.filter(Document.sale_condition_id == sale_condition)

    docs = query.order_by(Document.date.asc(), Document.created_at.asc()).all()

    # 3. Para cada documento, calcular la aplicación (cuánto se cobró/pagó)
    doc_ids = [d.id for d in docs]

    # Aplicaciones donde el documento ES EL ORIGEN (recibos/pagos que se aplicaron)
    apps_from_q = db.query(
        Application.from_document_id,
        Document.currency.label("to_currency"),
        func.sum(Application.amount_applied).label("applied"),
        func.sum(Application.amount_applied_ars).label("applied_ars"),
    ).join(Document, Application.to_document_id == Document.id)\
     .filter(Application.from_document_id.in_(doc_ids))\
     .group_by(Application.from_document_id, Document.currency).all()
    
    applied_from_map = {}
    for a in apps_from_q:
        did = a.from_document_id
        if did not in applied_from_map: applied_from_map[did] = {}
        curr = str(a.to_currency.value if hasattr(a.to_currency, "value") else a.to_currency)
        applied_from_map[did][curr] = (float(a.applied or 0), float(a.applied_ars or 0))

    # Aplicaciones donde el documento ES EL DESTINO (facturas que se pagaron)
    apps_to_q = db.query(
        Application.to_document_id,
        func.sum(Application.amount_applied).label("applied"),
    ).filter(Application.to_document_id.in_(doc_ids)).group_by(Application.to_document_id).all()
    applied_to_map = {a.to_document_id: float(a.applied or 0) for a in apps_to_q}

    # 4. Construir el ledger con saldos acumulados
    balance_ars = 0.0
    balance_usd = 0.0
    entries = []

    for doc in docs:
        # 4.1 Identificación de signo del impacto
        if view == 'customer':
            is_positive_impact = doc.doc_type in {DocumentType.INVOICE, DocumentType.FCE_MIPYME, DocumentType.DEBIT_NOTE}
        elif view == 'supplier':
            is_positive_impact = doc.doc_type in {DocumentType.PURCHASE_INVOICE, DocumentType.PURCHASE_DEBIT_NOTE, DocumentType.LPG_PRIMARY}
        else:
            is_positive_impact = doc.doc_type in DEBIT_TYPES
        is_usd = str(doc.currency) in ("USD", "CurrencyType.USD")

        total_usd_doc = float(doc.total_amount or 0)
        total_ars_doc = float(doc.total_amount_ars or 0)
        tc = float(doc.exchange_rate or 1.0)
        
        has_apps = doc.id in applied_from_map
        
        if not has_apps:
            sign = 1 if is_positive_impact else -1
            is_fx_adj_doc = getattr(doc, 'is_fx_adjustment', False)
            
            if is_usd:
                if is_fx_adj_doc:
                    amount_usd = (float(doc.total_amount or 0) - float(sum(l.net_amount or 0 for l in doc.lines))) * sign
                    if abs(amount_usd) < 0.01: 
                         amount_usd = total_usd_doc * sign
                else:
                    amount_usd = total_usd_doc * sign
                amount_ars = 0.0
            else:
                amount_usd = 0.0
                if is_fx_adj_doc:
                    vat_ars = sum(float(l.vat_amount or 0) for l in doc.lines) * tc
                    if vat_ars < 0.01:
                        vat_ars = (total_ars_doc * 0.21 / 1.21)
                    amount_usd = (vat_ars / tc) * sign if tc > 0 else 0
                
                amount_ars = total_ars_doc * sign
        else:
            apps = applied_from_map.get(doc.id, {})
            app_usd_val, app_usd_ars = apps.get("USD", (0.0, 0.0))
            app_ars_val, app_ars_ars = apps.get("ARS", (0.0, 0.0))

            sign = 1 if is_positive_impact else -1
            
            if is_usd:
                amount_ars = app_ars_val * sign
                val_spent_in_ars_as_usd = app_ars_ars / tc if tc > 0 else 0
                amount_usd = (total_usd_doc - val_spent_in_ars_as_usd) * sign
            else:
                amount_usd = app_usd_val * sign
                amount_ars = (total_ars_doc - app_usd_ars) * sign

        if abs(amount_ars) < 0.005: amount_ars = 0.0
        if abs(amount_usd) < 0.00005: amount_usd = 0.0
        
        balance_ars += amount_ars
        balance_usd += amount_usd

        apps = applied_from_map.get(doc.id, {})
        applied_total = sum(v[0] for v in apps.values())
        applied_total_ars = sum(v[1] for v in apps.values())

        if not has_apps:
            applied_already = applied_to_map.get(doc.id, 0.0)
            remaining = max(0.0, total_usd_doc - applied_already)
            
            if remaining < 0.01: payment_status = "PAID"
            elif remaining < total_usd_doc: payment_status = "PARTIAL"
            else: payment_status = "OPEN"
        else:
            total_target = total_usd_doc if is_usd else total_ars_doc
            applied_target = applied_total if is_usd else applied_total_ars
            remaining = max(0.0, total_target - applied_target)
            
            if applied_target >= total_target - 0.05:
                payment_status = "PAID"
            elif applied_target > 0.05:
                payment_status = "PARTIAL"
            else:
                payment_status = "OPEN"
        
        show_this = True
        if only_unapplied and payment_status == "PAID":
            show_this = False
        
        if only_overdue:
            is_overdue = False
            if doc.due_date and doc.due_date.date() < datetime.now().date() and payment_status != "PAID":
                is_overdue = True
            if not is_overdue:
                show_this = False

        if show_this:
            entry = {
                "id": doc.id,
                "date": doc.date.isoformat() if doc.date else None,
                "doc_type": doc.doc_type.value if hasattr(doc.doc_type, "value") else str(doc.doc_type),
                "payment_status": payment_status,
                "number": doc.number,
                "due_date": doc.due_date.isoformat() if doc.due_date else None,
                "currency": doc.currency.value if hasattr(doc.currency, "value") else str(doc.currency),
                "exchange_rate": tc,
                "total_amount": total_usd_doc,
                "total_amount_ars": total_ars_doc,
                "status": doc.status.value if hasattr(doc.status, "value") else str(doc.status),
                "notes": doc.notes,
                "sale_condition": (doc.sale_condition.description if doc.sale_condition else sc_map.get(str(doc.sale_condition_id).lower().strip())) if (doc.sale_condition_id and str(doc.sale_condition_id).strip()) else None,
                "is_initial_load": doc.is_initial_load or False,
                "amount_ars": amount_ars,
                "amount_usd": amount_usd,
                "balance_ars": balance_ars,
                "balance_usd": balance_usd,
                "applied_amount": applied_total,
                "applied_amount_ars": applied_total_ars,
                "remaining": remaining,
                "remaining_ars": max(0.0, total_ars_doc - applied_total_ars),
                "lines": []
            }
            entries.append(entry)

    return list(entries)
