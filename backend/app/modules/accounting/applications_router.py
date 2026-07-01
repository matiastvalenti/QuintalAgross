from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.db.session import get_db
from app.db.models.models import Document, DocumentStatus, DocumentType, Application, User, CurrencyType, DocumentLine
from app.modules.auth.auth_router import get_current_user
from app.modules.accounting.document_status_service import get_document_balance_info, recalc_document_status

router = APIRouter(prefix="/accounting/applications", tags=["Sales Applications"])

# ──────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────

class DocumentCandidateResponse(BaseModel):
    document_id: str
    doc_type: str
    number: str
    date: datetime
    currency: str
    exchange_rate: float
    total: float
    applied: float
    pending: float = 0.0 # for debts
    available: float = 0.0 # for credits
    status: str

class ApplicationHistoryResponse(BaseModel):
    application_id: str
    date: datetime
    credit_document_id: str
    credit_type: str
    credit_number: str
    debit_document_id: str
    debit_type: str
    debit_number: str
    currency: str
    credit_currency: str = None
    debit_currency: str = None
    amount: float
    amount_applied_ars: Optional[float] = None
    notes: str = ""
    can_void: bool = True
    is_system_application: bool = False
    application_origin: str = "MANUAL"
    fx_note_number: Optional[str] = None
    fx_note_type: Optional[str] = None
    fx_amount: Optional[float] = None
    fx_auto_cancelled: Optional[bool] = None

class ApplicationCandidatesResponse(BaseModel):
    entity_id: str
    debts: List[DocumentCandidateResponse]
    credits: List[DocumentCandidateResponse]

class ApplicationItemCreate(BaseModel):
    credit_document_id: str
    debit_document_id: str
    amount: float
    amount_currency: str = None
    credit_currency: str = None
    debit_currency: str = None
    currency: str = None
    exchange_rate: float = 1.0
    apply_max_credit: bool = False

class SalesApplicationCreate(BaseModel):
    entity_id: str
    application_date: datetime
    notes: str = ""
    items: List[ApplicationItemCreate]

# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sales/history", response_model=List[ApplicationHistoryResponse])
def get_sales_application_history(entity_id: str, db: Session = Depends(get_db)):
    """
    Trae el historial de aplicaciones para una entidad.
    """
    applications = db.query(Application).join(
        Document, Application.from_document_id == Document.id
    ).filter(
        Document.entity_id == entity_id
    ).order_by(Application.created_at.desc()).limit(100).all()

    history = []
    for app in applications:
        credit = app.from_document
        debit = app.to_document
        
        if not credit or not debit:
            continue

        # Detect system FX application
        is_fx = False
        is_system = False
        if debit.doc_type.value in ["DEBIT_NOTE", "CREDIT_NOTE"] and debit.reason_type and debit.reason_type.value == "EXCHANGE_DIFFERENCE":
            is_fx = True
            is_system = True

        can_void = not is_fx
        origin = "FX_COMPENSATION" if is_fx else "MANUAL"
        
        # Determine if this manual application generated an FX adjustment
        fx_note_number = None
        fx_note_type = None
        fx_amount = None
        fx_auto_cancelled = None
        
        if not is_fx:
            from app.db.models.models import FxAdjustmentLink
            fx_link = db.query(FxAdjustmentLink).filter(FxAdjustmentLink.source_application_id == app.id).first()
            if fx_link:
                gen_doc = fx_link.generated_document
                if gen_doc:
                    fx_note_number = gen_doc.number
                    fx_note_type = gen_doc.doc_type.value
                    fx_amount = gen_doc.total_amount_ars
                    fx_auto_cancelled = gen_doc.status.value in ["APPLIED", "CLOSED"]

        history.append({
            "application_id": app.id,
            "date": app.created_at,
            "credit_document_id": credit.id,
            "credit_type": credit.doc_type.value,
            "credit_number": credit.number,
            "debit_document_id": debit.id,
            "debit_type": debit.doc_type.value,
            "debit_number": debit.number,
            "currency": debit.currency.value,
            "credit_currency": credit.currency.value,
            "debit_currency": debit.currency.value,
            "amount": app.amount_applied,
            "amount_applied_ars": app.amount_applied_ars,
            "notes": "Aplicación automática" if is_fx else "Aplicación manual",
            "can_void": can_void,
            "is_system_application": is_system,
            "application_origin": origin,
            "fx_note_number": fx_note_number,
            "fx_note_type": fx_note_type,
            "fx_amount": fx_amount,
            "fx_auto_cancelled": fx_auto_cancelled
        })

    return history

class VoidApplicationRequest(BaseModel):
    reason: str = "Aplicación realizada por error"

@router.post("/sales/{application_id}/void")
def void_sales_application_endpoint(
    application_id: str, 
    payload: VoidApplicationRequest = None,
    db: Session = Depends(get_db)
):
    """
    Anula una aplicación realizada, recalculando los saldos de los documentos involucrados.
    """
    app_to_void = db.query(Application).filter(Application.id == application_id).first()
    if not app_to_void:
        raise HTTPException(status_code=404, detail="Aplicación no encontrada.")

    # Block voiding system-generated FX applications
    debit = app_to_void.to_document
    if debit and debit.doc_type.value in ["DEBIT_NOTE", "CREDIT_NOTE"] and debit.reason_type and debit.reason_type.value == "EXCHANGE_DIFFERENCE":
        raise HTTPException(status_code=400, detail="No se pueden revertir manualmente aplicaciones de diferencia de cambio automáticas.")

    from app.modules.accounting.application_service import void_sales_application
    reason = payload.reason if payload else "Aplicación realizada por error"
    
    result = void_sales_application(db, application_id, reason)
    
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result)
        
    return result

# ──────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────

@router.get("/sales/candidates", response_model=ApplicationCandidatesResponse)
def get_sales_application_candidates(entity_id: str, db: Session = Depends(get_db)):
    """
    Returns pending debts and available credits for a specific entity.
    Filters out fully applied documents regardless of their status.
    """
    debts_query = db.query(Document).filter(
        Document.entity_id == entity_id,
        Document.doc_type.in_([DocumentType.INVOICE, DocumentType.DEBIT_NOTE]),
        Document.status.not_in([DocumentStatus.CANCELLED])
    ).all()
    
    credits_query = db.query(Document).filter(
        Document.entity_id == entity_id,
        Document.doc_type.in_([DocumentType.CREDIT_NOTE, DocumentType.RECEIPT]),
        Document.status.not_in([DocumentStatus.CANCELLED])
    ).all()
    
    debts = []
    for doc in debts_query:
        bal = get_document_balance_info(doc, db)
        tolerance = 0.01 if str(doc.currency) in ("USD", "CurrencyType.USD") else 2.00
        if bal["balance"] > tolerance:
            debts.append(DocumentCandidateResponse(
                document_id=doc.id,
                doc_type=doc.doc_type,
                number=doc.number,
                date=doc.date,
                currency=str(doc.currency).replace('CurrencyType.', ''),
                exchange_rate=doc.exchange_rate or 1.0,
                total=bal["total"],
                applied=bal["applied"],
                pending=bal["balance"],
                status=doc.status
            ))
            
    credits = []
    for doc in credits_query:
        bal = get_document_balance_info(doc, db)
        tolerance = 0.01 if str(doc.currency) in ("USD", "CurrencyType.USD") else 2.00
        if bal["balance"] > tolerance:
            credits.append(DocumentCandidateResponse(
                document_id=doc.id,
                doc_type=doc.doc_type,
                number=doc.number,
                date=doc.date,
                currency=str(doc.currency).replace('CurrencyType.', ''),
                exchange_rate=doc.exchange_rate or 1.0,
                total=bal["total"],
                applied=bal["applied"],
                available=bal["balance"],
                status=doc.status
            ))
            
    return ApplicationCandidatesResponse(
        entity_id=entity_id,
        debts=debts,
        credits=credits
    )

@router.post("/sales")
def create_sales_applications(payload: SalesApplicationCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Creates multiple applications from credits to debts.
    Phase 2: Supports cross currency applications (ARS -> USD) with FX generation.
    """
    if not payload.entity_id:
        raise HTTPException(status_code=400, detail="entity_id is required")
        
    if not payload.items:
        raise HTTPException(status_code=400, detail="No items to apply")
        
    created_applications = []
    updated_documents = set()
    
    import logging
    logger = logging.getLogger(__name__)
    try:
        for item in payload.items:
            if item.amount <= 0:
                raise HTTPException(status_code=400, detail="Amount must be greater than 0")
                
            credit_doc = db.query(Document).filter(Document.id == item.credit_document_id).first()
            debit_doc = db.query(Document).filter(Document.id == item.debit_document_id).first()
            
            if not credit_doc or not debit_doc:
                raise HTTPException(status_code=404, detail="Document not found")
                
            if credit_doc.entity_id != payload.entity_id or debit_doc.entity_id != payload.entity_id:
                raise HTTPException(status_code=400, detail="Documents do not belong to the selected entity")
                
            if credit_doc.doc_type not in [DocumentType.CREDIT_NOTE, DocumentType.RECEIPT]:
                raise HTTPException(status_code=400, detail="Source document must be a Credit Note or Receipt")
                
            if debit_doc.doc_type not in [DocumentType.INVOICE, DocumentType.DEBIT_NOTE]:
                raise HTTPException(status_code=400, detail="Target document must be an Invoice or Debit Note")
                
            if credit_doc.status == DocumentStatus.CANCELLED or debit_doc.status == DocumentStatus.CANCELLED:
                raise HTTPException(status_code=400, detail="Cannot apply cancelled documents")
                
            # Cross Currency validation (Phase 2 rule)
            is_cross_currency = credit_doc.currency != debit_doc.currency
            if is_cross_currency:
                if credit_doc.currency.value == "USD" and debit_doc.currency.value == "ARS":
                    raise HTTPException(
                        status_code=400, 
                        detail="La aplicación de créditos USD contra deudas ARS todavía no está habilitada."
                    )
                if item.exchange_rate <= 0:
                    raise HTTPException(status_code=400, detail="Debe proveer un tipo de cambio mayor a 0 para aplicaciones entre monedas distintas.")
                
            # Determine actual application values
            is_debt_usd = str(debit_doc.currency) in ("USD", "CurrencyType.USD")
            app_exchange_rate = item.exchange_rate if is_cross_currency or is_debt_usd else 1.0
            
            credit_bal = get_document_balance_info(credit_doc, db)
            debit_bal = get_document_balance_info(debit_doc, db)
            
            forced_max_credit = False
            if is_cross_currency and credit_doc.currency.value == "ARS" and debit_doc.currency.value == "USD":
                equivalente_ars = item.amount * item.exchange_rate
                faltante = equivalente_ars - credit_bal["balance"]
                if faltante > 2.00:
                    max_usd = credit_bal["balance"] / item.exchange_rate
                    max_usd_str = f"{max_usd:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
                    raise HTTPException(
                        status_code=400,
                        detail=f"El crédito ARS disponible no alcanza para cancelar ese monto USD. Máximo aplicable: U$S {max_usd_str}."
                    )
                elif 0 < faltante <= 2.00:
                    forced_max_credit = True
    
            if is_cross_currency and (item.apply_max_credit or forced_max_credit):
                from decimal import Decimal
                avail_ars_dec = Decimal(str(credit_bal["balance"]))
                tc_dec = Decimal(str(item.exchange_rate))
                usd_applied_exact = float(avail_ars_dec / tc_dec)
                
                if usd_applied_exact > debit_bal["balance"]:
                    amount_applied = debit_bal["balance"]
                    amount_applied_ars = float(Decimal(str(debit_bal["balance"])) * tc_dec)
                else:
                    amount_applied = usd_applied_exact
                    amount_applied_ars = credit_bal["balance"]
            else:
                amount_applied = item.amount # Amount in debt currency
                
                if is_cross_currency:
                    amount_applied_ars = item.amount * item.exchange_rate # Credit ARS consumed = USD applied * TC
                else:
                    amount_applied_ars = item.amount * app_exchange_rate if is_debt_usd else item.amount
                
            # Balance validation
            amount_to_check_credit = amount_applied_ars / item.exchange_rate if credit_doc.currency.value == "USD" else amount_applied_ars
            if amount_to_check_credit > (credit_bal["balance"] + 0.02):
                if is_cross_currency:
                    if credit_doc.currency.value == "ARS" and debit_doc.currency.value == "USD":
                        max_usd = credit_bal["balance"] / item.exchange_rate
                        max_usd_str = f"{max_usd:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
                        raise HTTPException(status_code=400, detail=f"El crédito ARS disponible no alcanza para cancelar ese monto USD. Máximo aplicable: U$S {max_usd_str}.")
                    else:
                        max_usd = credit_bal["balance"] * item.exchange_rate
                        raise HTTPException(status_code=400, detail=f"El crédito {credit_doc.currency.value} disponible no alcanza para cancelar ese monto {debit_doc.currency.value}. Máximo aplicable: {debit_doc.currency.value} {max_usd:.2f}.")
                else:
                    raise HTTPException(status_code=400, detail=f"El equivalente en crédito ({amount_to_check_credit}) excede el disponible ({credit_bal['balance']})")
                
            if amount_applied > (debit_bal["balance"] + 0.02):
                raise HTTPException(status_code=400, detail=f"Amount ({amount_applied}) exceeds pending debt ({debit_bal['balance']})")
                
            # Idempotency check: prevent duplicate exact application on the same day
            existing = db.query(Application).filter(
                Application.from_document_id == credit_doc.id,
                Application.to_document_id == debit_doc.id,
                Application.amount_applied == item.amount,
                func.date(Application.created_at) == func.date(datetime.utcnow())
            ).first()
            
            if existing:
                # Skip duplicate creation
                continue
                
            # Create Application record
            new_app = Application(
                from_document_id=credit_doc.id,
                to_document_id=debit_doc.id,
                cost_center=1, # Default
                amount_applied=amount_applied,
                amount_applied_ars=amount_applied_ars,
                exchange_rate=app_exchange_rate,
                created_at=datetime.utcnow()
            )
            db.add(new_app)
            db.flush()
            
            # Handle automatic FX if cross currency
            if is_cross_currency:
                from app.modules.accounting.fx_service import generate_fx_adjustment
                fx_link = generate_fx_adjustment(new_app.id, db, mode="FISCAL")
                
                if fx_link:
                    fx_doc = db.query(Document).filter(Document.id == fx_link.generated_document_id).first()
                    # If an ND-FX is generated and we have credit remaining, auto-compensate it
                    # When apply_max_credit is true, the ARS credit covers exactly the historical + difference.
                    if fx_doc and fx_doc.doc_type == DocumentType.DEBIT_NOTE:
                        fx_bal = get_document_balance_info(fx_doc, db)
                        if fx_bal["balance"] > 0:
                            lines = db.query(DocumentLine).filter(DocumentLine.document_id == fx_doc.id).all()
                            base_amount = sum(float(l.net_amount or 0) for l in lines)
                            apply_amount = min(base_amount, fx_bal["balance"])
                            
                            if apply_amount > 0:
                                comp_app = Application(
                                    from_document_id=credit_doc.id,
                                    to_document_id=fx_doc.id,
                                    cost_center=1, # Default
                                    amount_applied=apply_amount,
                                    amount_applied_ars=apply_amount,
                                    exchange_rate=1.0,
                                    created_at=datetime.utcnow()
                                )
                                db.add(comp_app)
                                db.flush()
                                created_applications.append(comp_app.id)
                                updated_documents.add(fx_doc)
            
            created_applications.append(new_app.id)
            updated_documents.add(credit_doc)
            updated_documents.add(debit_doc)
            
        # Recalculate status for all affected documents
        for doc in updated_documents:
            recalc_document_status(doc, db)
            
        db.commit()
        
        return {
            "ok": True,
            "applications_created": created_applications,
            "updated_documents": [doc.id for doc in updated_documents],
            "warnings": []
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.exception("Error creating sales application")
        raise HTTPException(
            status_code=500,
            detail=f"Error al crear aplicación de venta: {str(e)}"
        )

class RepairFxRequest(BaseModel):
    entity_id: str = None
    dry_run: bool = True

@router.post("/sales/repair-fx-compensations")
def repair_fx_compensations(req: RepairFxRequest, db: Session = Depends(get_db)):
    """
    Busca y repara pares FX huerfanos (ND-FX / NC-FX) que se compensan pero no tienen Application.
    """
    from app.modules.accounting.fx_compensation_repair_service import repair_missing_fx_compensation_applications
    return repair_missing_fx_compensation_applications(db, entity_id=req.entity_id, dry_run=req.dry_run)
