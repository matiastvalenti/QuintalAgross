from sqlalchemy.orm import Session
from app.db.models.models import Application, Document, FxAdjustmentLink
from app.modules.accounting.document_status_service import recalc_document_status

def void_sales_application(db: Session, application_id: str, reason: str = None):
    # 1. Fetch the application
    app = db.query(Application).filter(Application.id == application_id).first()
    
    if not app:
        return {
            "ok": True,
            "already_voided": True,
            "warnings": ["Aplicación no encontrada o ya revertida."]
        }

    credit_doc = app.from_document
    debit_doc = app.to_document
    
    # Block reverting automatic FX compensations
    if credit_doc and debit_doc:
        if credit_doc.doc_type.value == "CREDIT_NOTE" and debit_doc.doc_type.value == "DEBIT_NOTE":
            if credit_doc.reason_type and debit_doc.reason_type:
                if credit_doc.reason_type.value == "EXCHANGE_DIFFERENCE" and debit_doc.reason_type.value == "EXCHANGE_DIFFERENCE":
                    return {
                        "ok": False,
                        "detail": "Esta aplicación corresponde a una compensación automática de diferencia de cambio y no puede revertirse desde esta pantalla."
                    }

    credit_doc_id = app.from_document_id
    debit_doc_id = app.to_document_id
    
    fx_reversal = None
    
    # 2. Check for FX link (Future-proofing Phase 2)
    # Si esta aplicación generó un comprobante por diferencia de cambio,
    # habría que anular/revertir también ese comprobante.
    fx_link = db.query(FxAdjustmentLink).filter(FxAdjustmentLink.source_application_id == application_id).first()
    if fx_link:
        # Aquí iría la lógica de generar la NC/ND reversa, aplicarla automáticamente, etc.
        # Por ahora solo lo detectamos.
        pass

    # 3. Hard delete the application (since there's no soft-delete in the model for Phase 1)
    # Fase 1: hard delete solo para aplicaciones manuales.
    # Las aplicaciones automáticas del sistema no se eliminan desde esta pantalla.
    # A futuro migrar a soft void si Application incorpora status/voided_at.
    db.delete(app)
    db.commit()

    # 4. Recalculate status and balances for the affected documents
    updated_docs = []
    
    if credit_doc_id:
        credit_doc = db.query(Document).filter(Document.id == credit_doc_id).first()
        if credit_doc:
            recalc_document_status(credit_doc, db)
            db.commit()
            updated_docs.append({
                "document_id": credit_doc.id,
                "status": credit_doc.status.value if credit_doc.status else "OPEN",
                "balance": credit_doc.total_amount  # Will be calculated appropriately later if needed
            })

    if debit_doc_id:
        debit_doc = db.query(Document).filter(Document.id == debit_doc_id).first()
        if debit_doc:
            recalc_document_status(debit_doc, db)
            db.commit()
            updated_docs.append({
                "document_id": debit_doc.id,
                "status": debit_doc.status.value if debit_doc.status else "OPEN",
                "balance": debit_doc.total_amount
            })

    return {
        "ok": True,
        "application_id": application_id,
        "voided": True,
        "credit_document_id": credit_doc_id,
        "debit_document_id": debit_doc_id,
        "updated_documents": updated_docs,
        "fx_reversal_created": fx_reversal,
        "warnings": []
    }
