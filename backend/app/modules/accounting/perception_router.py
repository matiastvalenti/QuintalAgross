from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime
from typing import List, Dict, Optional
from pydantic import BaseModel

from app.db.session import get_db
from app.db.models.models import Document, DocumentType, DocumentPerception, DocumentRetention
from app.modules.auth.auth_router import check_permission

from .padron_service import padron_service

router = APIRouter(prefix="/perceptions", tags=["perceptions"])

@router.get("/lookup", dependencies=[Depends(check_permission("accounting", "view"))])
def lookup_tax_rates(cuit: str, jurisdiction: str = "ARBA"):
    """
    Consulta las alícuotas vigentes para un CUIT en una jurisdicción.
    """
    return padron_service.get_rates_for_cuit(cuit, jurisdiction)

class PerceptionSummary(BaseModel):
    jurisdiction: str
    tax_name: str
    total_amount: float
    count: int

class MonthlyPerceptionSummary(BaseModel):
    month: str # YYYY-MM
    summaries: List[PerceptionSummary]

@router.get("/summary", dependencies=[Depends(check_permission("accounting", "view"))])
def get_tax_summary(
    desde: Optional[datetime] = None,
    hasta: Optional[datetime] = None,
    jurisdiction: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Obtiene un resumen de percepciones y retenciones agrupado por jurisdicción e impuesto.
    """
    # 1. Percepciones
    p_query = db.query(
        DocumentPerception.jurisdiction,
        DocumentPerception.tax_name,
        func.sum(DocumentPerception.amount).label("total_amount"),
        func.count(DocumentPerception.id).label("count")
    ).join(Document)
    
    # 2. Retenciones
    r_query = db.query(
        DocumentRetention.jurisdiction,
        DocumentRetention.tax_name,
        func.sum(DocumentRetention.amount).label("total_amount"),
        func.count(DocumentRetention.id).label("count")
    ).join(Document)
    
    if desde:
        p_query = p_query.filter(Document.date >= desde)
        r_query = r_query.filter(Document.date >= desde)
    if hasta:
        p_query = p_query.filter(Document.date <= hasta)
        r_query = r_query.filter(Document.date <= hasta)
    if jurisdiction:
        p_query = p_query.filter(DocumentPerception.jurisdiction == jurisdiction)
        r_query = r_query.filter(DocumentRetention.jurisdiction == jurisdiction)
        
    p_results = p_query.group_by(DocumentPerception.jurisdiction, DocumentPerception.tax_name).all()
    r_results = r_query.group_by(DocumentRetention.jurisdiction, DocumentRetention.tax_name).all()
    
    perceptions = [
        {
            "jurisdiction": r.jurisdiction,
            "tax_name": r.tax_name,
            "total_amount": float(r.total_amount or 0),
            "count": r.count,
            "type": "PERCEPTION"
        }
        for r in p_results
    ]
    
    retentions = [
        {
            "jurisdiction": r.jurisdiction,
            "tax_name": r.tax_name,
            "total_amount": float(r.total_amount or 0),
            "count": r.count,
            "type": "RETENTION"
        }
        for r in r_results
    ]
    
    return perceptions + retentions

@router.get("/details", dependencies=[Depends(check_permission("accounting", "view"))])
def get_tax_details(
    desde: Optional[datetime] = None,
    hasta: Optional[datetime] = None,
    jurisdiction: Optional[str] = None,
    tax_type: Optional[str] = None, # PERCEPTION or RETENTION
    db: Session = Depends(get_db)
):
    """
    Lista detallada de facturas con sus percepciones y retenciones.
    """
    all_items = []
    
    if tax_type in [None, "PERCEPTION"]:
        p_query = db.query(DocumentPerception).join(Document)
        if desde: p_query = p_query.filter(Document.date >= desde)
        if hasta: p_query = p_query.filter(Document.date <= hasta)
        if jurisdiction: p_query = p_query.filter(DocumentPerception.jurisdiction == jurisdiction)
        
        for it in p_query.all():
            all_items.append({
                "id": it.id,
                "document_number": it.document.number,
                "document_date": it.document.date,
                "entity_name": it.document.entity.name if it.document.entity else "S/D",
                "jurisdiction": it.jurisdiction,
                "tax_name": it.tax_name,
                "base_amount": it.base_amount,
                "rate": it.rate,
                "amount": it.amount,
                "type": "PERCEPTION",
                "doc_type": it.document.doc_type
            })

    if tax_type in [None, "RETENTION"]:
        r_query = db.query(DocumentRetention).join(Document)
        if desde: r_query = r_query.filter(Document.date >= desde)
        if hasta: r_query = r_query.filter(Document.date <= hasta)
        if jurisdiction: r_query = r_query.filter(DocumentRetention.jurisdiction == jurisdiction)
        
        for it in r_query.all():
            all_items.append({
                "id": it.id,
                "document_number": it.document.number,
                "document_date": it.document.date,
                "entity_name": it.document.entity.name if it.document.entity else "S/D",
                "jurisdiction": it.jurisdiction,
                "tax_name": it.tax_name,
                "base_amount": it.base_amount,
                "rate": (it.amount / it.base_amount * 100) if (it.base_amount or 0) > 0 else 0,
                "amount": it.amount,
                "type": "RETENTION",
                "certificate": it.certificate_number,
                "doc_type": it.document.doc_type
            })
            
    # Ordenar por fecha descending
    all_items.sort(key=lambda x: x["document_date"] if x["document_date"] else datetime.min, reverse=True)
    return all_items
