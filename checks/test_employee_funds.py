"""Funds, expense approvals and row-level permissions in disposable databases."""
from test_bootstrap import isolated_backend, run_python
from test_invoice_delivery import SETUP as BASE_SETUP

SETUP = BASE_SETUP + '''
from app.db.models.auth_models import User, Role, CashPosition, CashMovement
from app.db.models.employee_fund_models import *
from app.modules.expenses.fund_schemas import FundInput
from app.modules.expenses.fund_router import create_movement,statement
from app.modules.expenses.expense_router import create_expense_claim,update_expense_claim,update_claim_status,get_expense_claim,list_expense_claims
from app.modules.expenses.expense_schemas import ExpenseClaimCreate,ExpenseClaimStatus
from app.modules.services.account_plan import add_missing_accounts
from app.modules.expenses.access import scope
from app.modules.auth.auth_router import get_effective_permissions
from app.modules.accounting.document_guards import require_unmanaged_employee_document
add_missing_accounts(db)
user=User(id='admin',email='admin@example.invalid',username='admin',hashed_password='unused',roles=['admin'])
worker=User(id='worker',email='worker@example.invalid',username='worker',hashed_password='unused',roles=['employee'])
db.add_all([user,worker,models.Entity(id='emp',name='Empleado',type='employee'),models.Entity(id='other',name='Otro empleado',type='employee'),
    models.Entity(id='supplier',name='Estación',type='provider'),Role(name='employee',permissions={'employee_expenses':{'view':True,'create':True,'edit':True},'employee_funds':{'create':True}})])
db.flush();db.add(EmployeeAccess(user_id='worker',entity_id='emp'));db.commit()
def movement(kind='ADVANCE',amount=100,currency='ARS',rate=1,key='request-0001',**kw):
    return FundInput(entity_id='emp',kind=kind,currency=currency,amount=amount,exchange_rate=rate,date=datetime(2026,10,20),
        description=kind,treasury_account='1.1.1.002',request_key=key,**kw)
def claim_data(currency='ARS',rate=1,total=70,number='0001-00000010'):
    return ExpenseClaimCreate(entity_id='emp',title='Viaje',date=datetime(2026,10,20),currency=currency,exchange_rate=rate,
        items=[dict(date=datetime(2026,10,20),description='Combustible',category='Combustible',amount=total,net_amount=total,
            vat_rate=0,vat_amount=0,account_code='5.1.1.001',provider_id='supplier',invoice_number=number,vehicle_ids=[])])
def submit(data=None):
    c=create_expense_claim(data or claim_data(),db,worker)
    update_claim_status(c.id,ExpenseClaimStatus.SUBMITTED,db,worker)
    return c
'''


def test_accumulated_funds_claim_supplier_and_reimbursement(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
create_movement(movement(),db,user)
c=submit()
assert statement('emp',db,worker)['balances']['ARS']==100
assert statement('emp',db,worker)['pending']['ARS']==70
update_claim_status(c.id,ExpenseClaimStatus.APPROVED,db,user)
assert statement('emp',db,worker)['balances']['ARS']==30
assert statement('emp',db,worker)['pending']['ARS']==0
assert db.query(models.Document).count()==2
assert db.query(models.Application).count()==1
for j in db.query(models.JournalEntry): assert round(sum(l.debit-l.credit for l in j.lines),2)==0
second=submit(claim_data(total=50,number='0001-00000011'))
update_claim_status(second.id,ExpenseClaimStatus.APPROVED,db,user)
assert statement('emp',db,worker)['balances']['ARS']==-20
create_movement(movement('REIMBURSE',20,key='request-0002'),db,user)
assert statement('emp',db,worker)['balances']['ARS']==0
try:
    update_claim_status(c.id,ExpenseClaimStatus.APPROVED,db,user)
    raise AssertionError('Duplicate approval accepted')
except HTTPException as e: assert e.status_code==409
assert db.query(models.Document).count()==4
for doc in db.query(models.Document):
    try:
        require_unmanaged_employee_document(db,doc)
        raise AssertionError('Managed document can be edited')
    except HTTPException as e: assert e.status_code==409
''')


def test_usd_conversion_carrying_value_and_retry(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
payload=movement(amount=100,currency='USD',rate=1000)
first=create_movement(payload,db,user)
assert create_movement(payload,db,user)==first
assert db.query(EmployeeFundOperation).count()==1
fx=movement('FX',100,currency='USD',rate=1100,key='request-0002')
create_movement(fx,db,user)
assert statement('emp',db,worker)['balances']=={'ARS':110000,'USD':0}
from app.modules.expenses.funds import balances
amounts,bases=balances(db,'emp')
assert bases['USD']==0 and bases['ARS']==110000
assert any(l.account_code=='4.2.1.001' and l.credit==10000 for j in db.query(models.JournalEntry) for l in j.lines)
try:
    create_movement(movement('FX',1,currency='USD',rate=1100,key='request-0003'),db,user)
    raise AssertionError('Converted unavailable USD')
except HTTPException as e: assert e.status_code==400
assert db.query(EmployeeFundOperation).count()==2
''')


def test_scope_overrides_submission_lock_and_return(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
c=submit()
assert len(list_expense_claims(None,None,None,db,worker))==1
for action in [lambda: statement('other',db,worker),lambda:update_claim_status(c.id,ExpenseClaimStatus.APPROVED,db,worker)]:
    try: action();raise AssertionError('Missing permission accepted')
    except HTTPException as e: assert e.status_code==403
try:
    update_expense_claim(c.id,claim_data(total=90),db,worker)
    raise AssertionError('Submitted claim editable')
except HTTPException as e: assert e.status_code in (400,409)
db.rollback()
update_claim_status(c.id,ExpenseClaimStatus.REJECTED,db,user,reason='Corregir número')
assert get_expense_claim(c.id,db,worker).review_note=='Corregir número'
update_expense_claim(c.id,claim_data(total=90),db,worker)
update_claim_status(c.id,ExpenseClaimStatus.SUBMITTED,db,worker)
worker.permissions={'employee_expenses':{'edit':False}};db.commit()
assert get_effective_permissions(worker,db)['employee_expenses']['edit'] is False
try:
    update_claim_status(c.id,ExpenseClaimStatus.SUBMITTED,db,worker)
    raise AssertionError('Explicit denial ignored')
except HTTPException as e: assert e.status_code==403
''')


def test_missing_accounts_roll_back_approval_and_cash(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
c=submit()
a=db.query(Account).filter_by(code='2.1.4.099').one();a.active=False;db.commit()
try:
    update_claim_status(c.id,ExpenseClaimStatus.APPROVED,db,user)
    raise AssertionError('Missing account accepted')
except HTTPException as e: assert e.status_code==400
assert db.get(models.ExpenseClaim,c.id).status==models.ExpenseClaimStatus.SUBMITTED
assert db.query(models.Document).count()==0
assert db.query(models.JournalEntry).count()==0
assert db.query(EmployeeFundOperation).count()==0
try:
    create_movement(movement(payment_method='CASH'),db,user)
    raise AssertionError('Cash movement without open day accepted')
except HTTPException as e: assert e.status_code==400
db.add(CashPosition(id='day',date='2026-10-20',status='OPEN',opening_balances={'ARS':500},opened_by='admin'));db.commit()
create_movement(movement(payment_method='CASH'),db,user)
assert db.query(CashMovement).one().amount==-100
''')


def test_private_receipt_access_and_untrusted_attachment_link(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
import asyncio
from io import BytesIO
from starlette.datastructures import UploadFile, Headers
from app.modules.expenses.expense_router import upload_receipt,get_receipt
other_user=User(id='otheruser',email='other@example.invalid',username='otheruser',hashed_password='unused',roles=['employee'])
db.add(other_user);db.flush();db.add(EmployeeAccess(user_id=other_user.id,entity_id='other'));db.commit()
file=UploadFile(BytesIO(b'private image fixture'),filename='ticket.png',headers=Headers({'content-type':'image/png'}))
upload=asyncio.run(upload_receipt(file,db,worker))
id=upload['url'].rsplit('/',1)[1]
assert get_receipt(id,db,worker).media_type=='image/png'
for read in [lambda:get_receipt(id,db,other_user)]:
    try:read();raise AssertionError('Private image disclosed')
    except HTTPException as e:assert e.status_code==403
payload=claim_data();payload.entity_id='other';payload.items[0].attachment_url=upload['url']
try:
    create_expense_claim(payload,db,other_user)
    raise AssertionError('Another employee can attach a private receipt')
except HTTPException as e: assert e.status_code==403
assert db.query(models.ExpenseClaim).count()==0
''')


def test_usd_claim_settlement_and_reverse_conversion(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
create_movement(movement(amount=100,currency='USD',rate=1000),db,user)
c=submit(claim_data(currency='USD',rate=1100,total=120))
update_claim_status(c.id,ExpenseClaimStatus.APPROVED,db,user)
assert statement('emp',db,worker)['balances']['USD']==-20
create_movement(movement('REIMBURSE',20,currency='USD',rate=1200,key='request-0002'),db,user)
from app.modules.expenses.funds import balances
amounts,bases=balances(db,'emp')
assert amounts['USD']==bases['USD']==0
create_movement(movement(amount=10000,key='request-0003'),db,user)
create_movement(movement('FX',10000,rate=1000,key='request-0004'),db,user)
assert statement('emp',db,worker)['balances']=={'ARS':0,'USD':10}
assert db.query(StockMovement).count()==0
''')


def test_http_authentication_scope_and_schema(isolated_backend,tmp_path):
    setup=SETUP.replace("create_engine('sqlite:///:memory:')", "create_engine('sqlite:///:memory:',connect_args={'check_same_thread':False},poolclass=__import__('sqlalchemy').pool.StaticPool)")
    run_python(isolated_backend,tmp_path,setup+'''
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.db.session import get_db
from app.modules.auth.auth_router import get_current_user
from app.modules.expenses import fund_router,expense_router
app=FastAPI();app.include_router(fund_router.router);app.include_router(expense_router.router)
app.dependency_overrides[get_db]=lambda:db
client=TestClient(app)
assert client.get('/employee-funds/emp').status_code==401
app.dependency_overrides[get_current_user]=lambda:worker
assert client.get('/employee-funds/other').status_code==403
payload=claim_data().model_dump(mode='json')
response=client.post('/expenses/claims',json=payload)
assert response.status_code==201,response.text
assert response.json()['currency']=='ARS'
claim_id=response.json()['id']
assert client.patch('/expenses/claims/'+claim_id+'/status?status=SUBMITTED').status_code==200
assert client.put('/expenses/claims/'+claim_id,json=payload).status_code==400
assert client.patch('/expenses/claims/'+claim_id+'/status?status=APPROVED').status_code==403
invalid=movement().model_dump(mode='json');invalid['exchange_rate']=0
assert client.post('/employee-funds/movements',json=invalid).status_code==422
''')
