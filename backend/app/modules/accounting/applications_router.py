from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from typing import List
from pydantic import BaseModel
from datetime import datetime

from app.db.session import get_db
from app.db.models.models import Document, DocumentStatus, DocumentType, Application, User, CurrencyType
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
    amount: float
    notes: str = ""
    can_void: bool = True
    is_system_application: bool = False
    application_origin: str = "MANUAL"

class ApplicationCandidatesResponse(BaseModel):
    entity_id: str
    debts: List[DocumentCandidateResponse]
    credits: List[DocumentCandidateResponse]

class ApplicationItemCreate(BaseModel):
    credit_document_id: str
    debit_document_id: str
    amount: float
    currency: str
    exchange_rate: float = 1.0

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
        if credit.doc_type.value == "CREDIT_NOTE" and debit.doc_type.value == "DEBIT_NOTE":
            if credit.reason_type and debit.reason_type:
                if credit.reason_type.value == "EXCHANGE_DIFFERENCE" and debit.reason_type.value == "EXCHANGE_DIFFERENCE":
                    is_fx = True

        can_void = not is_fx
        is_system = is_fx
        origin = "FX_COMPENSATION" if is_fx else "MANUAL"

        history.append({
            "application_id": app.id,
            "date": app.created_at,
            "credit_document_id": credit.id,
            "credit_type": credit.doc_type.value,
            "credit_number": credit.number,
            "debit_document_id": debit.id,
            "debit_type": debit.doc_type.value,
            "debit_number": debit.number,
            "currency": credit.currency.value,
            "amount": app.amount_applied,
            "notes": "Aplicación automática" if is_fx else "Aplicación manual",
            "can_void": can_void,
            "is_system_application": is_system,
            "application_origin": origin
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
        if bal["balance"] > 0.01: # Avoid floating point issues
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
        if bal["balance"] > 0.01:
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
    Phase 1: Strict single currency application.
    """
    if not payload.entity_id:
        raise HTTPException(status_code=400, detail="entity_id is required")
        
    if not payload.items:
        raise HTTPException(status_code=400, detail="No items to apply")
        
    created_applications = []
    updated_documents = set()
    
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
            
        # Cross Currency validation (Phase 1 rule)
        if credit_doc.currency != debit_doc.currency:
            raise HTTPException(
                status_code=400, 
                detail="La aplicación entre monedas distintas todavía no está habilitada en esta pantalla."
            )
            
        # Balance validation
        credit_bal = get_document_balance_info(credit_doc, db)
        debit_bal = get_document_balance_info(debit_doc, db)
        
        # We allow a small tolerance for floating point rounding issues
        if item.amount > (credit_bal["balance"] + 0.02):
            raise HTTPException(status_code=400, detail=f"Amount ({item.amount}) exceeds available credit ({credit_bal['balance']})")
            
        if item.amount > (debit_bal["balance"] + 0.02):
            raise HTTPException(status_code=400, detail=f"Amount ({item.amount}) exceeds pending debt ({debit_bal['balance']})")
            
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
        # Note: In Phase 1 where currency matches, amount_applied and amount_applied_ars are straightforward.
        # If USD, amount_applied is USD. amount_applied_ars = USD * exchange_rate
        # If ARS, amount_applied is ARS. amount_applied_ars = ARS
        is_usd = str(credit_doc.currency) in ("USD", "CurrencyType.USD")
        app_exchange_rate = item.exchange_rate if is_usd else 1.0
        amount_applied_ars = item.amount * app_exchange_rate if is_usd else item.amount
        
        new_app = Application(
            from_document_id=credit_doc.id,
            to_document_id=debit_doc.id,
            cost_center=1, # Default
            amount_applied=item.amount,
            amount_applied_ars=amount_applied_ars,
            exchange_rate=app_exchange_rate,
            created_at=datetime.utcnow()
        )
        db.add(new_app)
        db.flush()
        
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
