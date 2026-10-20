"""Actual service-work routes with isolated accounts, invoices and stock."""
import pytest
from test_bootstrap import isolated_backend, run_python
from test_invoice_delivery import SETUP as BASE_SETUP

SETUP = BASE_SETUP + '''
from app.db.models.field_models import Farm, Machinery
from app.db.models.service_models import ServiceWork, ServiceWorkCost, ServiceWorkBilling, ServiceInvoiceRequest
from app.modules.services.schemas import WorkInput, CostInput, InvoiceInput
from app.modules.services.router import create_work, update_work, add_cost, delete_cost, create_invoice
from app.modules.services.service import describe_work, used_quantity, invoice_work
from app.modules.services.account_plan import add_missing_accounts
from app.modules.accounting.document_router import annul_document, delete_document, update_document
from app.modules.accounting.document_schemas import DocumentUpdate
add_missing_accounts(db)
db.add(Product(id='svc',name='Servicio prueba',is_service=True,unit_of_measure='HA'))
db.add(Farm(id='farm',name='Campo prueba'))
db.add(Machinery(id='machine',name='Dron prueba'))
db.add(models.Entity(id='employee',name='Operario prueba',type='employee'))
db.add(models.Entity(id='client2',name='Otro cliente',type='client'))
db.commit()
def work(description='Trabajo', **changes):
    values=dict(description=description,date=datetime(2026,10,20),entity_id='client',farm_id='farm',
        product_id='svc',machinery_id='machine',activity='DRONE',unit='HA',quantity=100,
        unit_price=10,vat_rate='.21',currency='ARS',exchange_rate=1,cost_center=1)
    values.update(changes)
    return create_work(WorkInput(**values),db,user)
def request(items,key='request-1',rate=1):
    return InvoiceInput(request_key=key,items=[dict(work_id=w['id'],quantity=q) for w,q in items],
        date=datetime(2026,10,20),letter='A',exchange_rate=rate,cost_center=1)
'''


def test_grouped_partial_billing_is_idempotent_and_no_stock(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
a=work('Aplicación norte')
b=work('Aplicación sur',quantity=60,unit_price=20)
payload=request([(a,40),(b,20)])
first=create_invoice(payload,db,user)
second=create_invoice(payload,db,user)
assert first['id']==second['id']
assert first['is_draft'] and first['total_amount']==968
assert db.query(models.Document).count()==1
assert db.query(models.JournalEntry).count()==1
assert db.query(ServiceWorkBilling).count()==2
assert used_quantity(db,a['id'])==40 and used_quantity(db,b['id'])==20
assert describe_work(db,db.get(ServiceWork,a['id']))['pending_quantity']==60
assert db.query(StockMovement).count()==0 and balance()==200
journal=db.query(models.JournalEntry).one()
assert sum(l.debit for l in journal.lines)==sum(l.credit for l in journal.lines)==968
assert any(l.account_code=='4.1.3.001' and l.credit==400 for l in journal.lines)
try:
    create_invoice(request([(a,41),(b,20)]),db,user)
    raise AssertionError('Idempotency key reused with different content')
except HTTPException as e:
    assert e.status_code==409
create_invoice(request([(a,60)],key='request-2'),db,user)
assert used_quantity(db,a['id'])==100
try:
    create_invoice(request([(a,1)],key='request-3'),db,user)
    raise AssertionError('Overbilling accepted')
except HTTPException as e:
    assert e.status_code==400
assert db.query(models.Document).count()==2
''')


@pytest.mark.parametrize('unit,quantity,rate,total',[('H',2,100,200),('HA',10,2,20),('KM',50,3,150)])
def test_employee_cost_modes_and_currency(isolated_backend,tmp_path,unit,quantity,rate,total):
    run_python(isolated_backend,tmp_path,SETUP+f'''
a=work(currency='USD',exchange_rate=1000)
account=db.query(Account).filter_by(code='5.1.3.001').one()
result=add_cost(a['id'],CostInput(category='LABOR',description='Operario',employee_id='employee',
    account_id=account.id,unit={unit!r},quantity={quantity},unit_cost={rate},currency='USD',
    exchange_rate=1000,date=datetime(2026,10,20)),db)
assert result['costs_ars']=={total}*1000
assert result['costs'][0]['employee_name']=='Operario prueba'
assert result['estimated_margin_ars']==1000000-{total}*1000
assert db.query(models.Document).count()==0
assert db.query(models.JournalEntry).count()==0
result=delete_cost(a['id'],result['costs'][0]['id'],db)
assert result['costs_ars']==0
''')


def test_rollback_mixed_client_and_missing_account(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
a=work(); b=work(entity_id='client2')
for payload in [request([(a,10),(b,10)]),request([(a,10),(a,10)])]:
    try:
        create_invoice(payload,db,user)
        raise AssertionError('Invalid grouping accepted')
    except HTTPException as e:
        assert e.status_code==400
account=db.query(Account).filter_by(code='4.1.3.001').one(); account.active=False; db.commit()
try:
    create_invoice(request([(a,10)]),db,user)
    raise AssertionError('Missing active accounting accepted')
except HTTPException as e:
    assert e.status_code==400
assert db.query(models.Document).count()==0
assert db.query(ServiceWorkBilling).count()==0
assert db.get(ServiceWork,a['id']).revision==0
assert used_quantity(db,a['id'])==0
''')


def test_cancel_and_delete_release_quantities_and_protect_edits(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
a=work()
f=create_invoice(request([(a,40)]),db,user)
for action in [lambda:update_document(f['id'],DocumentUpdate(total_amount=1),db,user),
               lambda:update_work(a['id'],WorkInput(**{**a,'quantity':10}),db)]:
    try:
        action()
        raise AssertionError('Billing traceability changed')
    except HTTPException as e:
        assert e.status_code==409
annul_document(f['id'],db,user)
assert used_quantity(db,a['id'])==0
f2=create_invoice(request([(a,100)],key='request-2'),db,user)
assert used_quantity(db,a['id'])==100
delete_document(f2['id'],db,user)
assert used_quantity(db,a['id'])==0
assert db.query(ServiceInvoiceRequest).filter_by(document_id=f2['id']).count()==0
''')


def test_concurrent_partial_invoices_cannot_exceed_work(isolated_backend,tmp_path):
    setup=SETUP.replace("create_engine('sqlite:///:memory:')", "create_engine('sqlite:///concurrent.db',connect_args={'timeout':.2})")
    run_python(isolated_backend,tmp_path,setup+'''
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from app.modules.services import service
a=work()
barrier=Barrier(2)
original=service.lock_work
def synchronize(session,row):
    barrier.wait(timeout=5)
    original(session,row)
service.lock_work=synchronize
def attempt(index):
    with Session(engine) as session:
        try:
            invoice_work(session,request([(a,60)],key=f'request-{index}'),user)
            return 200
        except HTTPException as e:
            return e.status_code
with ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(attempt,[1,2]))
assert sorted(results)==[200,409], results
db.expire_all()
assert used_quantity(db,a['id'])==60
assert db.query(models.Document).count()==1
''')


def test_usd_freight_and_mixed_currency_rejection(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
a=work('Flete',currency='USD',exchange_rate=1000,activity='FREIGHT',unit='KM')
b=work('Pesos')
try:
    create_invoice(request([(a,1),(b,1)],rate=1100),db,user)
    raise AssertionError('Mixed currencies accepted')
except HTTPException as e:
    assert e.status_code==400
f=create_invoice(request([(a,2.5)],rate=1100),db,user)
doc=db.get(models.Document,f['id'])
assert doc.total_amount==30.25 and doc.total_amount_ars==33275
assert describe_work(db,db.get(ServiceWork,a['id']))['invoiced_net_ars']==27500
assert any(l.account_code=='4.1.4.001' for l in doc.journal_entries[0].lines)
''')


def test_plan_keeps_existing_accounts_and_employee_validation(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
account=db.query(Account).filter_by(code='4.1.3.001').one()
account.name='Nombre elegido';account.active=False;db.commit()
assert add_missing_accounts(db)==[]
assert account.name=='Nombre elegido' and not account.active
a=work()
cost_account=db.query(Account).filter_by(code='5.1.3.001').one()
try:
    add_cost(a['id'],CostInput(category='LABOR',description='Inválido',employee_id='client',
        account_id=cost_account.id,unit='H',quantity=1,unit_cost=10,currency='ARS',date=datetime.now()),db)
    raise AssertionError('Client accepted as employee')
except HTTPException as e:
    assert e.status_code==400
assert db.query(ServiceWorkCost).count()==0
try:
    work(product_id='p')
    raise AssertionError('Stock product accepted as service')
except HTTPException as e:
    assert e.status_code==400
''')
