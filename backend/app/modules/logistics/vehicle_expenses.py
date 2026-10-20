"""Read vehicle costs from their source receipts, never from service jobs."""
from datetime import timedelta, time
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy.orm import joinedload
from app.db.models.models import (
    Document, DocumentType, DocumentStatus, DocumentVehicleExpense,
    ExpenseItem, ExpenseItemVehicle, ExpenseClaim, ExpenseClaimStatus,
)

PURCHASE_TYPES = (DocumentType.PURCHASE_INVOICE, DocumentType.PURCHASE_DEBIT_NOTE,
                  DocumentType.PURCHASE_CREDIT_NOTE)


def money(value):
    return Decimal(str(value or 0)).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)


def period(query, column, start, end):
    if start:
        query = query.filter(column >= start)
    if end:
        # The date picker sends midnight: include the entire selected day.
        query = query.filter(column < end + timedelta(days=1)) if end.time() == time.min else query.filter(column <= end)
    return query


def vehicle_expenses(db, vehicle_id, start=None, end=None):
    """Return one ARS expense per source; explicit allocations override direct links."""
    tickets = db.query(ExpenseItem).join(ExpenseClaim).join(ExpenseItemVehicle).filter(
        ExpenseItemVehicle.vehicle_id == vehicle_id,
        ExpenseItem.generated_doc_id.is_(None),
        ExpenseClaim.status != ExpenseClaimStatus.REJECTED,
    ).options(joinedload(ExpenseItem.vehicles))
    results = []
    for item in period(tickets, ExpenseItem.date, start, end).all():
        vehicles = sorted({link.vehicle_id for link in item.vehicles})
        # Existing renditions may reference several vehicles. Preserve their split,
        # allocating rounding cents once, with no distribution to service jobs.
        from app.db.models.employee_fund_models import ClaimFunding
        meta = db.get(ClaimFunding,item.claim_id)
        rate = Decimal(meta.exchange_rate) if meta and meta.currency == 'USD' else Decimal(1)
        cents = int(money(Decimal(str(item.amount)) * rate) * 100)
        share, remainder = divmod(cents, len(vehicles))
        amount = Decimal(share + (vehicles.index(vehicle_id) < remainder)) / 100
        results.append(dict(date=item.date, description=item.description, amount=float(amount),
            category=item.category, type='Ticket', source_id=item.id,
            number=item.invoice_number, claim_id=item.claim_id, currency='ARS'))
    docs = db.query(Document).outerjoin(DocumentVehicleExpense).filter(
        (Document.vehicle_id == vehicle_id) | (DocumentVehicleExpense.vehicle_id == vehicle_id),
        Document.doc_type.in_(PURCHASE_TYPES), Document.status != DocumentStatus.CANCELLED,
    ).options(joinedload(Document.vehicle_expenses))
    for doc in period(docs, Document.date, start, end).all():
        if doc.vehicle_expenses:
            links = [link for link in doc.vehicle_expenses if link.vehicle_id == vehicle_id]
            if not links:
                continue
            amount = sum((money(link.amount) for link in links), Decimal('0'))
            category = next((link.notes for link in links if link.notes), 'Compra')
        else:
            amount = money(doc.total_amount_ars)
            category = 'Compra'
        if doc.doc_type == DocumentType.PURCHASE_CREDIT_NOTE:
            amount = -abs(amount)
        results.append(dict(date=doc.date, description=f'{doc.doc_type.value} {doc.number}',
            amount=float(amount), category=category, type='Factura', source_id=doc.id,
            number=doc.number, currency='ARS'))
    return sorted(results, key=lambda row: row['date'], reverse=True)


def validate_vehicle_allocations(db, entries, total_ars):
    """Validate source allocations in ARS before persisting a purchase document."""
    from fastapi import HTTPException
    from app.db.models.models import Vehicle
    cleaned = []
    seen = set()
    total = money(total_ars)
    for entry in entries:
        item = entry.model_dump() if hasattr(entry, 'model_dump') else dict(entry)
        vehicle_id = item['vehicle_id']
        if vehicle_id in seen or not db.get(Vehicle, vehicle_id):
            raise HTTPException(400, 'El vehículo/equipo no existe o está repetido.')
        seen.add(vehicle_id)
        amount = Decimal(str(item.get('amount', 0)))
        percentage = Decimal(str(item.get('percentage', 0)))
        if (not amount.is_finite() or amount < 0 or not percentage.is_finite()
                or percentage < 0 or percentage > 100):
            raise HTTPException(400, 'Importe o porcentaje de gasto de flota inválido.')
        # Full-document links follow the saved amount and exchange rate.
        item['amount'] = float(total if percentage == 100 else money(amount))
        cleaned.append(item)
    if sum((money(item['amount']) for item in cleaned), Decimal('0')) > total:
        raise HTTPException(400, 'Los gastos de flota superan el total del comprobante en pesos.')
    return cleaned
