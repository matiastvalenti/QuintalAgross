from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.db import models
from . import document_schemas
from .interest_engine import calculate_check_interest
from .financial_automation_service import generate_interest_debit_note

router = APIRouter(prefix="/financial-automation", tags=["financial-automation"])

@router.post("/interest/preview", response_model=document_schemas.CheckInterestPreviewResponse)
def interest_preview(payload: document_schemas.CheckInterestPreviewRequest):
    """Calcula el interés sugerido para un conjunto de cheques."""
    return calculate_check_interest(payload)

@router.post("/interest/generate-dn", response_model=document_schemas.DocumentResponse)
def interest_generate_dn(payload: document_schemas.CheckInterestConfirmRequest, db: Session = Depends(get_db)):
    """Genera una Nota de Débito por los intereses de un recibo."""
    try:
        doc = generate_interest_debit_note(payload.receipt_id, payload.interest_amount, db, notes=payload.notes)
        db.commit()
        db.refresh(doc)
        return doc
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al generar ND: {str(e)}")
