from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_, desc, case
from datetime import datetime, timedelta
from typing import List, Optional, Dict
import traceback

from app.db.session import get_db
from app.db.models.commercial_models import (
    SalesOrder, OrderStatus, 
    DeliveryNote, DeliveryNoteStatus,
    Product, StockItem
)
from app.db.models.models import (
    Document, DocumentType, Entity, EntityType,
    AccountMovement, DocumentStatus, Vehicle,
    Application, CurrencyType
)
from app.db.models.finance_models import Cheque
from app.db.models.auth_models import CashPosition, CashMovement, ExchangeRate

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

# Caching mechanism
_dashboard_cache = {
    "data": None,
    "expires": datetime.utcnow() - timedelta(hours=1)
}
CACHE_TTL_SECONDS = 30 # 30 seconds of TTL for the dashboard

@router.get("/drilldown/{type}")
def get_dashboard_drilldown(type: str, cost_center: Optional[int] = None, db: Session = Depends(get_db)):
    """
    Retorna el detalle (ítems) que compone un cuello de botella específico.
    Permite pasar del número agregado (Ej: 1M USD pendiente) a la lista accionable.
    """
    if type == "to_invoice":
        # Remitos Pendientes de Facturar
        query = db.query(DeliveryNote).options(joinedload(DeliveryNote.entity)).filter(
            DeliveryNote.status.in_([DeliveryNoteStatus.DISPATCHED, DeliveryNoteStatus.PARTIAL])
        )
        if cost_center:
            query = query.filter(DeliveryNote.cost_center == cost_center)
            
        dns = query.order_by(DeliveryNote.date.desc()).all()
        
        # Enriquecemos con el total de sus líneas si el campo header no está denormalizado
        results = []
        from sqlalchemy import func
        from app.db.models.commercial_models import DeliveryNoteLine
        
        for dn in dns:
            # Si el header ya tiene total_amount, lo usamos; si no, sumamos líneas.
            # (Depende de si se configuró el trigger de actualización)
            lines_total = db.query(func.sum(DeliveryNoteLine.total_amount)).filter(DeliveryNoteLine.delivery_note_id == dn.id).scalar() or 0.0
            
            results.append({
                "id": dn.id,
                "number": dn.number,
                "date": dn.date,
                "entity": dn.entity.name if dn.entity else "S/D",
                "entity_id": dn.entity_id,
                "total": float(dn.total_amount or lines_total),
                "currency": dn.currency,
                "amount_ars": float(dn.total_amount_ars or (lines_total * (dn.exchange_rate or 1) if dn.currency == CurrencyType.USD else lines_total))
            })
        return results
        
    elif type == "to_deliver":
        # Órdenes de Venta Pendientes de Entregar
        query = db.query(SalesOrder).options(joinedload(SalesOrder.entity)).filter(
            SalesOrder.status.in_([OrderStatus.APPROVED, OrderStatus.PARTIAL])
        )
        if cost_center:
            query = query.filter(SalesOrder.cost_center == cost_center)
            
        orders = query.order_by(SalesOrder.date.desc()).all()
        return [{
            "id": o.id, "number": o.number, "date": o.date, "entity": o.entity.name if o.entity else "S/D",
            "total": float(o.total_amount or 0), "currency": o.currency, "amount_ars": float(o.total_amount_ars or 0)
        } for o in orders]
        
    return []

# Global logger for direct debugging without terminal
def log_debug(msg):
    with open("dashboard_debug.txt", "a") as f:
        f.write(f"[{datetime.now()}] {msg}\n")

@router.get("/summary")
def get_dashboard_summary(cost_center: Optional[int] = None, db: Session = Depends(get_db)):
    # 0. Check Cache (Include cost_center in cache key logic if needed, but for simplicity we invalidate with time or params)
    now = datetime.now()
    cache_key = f"dashboard_{cost_center}"
    
    # We'll use a slightly different cache structure to support cost_center
    if not hasattr(router, "_dashboard_caches"):
        router._dashboard_caches = {}
    
    cached = router._dashboard_caches.get(cache_key)
    if cached and cached["expires"] > now:
        return cached["data"]

    log_debug(f"Starting dashboard summary (Refreshed) - CostCenter: {cost_center}")
    try:
        # 1. KPIs & Base Data
        first_day_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        kpi_query = db.query(
            Document.doc_type,
            func.sum(Document.total_amount_ars),
            func.sum(case((Document.currency == CurrencyType.USD, Document.total_amount), else_=Document.total_amount / func.nullif(Document.exchange_rate, 0)))
        ).filter(
            Document.date >= first_day_of_month,
            Document.doc_type.in_([DocumentType.INVOICE, DocumentType.PURCHASE_INVOICE])
        )
        if cost_center:
            kpi_query = kpi_query.filter(Document.cost_center == cost_center)
        
        kpi_results = kpi_query.group_by(Document.doc_type).all()
        
        kpi_map = {row[0]: {"ars": float(row[1] or 0), "usd": float(row[2] or 0)} for row in kpi_results}
        sales_month = kpi_map.get(DocumentType.INVOICE, {"ars": 0, "usd": 0})["ars"]
        sales_month_usd = kpi_map.get(DocumentType.INVOICE, {"ars": 0, "usd": 0})["usd"]
        purchases_month = kpi_map.get(DocumentType.PURCHASE_INVOICE, {"ars": 0, "usd": 0})["ars"]
            
        # Productos Críticos (Bajo Stock) - Optimized query with outer join
        low_stock_count = 0
        critical_products = []
        try:
            # We use outerjoin to include products without any StockItem records (Zero stock)
            critical_query = db.query(Product).outerjoin(
                StockItem, Product.id == StockItem.product_id
            ).group_by(Product.id).having(
                or_(
                    func.coalesce(func.sum(StockItem.qty_on_hand), 0) < 0,
                    and_(
                        Product.min_stock > 0, 
                        func.coalesce(func.sum(StockItem.qty_on_hand), 0) <= Product.min_stock
                    )
                )
            ).filter(
                Product.active == True,
                Product.is_service == False,
                Product.track_stock == True
            )
            
            low_stock_count = critical_query.count()
            critical_products = critical_query.limit(3).all()
        except Exception as e:
            log_debug(f"Error in critical stock: {e}")
        
        # Remitos a Facturar (Join with lines since header doesn't have total_amount)
        from app.db.models.commercial_models import DeliveryNoteLine
        pending_dn_q = db.query(
            func.count(func.distinct(DeliveryNote.id)),
            func.sum(case((DeliveryNote.currency == CurrencyType.USD, DeliveryNoteLine.total_amount * DeliveryNote.exchange_rate), else_=DeliveryNoteLine.total_amount)), # ARS approx
            func.sum(case((DeliveryNote.currency == CurrencyType.USD, DeliveryNoteLine.total_amount), else_=DeliveryNoteLine.total_amount / func.nullif(DeliveryNote.exchange_rate, 0))) # USD approx
        ).select_from(DeliveryNote).join(DeliveryNoteLine).filter(
            DeliveryNote.status == DeliveryNoteStatus.DISPATCHED
        )
        if cost_center:
            pending_dn_q = pending_dn_q.filter(DeliveryNote.cost_center == cost_center) 
            
        pending_dn_data = pending_dn_q.first()

        pending_delivery_notes = int(pending_dn_data[0] or 0)
        pending_delivery_notes_ars = float(pending_dn_data[1] or 0)
        pending_delivery_notes_usd = float(pending_dn_data[2] or 0)

        # Clientes Activos (Filtrando por tipo)
        active_clients_count = db.query(Entity).filter(
            Entity.type.in_([EntityType.CLIENT, EntityType.MIXED])
        ).count()
        
        # 2. Posición Consolidada (AR/AP/Checks)
        debit_types = [DocumentType.INVOICE, DocumentType.DEBIT_NOTE, DocumentType.PURCHASE_INVOICE]
        
        # Subquery para aplicaciones (monto pagado por documento)
        applied_subquery = db.query(
            Application.to_document_id.label("doc_id"),
            func.sum(Application.amount_applied_ars).label("applied_ars"),
            func.sum(Application.amount_applied).label("applied_orig")
        ).group_by(Application.to_document_id).subquery()

        # AR Total (ARS Equivalent)
        ar_q = db.query(func.sum(
            case(
                (Document.currency == CurrencyType.ARS, Document.total_amount_ars - func.coalesce(applied_subquery.c.applied_ars, 0)),
                else_=(Document.total_amount - func.coalesce(applied_subquery.c.applied_orig, 0)) * Document.exchange_rate
            )
        )).join(Entity, Document.entity_id == Entity.id).outerjoin(
            applied_subquery, Document.id == applied_subquery.c.doc_id
        ).filter(
            Entity.type.in_([EntityType.CLIENT, EntityType.MIXED]),
            Document.status.in_([DocumentStatus.OPEN, DocumentStatus.PARTIAL])
        )
        if cost_center:
            ar_q = ar_q.filter(Document.cost_center == cost_center)
        ar_total_ars = ar_q.scalar() or 0

        # AR Total (Neto USD Equivalent) - Linea 98
        ar_usd_q = db.query(func.sum(
            case(
                (Document.currency == CurrencyType.USD, Document.total_amount - func.coalesce(applied_subquery.c.applied_orig, 0)),
                else_=(Document.total_amount - func.coalesce(applied_subquery.c.applied_orig, 0)) / Document.exchange_rate
            )
        )).join(Entity, Document.entity_id == Entity.id).outerjoin(
            applied_subquery, Document.id == applied_subquery.c.doc_id
        ).filter(
            Entity.type.in_([EntityType.CLIENT, EntityType.MIXED]),
            Document.status.in_([DocumentStatus.OPEN, DocumentStatus.PARTIAL])
        )
        if cost_center:
            ar_usd_q = ar_usd_q.filter(Document.cost_center == cost_center)
        ar_total = ar_usd_q.scalar() or 0
        
        # AR Vencido (Desglosado)
        ar_ov_ars_q = db.query(func.sum(
            Document.total_amount_ars - func.coalesce(applied_subquery.c.applied_ars, 0)
        )).join(Entity, Document.entity_id == Entity.id).outerjoin(
            applied_subquery, Document.id == applied_subquery.c.doc_id
        ).filter(
            Entity.type.in_([EntityType.CLIENT, EntityType.MIXED]),
            Document.doc_type.in_([DocumentType.INVOICE, DocumentType.DEBIT_NOTE]),
            Document.status.in_([DocumentStatus.OPEN, DocumentStatus.PARTIAL]),
            Document.due_date < now,
            Document.currency == CurrencyType.ARS
        )
        if cost_center:
            ar_ov_ars_q = ar_ov_ars_q.filter(Document.cost_center == cost_center)
        ar_ov_ars = ar_ov_ars_q.scalar() or 0

        ar_ov_usd_q = db.query(func.sum(
            Document.total_amount - func.coalesce(applied_subquery.c.applied_orig, 0)
        )).join(Entity, Document.entity_id == Entity.id).outerjoin(
            applied_subquery, Document.id == applied_subquery.c.doc_id
        ).filter(
            Entity.type.in_([EntityType.CLIENT, EntityType.MIXED]),
            Document.doc_type.in_([DocumentType.INVOICE, DocumentType.DEBIT_NOTE]),
            Document.status.in_([DocumentStatus.OPEN, DocumentStatus.PARTIAL]),
            Document.due_date < now,
            Document.currency == CurrencyType.USD
        )
        if cost_center:
            ar_ov_usd_q = ar_ov_usd_q.filter(Document.cost_center == cost_center)
        ar_ov_usd = ar_ov_usd_q.scalar() or 0

        # AP Total (ARS Equivalent)
        ap_q = db.query(func.sum(
            case(
                (Document.currency == CurrencyType.ARS, Document.total_amount_ars - func.coalesce(applied_subquery.c.applied_ars, 0)),
                else_=(Document.total_amount - func.coalesce(applied_subquery.c.applied_orig, 0)) * Document.exchange_rate
            )
        )).join(Entity, Document.entity_id == Entity.id).outerjoin(
            applied_subquery, Document.id == applied_subquery.c.doc_id
        ).filter(
            Entity.type.in_([EntityType.PROVIDER, EntityType.MIXED]),
            Document.status.in_([DocumentStatus.OPEN, DocumentStatus.PARTIAL])
        )
        if cost_center:
            ap_q = ap_q.filter(Document.cost_center == cost_center)
        ap_total_ars = ap_q.scalar() or 0

        # AP Total (Neto) - Sumamos el saldo de todos los documentos abiertos en USD equivalente
        ap_usd_q = db.query(func.sum(
            case(
                (Document.currency == CurrencyType.USD, Document.total_amount - func.coalesce(applied_subquery.c.applied_orig, 0)),
                else_=(Document.total_amount - func.coalesce(applied_subquery.c.applied_orig, 0)) / Document.exchange_rate
            )
        )).join(Entity, Document.entity_id == Entity.id).outerjoin(
            applied_subquery, Document.id == applied_subquery.c.doc_id
        ).filter(
            Entity.type.in_([EntityType.PROVIDER, EntityType.MIXED]),
            Document.status.in_([DocumentStatus.OPEN, DocumentStatus.PARTIAL])
        )
        if cost_center:
            ap_usd_q = ap_usd_q.filter(Document.cost_center == cost_center)
        ap_total = ap_usd_q.scalar() or 0
        
        # AP Vencido (Desglosado)
        ap_ov_ars_q = db.query(func.sum(
            Document.total_amount_ars - func.coalesce(applied_subquery.c.applied_ars, 0)
        )).join(Entity, Document.entity_id == Entity.id).outerjoin(
            applied_subquery, Document.id == applied_subquery.c.doc_id
        ).filter(
            Entity.type.in_([EntityType.PROVIDER, EntityType.MIXED]),
            Document.doc_type == DocumentType.PURCHASE_INVOICE,
            Document.status.in_([DocumentStatus.OPEN, DocumentStatus.PARTIAL]),
            Document.due_date < now,
            Document.currency == CurrencyType.ARS
        )
        if cost_center:
            ap_ov_ars_q = ap_ov_ars_q.filter(Document.cost_center == cost_center)
        ap_ov_ars = ap_ov_ars_q.scalar() or 0

        ap_ov_usd_q = db.query(func.sum(
            Document.total_amount - func.coalesce(applied_subquery.c.applied_orig, 0)
        )).join(Entity, Document.entity_id == Entity.id).outerjoin(
            applied_subquery, Document.id == applied_subquery.c.doc_id
        ).filter(
            Entity.type.in_([EntityType.PROVIDER, EntityType.MIXED]),
            Document.doc_type == DocumentType.PURCHASE_INVOICE,
            Document.status.in_([DocumentStatus.OPEN, DocumentStatus.PARTIAL]),
            Document.due_date < now,
            Document.currency == CurrencyType.USD
        )
        if cost_center:
            ap_ov_usd_q = ap_ov_usd_q.filter(Document.cost_center == cost_center)
        ap_ov_usd = ap_ov_usd_q.scalar() or 0

        checks_q = db.query(func.sum(Cheque.importe)).filter(Cheque.estado.in_(["EN_CARTERA", "PENDIENTE"]))
        if cost_center:
            checks_q = checks_q.filter(Cheque.cost_center == cost_center)
        checks_total = checks_q.scalar() or 0
        
        # 3. Alertas
        alerts = []
        try:
            # Fleet Alerts: VTV or Insurance expiring soon (15 days)
            deadline = now + timedelta(days=15)
            fleet_alerts = db.query(Vehicle).filter(
                Vehicle.active == True,
                or_(
                    Vehicle.insurance_due <= deadline,
                    Vehicle.vtv_due <= deadline
                )
            ).all()

            for v in fleet_alerts:
                if v.insurance_due and v.insurance_due <= deadline:
                    days = (v.insurance_due - now).days
                    alerts.append({
                        "type": "urgent" if days <= 3 else "warning",
                        "title": f"Seguro Vence: {v.name}",
                        "desc": f"Patente: {v.plate} · Vence en {days} días ({v.insurance_due.strftime('%d/%m')})",
                        "icon": "ShieldAlert"
                    })
                if v.vtv_due and v.vtv_due <= deadline:
                    days = (v.vtv_due - now).days
                    alerts.append({
                        "type": "urgent" if days <= 3 else "warning",
                        "title": f"VTV Vence: {v.name}",
                        "desc": f"Patente: {v.plate} · Vence en {days} días ({v.vtv_due.strftime('%d/%m')})",
                        "icon": "Stethoscope"
                    })

            reject_q = db.query(Cheque).filter(
                Cheque.rechazado == True,
                Cheque.nd_realizada == False
            )
            if cost_center:
                reject_q = reject_q.filter(Cheque.cost_center == cost_center)
            rejected_checks = reject_q.limit(3).all()
            for c in rejected_checks:
                alerts.append({
                    "type": "urgent",
                    "title": f"Cheque Rechazado #{c.nro_cheque}",
                    "desc": "Emisor: {0} · ${1:,.2f}".format(c.cuit_emisor or 'S/D', float(c.importe or 0)),
                    "icon": "AlertTriangle"
                })
        except Exception as e:
            log_debug(f"Error in fleet/check alerts: {e}")
            
        for p in critical_products:
            alerts.append({
                "type": "warning",
                "title": f"Stock Bajo: {p.name}",
                "desc": f"SKU: {p.sku} · Quedan pocas unidades",
                "icon": "Package"
            })
            
        # 4. Cronología (limit results to essential fields)
        activity = []
        try:
            act_q = db.query(Document).order_by(Document.created_at.desc())
            if cost_center:
                act_q = act_q.filter(Document.cost_center == cost_center)
            recent_docs = act_q.limit(5).all()
            for doc in recent_docs:
                dtype_str = str(doc.doc_type.value if hasattr(doc.doc_type, 'value') else doc.doc_type)
                emoji = {
                    "RECEIPT": "💰",
                    "PAYMENT": "📤",
                    "INVOICE": "📄",
                    "PURCHASE_INVOICE": "🛒"
                }.get(dtype_str, "📄")
                
                ent_name = doc.entity.name if doc.entity else "S/D"
                date_str = doc.created_at.strftime('%d/%m %H:%M') if doc.created_at else ""

                activity.append({
                    "type": dtype_str.lower(),
                    "title": f"{dtype_str} #{doc.number or 'S/N'}",
                    "meta": f"{ent_name} · {date_str}",
                    "icon": emoji,
                    "entity": ent_name,
                    "amount": float(doc.total_amount_ars),
                    "status": doc.status.value if hasattr(doc.status, 'value') else doc.status,
                    "currency": doc.currency.value if hasattr(doc.currency, 'value') else doc.currency
                })
        except Exception as e:
            log_debug(f"Error in activity: {e}")
 
        # 5. Ventas por Unidad de Negocio (Mes Actual)
        sales_by_unit = []
        try:
            unit_q = db.query(
                Document.unidad_negocio,
                func.sum(Document.total_amount_ars)
            ).filter(
                Document.date >= first_day_of_month,
                Document.doc_type == DocumentType.INVOICE,
                Document.unidad_negocio != None
            )
            if cost_center:
                unit_q = unit_q.filter(Document.cost_center == cost_center)
            unit_query_results = unit_q.group_by(Document.unidad_negocio).all()
            
            total_sales = sum(float(row[1] or 0) for row in unit_query_results)
            for unit, amount in unit_query_results:
                sales_by_unit.append({
                    "label": unit,
                    "value": float(amount or 0),
                    "pct": round((float(amount or 0) / total_sales * 100), 1) if total_sales > 0 else 0
                })
        except Exception as e:
            log_debug(f"Error in sales by unit: {e}")

        # 6. Próximos Vencimientos (Documentos y Cheques)
        upcoming_deadlines = []
        try:
            target_date = now + timedelta(days=15)
            
            # Docs por cobrar/pagar
            up_docs_q = db.query(Document).filter(
                Document.status.in_([DocumentStatus.OPEN, DocumentStatus.PARTIAL]),
                Document.due_date >= now,
                Document.due_date <= target_date
            )
            if cost_center:
                up_docs_q = up_docs_q.filter(Document.cost_center == cost_center)
            docs_upcoming = up_docs_q.order_by(Document.due_date.asc()).limit(4).all()
            
            for d in docs_upcoming:
                upcoming_deadlines.append({
                    "type": "document",
                    "title": f"{d.doc_type} #{d.number}",
                    "date": d.due_date.strftime('%d/%m'),
                    "amount": float(d.total_amount),
                    "currency": d.currency.value if hasattr(d.currency, 'value') else d.currency,
                    "entity": d.entity.name if d.entity else "S/D"
                })
                
            # Cheques a depositar/cobrar
            up_ch_q = db.query(Cheque).filter(
                Cheque.estado == "EN_CARTERA",
                Cheque.f_pago >= now.date(),
                Cheque.f_pago <= target_date.date()
            )
            if cost_center:
                up_ch_q = up_ch_q.filter(Cheque.cost_center == cost_center)
            checks_upcoming = up_ch_q.order_by(Cheque.f_pago.asc()).limit(3).all()
            
            for c in checks_upcoming:
                upcoming_deadlines.append({
                    "type": "check",
                    "title": f"Cheque #{c.nro_cheque}",
                    "date": c.f_pago.strftime('%d/%m'),
                    "amount": float(c.importe),
                    "currency": "ARS",
                    "entity": c.banco or "S/D"
                })
            
            upcoming_deadlines = sorted(upcoming_deadlines, key=lambda x: x['date'])[:6]
        except Exception as e:
            log_debug(f"Error in upcoming: {e}")

        # 7. Precios de Granos (No afectado por Cost Center)
        def get_grain_prices():
            import requests
            try:
                headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
                symbols = {
                    "Soja CBOT": ("ZS=F", 36.7437),
                    "Maíz CBOT": ("ZC=F", 39.368),
                    "Trigo CBOT": ("ZW=F", 36.7437)
                }
                results = []
                for label, (sym, multiplier) in symbols.items():
                    # Usar timeout bajo para no trabar el dashboard
                    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&range=2d"
                    r = requests.get(url, headers=headers, timeout=1.5)
                    if r.status_code == 200:
                        data = r.json()
                        meta = data['chart']['result'][0]['meta']
                        price = meta['regularMarketPrice']
                        prev_close = meta['chartPreviousClose']
                        
                        # Convertir de centavos/bushel a USD/Tonelada
                        price_ton = (price / 100) * multiplier
                        trend = ((price - prev_close) / prev_close) * 100
                        trend_str = f"{'+' if trend > 0 else ''}{trend:.1f}"
                        
                        results.append({
                            "label": label,
                            "value": round(price_ton, 1),
                            "trend": trend_str,
                            "currency": "USD"
                        })
                # Si falló alguno, usar fallback
                if len(results) == len(symbols):
                    return results
            except Exception as e:
                log_debug(f"Error fetching grain prices: {e}")
            
            # Fallback values
            return [
                {"label": "Soja CBOT", "value": 435.2, "trend": "+0.5", "currency": "USD"},
                {"label": "Maíz CBOT", "value": 178.5, "trend": "-0.2", "currency": "USD"},
                {"label": "Trigo CBOT", "value": 215.0, "trend": "0.0", "currency": "USD"}
            ]
        
        grain_prices = get_grain_prices()

        # 8. Composición de Deuda (Aging)
        debt_aging = [
            {"label": "0-30 días", "value": 0},
            {"label": "31-60 días", "value": 0},
            {"label": "61+ días", "value": 0}
        ]
        try:
            aging_q = db.query(
                case(
                    (Document.due_date >= now - timedelta(days=30), "0-30 días"),
                    (Document.due_date >= now - timedelta(days=60), "31-60 días"),
                    else_="61+ días"
                ).label("age_group"),
                func.sum(Document.total_amount_ars)
            ).join(Entity, Document.entity_id == Entity.id).filter(
                Entity.type.in_([EntityType.CLIENT, EntityType.MIXED]),
                Document.doc_type.in_([DocumentType.INVOICE, DocumentType.DEBIT_NOTE]),
                Document.status.in_([DocumentStatus.OPEN, DocumentStatus.PARTIAL])
            )
            if cost_center:
                aging_q = aging_q.filter(Document.cost_center == cost_center)
            aging_query_res = aging_q.group_by("age_group").all()
            
            aging_map = {row[0]: float(row[1] or 0) for row in aging_query_res}
            debt_aging = [
                {"label": "0-30 días", "value": aging_map.get("0-30 días", 0)},
                {"label": "31-60 días", "value": aging_map.get("31-60 días", 0)},
                {"label": "61+ días", "value": aging_map.get("61+ días", 0)}
            ]
        except Exception as e:
            log_debug(f"Error in debt aging: {e}")

        # 9. Commercial Funnel (Ordered -> Delivered -> Invoiced -> Collected)
        funnel = {}
        try:
            # Stage 1: Ordered (Confirmed SOs this month)
            so_q = db.query(func.sum(
                case(
                    (SalesOrder.currency == "USD", SalesOrder.total_amount),
                    else_=SalesOrder.total_amount / func.nullif(SalesOrder.exchange_rate, 0)
                )
            )).filter(
                SalesOrder.date >= first_day_of_month,
                SalesOrder.status != OrderStatus.CANCELLED
            )
            if cost_center:
                so_q = so_q.filter(SalesOrder.cost_center == cost_center)
            ordered_usd = so_q.scalar() or 0

            # Stage 2: Delivered (Sum of DNs dispatched this month)
            dn_q = db.query(func.sum(
                case(
                    (DeliveryNote.currency == "USD", DeliveryNoteLine.total_amount),
                    else_=DeliveryNoteLine.total_amount / func.nullif(DeliveryNote.exchange_rate, 0)
                )
            )).select_from(DeliveryNote).join(DeliveryNoteLine).filter(
                DeliveryNote.date >= first_day_of_month,
                DeliveryNote.status != DeliveryNoteStatus.CANCELLED
            )
            if cost_center:
                dn_q = dn_q.filter(DeliveryNote.cost_center == cost_center)
            delivered_usd = dn_q.scalar() or 0

            # Stage 3: Invoiced (Already calculated in sales_month_usd)
            invoiced_usd = sales_month_usd

            # Stage 4: Collected (Applications to invoices this month)
            coll_q = db.query(func.sum(
                Application.amount_applied # This is usually in document currency (USD/ARS normalized)
            )).join(Document, Application.to_document_id == Document.id).filter(
                Application.date >= first_day_of_month,
                Document.doc_type == DocumentType.INVOICE
            )
            if cost_center:
                coll_q = coll_q.filter(Document.cost_center == cost_center)
            collected_usd = coll_q.scalar() or 0

            funnel = {
                "ordered": float(ordered_usd),
                "delivered": float(delivered_usd),
                "invoiced": float(invoiced_usd),
                "collected": float(collected_usd),
                "bottlenecks": {
                    "to_deliver": float(max(0, ordered_usd - delivered_usd)),
                    "to_invoice": float(max(0, delivered_usd - invoiced_usd)),
                    "to_collect": float(max(0, invoiced_usd - collected_usd))
                }
            }
        except Exception as e:
            log_debug(f"Error in funnel: {e}")

        result = {
            "kpis": {
                "sales_month": float(sales_month),
                "sales_month_usd": float(sales_month_usd),
                "purchases_month": float(purchases_month),
                "low_stock_count": int(low_stock_count),
                "pending_delivery_notes": int(pending_delivery_notes),
                "pending_delivery_notes_ars": float(pending_delivery_notes_ars),
                "pending_delivery_notes_usd": float(pending_delivery_notes_usd),
                "active_clients_count": int(active_clients_count)
            },
            "financial": {
                "ar_total": float(ar_total),
                "ar_total_ars": float(ar_total_ars),
                "ar_overdue": {
                    "ars": float(ar_ov_ars),
                    "usd": float(ar_ov_usd)
                },
                "ap_total": float(ap_total),
                "ap_total_ars": float(ap_total_ars),
                "ap_overdue": {
                    "ars": float(ap_ov_ars),
                    "usd": float(ap_ov_usd)
                },
                "checks_total": float(checks_total),
                "aging": debt_aging
            },
            "funnel": funnel,
            "sales_by_unit": sales_by_unit,
            "activity": activity,
            "alerts": alerts,
            "upcoming": upcoming_deadlines,
            "grain_prices": grain_prices
        }
        
        # Update Cache
        router._dashboard_caches[cache_key] = {
        "data": result,
        "expires": now + timedelta(seconds=CACHE_TTL_SECONDS)
    }
    except Exception as e:
        log_debug(f"CRITICAL ERROR in dashboard summary: {e}")
        import traceback
        traceback.print_exc()
        result = {"error": str(e)}

    return result

@router.get("/alerts")
def get_dashboard_alerts(db: Session = Depends(get_db)):
    """
    Motor de Alertas Tempranas (Early Warning System).
    Analiza facturas vencidas, stock bajo y cheques por vencer.
    """
    try:
        alerts = []
        now = datetime.now()
        today = now.date()
        
        # 1. Facturas Vencidas (>7 días crítico)
        overdue_docs = db.query(Document).filter(
            Document.doc_type == DocumentType.INVOICE,
            Document.status.in_([DocumentStatus.OPEN, DocumentStatus.PARTIAL]),
            Document.due_date < today
        ).order_by(Document.due_date.asc()).all()
        
        for doc in overdue_docs:
            d_date = doc.due_date if hasattr(doc.due_date, "days") or not hasattr(doc.due_date, "date") else datetime.combine(doc.due_date, datetime.min.time())
            # Convert both to date for subtraction or use combine
            try:
                doc_date_val = doc.due_date.date() if hasattr(doc.due_date, "date") else doc.due_date
                days = (today - doc_date_val).days
            except Exception:
                days = 0

            severity = "high" if days > 7 else "medium"
            alerts.append({
                "id": f"overdue-{doc.id}",
                "title": f"Factura Vencida: {doc.number}",
                "desc": f"Venció hace {days} días. Deuda pendiente detectada.",
                "severity": severity,
                "type": "overdue",
                "created_at": doc.due_date,
                "doc_id": doc.id,
                "module": "/ventas/facturas"
            })

        # 2. Stock Bajo (Current < Min)
        products = db.query(Product).options(joinedload(Product.stock_items)).filter(Product.active == True, Product.is_service == False).all()
        for p in products:
            total_stock = sum(float(item.qty_on_hand or 0) for item in p.stock_items)
            if p.min_stock > 0 and total_stock < p.min_stock:
                alerts.append({
                    "id": f"stock-{p.id}",
                    "title": f"Stock Bajo: {p.name}",
                    "desc": f"Quedan {total_stock:g} unidades (Mínimo: {p.min_stock:g}). Reposición recomendada.",
                    "severity": "medium" if total_stock > (p.min_stock * 0.5) else "high",
                    "type": "low_stock",
                    "created_at": now,
                    "sku": p.sku,
                    "module": "/inventario/articulos"
                })

        # 3. Cheques por Vencer (Hoy +/- 2 días)
        start_window = (now - timedelta(days=2)).date()
        end_window = (now + timedelta(days=2)).date()
        pending_cheques = db.query(Cheque).filter(
            Cheque.f_vencimiento >= start_window,
            Cheque.f_vencimiento <= end_window,
            Cheque.estado.in_(["CARTERA", "RECHAZADO"]) # Asumimos estados
        ).all()
        
        for ch in pending_cheques:
            is_today = ch.f_vencimiento == now.date()
            alerts.append({
                "id": f"cheque-{ch.id}",
                "title": f"Cheque por Vencer: {ch.nro_cheque}",
                "desc": f"Vence { 'HOY' if is_today else ch.f_vencimiento.strftime('%d/%m/%Y') }. Banco {ch.banco}.",
                "severity": "high" if is_today or ch.f_vencimiento < now.date() else "medium",
                "type": "cheque",
                "created_at": datetime.combine(ch.f_vencimiento, datetime.min.time()),
                "cheque_id": ch.id,
                "module": "/finanzas/cheques"
            })

        # Ordenar por severidad (high primero)
        severity_map = {"high": 3, "medium": 2, "low": 1}
        alerts.sort(key=lambda x: severity_map.get(x["severity"], 0), reverse=True)
        
        return alerts
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"dashboard alerts error: {e}", exc_info=True)
        return []

@router.get("/cash-flow-forecast")
def get_cash_flow_forecast(cost_center: Optional[int] = None, db: Session = Depends(get_db)):
    """
    Motor de Proyección de Flujo de Caja.
    Proyecta ingresos y egresos para los próximos 30 días basándose en vtos.
    """
    try:
        now = datetime.now()
        end_date = now + timedelta(days=30)
        
        # 1. Saldo Inicial ARS (Caja Abierta)
        pos_q = db.query(CashPosition).filter(CashPosition.status == "OPEN")
        if cost_center:
            pos_q = pos_q.filter(CashPosition.cost_center == cost_center) # Note: requires CashPosition to have cost_center
            
        pos = pos_q.order_by(desc(CashPosition.opened_at)).first()
        rate = db.query(ExchangeRate).order_by(desc(ExchangeRate.timestamp)).first()
        xr = rate.sell if rate else 1000.0
        
        initial_balance = 0.0
        if pos and pos.opening_balances:
            balances = pos.opening_balances
            initial_balance += float(balances.get("ARS", 0))
            initial_balance += float(balances.get("USD", 0)) * xr
        
        # 2. Obtener Ingresos Futuros (Invoices + Cheques)
        incomes_q = db.query(Document).filter(
            Document.doc_type == DocumentType.INVOICE,
            Document.status.in_([DocumentStatus.OPEN, DocumentStatus.PARTIAL]),
            Document.due_date >= now.date(),
            Document.due_date <= end_date.date()
        )
        if cost_center:
            incomes_q = incomes_q.filter(Document.cost_center == cost_center)
        incomes = incomes_q.all()
        
        cheques_q = db.query(Cheque).filter(
            Cheque.f_vencimiento >= now.date(),
            Cheque.f_vencimiento <= end_date.date(),
            Cheque.estado == "EN_CARTERA"  # Corrected status
        )
        if cost_center:
            cheques_q = cheques_q.filter(Cheque.cost_center == cost_center)
        cheques = cheques_q.all()
        
        # 3. Obtener Egresos Futuros (Purchase Invoices)
        expenses_q = db.query(Document).filter(
            Document.doc_type == DocumentType.PURCHASE_INVOICE,
            Document.status.in_([DocumentStatus.OPEN, DocumentStatus.PARTIAL]),
            Document.due_date >= now.date(),
            Document.due_date <= end_date.date()
        )
        if cost_center:
            expenses_q = expenses_q.filter(Document.cost_center == cost_center)
        expenses = expenses_q.all()
        
        # 4. Agrupar por día
        daily_data = {}
        for i in range(31):
            day = (now + timedelta(days=i)).date()
            daily_data[day] = {"income": 0.0, "expense": 0.0, "balance": 0.0}
            
        for doc in incomes:
            amount = float(doc.total_amount)
            if doc.currency == CurrencyType.USD: amount *= xr
            d_date = doc.due_date if not hasattr(doc.due_date, "date") else doc.due_date.date()
            if d_date in daily_data:
                daily_data[d_date]["income"] += amount
            
        for ch in cheques:
            d_date = ch.f_vencimiento if not hasattr(ch.f_vencimiento, "date") else ch.f_vencimiento.date()
            if d_date in daily_data:
                daily_data[d_date]["income"] += float(ch.importe or 0)
                
        for doc in expenses:
            amount = float(doc.total_amount)
            if doc.currency == CurrencyType.USD: amount *= xr
            d_date = doc.due_date if not hasattr(doc.due_date, "date") else doc.due_date.date()
            if d_date in daily_data:
                daily_data[d_date]["expense"] += amount
                
        # 5. Generar Series Acumulada
        forecast = [
            {"date": now.strftime("%d/%m"), "income":0, "expense":0, "balance": round(initial_balance, 2)}
        ]
        current_acc = initial_balance
        
        for day in sorted(daily_data.keys()):
            stats = daily_data[day]
            current_acc += (stats["income"] - stats["expense"])
            forecast.append({
                "date": day.strftime("%d/%m"),
                "income": round(stats["income"], 2),
                "expense": round(stats["expense"], 2),
                "balance": round(current_acc, 2)
            })
            
        return {
            "initial_balance": initial_balance,
            "xr_used": xr,
            "forecast": forecast
        }

    except Exception as e:
        import traceback
        log_debug(f"GLOBAL ERROR in cash flow forecast: {e}\n{traceback.format_exc()}")
        return {
            "initial_balance": 0.0,
            "xr_used": 1000.0,
            "forecast": [],
            "error": str(e)
        }

@router.get("/rentability")
def get_daily_rentability(cost_center: Optional[int] = None, db: Session = Depends(get_db)):
    try:
        # 1. Movimientos de caja del d\u00eda
        today_str = datetime.now().strftime("%Y-%m-%d")
        from app.db.models.auth_models import CashPosition, CashMovement
        
        # Comparación robusta: convertir a string o comparar directamente con date
        pos = db.query(CashPosition).filter(
            func.date(CashPosition.date) == func.date(today_str)
        ).first()
        variation = {}
        if pos:
            try:
                mov_q = db.query(CashMovement).filter(CashMovement.cash_position_id == pos.id)
                # Cash movements usually don't have cost_center directly, but we might filter by Document's cost_center if joined
                movements = mov_q.all()
                for m in movements:
                    variation[m.currency] = variation.get(m.currency, 0) + m.amount
            except: pass
                
        # 2. Gastos prorrateados
        now = datetime.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        exp_q = db.query(func.sum(Document.total_amount_ars)).filter(
            Document.date >= today_start,
            Document.doc_type == DocumentType.PURCHASE_INVOICE
        )
        if cost_center:
            exp_q = exp_q.filter(Document.cost_center == cost_center)
        daily_expenses_ars = exp_q.scalar() or 0
        
        # 3. Ganancia expl\u00edcita
        sales_q = db.query(Document).filter(
            Document.date >= today_start,
            Document.doc_type == DocumentType.INVOICE
        )
        if cost_center:
            sales_q = sales_q.filter(Document.cost_center == cost_center)
        daily_sales = sales_q.all()
        
        explicit_profit = 0
        for s in daily_sales:
            try:
                cost = sum(l.total_cost for l in s.lines) if s.lines else 0
                explicit_profit += (s.total_amount_ars - (cost * s.exchange_rate))
            except: pass
            
        net_ars = (variation.get("ARS", 0)) - float(daily_expenses_ars or 0)
        
        return {
            "variation": variation,
            "daily_expenses_ars": float(daily_expenses_ars or 0),
            "explicit_profit": float(explicit_profit or 0),
            "net_ars": float(net_ars),
            "is_day_open": pos.status == "OPEN" if pos else False
        }
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"rentability error: {e}", exc_info=True)
        return {
            "variation": {}, "daily_expenses_ars": 0.0, "explicit_profit": 0.0, "net_ars": 0.0, "is_day_open": False
        }

@router.get("/sales-chart")
def get_sales_chart_data(cost_center: Optional[int] = None, db: Session = Depends(get_db)):
    try:
        # Ultimos 7 dias
        now = datetime.now()
        today_end = now.replace(hour=23, minute=59, second=59, microsecond=999)
        start_date = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Query sales per day
        sales_q = db.query(
            func.date(Document.date).label('day'),
            func.sum(Document.total_amount_ars).label('total_ars'),
            func.sum(case((Document.currency == CurrencyType.USD, Document.total_amount), else_=Document.total_amount / func.nullif(Document.exchange_rate, 0))).label('total_usd')
        ).filter(
            Document.date >= start_date,
            Document.date <= today_end,
            Document.doc_type == DocumentType.INVOICE
        )
        if cost_center:
            sales_q = sales_q.filter(Document.cost_center == cost_center)
            
        sales_query_results = sales_q.group_by(func.date(Document.date)).all()
        
        # Fill gaps to have exactly 7 entries
        result = []
        days_map_ars = {str(s.day): float(s.total_ars or 0.0) for s in sales_query_results}
        days_map_usd = {str(s.day): float(s.total_usd or 0.0) for s in sales_query_results}
        
        current = start_date
        while current <= today_end:
            day_str = current.strftime("%Y-%m-%d")
            # En SQLite/Postgres func.date puede devolver string o date object
            # Ajustamos busqueda flexible
            val_ars = days_map_ars.get(day_str, 0)
            val_usd = days_map_usd.get(day_str, 0)
            
            result.append({
                "label": current.strftime("%a"), # Lun, Mar...
                "value_ars": val_ars,
                "value_usd": val_usd,
                "date": day_str
            })
            current += timedelta(days=1)
            
        return result
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"sales-chart error: {e}", exc_info=True)
        return []
