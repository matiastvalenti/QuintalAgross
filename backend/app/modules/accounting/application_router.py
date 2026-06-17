from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

from app.db.session import get_db
from app.db import models
from app.modules.accounting.fx_service import generate_fx_adjustment
from app.modules.accounting.document_router import _recalc_document_status, _log_history
from app.modules.auth.auth_router import get_current_user

router = APIRouter(prefix="/applications", tags=["applications"])

class ApplicationRequest(BaseModel):
    from_document_id: str
    to_document_id: str
    amount: float  # Monto en la moneda del documento DESTINO
    exchange_rate: Optional[float] = None # Si no se provee, se usa el del from_document o el actual
    date: Optional[datetime] = None

@router.post("/apply")
def apply_manually(req: ApplicationRequest, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Realiza una aplicación manual de fondos (imputación).
    from_document_id: Documento origen (Crédito: Recibo, Pago, NC)
    to_document_id: Documento destino (Débito: Factura, ND)
    """
    # 1. Validar documentos
    from_doc = db.query(models.Document).filter(models.Document.id == req.from_document_id).first()
    to_doc = db.query(models.Document).filter(models.Document.id == req.to_document_id).first()

    if not from_doc or not to_doc:
        raise HTTPException(status_code=404, detail="Uno de los documentos no existe")
    
    if from_doc.entity_id != to_doc.entity_id:
        raise HTTPException(status_code=400, detail="Los documentos pertenecen a distintas entidades")

    # 2. Calcular remanente disponible en Origen (Crédito)
    # Sumar aplicaciones ya hechas desde este origen
    # Nota: Usamos la lógica de _recalc_document_status para saber el 'usage'
    is_from_usd = str(from_doc.currency) in ("USD", "CurrencyType.USD")
    
    # Obtener exchange_rate para la aplicación
    # Si el origen es USD y el destino es ARS, el exchange_rate define cuántos pesos vale cada dólar del origen.
    # Si ambos son la misma moneda, suele ser 1.0 (o el TC del día si se quiere trackear devaluación en USD?)
    app_tc = req.exchange_rate or from_doc.exchange_rate or 1.0
    
    # Monto en pesos de la aplicación
    # mount es el valor en la moneda del TO_DOC (destino)
    if str(to_doc.currency) in ("USD", "CurrencyType.USD"):
        # Destino es USD. amount es USD.
        amount_ars = req.amount * app_tc
    else:
        # Destino es ARS. amount es ARS.
        amount_ars = req.amount

    # 3. Crear la Aplicación
    new_app = models.Application(
        from_document_id=from_doc.id,
        to_document_id=to_doc.id,
        amount_applied=req.amount,
        amount_applied_ars=amount_ars,
        exchange_rate=app_tc,
        created_at=req.date or datetime.utcnow()
    )
    db.add(new_app)
    db.flush()

    # 4. Generar Diferencia de Cambio si corresponde (Invoices en USD pagadas con saldo en pesos o similar)
    # El service de ajuste solo actúa si hay disparidad de TCs significante
    try:
        if str(to_doc.currency) in ("USD", "CurrencyType.USD"):
            generate_fx_adjustment(new_app.id, db)
    except Exception as e:
        print(f"Error generando ajuste FX: {e}")

    # 5. Recalcular Estados
    _recalc_document_status(from_doc, db)
    _recalc_document_status(to_doc, db)
    
    # 6. Historial
    _log_history(db, from_doc.id, "APLICACION_MANUAL", f"Se imputó {req.amount} {to_doc.currency} a {to_doc.number}", current_user)
    _log_history(db, to_doc.id, "IMPUTACION_MANUAL", f"Se recibió imputación de {req.amount} {to_doc.currency} desde {from_doc.number}", current_user)

    db.commit()
    return {"ok": True, "application_id": new_app.id}

@router.delete("/{application_id}")
def delete_application(application_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Elimina una aplicación manual, revirtiendo el saldo en ambos documentos.
    También elimina el ajuste de diferencia de cambio asociado si existiera.
    """
    app = db.query(models.Application).filter(models.Application.id == application_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Aplicación no encontrada")
    
    from_doc = app.from_document
    to_doc = app.to_document
    
    # El fx_link se borra por cascade delete-orphan en el modelo models.py (línea 440)
    # pero los documentos generados (NC/ND) deben ser anulados o manejados.
    # Por ahora dejamos que el cascade limpie los links. 
    # Si queremos borrar el documento físico (NC/ND):
    fx_link = app.fx_link
    if fx_link and fx_link.generated_document_id:
        gen_doc = db.query(models.Document).get(fx_link.generated_document_id)
        if gen_doc and not gen_doc.cae: # Solo lo borramos si no tiene CAE
            db.delete(gen_doc)

    db.delete(app)
    db.flush()

    # Recalcular
    if from_doc: _recalc_document_status(from_doc, db)
    if to_doc: _recalc_document_status(to_doc, db)
    
    if from_doc: _log_history(db, from_doc.id, "DESVINCULACION", f"Se quitó aplicación a {to_doc.number if to_doc else 'N/A'}", current_user)
    if to_doc: _log_history(db, to_doc.id, "DESVINCULACION", f"Se quitó aplicación de {from_doc.number if from_doc else 'N/A'}", current_user)

    db.commit()
    return {"ok": True}

@router.post("/simulate-apply")
def simulate_apply(req: ApplicationRequest, db: Session = Depends(get_db)):
    """
    Simula una aplicación y devuelve el impacto financiero y los ajustes de FX proyectados.
    """
    from_doc = db.query(models.Document).filter(models.Document.id == req.from_document_id).first()
    to_doc = db.query(models.Document).filter(models.Document.id == req.to_document_id).first()

    if not from_doc or not to_doc:
        raise HTTPException(status_code=404, detail="Documentos no encontrados")

    app_tc = req.exchange_rate or from_doc.exchange_rate or 1.0
    
    # Simular cálculo FX
    from app.modules.accounting.fx_engine import calculate_fx_adjustment, InvoiceLine, FX_ADJUSTMENT_THRESHOLD_ARS
    
    fx_preview = None
    if str(to_doc.currency) in ("USD", "CurrencyType.USD") and from_doc.exchange_rate != app_tc:
         # Obtener líneas del destino
        lines = db.query(models.DocumentLine).filter(models.DocumentLine.document_id == to_doc.id).all()
        invoice_lines = [
            InvoiceLine(
                line_id=l.id, description=l.description, vat_rate=l.vat_rate,
                net_amount=l.net_amount, vat_amount=l.vat_amount, total_amount=l.total_amount
            ) for l in lines
        ]
        
        fx_preview = calculate_fx_adjustment(
            invoice_lines=invoice_lines,
            invoice_total=to_doc.total_amount,
            tc_invoice=to_doc.exchange_rate,
            tc_application=app_tc,
            amount_applied=req.amount,
            threshold_ars=FX_ADJUSTMENT_THRESHOLD_ARS
        )

    return {
        "ok": True,
        "simulation": {
            "from_number": from_doc.number,
            "to_number": to_doc.number,
            "amount_to_apply_usd": req.amount if str(to_doc.currency) == "USD" else req.amount / app_tc,
            "amount_to_apply_ars": req.amount if str(to_doc.currency) == "ARS" else req.amount * app_tc,
            "exchange_rate_used": app_tc,
            "fx_adjustment_needed": fx_preview.needs_adjustment if fx_preview else False,
            "fx_adjustment_preview": fx_preview if fx_preview else None
        }
    }

@router.get("/pending/{entity_id}")
def get_pending_items(entity_id: str, db: Session = Depends(get_db)):
    """
    Retorna créditos (balances a favor) y débitos (deudas) pendientes de una entidad
    para facilitar la pantalla de conciliación manual.
    """
    # 1. Deudas (Débitos)
    debits = db.query(models.Document).filter(
        models.Document.entity_id == entity_id,
        models.Document.doc_type.in_([
            models.DocumentType.INVOICE, 
            models.DocumentType.PURCHASE_INVOICE, 
            models.DocumentType.DEBIT_NOTE, 
            models.DocumentType.PURCHASE_DEBIT_NOTE
        ]),
        models.Document.status != models.DocumentStatus.CLOSED,
        models.Document.status != models.DocumentStatus.CANCELLED
    ).order_by(models.Document.date.asc()).all()

    # 2. Créditos (A favor)
    credits = db.query(models.Document).filter(
        models.Document.entity_id == entity_id,
        models.Document.doc_type.in_([
            models.DocumentType.RECEIPT, 
            models.DocumentType.PAYMENT, 
            models.DocumentType.CREDIT_NOTE, 
            models.DocumentType.PURCHASE_CREDIT_NOTE
        ]),
        models.Document.status != models.DocumentStatus.CLOSED,
        models.Document.status != models.DocumentStatus.CANCELLED
    ).order_by(models.Document.date.asc()).all()

    # Calculamos remanente real para cada uno
    def get_remaining(doc):
        # Lógica simplificada basada en lo que ya hace el ledger
        # To-do: Usar la misma lógica exacta de accounts_router si es posible
        from app.modules.entities.accounts_router import CREDIT_TYPES
        # Sumar ya aplicado
        is_usd = str(doc.currency) in ("USD", "CurrencyType.USD")
        
        if doc.doc_type in CREDIT_TYPES:
            # Cuánto se usó de este crédito
            if is_usd:
                usage = db.query(func.sum(models.Application.amount_applied_ars / func.nullif(models.Application.exchange_rate, 0))).filter(
                    models.Application.from_document_id == doc.id
                ).scalar() or 0.0
            else:
                usage = db.query(func.sum(models.Application.amount_applied_ars)).filter(
                    models.Application.from_document_id == doc.id
                ).scalar() or 0.0
        else:
            # Cuánto se pagó de esta deuda
            usage = db.query(func.sum(models.Application.amount_applied)).filter(
                models.Application.to_document_id == doc.id
            ).scalar() or 0.0
            
        return max(0.0, float(doc.total_amount or 0) - float(usage))

    return {
        "debits": [
            {
                "id": d.id,
                "number": d.number,
                "date": d.date,
                "doc_type": d.doc_type,
                "total": d.total_amount,
                "remaining": get_remaining(d),
                "currency": d.currency,
                "exchange_rate": d.exchange_rate
            } for d in debits if get_remaining(d) > 0.01
        ],
        "credits": [
            {
                "id": c.id,
                "number": c.number,
                "date": c.date,
                "doc_type": c.doc_type,
                "total": c.total_amount,
                "remaining": get_remaining(c),
                "currency": c.currency,
                "exchange_rate": c.exchange_rate
            } for c in credits if get_remaining(c) > 0.01
        ]
    }
