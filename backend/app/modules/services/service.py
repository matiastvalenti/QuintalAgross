from decimal import Decimal, ROUND_HALF_UP
from hashlib import sha256
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import func, update
from sqlalchemy.exc import IntegrityError, OperationalError
from app.db.models.models import Document, DocumentLine, DocumentType, DocumentStatus, Entity, Vehicle, DocumentHistory
from app.db.models.commercial_models import Product, Account
from app.db.models.field_models import Farm, Machinery
from app.db.models.service_models import ServiceWork, ServiceWorkCost, ServiceWorkBilling, ServiceInvoiceRequest
from app.modules.accounting.document_guards import require_accounting
from .account_plan import income_code


def dec(value):
    return Decimal(str(value or 0))


def money(value):
    return dec(value).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)


def billing_lines(db, work_id):
    return db.query(ServiceWorkBilling, DocumentLine, Document).join(
        DocumentLine, ServiceWorkBilling.document_line_id == DocumentLine.id).join(
        Document, DocumentLine.document_id == Document.id).filter(
        ServiceWorkBilling.work_id == work_id, Document.status != DocumentStatus.CANCELLED).all()


def used_quantity(db, work_id):
    return sum((dec(link.quantity) for link, _, _ in billing_lines(db, work_id)), Decimal(0))


def active_record(db, model, key, label):
    row = db.get(model, key) if key else None
    if not row or getattr(row, 'active', True) is False:
        raise HTTPException(400, f'{label} inexistente o inactivo')
    return row


def validate_work(db, data):
    entity = active_record(db, Entity, data.entity_id, 'Cliente')
    if getattr(entity.type,'value',entity.type) not in ('client','mixed'):
        raise HTTPException(400, 'Seleccione una entidad de tipo cliente o mixta')
    active_record(db, Farm, data.farm_id, 'Establecimiento')
    product = active_record(db, Product, data.product_id, 'Servicio')
    if not product.is_service:
        raise HTTPException(400, 'El trabajo requiere un producto de tipo servicio, sin stock')
    if data.machinery_id:
        active_record(db, Machinery, data.machinery_id, 'Equipo')
    if data.vehicle_id:
        active_record(db, Vehicle, data.vehicle_id, 'Vehículo')


def lock_work(db, work):
    # CAS serializes billing/editing on SQLite as well as servers with row locks.
    changed = db.execute(update(ServiceWork).where(ServiceWork.id == work.id,
        ServiceWork.revision == work.revision).values(revision=work.revision + 1),
        execution_options={'synchronize_session': False}).rowcount
    if changed != 1:
        raise HTTPException(409, 'El trabajo cambió. Actualice la pantalla y vuelva a intentar')
    db.expire(work)


def describe_work(db, work):
    bills = billing_lines(db, work.id)
    invoiced = sum((dec(b.quantity) for b, _, _ in bills), Decimal(0))
    costs = sum((money(dec(c.quantity)*dec(c.unit_cost)*dec(c.exchange_rate)) for c in work.costs), Decimal(0))
    quote = money(dec(work.quantity)*dec(work.unit_price)*dec(work.exchange_rate))
    revenue = sum((money(dec(line.net_amount)*(dec(doc.exchange_rate) if doc.currency == 'USD' else 1))
                   for _, line, doc in bills), Decimal(0))
    result = {c.name: getattr(work, c.name) for c in ServiceWork.__table__.columns}
    result.update(entity_name=work.entity.name, farm_name=work.farm.name,
        product_name=work.product.name, machinery_name=work.machinery.name if work.machinery else None,
        vehicle_name=work.vehicle.name if work.vehicle else None,
        invoiced_quantity=invoiced, pending_quantity=max(Decimal(0), dec(work.quantity)-invoiced),
        costs_ars=costs, quoted_net_ars=quote, invoiced_net_ars=revenue,
        estimated_margin_ars=quote-costs, invoiced_less_costs_ars=revenue-costs,
        costs=[dict(**{col.name:getattr(c,col.name) for col in ServiceWorkCost.__table__.columns},
                    employee_name=c.employee.name if c.employee else None,
                    total_ars=money(dec(c.quantity)*dec(c.unit_cost)*dec(c.exchange_rate))) for c in work.costs],
        invoices=[dict(id=doc.id, number=doc.number, quantity=b.quantity, is_draft=doc.is_draft) for b, _, doc in bills])
    return result


def invoice_work(db, data, user):
    digest = sha256(data.model_dump_json().encode()).hexdigest()
    previous = db.get(ServiceInvoiceRequest, data.request_key)
    if previous:
        if previous.payload_hash != digest:
            raise HTTPException(409, 'Este intento ya fue usado con otros datos; actualice la pantalla')
        doc = db.get(Document, previous.document_id)
        if not doc or doc.status == DocumentStatus.CANCELLED:
            raise HTTPException(409, 'La factura de este intento fue eliminada o anulada; inicie uno nuevo')
        return doc
    if len({i.work_id for i in data.items}) != len(data.items):
        raise HTTPException(400, 'No repita un trabajo en la misma solicitud')
    works = []
    try:
        for item in sorted(data.items, key=lambda i:i.work_id):
            work = db.get(ServiceWork, item.work_id)
            if not work:
                raise HTTPException(404, 'Trabajo no encontrado')
            lock_work(db, work)
            if work.status == 'CANCELLED':
                raise HTTPException(400, 'No se puede facturar un trabajo anulado')
            if item.quantity > dec(work.quantity)-used_quantity(db, work.id):
                raise HTTPException(400, 'La cantidad supera lo pendiente del trabajo: '+work.description)
            works.append((work, item.quantity))
        first = works[0][0]
        if any((w.entity_id,w.currency,w.cost_center) != (first.entity_id,first.currency,first.cost_center) for w,_ in works):
            raise HTTPException(400, 'Agrupe trabajos del mismo cliente, moneda y centro de costos')
        if data.cost_center != first.cost_center:
            raise HTTPException(400, 'El centro de costos debe coincidir con los trabajos')
        if data.letter == 'C' and any(dec(w.vat_rate) != 0 for w,_ in works):
            raise HTTPException(400, 'Revise el IVA de los trabajos antes de generar una factura C')
        rate = data.exchange_rate if first.currency == 'USD' else Decimal(1)
        doc = Document(entity_id=first.entity_id, doc_type=DocumentType.INVOICE,
            number=('BOR-SERV-' if first.cost_center == 1 else 'SERV-INT-')+uuid4().hex[:12].upper(), date=data.date, line=data.letter,
            currency=first.currency, exchange_rate=float(rate), cost_center=first.cost_center,
            status=DocumentStatus.OPEN, created_by=getattr(user,'username','Sistema'),
            notes='Servicios: '+', '.join(w.description for w,_ in works))
        db.add(doc)
        db.flush()
        total = Decimal(0)
        for index,(work, qty) in enumerate(works):
            product = active_record(db, Product, work.product_id, 'Servicio')
            if not product.is_service:
                raise HTTPException(400, 'El producto dejó de ser un servicio')
            account = db.query(Account).filter_by(code=income_code(db,work.activity), active=True).first()
            if not account:
                raise HTTPException(400, 'Configure la cuenta de ingresos para la actividad '+work.activity)
            net = money(qty*dec(work.unit_price))
            vat = money(net*dec(work.vat_rate))
            line = DocumentLine(document_id=doc.id, product_id=work.product_id,
                description=f'{work.description} · {work.farm.name} · {qty} {work.unit}',
                qty=float(qty), unit_price=float(work.unit_price), net_amount=float(net),
                vat_rate=float(work.vat_rate), vat_amount=float(vat), total_amount=float(net+vat),
                accounting_account_id=account.id, line_order=index)
            db.add(line)
            db.flush()
            db.add(ServiceWorkBilling(work_id=work.id, document_line_id=line.id, quantity=qty))
            total += net+vat
        doc.total_amount = float(total)
        doc.total_amount_ars = float(money(total*rate))
        db.add(ServiceInvoiceRequest(key=data.request_key,payload_hash=digest,document_id=doc.id))
        db.add(DocumentHistory(document_id=doc.id,user=getattr(user,'username','Sistema'),
            action='CREACION',details='Borrador agrupado/parcial de trabajos de servicios'))
        require_accounting(db,doc)
        db.commit()
        db.refresh(doc)
        return doc
    except (IntegrityError, OperationalError) as exc:
        db.rollback()
        raise HTTPException(409, 'Otro proceso modificó estos datos; vuelva a consultar antes de reintentar') from exc
    except Exception:
        db.rollback()
        raise
