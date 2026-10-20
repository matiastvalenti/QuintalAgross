"""Draft balances, application locks and strict accounting through actual routes."""
from test_bootstrap import isolated_backend, run_python
from test_invoice_delivery import SETUP

EXTRA = '''
from app.modules.accounting.document_router import update_document, delete_document, annul_document, register_document_afip
from app.modules.accounting.document_schemas import DocumentUpdate
from app.modules.entities.account_statement_service import build_entity_ledger
from app.modules.accounting.application_service import void_sales_application
from app.modules.accounting.document_status_service import recalc_document_status

def collect(doc, amount=100):
    return create_document(DocumentCreate(doc_type='RECEIPT', number='0001-00000001',
        entity_id='client', currency='ARS', total_amount=amount, exchange_rate=1,
        payments=[dict(type='CASH', amount=amount)],
        applications=[dict(to_document_id=doc.id, amount_applied=amount, exchange_rate=1)]), db, user)
'''


def test_draft_in_balance_with_payment_and_locks(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + EXTRA + '''
f=invoice()
assert f.is_draft and f.cae is None
rows=build_entity_ledger(db,'client')
row=next(r for r in rows if r['id']==f.id)
assert row['is_draft'] and row['balance_ars']==1210, row
r=collect(f)
assert f.is_draft and f.status == models.DocumentStatus.PARTIAL
rows=build_entity_ledger(db,'client')
assert rows[-1]['balance_ars']==1110, rows
for action in [lambda: update_document(f.id,DocumentUpdate(total_amount=1400),db,user),
               lambda: delete_document(f.id,db,user), lambda: annul_document(f.id,db,user)]:
    try:
        action()
        raise AssertionError('Applied draft changed')
    except HTTPException as exc:
        assert exc.status_code == 409 and r.number in exc.detail, exc.detail
assert db.get(models.Document,f.id).total_amount==1210
assert db.query(models.Application).count()==1
app=db.query(models.Application).one()
assert void_sales_application(db,app.id,'Desaplicación')['ok']
db.commit()
update_document(f.id,DocumentUpdate(notes='Borrador revisado'),db,user)
assert db.get(models.Document,f.id).notes=='Borrador revisado'
annul_document(f.id,db,user)
assert db.get(models.Document,f.id).status==models.DocumentStatus.CANCELLED
assert db.query(models.JournalEntry).filter_by(document_id=f.id).count()==0
''')


def test_accounting_failure_rolls_back_everything(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + EXTRA + '''
db.get(Account,'4.1.1.001').active=False
db.commit()
try:
    invoice()
    raise AssertionError('Inactive accounting accepted')
except HTTPException as exc:
    assert exc.status_code==400 and 'contable' in exc.detail
assert db.query(models.Document).count()==0
assert db.query(models.JournalEntry).count()==0
assert db.get(SalesOrderLine,'ol').qty_invoiced==0
assert balance()==200
db.get(Account,'4.1.1.001').active=True
db.get(Product,'p').sales_account_id=None
db.commit()
try:
    invoice()
    raise AssertionError('Missing product account accepted')
except HTTPException as exc:
    assert exc.status_code==400
assert db.query(models.Document).count()==0
''')


def test_arca_action_does_not_simulate_authorization(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + EXTRA + '''
f=invoice()
collect(f)
ids=[a.id for a in db.query(models.Application)]
try:
    register_document_afip(f.id,db,user)
    raise AssertionError('Fake authorization accepted')
except HTTPException as exc:
    assert exc.status_code==503
assert f.is_draft and f.cae is None
assert ids==[a.id for a in db.query(models.Application)]
assert db.query(models.Document).count()==2
from app.modules.accounting.afip_wsfe_service import AfipWsfeService
from app.modules.inventory.afip_lpg_service import AfipLpgService
for call in [lambda: AfipWsfeService.authorize_invoice({'tax_id':'test'}),
             lambda: AfipLpgService.request_coe({})]:
    try:
        call()
        raise AssertionError('Fiscal simulation still enabled')
    except RuntimeError:
        pass
''')


def test_receipt_without_accounting_detail_is_not_saved(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + EXTRA + '''
f=invoice()
try:
    create_document(DocumentCreate(doc_type='RECEIPT',number='0001-00000001',entity_id='client',
        total_amount=100, applications=[dict(to_document_id=f.id,amount_applied=100)]),db,user)
    raise AssertionError('Unbalanced receipt saved')
except HTTPException as exc:
    assert exc.status_code==400 and 'desbalanceado' in exc.detail
assert db.query(models.Document).count()==1
assert db.query(models.Application).count()==0
assert db.query(models.JournalEntry).count()==1
''')


def test_full_collection_does_not_remove_draft_label(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + EXTRA + '''
f=invoice()
collect(f,1210)
assert f.status==models.DocumentStatus.CLOSED and f.is_draft
rows=build_entity_ledger(db,'client')
assert next(r for r in rows if r['id']==f.id)['is_draft']
assert rows[-1]['balance_ars']==0
# Once authorization metadata exists, the same row and its allocations remain.
# This is a local fixture transition, never an ARCA request.
f.cae='TEST-ONLY'
db.commit()
assert not f.is_draft
assert db.query(models.Document).count()==2
assert len(build_entity_ledger(db,'client'))==2
assert db.query(models.Application).count()==1
''')


def test_supplier_draft_accepts_payment_and_keeps_label(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + EXTRA + '''
purchase=create_document(DocumentCreate(doc_type='PURCHASE_INVOICE',status='DRAFT',
    number='0001-00000002',entity_id='client',currency='ARS',total_amount=121,
    lines=[dict(description='Servicio comprado',qty=1,unit_price=100,vat_rate=.21,
        accounting_account_id='5.1.1.001')]),db,user)
payment=create_document(DocumentCreate(doc_type='PAYMENT',number='0001-00000003',
    entity_id='client',currency='ARS',total_amount=21,payments=[dict(type='CASH',amount=21)],
    applications=[dict(to_document_id=purchase.id,amount_applied=21,exchange_rate=1)]),db,user)
assert purchase.status==models.DocumentStatus.DRAFT and purchase.is_draft
rows=build_entity_ledger(db,'client',view='supplier')
assert len(rows)==2 and rows[-1]['balance_ars']==100, rows
assert next(r for r in rows if r['id']==purchase.id)['is_draft']
try:
    annul_document(purchase.id,db,user)
    raise AssertionError('Applied supplier draft cancelled')
except HTTPException as exc:
    assert exc.status_code==409
''')


def test_grain_save_never_requests_coe_and_requires_accounting(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + EXTRA + '''
from fastapi import BackgroundTasks
from app.db.models import grain_models
from app.modules.inventory.grain_router import create_settlement
from app.modules.inventory.grain_schemas import GrainSettlementCreate
from app.modules.inventory.afip_lpg_service import AfipLpgService
def forbidden_call(*args):
    raise AssertionError('COE requested during save')
AfipLpgService.request_coe=forbidden_call
db.add(grain_models.GrainType(id='grain',name='Grano prueba',short_name='PR'))
db.add(grain_models.Harvest(id='harvest',name='Prueba'))
db.add(Account(id='grain-account',code='5.1.2.001',name='Compras grano'))
db.commit()
data=GrainSettlementCreate(entity_id='client',grain_type_id='grain',harvest_id='harvest',
    number='LPG-1',date=datetime.now(),currency='ARS',exchange_rate=1,
    total_kilos=1000,price_per_ton=100,gross_amount=100,vat_amount=21,net_amount=121,
    items=[dict(line_type='DEBIT',description='Grano prueba',quantity=1000,unit_price=.1,
        subtotal=100,vat_rate=.21,vat_amount=21,total_amount=121)])
settle=create_settlement(data,BackgroundTasks(),db)
assert settle.coe_number is None and settle.status=='DRAFT'
doc=db.get(models.Document,settle.document_id)
assert doc.is_draft
assert db.query(models.JournalEntry).filter_by(document_id=doc.id).count()==1
db.get(Account,'grain-account').active=False
db.commit()
try:
    create_settlement(data.model_copy(update={'number':'LPG-2'}),BackgroundTasks(),db)
    raise AssertionError('Grain saved without accounting')
except HTTPException as exc:
    assert exc.status_code==400
assert db.query(grain_models.GrainSettlement).count()==1
assert db.query(models.Document).count()==1
''')
