"""
Módulo de Comisiones v2
=======================
- No genera comprobantes fiscales.
- No afecta IVA, cuenta corriente de cliente ni stock.
- Maneja tres modalidades: BY_COLLECTION, BY_MARGIN, BY_CASH.
- Monedas duales: USD y ARS siempre almacenadas.
- Liquidaciones puramente internas.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from uuid import uuid4

from app.db.session import get_db
from app.db.models import models
from app.modules.auth.auth_router import get_current_user

def _uuid(): return str(uuid4())

router = APIRouter(prefix="/commissions", tags=["commissions"])


# ─────────────────────────────────────────────────────────────────────────────
# Helpers de cálculo
# ─────────────────────────────────────────────────────────────────────────────

def _to_usd(amount: float, currency: str, rate: float) -> float:
    if str(currency).upper() == "USD":
        return float(amount)
    return float(amount) / float(rate or 1.0)

def _to_ars(amount_usd: float, rate: float) -> float:
    return float(amount_usd) * float(rate or 1.0)

def _get_current_tc(db: Session) -> float:
    """Obtiene el TC más reciente de la DB (último documento USD con TC > 1)."""
    from app.db.models.models import Document, CurrencyType
    last = db.query(Document.exchange_rate).filter(
        Document.currency == CurrencyType.USD,
        Document.exchange_rate > 1.0
    ).order_by(Document.date.desc()).first()
    return float(last[0]) if last else 1.0


def _calc_commission_by_collection(doc, seller) -> Dict[str, float]:
    """
    BY_COLLECTION: comision = neto_sin_iva * pct / 100
    La disponibilidad se calcula según el % cobrado del cliente.
    """
    pct = float(seller.commission_pct or 0)
    rate = float(doc.exchange_rate or 1.0)

    # Neto sin IVA. Si no hay campo net_amount directo, usar total / 1.21
    net_ars = sum(float(getattr(l, 'net_amount', 0) or 0) for l in doc.lines) if doc.lines else float(doc.total_amount or 0) / 1.21
    net_usd = _to_usd(net_ars, doc.currency, rate)

    comm_usd = net_usd * pct / 100.0
    comm_ars = net_ars * pct / 100.0

    legacy_comm_ars = float(getattr(doc, 'commission_amount', 0) or 0)
    if legacy_comm_ars > 0 and pct == 0:
        comm_ars = legacy_comm_ars
        comm_usd = _to_usd(comm_ars, getattr(doc, 'currency', 'ARS'), rate)

    # Porcentaje cobrado
    total = float(doc.total_amount or 0)
    allocated = float(doc.allocated_amount or 0)
    pct_cobrado = min(1.0, allocated / total) if total > 0 else 0.0

    available_usd = comm_usd * pct_cobrado
    available_ars = comm_ars * pct_cobrado

    return {
        "base_net_usd": net_usd, "base_net_ars": net_ars,
        "commission_amount_usd": comm_usd, "commission_amount_ars": comm_ars,
        "available_amount_usd": available_usd, "available_amount_ars": available_ars,
        "pct_cobrado": round(pct_cobrado * 100, 1),
    }


def _calc_commission_by_margin(doc, seller) -> Dict[str, float]:
    """
    BY_MARGIN: commission = (precio_venta - costo) * qty * margin_pct / 100
    """
    pct        = float(seller.commission_pct or 0)
    margin_pct = float(getattr(seller, 'margin_commission_pct', 100.0) or 100.0)
    rate       = float(doc.exchange_rate or 1.0)

    margin_ars = 0.0
    if doc.lines:
        for line in doc.lines:
            net  = float(getattr(line, 'net_amount',  0) or 0)
            cost = float(getattr(line, 'total_cost',  0) or 0)
            margin_ars += max(0.0, net - cost)
    else:
        margin_ars = float(doc.total_amount or 0) / 1.21  # fallback

    margin_usd = _to_usd(margin_ars, doc.currency, rate)

    # seller gets margin_pct% of the margin, then commission_pct% of that
    comm_usd = margin_usd * (margin_pct / 100.0) * (pct / 100.0)
    comm_ars = margin_ars * (margin_pct / 100.0) * (pct / 100.0)

    legacy_comm_ars = float(getattr(doc, 'commission_amount', 0) or 0)
    if legacy_comm_ars > 0 and pct == 0:
        comm_ars = legacy_comm_ars
        comm_usd = _to_usd(comm_ars, getattr(doc, 'currency', 'ARS'), rate)

    return {
        "base_net_usd": margin_usd, "base_net_ars": margin_ars,
        "commission_amount_usd": comm_usd, "commission_amount_ars": comm_ars,
        "available_amount_usd": comm_usd,   # margen: disponible inmediatamente
        "available_amount_ars": comm_ars,
        "pct_cobrado": 100.0,
    }


def _calc_commission_by_cash(collection_doc, seller) -> Dict[str, float]:
    """
    BY_CASH: commission = monto_cobrado * pct / 100
    """
    pct  = float(seller.commission_pct or 0)
    rate = float(collection_doc.exchange_rate or 1.0)

    total_ars = float(collection_doc.total_amount or 0)
    total_usd = _to_usd(total_ars, collection_doc.currency, rate)

    comm_usd = total_usd * pct / 100.0
    comm_ars = total_ars * pct / 100.0

    return {
        "base_net_usd": total_usd, "base_net_ars": total_ars,
        "commission_amount_usd": comm_usd, "commission_amount_ars": comm_ars,
        "available_amount_usd": comm_usd,
        "available_amount_ars": comm_ars,
        "pct_cobrado": 100.0,
    }


def _resolve_doc_commission_status(app: "models.CommissionApplication") -> str:
    """Determina el estado de una CommissionApplication."""
    paid_usd = app.paid_amount_usd or 0.0
    comm_usd = app.commission_amount_usd or 0.0
    
    if app.available_amount_usd == 0 and comm_usd > 0:
        return "PENDING"
    
    if paid_usd >= comm_usd - 0.01 and comm_usd > 0:
        return "PAID"
        
    if paid_usd > 0.01:
        return "PARTIAL"
        
    if app.available_amount_usd > 0.01:
        return "AVAILABLE"
    return "PENDING"


# ─────────────────────────────────────────────────────────────────────────────
# GET /commissions/sellers
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sellers")
def get_sellers_kpis(
    start_date: Optional[str] = None,
    end_date:   Optional[str] = None,
    seller_id:  Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Lista todos los vendedores activos con KPIs calculados.
    Incluye vendedores sin documentos (aparecen con todo en 0).
    """
    dt_start = datetime.fromisoformat(start_date) if start_date else None
    dt_end   = datetime.fromisoformat(end_date)   if end_date   else None

    q = db.query(models.Entity).filter(models.Entity.is_salesperson == True)
    if seller_id:
        q = q.filter(models.Entity.id == seller_id)
    sellers = q.all()

    print(f"SELLERS FOUND: {[(s.id, s.name) for s in sellers]}")

    result = []
    for seller in sellers:
        # Obtener CommissionApplications del vendedor
        aq = db.query(models.CommissionApplication).filter(
            models.CommissionApplication.seller_id == seller.id
        )
        if dt_start:
            aq = aq.filter(models.CommissionApplication.application_date >= dt_start)
        if dt_end:
            aq = aq.filter(models.CommissionApplication.application_date <= dt_end + timedelta(days=1))
        apps = aq.all()

        # KPIs desde applications (arquitectura v2)
        gen_usd = sum(a.commission_amount_usd for a in apps)
        avail_usd = sum(a.available_amount_usd for a in apps)
        paid_usd = sum(a.paid_amount_usd for a in apps)
        pending_usd = max(0.0, avail_usd - paid_usd)

        gen_ars = sum(a.commission_amount_ars for a in apps)
        avail_ars = sum(a.available_amount_ars for a in apps)
        paid_ars = sum(a.paid_amount_ars for a in apps)
        pending_ars = max(0.0, avail_ars - paid_ars)

        net_sales_usd = sum(a.base_net_usd for a in apps)

        # Ventas facturadas desde documentos (legacy + v2)
        docs_q = db.query(models.Document).filter(
            models.Document.salesperson_id == seller.id,
            models.Document.doc_type.in_([
                models.DocumentType.INVOICE,
                models.DocumentType.FCE_MIPYME,
            ]),
            models.Document.status != models.DocumentStatus.CANCELLED
        )
        if dt_start: docs_q = docs_q.filter(models.Document.date >= dt_start)
        if dt_end:   docs_q = docs_q.filter(models.Document.date <= dt_end + timedelta(days=1))
        docs = docs_q.all()

        sales_usd = sum(_to_usd(d.total_amount or 0, d.currency, d.exchange_rate or 1) for d in docs)
        collected_usd = sum(_to_usd(d.allocated_amount or 0, d.currency, d.exchange_rate or 1) for d in docs)

        # Modalidad del vendedor
        mode = getattr(seller, 'commission_mode', 'BY_COLLECTION') or 'BY_COLLECTION'
        mode_labels = {
            "BY_COLLECTION": "Sobre Cobranza",
            "BY_MARGIN":     "Por Margen",
            "BY_CASH":       "Sobre Efectivo",
        }

        result.append({
            "id":   seller.id,
            "name": seller.name,
            "commission_pct":  float(seller.commission_pct or 0),
            "commission_mode": mode,
            "commission_mode_label": mode_labels.get(mode, mode),
            "commission_currency": getattr(seller, 'commission_currency', 'USD') or 'USD',
            # Ventas
            "sales_invoiced_usd":  round(sales_usd, 2),
            "collected_usd":       round(collected_usd, 2),
            # Comisiones
            "commission_generated_usd": round(gen_usd, 2),
            "commission_available_usd": round(avail_usd, 2),
            "commission_paid_usd":      round(paid_usd, 2),
            "commission_pending_usd":   round(pending_usd, 2),
            "commission_generated_ars": round(gen_ars, 2),
            "commission_available_ars": round(avail_ars, 2),
            "commission_paid_ars":      round(paid_ars, 2),
            "commission_pending_ars":   round(pending_ars, 2),
            "doc_count": len(apps),
        })

    print(f"COMMISSION ROWS: {[(r['name'], r['commission_generated_usd']) for r in result]}")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# GET /commissions/sellers/{id}/detail
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sellers/{seller_id}/detail")
def get_seller_detail(
    seller_id:  str,
    start_date: Optional[str] = None,
    end_date:   Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Detalle completo del vendedor:
    - KPIs
    - invoices (facturas con estado de cobro y comisión)
    - delivery_notes_pending_invoice (remitos sin facturar)
    - applications (CommissionApplication)
    - settlements (CommissionSettlement)
    """
    from app.db.models.commercial_models import DeliveryNote, DeliveryNoteStatus, SalesOrder, InvoiceDeliveryNoteLink

    seller = db.query(models.Entity).filter(models.Entity.id == seller_id).first()
    if not seller:
        raise HTTPException(status_code=404, detail="Vendedor no encontrado")

    dt_start = datetime.fromisoformat(start_date) if start_date else None
    dt_end   = datetime.fromisoformat(end_date)   if end_date   else None

    mode = getattr(seller, 'commission_mode', 'BY_COLLECTION') or 'BY_COLLECTION'

    # ── FACTURAS ────────────────────────────────────────────────────────────
    docs_q = db.query(models.Document).filter(
        models.Document.salesperson_id == seller_id,
        models.Document.doc_type.in_([
            models.DocumentType.INVOICE,
            models.DocumentType.FCE_MIPYME,
            models.DocumentType.DEBIT_NOTE,
            models.DocumentType.CREDIT_NOTE,
        ]),
        models.Document.status != models.DocumentStatus.CANCELLED
    )
    if dt_start: docs_q = docs_q.filter(models.Document.date >= dt_start)
    if dt_end:   docs_q = docs_q.filter(models.Document.date <= dt_end + timedelta(days=1))
    docs = docs_q.order_by(models.Document.date.desc()).all()

    invoices = []
    total_sales_usd = 0.0
    total_collected_usd = 0.0
    total_comm_gen_usd = 0.0
    total_comm_avail_usd = 0.0
    total_comm_paid_usd = 0.0

    for doc in docs:
        # Filtrar ND no comerciales
        if doc.doc_type == models.DocumentType.DEBIT_NOTE:
            if doc.reason_type != models.DocumentReasonType.COMMERCIAL_ADJUSTMENT:
                continue

        rate = float(doc.exchange_rate or 1.0)
        total_usd = _to_usd(doc.total_amount or 0, doc.currency, rate)
        allocated_usd = _to_usd(doc.allocated_amount or 0, doc.currency, rate)
        pct_cobrado = round(min(100.0, (allocated_usd / total_usd * 100)) if total_usd > 0 else 0.0, 1)

        # Estado cobro
        if doc.status == models.DocumentStatus.CLOSED:
            cobro_status = "PAGADA"
        elif allocated_usd > 0.01:
            cobro_status = "PARCIAL"
        else:
            cobro_status = "IMPAGA"

        # Comisión: buscar CommissionApplication existente, o calcular on-the-fly
        app = db.query(models.CommissionApplication).filter(
            models.CommissionApplication.document_id == doc.id
        ).first()

        if app:
            comm_gen_usd   = app.commission_amount_usd
            comm_avail_usd = app.available_amount_usd
            comm_paid_usd  = app.paid_amount_usd
            comm_status    = _resolve_doc_commission_status(app)
        else:
            # Calcular on-the-fly para mostrar (no persiste todavía)
            if mode == "BY_MARGIN":
                calc = _calc_commission_by_margin(doc, seller)
            else:
                calc = _calc_commission_by_collection(doc, seller)
            comm_gen_usd   = calc["commission_amount_usd"]
            comm_avail_usd = calc["available_amount_usd"]
            comm_paid_usd  = float(doc.commission_paid_amount or 0)
            if pct_cobrado >= 99.9:
                comm_status = "DISPONIBLE" if comm_paid_usd < comm_gen_usd - 0.01 else "PAGADA"
            elif pct_cobrado > 0:
                comm_status = "PARCIAL"
            else:
                comm_status = "NO DISPONIBLE"

        comm_pending_usd = max(0.0, comm_avail_usd - comm_paid_usd)

        # NC resta
        if doc.doc_type == models.DocumentType.CREDIT_NOTE:
            comm_gen_usd   = -abs(comm_gen_usd)
            comm_avail_usd = -abs(comm_avail_usd)
            total_usd      = -abs(total_usd)

        total_sales_usd     += total_usd
        total_collected_usd += allocated_usd
        total_comm_gen_usd  += comm_gen_usd
        total_comm_avail_usd+= comm_avail_usd
        total_comm_paid_usd += comm_paid_usd

        invoices.append({
            "id":             doc.id,
            "date":           doc.date.isoformat() if doc.date else None,
            "doc_type":       doc.doc_type.value if hasattr(doc.doc_type, 'value') else str(doc.doc_type),
            "number":         doc.number,
            "client_name":    doc.entity.name if doc.entity else "",
            "total_usd":      round(total_usd, 2),
            "total_ars":      round(float(doc.total_amount or 0), 2),
            "currency":       str(doc.currency.value if hasattr(doc.currency, 'value') else doc.currency),
            "exchange_rate":  rate,
            "collected_usd":  round(allocated_usd, 2),
            "pct_cobrado":    pct_cobrado,
            "cobro_status":   cobro_status,
            # Comisión
            "comm_generated_usd":  round(comm_gen_usd, 2),
            "comm_available_usd":  round(comm_avail_usd, 2),
            "comm_paid_usd":       round(comm_paid_usd, 2),
            "comm_pending_usd":    round(comm_pending_usd, 2),
            "comm_status":         comm_status,
            "commission_pct":      float(seller.commission_pct or 0),
        })

    # ── REMITOS PENDIENTES DE FACTURAR ────────────────────────────────────────
    dns_q = db.query(DeliveryNote).filter(
        (DeliveryNote.salesperson_id == seller_id) | (DeliveryNote.vendedor == seller.name),
        DeliveryNote.status.notin_([DeliveryNoteStatus.CANCELLED])
    )
    if dt_start: dns_q = dns_q.filter(DeliveryNote.date >= dt_start)
    if dt_end:   dns_q = dns_q.filter(DeliveryNote.date <= dt_end + timedelta(days=1))
    dns = dns_q.order_by(DeliveryNote.date.desc()).all()

    delivery_notes_pending = []
    for dn in dns:
        # Ver si tiene facturas vinculadas
        links = db.query(InvoiceDeliveryNoteLink).filter(
            InvoiceDeliveryNoteLink.delivery_note_id == dn.id
        ).all()
        has_invoice = any(
            lnk.document and lnk.document.status != models.DocumentStatus.CANCELLED
            for lnk in links if lnk.document
        )
        if has_invoice:
            invoice_status = "FACTURADO"
        else:
            invoice_status = "PENDIENTE"

        ov_number = ""
        if dn.sales_order_id and dn.sales_order:
            ov_number = dn.sales_order.number or ""

        delivery_notes_pending.append({
            "id":             dn.id,
            "date":           dn.date.isoformat() if dn.date else None,
            "number":         dn.number,
            "ov_number":      ov_number,
            "client_name":    dn.entity.name if dn.entity else "",
            "total":          round(sum(float(line.total_amount or 0) for line in dn.lines), 2),
            "currency":       str(dn.currency.value if hasattr(dn.currency, 'value') else (dn.currency or "ARS")),
            "invoice_status": invoice_status,
        })

    # ── APPLICATIONS (v2) ────────────────────────────────────────────────────
    apps_db = db.query(models.CommissionApplication).filter(
        models.CommissionApplication.seller_id == seller_id
    ).order_by(models.CommissionApplication.application_date.desc()).all()

    applications = []
    for a in apps_db:
        applications.append({
            "id":                    a.id,
            "date":                  a.application_date.isoformat() if a.application_date else None,
            "document_id":           a.document_id,
            "commission_mode":       a.commission_mode,
            "commission_amount_usd": round(a.commission_amount_usd, 2),
            "commission_amount_ars": round(a.commission_amount_ars, 2),
            "available_amount_usd":  round(a.available_amount_usd, 2),
            "paid_amount_usd":       round(a.paid_amount_usd, 2),
            "status":                a.status,
            "exchange_rate":         a.exchange_rate,
        })

    # ── SETTLEMENTS (liquidaciones internas) ─────────────────────────────────
    setts = db.query(models.CommissionSettlement).filter(
        models.CommissionSettlement.seller_id == seller_id
    ).order_by(models.CommissionSettlement.date.desc()).all()

    settlements = []
    for s in setts:
        settlements.append({
            "id":           s.id,
            "date":         s.date.isoformat() if s.date else None,
            "currency":     s.currency,
            "exchange_rate":s.exchange_rate,
            "amount_usd":   round(s.amount_usd, 2),
            "amount_ars":   round(s.amount_ars, 2),
            "is_advance":   s.is_advance,
            "notes":        s.notes,
        })

    # ── KPIs resumen ──────────────────────────────────────────────────────────
    total_comm_pending_usd = max(0.0, total_comm_avail_usd - total_comm_paid_usd)
    pending_dn_count = sum(1 for d in delivery_notes_pending if d["invoice_status"] == "PENDIENTE")

    return {
        "seller": {
            "id":                 seller.id,
            "name":               seller.name,
            "commission_pct":     float(seller.commission_pct or 0),
            "commission_mode":    mode,
            "commission_currency": getattr(seller, 'commission_currency', 'USD') or 'USD',
            "commission_exchange_mode": getattr(seller, 'commission_exchange_mode', 'INVOICE_RATE') or 'INVOICE_RATE',
            "margin_commission_pct": float(getattr(seller, 'margin_commission_pct', 100) or 100),
        },
        "kpis": {
            "sales_invoiced_usd":        round(total_sales_usd, 2),
            "collected_usd":             round(total_collected_usd, 2),
            "commission_generated_usd":  round(total_comm_gen_usd, 2),
            "commission_available_usd":  round(total_comm_avail_usd, 2),
            "commission_paid_usd":       round(total_comm_paid_usd, 2),
            "commission_pending_usd":    round(total_comm_pending_usd, 2),
            "pending_delivery_notes":    pending_dn_count,
        },
        "invoices":                  invoices,
        "delivery_notes_pending":    delivery_notes_pending,
        "applications":              applications,
        "settlements":               settlements,
    }


# ─────────────────────────────────────────────────────────────────────────────
# POST /commissions/applications/sync
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/applications/sync")
def sync_commission_applications(
    seller_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Crea/actualiza CommissionApplication para documentos que aún no tienen una.
    No modifica documentos fiscales. Solo actualiza tablas internas de comisión.
    """
    q = db.query(models.Entity).filter(models.Entity.is_salesperson == True)
    if seller_id:
        q = q.filter(models.Entity.id == seller_id)
    sellers = q.all()

    created = 0
    updated = 0

    for seller in sellers:
        mode = getattr(seller, 'commission_mode', 'BY_COLLECTION') or 'BY_COLLECTION'

        docs = db.query(models.Document).filter(
            models.Document.salesperson_id == seller.id,
            models.Document.doc_type.in_([
                models.DocumentType.INVOICE,
                models.DocumentType.FCE_MIPYME,
                models.DocumentType.DEBIT_NOTE,
            ]),
            models.Document.status != models.DocumentStatus.CANCELLED
        ).all()

        for doc in docs:
            if doc.doc_type == models.DocumentType.DEBIT_NOTE:
                if doc.reason_type != models.DocumentReasonType.COMMERCIAL_ADJUSTMENT:
                    continue

            # Calcular según modalidad
            if mode == "BY_MARGIN":
                calc = _calc_commission_by_margin(doc, seller)
            else:
                calc = _calc_commission_by_collection(doc, seller)

            # Buscar application existente
            app = db.query(models.CommissionApplication).filter(
                models.CommissionApplication.document_id == doc.id
            ).first()

            exchange_mode = getattr(seller, 'commission_exchange_mode', 'INVOICE_RATE') or 'INVOICE_RATE'
            rate = float(doc.exchange_rate or 1.0)

            if not app:
                app = models.CommissionApplication(
                    id=_uuid(),
                    seller_id=seller.id,
                    document_id=doc.id,
                    commission_mode=mode,
                    commission_pct=float(seller.commission_pct or 0),
                    exchange_rate=rate,
                    application_date=doc.date or datetime.utcnow(),
                )
                db.add(app)
                created += 1
            else:
                updated += 1

            app.base_net_usd          = calc["base_net_usd"]
            app.base_net_ars          = calc["base_net_ars"]
            app.commission_amount_usd = calc["commission_amount_usd"]
            app.commission_amount_ars = calc["commission_amount_ars"]
            app.available_amount_usd  = calc["available_amount_usd"]
            app.available_amount_ars  = calc["available_amount_ars"]
            app.status = _resolve_doc_commission_status(app)

    db.commit()
    return {"ok": True, "created": created, "updated": updated}


# ─────────────────────────────────────────────────────────────────────────────
# POST /commissions/recalc-tc
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/recalc-tc")
def recalc_at_current_tc(
    seller_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Recalcula todas las CommissionApplication pendientes usando el TC de hoy.
    NO genera ND, NC ni ningún comprobante fiscal.
    """
    current_tc = _get_current_tc(db)

    q = db.query(models.CommissionApplication).filter(
        models.CommissionApplication.status.in_(["PENDING", "AVAILABLE", "PARTIAL"])
    )
    if seller_id:
        q = q.filter(models.CommissionApplication.seller_id == seller_id)
    apps = q.all()

    for app in apps:
        # Convertir: el base_net_usd es la fuente de verdad, recalcular ARS al nuevo TC
        app.commission_amount_ars = app.commission_amount_usd * current_tc
        app.available_amount_ars  = app.available_amount_usd  * current_tc
        app.exchange_rate         = current_tc

    db.commit()
    return {"ok": True, "tc_used": current_tc, "apps_updated": len(apps)}


# ─────────────────────────────────────────────────────────────────────────────
# POST /commissions/settle
# ─────────────────────────────────────────────────────────────────────────────

class SettleRequest(dict):
    pass

from pydantic import BaseModel

class SettlementLineIn(BaseModel):
    application_id: str
    amount_usd: float
    amount_ars: float

class SettleCommissionRequest(BaseModel):
    seller_id:    str
    currency:     str = "USD"
    exchange_rate: float = 1.0
    amount_usd:   float
    amount_ars:   float
    is_advance:   bool = False
    notes:        Optional[str] = None
    lines:        List[SettlementLineIn] = []  # Si vacío = liquidar todo disponible


@router.post("/settle")
def settle_commission(
    payload: SettleCommissionRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Registra una liquidación interna de comisión.
    NO genera comprobantes fiscales.
    NO afecta cuenta corriente del cliente, IVA ni stock.
    """
    seller = db.query(models.Entity).filter(models.Entity.id == payload.seller_id).first()
    if not seller:
        raise HTTPException(status_code=404, detail="Vendedor no encontrado")

    settlement = models.CommissionSettlement(
        id=_uuid(),
        seller_id=payload.seller_id,
        date=datetime.utcnow(),
        currency=payload.currency,
        exchange_rate=payload.exchange_rate,
        amount_usd=payload.amount_usd,
        amount_ars=payload.amount_ars,
        is_advance=payload.is_advance,
        notes=payload.notes,
        created_by=current_user.username if current_user else None,
    )
    db.add(settlement)
    db.flush()

    if payload.lines:
        # Liquidación específica por application
        for line_in in payload.lines:
            app = db.query(models.CommissionApplication).filter(
                models.CommissionApplication.id == line_in.application_id
            ).first()
            if not app:
                continue

            sl = models.CommissionSettlementLine(
                id=_uuid(),
                settlement_id=settlement.id,
                application_id=app.id,
                amount_usd=line_in.amount_usd,
                amount_ars=line_in.amount_ars,
            )
            db.add(sl)

            app.paid_amount_usd += line_in.amount_usd
            app.paid_amount_ars += line_in.amount_ars
            app.status = _resolve_doc_commission_status(app)
    else:
        # Liquidar todo lo disponible del vendedor
        avail_apps = db.query(models.CommissionApplication).filter(
            models.CommissionApplication.seller_id == payload.seller_id,
            models.CommissionApplication.status.in_(["AVAILABLE", "PARTIAL"])
        ).all()

        for app in avail_apps:
            pending_usd = app.available_amount_usd - app.paid_amount_usd
            if pending_usd <= 0.001:
                continue
            pending_ars = app.available_amount_ars - app.paid_amount_ars

            sl = models.CommissionSettlementLine(
                id=_uuid(),
                settlement_id=settlement.id,
                application_id=app.id,
                amount_usd=pending_usd,
                amount_ars=pending_ars,
            )
            db.add(sl)

            app.paid_amount_usd += pending_usd
            app.paid_amount_ars += pending_ars
            app.status = _resolve_doc_commission_status(app)

    db.commit()
    return {"ok": True, "settlement_id": settlement.id}


# ─────────────────────────────────────────────────────────────────────────────
# Legacy compatibility: mantener /pay y /sync para el viejo CommissionReport
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/sync")
def sync_legacy(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Compatibilidad: sincroniza comisiones legadas y dispara sync de applications v2."""
    return sync_commission_applications(db=db, current_user=current_user)
