import os
import sys
from datetime import datetime

# Setup paths and environment
sys.path.insert(0, os.path.abspath('backend'))
os.environ['DATABASE_URL'] = 'sqlite:///backend/sql_app_v2.db'

from app.db.session import SessionLocal
from app.db.models.models import Document, Application, DocumentType, CurrencyType, DocumentStatus
from app.modules.accounting.document_status_service import get_document_usage, get_document_balance_info

db = SessionLocal()

# 1. Create a dummy USD Invoice (Debt)
invoice = Document(
    id='dummy_invoice_usd',
    entity_id='dummy_entity',
    doc_type=DocumentType.INVOICE,
    number='0001-00000001',
    currency=CurrencyType.USD,
    exchange_rate=1459.0,
    total_amount=242.0,
    total_amount_ars=242.0 * 1459.0,
    status=DocumentStatus.OPEN,
    date=datetime.utcnow()
)

# 2. Create a dummy ARS Receipt (Credit)
receipt = Document(
    id='dummy_receipt_ars',
    entity_id='dummy_entity',
    doc_type=DocumentType.RECEIPT,
    number='0001-00000002',
    currency=CurrencyType.ARS,
    exchange_rate=1.0,
    total_amount=357434.0,
    total_amount_ars=357434.0,
    status=DocumentStatus.OPEN,
    date=datetime.utcnow()
)

db.add(invoice)
db.add(receipt)
db.commit()

# 3. Create cross-currency application
app = Application(
    id='dummy_app',
    from_document_id=receipt.id,
    to_document_id=invoice.id,
    amount_applied=242.0,
    amount_applied_ars=357434.0,
    exchange_rate=1477.0,
    created_at=datetime.utcnow()
)
db.add(app)
db.commit()

# 4. Check balances
invoice_bal = get_document_balance_info(invoice, db)
receipt_bal = get_document_balance_info(receipt, db)

print(f'Factura USD - Total: {invoice_bal["total"]}, Applied: {invoice_bal["applied"]}, Balance: {invoice_bal["balance"]}')
print(f'Recibo ARS - Total: {receipt_bal["total"]}, Applied: {receipt_bal["applied"]}, Balance: {receipt_bal["balance"]}')

# Cleanup
db.delete(app)
db.delete(invoice)
db.delete(receipt)
db.commit()
db.close()
