"""Journal postings in disposable databases, without application startup."""
import pytest
from test_bootstrap import isolated_backend, run_python

SETUP = '''
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.db.base import Base
from app.db.models.models import *
from app.db.models.commercial_models import Account
from app.modules.accounting.ledger_engine import create_journal_entry_for_document
engine = create_engine('sqlite:///:memory:')
Base.metadata.create_all(engine)
db = Session(engine)
from app.db.models.commercial_models import Account
for code in ['1.1.1.001','1.1.1.002','1.1.1.003','1.1.2.001','2.1.1.001','4.1.1.001','5.1.1.001','2.1.2.001','1.1.3.001']:
    db.add(Account(id=code, code=code, name='Cuenta de prueba '+code))
db.commit()

e = Entity(id='e', name='Prueba')
a = Account(id='a', code='4.9.001', name='Servicios')
db.add_all([e, a])
db.commit()
def document(kind='INVOICE', currency='ARS', rate=1200):
    doc = Document(entity_id='e', doc_type=kind, number='1', currency=currency,
                   exchange_rate=rate, total_amount=121)
    doc.lines = [DocumentLine(description='Servicio', qty=1, unit_price=100,
        net_amount=100, vat_rate=21, vat_amount=21, total_amount=121, accounting_account_id='a')]
    db.add(doc)
    db.commit()
    return doc
'''

@pytest.mark.parametrize('kind,reverse', [
    ('INVOICE', False), ('FCE_MIPYME', False), ('TIQUET_FACTURA', False),
    ('DEBIT_NOTE', False), ('CREDIT_NOTE', True),
    ('PURCHASE_INVOICE', True), ('PURCHASE_DEBIT_NOTE', True), ('PURCHASE_CREDIT_NOTE', False),
])
def test_accounts_and_posting_direction(isolated_backend, tmp_path, kind, reverse):
    run_python(isolated_backend, tmp_path, SETUP + f'''
doc = document({kind!r})
entry = create_journal_entry_for_document(db, doc)
db.commit()
assert entry.total_amount == 121
assert sum(l.debit for l in entry.lines) == sum(l.credit for l in entry.lines) == 121
line = next(l for l in entry.lines if l.account_code == '4.9.001')
assert (line.debit, line.credit) == {(100, 0) if reverse else (0, 100)!r}
create_journal_entry_for_document(db, doc)
db.commit()
assert db.query(JournalEntry).count() == 1
assert db.query(JournalLine).count() == 3
''')


def test_usd_and_failed_regeneration_preserves_previous(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + '''
doc = document(currency='USD', rate=1000)
entry = create_journal_entry_for_document(db, doc)
db.commit()
old_id = entry.id
assert entry.total_amount == 121000
for change in ('total', 'account', 'rate'):
    doc.total_amount = 122 if change == 'total' else 121
    doc.lines[0].accounting_account_id = 'missing' if change == 'account' else 'a'
    doc.exchange_rate = 0 if change == 'rate' else 1000
    try:
        create_journal_entry_for_document(db, doc)
        raise AssertionError('Invalid journal accepted')
    except ValueError:
        pass
    db.commit()
    assert db.query(JournalEntry).one().id == old_id
    assert db.query(JournalLine).count() == 3
    assert sum(l.debit for l in db.query(JournalLine)) == 121000
''')


def test_unbalanced_new_document_leaves_no_header(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + '''
doc = document()
doc.total_amount = 150
try:
    create_journal_entry_for_document(db, doc)
    raise AssertionError('Unbalanced journal accepted')
except ValueError:
    pass
db.commit()
assert db.query(JournalEntry).count() == 0
assert db.query(JournalLine).count() == 0
assert db.get(Document, doc.id) is not None
''')

@pytest.mark.parametrize('kind', ['RECEIPT', 'PAYMENT'])
def test_peso_payment_keeps_nominal_amount(isolated_backend, tmp_path, kind):
    run_python(isolated_backend, tmp_path, SETUP + f'''
doc = document(kind={kind!r}, rate=1200)
doc.payments = [PaymentItem(type='CASH', amount=121)]
db.commit()
entry = create_journal_entry_for_document(db, doc)
db.commit()
assert entry.total_amount == 121
assert sum(l.debit for l in entry.lines) == sum(l.credit for l in entry.lines) == 121
''')
