"""Sales invoice before dispatch, using isolated SQLite and actual route functions."""
from test_bootstrap import isolated_backend, run_python

SETUP = '''
from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.db.base import Base
from app.db import models
from app.db.models.commercial_models import *
from app.modules.accounting.document_router import create_document, _sanitize_document_for_response
from app.modules.accounting.document_schemas import DocumentCreate
from app.modules.sales.delivery_note_router import create_delivery_note_from_ov, confirm_delivery_note
from app.modules.sales.delivery_note_schemas import CreateDeliveryNoteFromOV
from app.modules.sales.sales_utils import reconcile_sales_order_invoice_delivery_links, recalc_sales_order_traceability_strict
from app.modules.sales.delivery_allocation import invoice_delivery_progress
engine=create_engine('sqlite:///:memory:')
Base.metadata.create_all(engine)
db=Session(engine)
user=SimpleNamespace(id=None, username='test', roles=['admin'], email='test@example.invalid')
db.add(models.Entity(id='client', name='Cliente prueba'))
db.add(Product(id='p', name='Producto prueba', unit_of_measure='LT', quantity_per_container=20))
db.add(Warehouse(id='w', name='Deposito'))
db.add(SalesOrder(id='o', entity_id='client', number='OV-1', warehouse_id='w', status=OrderStatus.CONFIRMED))
db.flush()
db.add(SalesOrderLine(id='ol', order_id='o', product_id='p', description='Producto prueba', qty=100,
    unit_price=10, net_amount=1000, vat_amount=210, total_amount=1210))
db.add(StockItem(id='stock', product_id='p', warehouse_id='w', qty_on_hand=200))
db.commit()
def invoice(qty=100, number='0001-00000001', use_order=True):
    return create_document(DocumentCreate(doc_type='INVOICE', number=number, date=datetime.now(),
        entity_id='client', warehouse_id='w', currency='ARS', exchange_rate=1, total_amount=qty*12.1,
        lines=[dict(product_id='p', description='Producto prueba', qty=qty, unit_price=10,
            net_amount=qty*10, vat_amount=qty*2.1, total_amount=qty*12.1,
            source_sales_line_id='ol' if use_order else None)]), db, user)
def deliver(qty, number, confirmed=True):
    return create_delivery_note_from_ov('o', CreateDeliveryNoteFromOV(warehouse_id='w', number=number,
        confirm_now=confirmed, lines=[dict(source_sales_line_id='ol', qty=qty)]), db, user)
def balance():
    return db.get(StockItem, 'stock').qty_on_hand
'''


def test_invoice_then_two_partial_deliveries(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + '''
f=invoice()
assert balance() == 200
assert db.query(StockMovement).count() == 0
assert db.get(SalesOrder,'o').status == OrderStatus.INVOICED
assert invoice_delivery_progress(db, f)[0] == 'PENDING'
a=deliver(40, '0001-00000001')
assert balance() == 160
assert a.lines[0].qty_invoiced == 40
status, quantities=invoice_delivery_progress(db,f)
assert status == 'PARTIAL'
assert quantities[0]['pending_qty'] == 60, quantities
# Repeated reconciliation must not attribute the whole invoice to the first note.
reconcile_sales_order_invoice_delivery_links(db,'o')
assert a.lines[0].qty_invoiced == 40
b=deliver(60, '0001-00000002')
assert balance() == 100
for _ in range(2):
    reconcile_sales_order_invoice_delivery_links(db,'o')
assert a.lines[0].qty_invoiced == 40 and b.lines[0].qty_invoiced == 60
assert db.query(StockMovement).count() == 2
assert invoice_delivery_progress(db,f)[0] == 'DELIVERED'
assert f.lines[0].source_dn_line_id is None
assert db.get(SalesOrder,'o').status == OrderStatus.COMPLETED
''')


def test_draft_delivery_is_not_stock_or_delivery(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + '''
f=invoice()
note=deliver(25, '0001-00000001', False)
assert note.status == DeliveryNoteStatus.DRAFT
assert note.lines[0].qty_invoiced == 0
from app.modules.sales.sales_order_router import get_sales_order
get_sales_order('o', db)
assert db.get(SalesOrderLine,'ol').qty_delivered == 0
assert balance() == 200
assert invoice_delivery_progress(db,f)[0] == 'PENDING'
confirm_delivery_note(note.id,db,user)
assert balance() == 175
assert note.lines[0].qty_invoiced == 25
try:
    confirm_delivery_note(note.id,db,user)
    raise AssertionError('Confirmed twice')
except HTTPException as exc:
    assert exc.status_code == 409
assert balance() == 175
assert invoice_delivery_progress(db,f)[1][0]['pending_qty'] == 75
''')


def test_direct_product_invoice_requires_order(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + '''
try:
    invoice(use_order=False)
    raise AssertionError('Product invoice accepted without order')
except HTTPException as exc:
    assert exc.status_code == 400
    assert 'OV' in exc.detail
assert balance() == 200
assert db.query(models.Document).count() == 0
''')


def test_two_invoices_do_not_reuse_delivery_quantities(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + '''
a=invoice(40)
b=invoice(60,'0001-00000002')
note=deliver(50,'0001-00000001')
assert invoice_delivery_progress(db,a)[0] == 'DELIVERED'
assert invoice_delivery_progress(db,b)[1][0]['pending_qty'] == 50
assert note.lines[0].qty_invoiced == 50
assert balance() == 150
''')


def test_fractional_delivery_and_return_reopen_pending(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + '''
f=invoice()
note=deliver(12.5,'0001-00000001')
assert balance() == Decimal('187.5')
assert invoice_delivery_progress(db,f)[1][0]['pending_qty'] == 87.5
returned=DeliveryNote(entity_id='client', warehouse_id='w', number='RETURN-1',
    sales_order_id='o', delivery_type=DeliveryNoteType.RETURN, note_type=OrderType.SALE,
    return_source_id=note.id, status=DeliveryNoteStatus.DRAFT)
db.add(returned); db.flush()
db.add(DeliveryNoteLine(delivery_note_id=returned.id, source_sales_line_id='ol', product_id='p',
    qty=2.5, description='Devolucion', net_amount=25, vat_amount=5.25, total_amount=30.25))
db.commit()
from app.modules.sales.delivery_note_router import confirm_return_delivery_note
confirm_return_delivery_note(returned.id, db)
assert balance() == 190
assert invoice_delivery_progress(db,f)[1][0]['pending_qty'] == 90
recalc_sales_order_traceability_strict(db,db.get(SalesOrder,'o'))
assert db.get(SalesOrderLine,'ol').qty_delivered == 10
''')


def test_invoice_after_dispatch_does_not_duplicate_stock(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + '''
note=deliver(100,'0001-00000001')
assert balance() == 100
f=invoice()
assert balance() == 100
assert db.query(StockMovement).count() == 1
assert invoice_delivery_progress(db,f)[0] == 'DELIVERED'
''')


def test_service_invoice_without_order(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + '''
db.get(Product,'p').is_service=True
db.commit()
f=invoice(use_order=False)
assert f.id
assert balance() == 200
assert db.query(StockMovement).count() == 0
assert invoice_delivery_progress(db,f)[0] == 'NOT_REQUIRED'
''')


def test_wrong_order_and_edit_cannot_bypass_rule(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + '''
from app.modules.sales.invoice_origin import validate_invoice_origins
for changes in [dict(source_sales_line_id=None), dict(source_sales_line_id='missing')]:
    try:
        validate_invoice_origins(db, models.DocumentType.INVOICE, 'client',
            [SimpleNamespace(product_id='p', **changes)])
        raise AssertionError('Invalid order accepted')
    except HTTPException as exc:
        assert exc.status_code == 400
try:
    validate_invoice_origins(db, models.DocumentType.INVOICE, 'other-client',
        [SimpleNamespace(product_id='p',source_sales_line_id='ol')])
    raise AssertionError('Other client order accepted')
except HTTPException as exc:
    assert exc.status_code == 400
f=invoice()
from app.modules.accounting.document_router import update_document, adjust_link, LinkAdjustmentRequest
from app.modules.accounting.document_schemas import DocumentUpdate
try:
    update_document(f.id, DocumentUpdate(lines=[dict(product_id='p',qty=100,unit_price=10)]),db,user)
    raise AssertionError('Order removed through edit')
except HTTPException as exc:
    assert exc.status_code == 400
try:
    adjust_link(LinkAdjustmentRequest(line_id=f.lines[0].id,source_sales_line_id='ol',new_qty=0),db)
    raise AssertionError('Order removed through unlink')
except HTTPException as exc:
    assert exc.status_code == 400
assert db.get(models.DocumentLine,f.lines[0].id).source_sales_line_id == 'ol'
''')


def test_confirmed_order_delivery_is_valid_origin(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, SETUP + '''
from app.modules.sales.invoice_origin import validate_invoice_origins
note=deliver(25,'0001-00000001')
validate_invoice_origins(db,models.DocumentType.INVOICE,'client',
    [SimpleNamespace(product_id='p',source_dn_line_id=note.lines[0].id)])
note.status=DeliveryNoteStatus.CANCELLED
db.flush()
try:
    validate_invoice_origins(db,models.DocumentType.INVOICE,'client',
        [SimpleNamespace(product_id='p',source_dn_line_id=note.lines[0].id)])
    raise AssertionError('Cancelled delivery accepted')
except HTTPException as exc:
    assert exc.status_code == 400
''')
