from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from app.db.models.models import Document, DocumentType, DocumentReasonType, Application
from app.modules.accounting.document_status_service import recalc_document_status

def repair_missing_fx_compensation_applications(db: Session, entity_id: str = None, dry_run: bool = True):
    """
    Busca pares de ND-FX y NC-FX (reversas) que se compensan mutuamente pero carecen de registro 'Application'.
    Crea las 'Applications' faltantes para que sus saldos reales sean cero.
    """
    query = db.query(Document).filter(
        Document.reason_type == DocumentReasonType.EXCHANGE_DIFFERENCE,
        Document.doc_type.in_([DocumentType.DEBIT_NOTE, DocumentType.CREDIT_NOTE]),
        Document.status != "CANCELLED"
    )
    if entity_id:
        query = query.filter(Document.entity_id == entity_id)

    all_fx = query.all()

    # Agrupar por entidad
    by_entity = {}
    for doc in all_fx:
        if doc.entity_id not in by_entity:
            by_entity[doc.entity_id] = []
        by_entity[doc.entity_id].append(doc)

    pairs_found = 0
    applications_to_create = 0
    applications_created = []
    warnings = []

    for eid, docs in by_entity.items():
        # Separar en debit notes y credit notes
        debits = [d for d in docs if d.doc_type == DocumentType.DEBIT_NOTE]
        credits = [c for c in docs if c.doc_type == DocumentType.CREDIT_NOTE]

        for debit in debits:
            # Buscar si alguna nota de credito dice explicitamente que cancela a esta ND-FX
            matching_credits = []
            for credit in credits:
                # 1. Match exacto por ID
                if credit.notes and f"[ID:{debit.id}]" in credit.notes:
                    matching_credits.append(credit)
                # 2. Match por fallback
                elif (
                    credit.source_invoice_id == debit.source_invoice_id and
                    abs(credit.total_amount - debit.total_amount) < 0.01 and
                    credit.currency == debit.currency and
                    credit.reason_type == DocumentReasonType.EXCHANGE_DIFFERENCE and
                    credit.notes and ("cancela" in credit.notes.lower() or debit.number in credit.notes)
                ):
                    matching_credits.append(credit)
            
            if not matching_credits:
                continue
            
            if len(matching_credits) > 1:
                warnings.append(f"Se encontraron multiples NC candidatas para la ND-FX {debit.number}. Revisar manualmente.")
                continue

            credit = matching_credits[0]
            pairs_found += 1

            # Verificar total
            if abs(debit.total_amount - credit.total_amount) > 0.01:
                warnings.append(f"ND-FX {debit.number} y NC-FX {credit.number} tienen totales diferentes.")
                continue

            # Verificar si ya existe aplicacion
            existing_app = db.query(Application).filter(
                Application.from_document_id == credit.id,
                Application.to_document_id == debit.id
            ).first()

            if not existing_app:
                applications_to_create += 1
                if not dry_run:
                    new_app = Application(
                        from_document_id=credit.id,
                        to_document_id=debit.id,
                        amount_applied=debit.total_amount,
                        amount_applied_ars=debit.total_amount_ars,
                        exchange_rate=debit.exchange_rate or 1.0
                    )
                    db.add(new_app)
                    db.flush()
                    applications_created.append({
                        "credit_id": credit.id,
                        "debit_id": debit.id,
                        "amount": float(debit.total_amount)
                    })
                    recalc_document_status(credit, db)
                    recalc_document_status(debit, db)

    if not dry_run:
        db.commit()

    return {
        "ok": True,
        "dry_run": dry_run,
        "pairs_found": pairs_found,
        "applications_to_create": applications_to_create,
        "applications_created": applications_created,
        "warnings": warnings
    }
