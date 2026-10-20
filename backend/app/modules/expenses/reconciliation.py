"""A provisional cut groups history without forgiving or creating any balance."""
from decimal import Decimal
from app.db.models.employee_fund_models import EmployeeFundCut
from app.db.models.models import ExpenseClaim
from .funds import money


def latest_cut(db,entity_id):
    return db.query(EmployeeFundCut).filter_by(entity_id=entity_id).order_by(
        EmployeeFundCut.cutoff_date.desc(),EmployeeFundCut.created_at.desc(),EmployeeFundCut.id.desc()).first()


def describe_cut(db,entity_id,operations):
    cut=latest_cut(db,entity_id)
    if not cut:return None
    before={'ARS':Decimal(0),'USD':Decimal(0)}
    after={'ARS':Decimal(0),'USD':Decimal(0)}
    historical_claims=[]
    for op in operations:
        if op.kind=='CLAIM' and op.claim_id:
            claim=db.get(ExpenseClaim,op.claim_id)
            # Use each receipt's expense date, including mixed-date renditions.
            if claim:
                old=money(sum((money(item.amount) for item in claim.items if item.date.date()<cut.cutoff_date),Decimal(0)))
                before[op.currency]-=old
                after[op.currency]+=op.amount+old
                if old:historical_claims.append(claim.id)
                continue
        bucket=before if op.date.date()<cut.cutoff_date else after
        bucket[op.currency]+=op.amount
        if op.other_currency:bucket[op.other_currency]+=op.other_amount
    return dict(id=cut.id,cutoff_date=cut.cutoff_date,reason=cut.reason,
        status='RESOLVED' if cut.resolved_at else 'PENDING',resolved_at=cut.resolved_at,
        resolution_note=cut.resolution_note,before={k:float(v) for k,v in before.items()},
        since={k:float(v) for k,v in after.items()},historical_claim_ids=historical_claims)
