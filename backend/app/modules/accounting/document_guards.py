"""Commercial save rules shared by entry points."""
from fastapi import HTTPException
from sqlalchemy import or_
from app.db.models.models import Application, CommissionPayment
from app.modules.accounting.ledger_engine import create_journal_entry_for_document


def require_unapplied_draft(db, doc):
    if not doc.is_draft:
        return
    apps = db.query(Application).filter(or_(
        Application.from_document_id == doc.id,
        Application.to_document_id == doc.id,
    )).all()
    commissions = db.query(CommissionPayment).filter(or_(
        CommissionPayment.document_id == doc.id,
        CommissionPayment.source_document_id == doc.id,
    )).all()
    if apps or commissions:
        numbers = set()
        for app in apps:
            other = app.to_document if app.from_document_id == doc.id else app.from_document
            numbers.add(other.number if other else app.id)
        if commissions:
            numbers.add('pago de comisión')
        raise HTTPException(status_code=409, detail=(
            'Primero debe desaplicar los comprobantes vinculados al borrador: '
            + ', '.join(sorted(numbers))))


def require_accounting(db, doc):
    """A document and its journal are committed together or not at all."""
    try:
        db.flush()
        db.expire(doc, ['lines', 'payments', 'retentions', 'entity'])
        entry = create_journal_entry_for_document(db, doc)
        if entry is None:
            raise ValueError('No hay un circuito contable configurado para este comprobante')
        return entry
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f'No se puede guardar: {exc}') from exc
