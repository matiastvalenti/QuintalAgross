"""Exercise receipt FX allocation in disposable databases, without startup or ARCA."""
import pytest
from test_bootstrap import isolated_backend, run_python

SETUP = '''
from datetime import datetime
from types import SimpleNamespace
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.db.base import Base
from app.db import models
from app.db.models import commercial_models
from app.modules.accounting.fx_service import generate_fx_adjustment
from app.modules.accounting.document_status_service import get_document_balance_info, get_document_usage
from app.modules.accounting.applications_router import create_sales_applications, SalesApplicationCreate
from app.modules.accounting.document_router import create_document, void_document, VoidRequest, _sanitize_document_for_response
from app.modules.accounting.document_schemas import DocumentCreate
from app.modules.accounting.application_service import void_sales_application
engine = create_engine('sqlite:///:memory:')
Base.metadata.create_all(engine)
db = Session(engine)
db.add(models.Entity(id='client', name='Cliente de prueba'))
invoice = models.Document(id='invoice', entity_id='client', doc_type=models.DocumentType.INVOICE,
    number='0001-00000001', currency=models.CurrencyType.USD, exchange_rate=1000,
    total_amount=1000, total_amount_ars=1000000, status=models.DocumentStatus.OPEN, line='A')
db.add(invoice)
db.add(models.DocumentLine(document_id='invoice', description='Producto de prueba', qty=1,
    unit_price=1000/1.21, net_amount=1000/1.21, vat_rate=.21, vat_amount=1000-1000/1.21, total_amount=1000))
db.commit()
user = SimpleNamespace(roles=['admin'], username='test', id=None)
def check(document, expected):
    balance = get_document_balance_info(document, db)
    assert abs(balance['balance']-expected) < .00001, balance
    assert get_document_usage(document, db) <= document.total_amount + .00001
'''

@pytest.mark.parametrize('rate,amount', [(1100,1000),(900,1000),(1000,1000),(1100,400),(900,400)])
@pytest.mark.parametrize('entry', ['receipt', 'application', 'void_receipt'])
def test_receipt_settles_adjustment_once(isolated_backend, tmp_path, rate, amount, entry):
    run_python(isolated_backend, tmp_path, SETUP + f'''\nrate={rate}; amount={amount}; entry={entry!r}
if entry in ('receipt', 'void_receipt'):
    receipt = create_document(DocumentCreate(doc_type='RECEIPT', number='0001-00000001',
        entity_id='client', date=datetime.now(), currency='ARS', exchange_rate=rate,
        total_amount=amount*rate, applications=[dict(to_document_id='invoice', amount_applied=amount, exchange_rate=rate)]), db, user)
else:
    receipt = models.Document(entity_id='client', doc_type=models.DocumentType.RECEIPT,
        number='0001-00000001', currency=models.CurrencyType.ARS, exchange_rate=rate,
        total_amount=amount*rate, total_amount_ars=amount*rate, status=models.DocumentStatus.OPEN)
    db.add(receipt); db.commit()
    create_sales_applications(SalesApplicationCreate(entity_id='client', application_date=datetime.now(),
        items=[dict(credit_document_id=receipt.id, debit_document_id='invoice', amount=amount, exchange_rate=rate)]), db, user)
check(receipt, 0)
check(invoice, 1000-amount)
links = db.query(models.FxAdjustmentLink).all()
if rate == 1000:
    assert not links
else:
    assert len(links) == 1
    link = links[0]
    note = link.generated_document
    assert note.doc_type.value == ('DEBIT_NOTE' if rate > 1000 else 'CREDIT_NOTE')
    assert note.total_amount == amount*abs(rate-1000)
    check(note, 0)
    assert abs(sum(l.net_amount+l.vat_amount for l in note.lines)-note.total_amount) < .001
    count = db.query(models.Application).count()
    assert generate_fx_adjustment(link.source_application_id, db).id == link.id
    assert db.query(models.Application).count() == count
    assert db.query(models.FxAdjustmentLink).count() == 1
    db.expire(receipt, ['applied_to'])
    _sanitize_document_for_response(receipt, db)
    visible = [a for a in receipt.applied_to if not a.is_system_fx]
    assert len(visible) == 1
    assert visible[0].fx_settled_amount == amount
    if entry == 'void_receipt':
        result = void_document(receipt.id, VoidRequest(reason='Prueba'), db, user)
    else:
        result = void_sales_application(db, link.source_application_id, 'Prueba')
    assert result['ok']
    check(receipt, 0 if entry == 'void_receipt' else amount*rate)
    check(invoice, 1000)
    check(note, 0)
''')


def test_missing_detail_rolls_back_receipt(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + '''
db.query(models.DocumentLine).delete(); db.commit()
try:
    create_document(DocumentCreate(doc_type='RECEIPT', number='0001-00000001', entity_id='client',
        currency='ARS', exchange_rate=1100, total_amount=1100000,
        applications=[dict(to_document_id='invoice', amount_applied=1000, exchange_rate=1100)]), db, user)
    raise AssertionError('Receipt saved without its required note')
except HTTPException as exc:
    assert exc.status_code == 400
assert db.query(models.Document).count() == 1
assert db.query(models.Application).count() == 0
''')


def test_ars_invoice_is_fixed(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + '''
invoice.currency=models.CurrencyType.ARS
invoice.total_amount=1000000
invoice.exchange_rate=1000
db.commit()
receipt = create_document(DocumentCreate(doc_type='RECEIPT', number='0001-00000001', entity_id='client',
    currency='ARS', exchange_rate=1100, total_amount=1000000,
    applications=[dict(to_document_id='invoice', amount_applied=1000000, exchange_rate=1100)]), db, user)
check(receipt, 0); check(invoice, 0)
assert db.query(models.FxAdjustmentLink).count() == 0
''')


@pytest.mark.parametrize('amount,cash', [(1000,100), (1100,1210000)])
def test_rejects_overapplication(isolated_backend, tmp_path, amount, cash):
    run_python(isolated_backend, tmp_path, SETUP + f'''
try:
    create_document(DocumentCreate(doc_type='RECEIPT', number='0001-00000001', entity_id='client',
        currency='ARS', exchange_rate=1100, total_amount={cash},
        applications=[dict(to_document_id='invoice', amount_applied={amount}, exchange_rate=1100)]), db, user)
    raise AssertionError('Overapplication accepted')
except HTTPException as exc:
    assert exc.status_code == 400
assert db.query(models.Document).count() == 1
assert db.query(models.Application).count() == 0
''')


def test_successive_partial_collections_with_opposite_rates(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + '''
for index, (amount, rate) in enumerate([(400,1100), (600,900)], start=1):
    receipt = create_document(DocumentCreate(doc_type='RECEIPT', number=f'0001-{index:08d}', entity_id='client',
        currency='ARS', exchange_rate=rate, total_amount=amount*rate,
        applications=[dict(to_document_id='invoice', amount_applied=amount, exchange_rate=rate)]), db, user)
    check(receipt, 0)
check(invoice, 0)
links = db.query(models.FxAdjustmentLink).all()
assert len(links) == 2
notes = {link.generated_document.doc_type.value:link.generated_document for link in links}
assert notes['DEBIT_NOTE'].total_amount == 40000
assert notes['CREDIT_NOTE'].total_amount == 60000
for note in notes.values():
    check(note, 0)
''')
