"""
Router de ajustes por diferencia de cambio (FX Adjustment).
Endpoints: preview, confirm, y listado de links.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.db.session import get_db
from app.db import models
from app.modules.accounting import document_schemas
from app.modules.accounting.fx_engine import (
    calculate_fx_adjustment,
    InvoiceLine,
    FX_ADJUSTMENT_THRESHOLD_ARS,
)

router = APIRouter(prefix="/documents", tags=["fx-adjustment"])


def _get_application_or_404(app_id: str, db: Session) -> models.Application:
    app = db.query(models.Application).filter(models.Application.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


def _build_preview(app: models.Application, db: Session) -> document_schemas.FxPreviewResponse:
    """Construye el preview de ajuste FX para una aplicación dada."""
    to_doc = app.to_document  # Factura/ND (documento de deuda)
    
    # Obtener líneas de la factura
    lines = db.query(models.DocumentLine).filter(
        models.DocumentLine.document_id == to_doc.id
    ).order_by(models.DocumentLine.line_order).all()
    
    invoice_lines = [
        InvoiceLine(
            line_id=l.id,
            description=l.description,
            vat_rate=l.vat_rate,
            net_amount=l.net_amount,
            vat_amount=l.vat_amount,
            total_amount=l.total_amount,
        )
        for l in lines
    ]
    
    result = calculate_fx_adjustment(
        invoice_lines=invoice_lines,
        invoice_total=to_doc.total_amount,
        tc_invoice=to_doc.exchange_rate,
        tc_application=app.exchange_rate,
        amount_applied=app.amount_applied,
        threshold_ars=FX_ADJUSTMENT_THRESHOLD_ARS,
    )
    
    # Convertir a schema response
    preview_lines = [
        document_schemas.FxPreviewLineResponse(
            invoice_line_id=l.invoice_line_id,
            description=l.description,
            vat_rate=l.vat_rate,
            applied_original_currency=l.applied_original_currency,
            ars_at_invoice_rate=l.ars_at_invoice_rate,
            ars_at_application_rate=l.ars_at_application_rate,
            diff_ars_total=l.diff_ars_total,
            net_ars=l.net_ars,
            vat_ars=l.vat_ars,
        )
        for l in result.lines
    ]
    
    vat_by_rate = {
        str(k): document_schemas.VatBreakdown(**v)
        for k, v in result.vat_by_rate.items()
    }
    
    return document_schemas.FxPreviewResponse(
        needs_adjustment=result.needs_adjustment,
        sign=result.sign,
        lines=preview_lines,
        total_net_ars=result.total_net_ars,
        total_vat_ars=result.total_vat_ars,
        total_ars=result.total_ars,
        vat_by_rate=vat_by_rate,
        reason=result.reason,
        tc_invoice=result.tc_invoice,
        tc_application=result.tc_application,
        applied_amount_original=result.applied_amount_original,
    )


@router.post("/applications/{app_id}/fx-adjustment/preview", response_model=document_schemas.FxPreviewResponse)
def fx_preview(app_id: str, db: Session = Depends(get_db)):
    """Calcula y devuelve el borrador del ajuste por diferencia de cambio."""
    app = _get_application_or_404(app_id, db)
    return _build_preview(app, db)


from app.modules.accounting.fx_service import generate_fx_adjustment
from pydantic import BaseModel
from typing import Dict

class FxConfirmRequest(BaseModel):
    mode: str = "FISCAL"

@router.post("/applications/{app_id}/fx-adjustment/confirm", response_model=document_schemas.FxConfirmResponse)
def fx_confirm(app_id: str, payload: FxConfirmRequest, db: Session = Depends(get_db)):
    """
    Confirma y genera la ND/NC por diferencia de cambio.
    Idempotente: si ya existe un ajuste para esta aplicación, devuelve el existente.
    """
    app = _get_application_or_404(app_id, db)
    
    # Let the service handle creation
    fx_link = generate_fx_adjustment(app_id, db, mode=payload.mode)
    
    if not fx_link:
        # If no link was created, it might be because no adjustment was needed
        preview = _build_preview(app, db)
        if not preview.needs_adjustment:
             raise HTTPException(status_code=400, detail=f"No hay ajuste necesario: {preview.reason}")
        # Otherwise some error?
        raise HTTPException(status_code=500, detail="Error al generar el ajuste")

    db.commit()
    db.refresh(fx_link)
    db.refresh(fx_link.generated_document)
    gen_doc = fx_link.generated_document
    
    return document_schemas.FxConfirmResponse(
        fx_link_id=fx_link.id,
        generated_document_id=gen_doc.id,
        generated_doc_type=gen_doc.doc_type,
        generated_doc_number=gen_doc.number,
        total_ars=gen_doc.total_amount,
        already_existed=False # For simplicity
    )

class DocFxPreviewResponse(BaseModel):
    has_any_adjustment: bool
    previews: Dict[str, document_schemas.FxPreviewResponse]

@router.post("/{doc_id}/fx-adjustment/preview", response_model=DocFxPreviewResponse)
def fx_preview_doc(doc_id: str, db: Session = Depends(get_db)):
    """Previsualiza los ajustes de FX para todas las aplicaciones hechas POR este documento (ej. un recibo)."""
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    
    previews = {}
    has_any = False
    for app in doc.applied_to:  # Las aplicaciones que nacen de este recibo hacia facturas
        prev = _build_preview(app, db)
        previews[app.id] = prev
        if prev.needs_adjustment:
            has_any = True
            
    return DocFxPreviewResponse(has_any_adjustment=has_any, previews=previews)

@router.post("/{doc_id}/fx-adjustment/confirm")
def fx_confirm_doc(doc_id: str, payload: FxConfirmRequest, db: Session = Depends(get_db)):
    """Confirma generar ajustes FX para todas las aplicaciones de este documento que lo requieran."""
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    
    results = []
    for app in doc.applied_to:
        prev = _build_preview(app, db)
        if prev.needs_adjustment:
            try:
                link = generate_fx_adjustment(app.id, db, mode=payload.mode)
                if link:
                    db.commit()
                    db.refresh(link)
                    results.append(link.id)
            except Exception as e:
                print(f"Error generating FX for {app.id}: {e}")
                
    return {"status": "ok", "generated_links": results}

@router.get("/{doc_id}/fx-links", response_model=List[document_schemas.FxLinkResponse])
def get_fx_links(doc_id: str, db: Session = Depends(get_db)):
    """Lista todos los ajustes FX vinculados a un documento (como origen)."""
    links = db.query(models.FxAdjustmentLink).filter(
        models.FxAdjustmentLink.source_document_id == doc_id
    ).all()
    
    results = []
    for link in links:
        item = document_schemas.FxLinkResponse.model_validate(link)
        item.generated_doc_type = link.generated_document.doc_type
        item.generated_doc_number = link.generated_document.number
        results.append(item)
    
    return results
