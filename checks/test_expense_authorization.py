"""Explicit no-receipt authorization, internal accounting, atomic rollback."""
from test_bootstrap import isolated_backend,run_python
from test_employee_funds import SETUP as FUNDS_SETUP
SETUP=FUNDS_SETUP+'''
from app.modules.expenses.expense_schemas import ExpenseApproval,ReceiptException
from app.db.models.employee_fund_models import ExpenseReceiptAuthorization

def exception(c,reason='Comprobante extraviado, gasto verificado'):
    return ExpenseApproval(without_receipts=[ReceiptException(item_id=c.items[0].id,reason=reason)])
def missing_claim():
    data=claim_data(total=121);data.items[0].net_amount=100;data.items[0].vat_amount=21
    data.items[0].vat_rate=.21;data.items[0].invoice_number=None
    return submit(data)
'''


def test_explicit_authorization_posts_internal_expense_and_supplier_account(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
c=missing_claim()
try:
    update_claim_status(c.id,ExpenseClaimStatus.APPROVED,db,user)
    raise AssertionError('Missing receipt silently accepted')
except HTTPException as e:assert e.status_code==400
assert db.query(models.Document).count()==0
update_claim_status(c.id,ExpenseClaimStatus.APPROVED,db,user,approval=exception(c))
auth=db.query(ExpenseReceiptAuthorization).one()
assert auth.authorized_by=='admin' and auth.authorized_at and 'extraviado' in auth.reason
invoice=db.get(models.Document,auth.document_id)
assert invoice.line=='X' and invoice.number.startswith('INT-GASTO-')
assert invoice.lines[0].net_amount==121 and invoice.lines[0].vat_amount==0
assert 'SIN COMPROBANTE' in invoice.notes and not invoice.cae
assert db.query(models.Application).count()==1
assert statement('emp',db,worker)['balances']['ARS']==-121
assert get_expense_claim(c.id,db,worker).items[0].authorization_reason==auth.reason
assert not any(l.account_code=='1.1.3.001' for j in db.query(models.JournalEntry) for l in j.lines)
assert all(round(sum(l.debit-l.credit for l in j.lines),2)==0 for j in db.query(models.JournalEntry))
try:
    update_claim_status(c.id,ExpenseClaimStatus.APPROVED,db,user,approval=exception(c))
    raise AssertionError('Duplicate authorization')
except HTTPException as e:assert e.status_code==409
assert db.query(ExpenseReceiptAuthorization).count()==1
assert db.query(models.Document).count()==2
''')


def test_exception_permission_is_separate_and_items_are_scoped(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
c=missing_claim()
worker.permissions={'employee_review':{'create':True}};db.commit()
try:
    update_claim_status(c.id,ExpenseClaimStatus.APPROVED,db,worker,approval=exception(c))
    raise AssertionError('Reviewer without exception permission authorized')
except HTTPException as e:assert e.status_code==403
for payload in [ExpenseApproval(without_receipts=[ReceiptException(item_id='foreign',reason='Verificado')]),
                ExpenseApproval(without_receipts=[ReceiptException(item_id=c.items[0].id,reason='   ')]),
                ExpenseApproval(without_receipts=exception(c).without_receipts*2)]:
    try:
        update_claim_status(c.id,ExpenseClaimStatus.APPROVED,db,user,approval=payload)
        raise AssertionError('Invalid or foreign exception accepted')
    except HTTPException as e:assert e.status_code==400
assert db.query(models.Document).count()==0
assert db.query(ExpenseReceiptAuthorization).count()==0
assert db.get(models.ExpenseClaim,c.id).status==models.ExpenseClaimStatus.SUBMITTED
''')


def test_missing_account_rolls_back_authorization_and_documents(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
c=missing_claim()
db.query(Account).filter_by(code='2.1.4.099').one().active=False;db.commit()
try:
    update_claim_status(c.id,ExpenseClaimStatus.APPROVED,db,user,approval=exception(c))
    raise AssertionError('Missing accounting allowed')
except HTTPException as e:assert e.status_code==400
assert db.query(models.Document).count()==0
assert db.query(models.JournalEntry).count()==0
assert db.query(ExpenseReceiptAuthorization).count()==0
assert statement('emp',db,worker)['balances']['ARS']==0
''')


def test_http_approval_body_authorizes_only_selected_expense(isolated_backend,tmp_path):
    setup=SETUP.replace("create_engine('sqlite:///:memory:')", "create_engine('sqlite:///:memory:',connect_args={'check_same_thread':False},poolclass=__import__('sqlalchemy').pool.StaticPool)")
    run_python(isolated_backend,tmp_path,setup+'''
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.db.session import get_db
from app.modules.auth.auth_router import get_current_user
from app.modules.expenses.expense_router import router
c=missing_claim()
app=FastAPI();app.include_router(router)
app.dependency_overrides[get_db]=lambda:db
app.dependency_overrides[get_current_user]=lambda:user
client=TestClient(app)
response=client.patch('/expenses/claims/'+c.id+'/status?status=APPROVED',json=exception(c).model_dump())
assert response.status_code==200,response.text
response=client.get('/expenses/claims/'+c.id)
assert response.status_code==200,response.text
item=response.json()['items'][0]
assert item['authorization_reason']=='Comprobante extraviado, gasto verificado'
assert item['authorized_by']=='admin' and item['authorized_at']
''')
