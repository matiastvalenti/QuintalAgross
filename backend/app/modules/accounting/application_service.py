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
    
    # 2. Check for FX link
    fx_link = db.query(FxAdjustmentLink).filter(FxAdjustmentLink.source_application_id == application_id).first()
    if fx_link:
        original_fx_doc = db.query(Document).filter(Document.id == fx_link.generated_document_id).first()
        if original_fx_doc:
            from app.db.models.models import DocumentType, DocumentStatus, DocumentReasonType, CurrencyType, DocumentLine
            from app.modules.sales import numbering_service
            from datetime import datetime
            
            # Create reverse doc
            is_nd = original_fx_doc.doc_type == DocumentType.DEBIT_NOTE
            rev_doc_type = DocumentType.CREDIT_NOTE if is_nd else DocumentType.DEBIT_NOTE
            
            import re
            pv = "0001"
            if original_fx_doc.number:
                parts = original_fx_doc.number.split("-")
                pv_part = parts[-2] if len(parts) >= 2 else parts[0]
                pv_match = re.search(r'\d+', pv_part)
                if pv_match:
                    candidate = pv_match.group().zfill(4)
                    if len(candidate) == 4 and candidate != "0000":
                        pv = candidate
                
            letter = original_fx_doc.line or "A"
            doc_tag = f"NC{letter}" if is_nd else f"ND{letter}"
            doc_number = numbering_service.get_next_number(db, pv, doc_tag)
            numbering_service.increment_last_number(db, pv, doc_tag)
            
            notes = f"Reversa automática por anulación de aplicación. Cancela {original_fx_doc.doc_type.value} {original_fx_doc.number} [ID:{original_fx_doc.id}]"
            
            rev_doc = Document(
                entity_id=original_fx_doc.entity_id,
                doc_type=rev_doc_type,
                number=doc_number,
                date=datetime.utcnow(),
                currency=CurrencyType.ARS,
                exchange_rate=1.0,
                total_amount=original_fx_doc.total_amount,
                total_amount_ars=original_fx_doc.total_amount_ars,
                status=DocumentStatus.OPEN,
                line=letter,
                notes=notes,
                salesperson_id=original_fx_doc.salesperson_id,
                vendedor=original_fx_doc.vendedor,
                cost_center=original_fx_doc.cost_center,
                source_invoice_id=original_fx_doc.id,
                reason_type=DocumentReasonType.EXCHANGE_DIFFERENCE,
                is_exchange_difference=True,
            )
            db.add(rev_doc)
            db.flush()
            
            original_lines = db.query(DocumentLine).filter(DocumentLine.document_id == original_fx_doc.id).all()
            for l in original_lines:
                rev_line = DocumentLine(
                    document_id=rev_doc.id,
                    description=l.description,
                    qty=l.qty,
                    unit_price=l.unit_price,
                    discount_pct=l.discount_pct,
                    net_amount=l.net_amount,
                    vat_rate=l.vat_rate,
                    vat_amount=l.vat_amount,
                    total_amount=l.total_amount,
                    line_order=l.line_order,
                )
                db.add(rev_line)
                
            db.flush()
            
            # Auto-apply them
            comp_app = Application(
                from_document_id=rev_doc.id if is_nd else original_fx_doc.id,
                to_document_id=original_fx_doc.id if is_nd else rev_doc.id,
                cost_center=1,
                amount_applied=original_fx_doc.total_amount,
                amount_applied_ars=original_fx_doc.total_amount_ars,
                exchange_rate=1.0,
                created_at=datetime.utcnow()
            )
            db.add(comp_app)
            db.flush()
            
            # Find and delete the original auto-application from credit_doc to original_fx_doc
            original_auto_app = db.query(Application).filter(
                Application.from_document_id == credit_doc_id,
                Application.to_document_id == original_fx_doc.id
            ).first()
            if original_auto_app:
                db.delete(original_auto_app)
                db.flush()
            
            recalc_document_status(original_fx_doc, db)
            recalc_document_status(rev_doc, db)
            
            fx_reversal = {
                "original_fx_note_id": original_fx_doc.id,
                "reverse_fx_note_id": rev_doc.id,
                "reverse_type": rev_doc.doc_type.value,
                "number": rev_doc.number,
                "auto_application_created": True
            }

    # 3. Hard delete the application
    # Fase 1: hard delete solo para aplicaciones manuales.
    # Las aplicaciones automáticas del sistema no se eliminan desde esta pantalla.
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
