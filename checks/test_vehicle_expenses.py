"""Fleet source deduplication using disposable SQLite; no production startup."""
from test_bootstrap import isolated_backend, run_python
from test_invoice_delivery import SETUP as BASE_SETUP

SETUP = BASE_SETUP + '''
from app.modules.logistics.vehicle_router import list_vehicles, get_vehicle_expenses
from app.db.models.models import Vehicle, ExpenseClaim, ExpenseItem, ExpenseItemVehicle, DocumentVehicleExpense
for key in ['v1','v2','v3']:
    db.add(Vehicle(id=key,name=key))
db.add(ExpenseClaim(id='claim',entity_id='client',title='Gastos',status='DRAFT'))
db.flush()
def document(key,amount=100,kind='PURCHASE_INVOICE',status='OPEN',vehicle=None):
    doc=models.Document(id=key,entity_id='client',doc_type=kind,number=key,date=datetime(2026,10,20,18),
        total_amount=amount,total_amount_ars=amount,status=status,vehicle_id=vehicle)
    db.add(doc); db.flush(); return doc
def link(doc,vehicle='v1',amount=100):
    db.add(DocumentVehicleExpense(document_id=doc.id,vehicle_id=vehicle,amount=amount,percentage=100,notes='Combustible'))
def ticket(key,amount=100,generated=None,vehicles=('v1',)):
    db.add(ExpenseItem(id=key,claim_id='claim',date=datetime(2026,10,20,17),description=key,
        category='Combustible',amount=amount,generated_doc_id=generated))
    db.flush()
    for vid in vehicles: db.add(ExpenseItemVehicle(expense_item_id=key,vehicle_id=vid))
    db.flush()
def expenses(vehicle='v1'):
    db.commit()
    return get_vehicle_expenses(vehicle,datetime(2026,10,20),datetime(2026,10,20),db)
'''


def test_receipt_conversion_direct_links_cancellation_and_credit(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
f=document('invoice',vehicle='v1'); link(f)
ticket('converted',generated=f.id)
ticket('ticket',amount=50)
link(document('cancelled',amount=500,status='CANCELLED'),amount=500)
ticket('cancelled-source',amount=500,generated='cancelled')
link(document('credit',amount=20,kind='PURCHASE_CREDIT_NOTE'),amount=20)
link(document('debit',amount=30,kind='PURCHASE_DEBIT_NOTE'),amount=30)
document('payment',amount=999,kind='PAYMENT',vehicle='v1')
rows=expenses()
assert len(rows)==4, rows
assert sum(r['amount'] for r in rows)==160
summary=list_vehicles(False,datetime(2026,10,20),datetime(2026,10,20),db)
assert next(r for r in summary if r['id']=='v1')['total_expenses']==160
assert next(r for r in rows if r['source_id']=='invoice')['category']=='Combustible'
assert db.query(models.JournalEntry).count()==0
''')


def test_shared_legacy_ticket_cents_and_rejected_claim(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
ticket('split',amount=100,vehicles=('v1','v2','v3'))
amounts=[expenses(v)[0]['amount'] for v in ['v1','v2','v3']]
assert amounts==[33.34,33.33,33.33],amounts
assert round(sum(amounts),2)==100
db.get(ExpenseClaim,'claim').status='REJECTED'
assert expenses()==[]
''')


def test_explicit_allocations_override_direct_legacy_link_and_date_filter(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
f=document('partial',vehicle='v1'); link(f,'v2',60)
assert expenses('v1')==[]
assert expenses('v2')[0]['amount']==60
f.date=datetime(2026,10,21)
assert expenses('v2')==[]
try:
    get_vehicle_expenses('missing',None,None,db)
    raise AssertionError('missing vehicle accepted')
except HTTPException as e:
    assert e.status_code==404
''')


def test_purchase_invoice_stores_vehicle_link_with_accounting_and_no_stock(isolated_backend,tmp_path):
    run_python(isolated_backend,tmp_path,SETUP+'''
from app.modules.accounting.document_router import update_document
from app.modules.accounting.document_schemas import DocumentUpdate
from app.modules.logistics.vehicle_expenses import validate_vehicle_allocations
payload=DocumentCreate(doc_type='PURCHASE_INVOICE',number='0001-00000001',date=datetime(2026,10,20),
    entity_id='client',currency='USD',exchange_rate=1000,total_amount=121,
    vehicle_expenses=[dict(vehicle_id='v1',amount=121,percentage=100,notes='Mantenimiento')],
    lines=[dict(description='Reparación',qty=1,unit_price=100,net_amount=100,vat_rate=.21,
        vat_amount=21,total_amount=121,accounting_account_id='5.1.1.001')])
f=create_document(payload,db,user)
assert db.query(models.JournalEntry).count()==1
rows=expenses(); assert len(rows)==1 and rows[0]['amount']==121000,rows
assert rows[0]['category']=='Mantenimiento'
assert db.query(StockMovement).count()==0
update_document(f.id,DocumentUpdate(vehicle_expenses=[dict(vehicle_id='v2',amount=1,percentage=100,notes='Reparaciones')]),db,user)
assert expenses('v1')==[]
assert expenses('v2')[0]['amount']==121000
for entries in [[dict(vehicle_id='missing',amount=1)], [dict(vehicle_id='v1',amount=200)],
                [dict(vehicle_id='v1',amount=-1)], [dict(vehicle_id='v1',amount=float('nan'))],
                [dict(vehicle_id='v1',amount=1),dict(vehicle_id='v1',amount=1)]]:
    try:
        validate_vehicle_allocations(db,entries,100)
        raise AssertionError('Invalid allocation accepted')
    except HTTPException as e:
        assert e.status_code==400
''')
