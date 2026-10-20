"""Provisional cuts preserve funds, allow historical receipts and enforce scope."""
from test_bootstrap import isolated_backend,run_python
from test_employee_funds import SETUP as FUND_SETUP
SETUP=FUND_SETUP+'''
from app.modules.expenses.fund_router import create_cut,resolve_cut
from app.modules.expenses.fund_schemas import CutInput,CutResolution
from app.modules.expenses.expense_router import get_expense_claim
from app.db.models.employee_fund_models import EmployeeFundCut
from datetime import date

def cut():
    return create_cut('emp',CutInput(cutoff_date=date(2026,10,15),reason='Comprobantes pendientes'),db,user)
'''


def test_cut_preserves_balances_and_late_expenses_use_receipt_date(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
advance=movement();advance.date=datetime(2026,10,1)
create_movement(advance,db,user)
first=cut();assert cut()==first
assert statement('emp',db,user)['balances']['ARS']==100
assert statement('emp',db,user)['reconciliation']['before']['ARS']==100
assert db.query(models.JournalEntry).count()==1
second=movement(amount=50,key='request-0002');create_movement(second,db,user)
# Header is after the cut; the actual expense occurred before it.
data=claim_data(total=70);data.items[0].date=datetime(2026,10,5)
c=submit(data)
assert not get_expense_claim(c.id,db,worker).items[0].attachment_url
assert statement('emp',db,user)['balances']['ARS']==150
update_claim_status(c.id,ExpenseClaimStatus.APPROVED,db,user)
r=statement('emp',db,user)
assert r['balances']['ARS']==80
assert r['reconciliation']['before']['ARS']==30
assert r['reconciliation']['since']['ARS']==50
assert c.id in r['reconciliation']['historical_claim_ids']
resolve_cut('emp',first['id'],CutResolution(note='Revisión completada'),db,user)
assert statement('emp',db,user)['balances']['ARS']==80
assert statement('emp',db,user)['reconciliation']['status']=='RESOLVED'
# A newly recovered historical expense reopens the latest reconciliation.
data=claim_data(total=10,number='0001-00000011');data.items[0].date=datetime(2026,10,10)
c2=submit(data);update_claim_status(c2.id,ExpenseClaimStatus.APPROVED,db,user)
r=statement('emp',db,user)
assert r['reconciliation']['status']=='PENDING'
assert r['reconciliation']['before']['ARS']==20
assert r['balances']['ARS']==70
''')


def test_cut_permissions_and_only_one_pending_marker(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
for entity in ['emp','other']:
    try:
        create_cut(entity,CutInput(cutoff_date=date(2026,10,15),reason='Pendiente'),db,worker)
        raise AssertionError('Worker without reconciliation permission created cut')
    except HTTPException as e:assert e.status_code==403
first=cut()
try:
    create_cut('emp',CutInput(cutoff_date=date(2026,10,18),reason='Otro corte'),db,user)
    raise AssertionError('Multiple pending cuts')
except HTTPException as e:assert e.status_code==409
assert db.query(EmployeeFundCut).count()==1
try:
    resolve_cut('emp',first['id'],CutResolution(note='Revisado'),db,worker)
    raise AssertionError('Worker resolved own cut without permission')
except HTTPException as e:assert e.status_code==403
assert db.query(EmployeeFundOperation).count()==0
assert db.query(models.JournalEntry).count()==0
''')
