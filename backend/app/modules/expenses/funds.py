"""Atomic employee subledger, source documents and balanced accounting."""
import hashlib
from decimal import Decimal, ROUND_HALF_UP
from fastapi import HTTPException
from app.db.models import models as m
from app.db.models.commercial_models import Account
from app.db.models.auth_models import CashPosition, CashMovement, AuditLog
from app.db.models.employee_fund_models import EmployeeFundOperation, ClaimFunding
from app.modules.accounting.ledger_engine import create_journal_entry_for_document, get_ledger_setting


def money(value):
    return Decimal(str(value or 0)).quantize(Decimal('.01'),rounding=ROUND_HALF_UP)


def account(db, code):
    row=db.query(Account).filter_by(code=code,active=True).first()
    if not row: raise HTTPException(400,f'Configure una cuenta contable activa: {code}')
    return row


def employee_account(db,currency):
    return account(db,get_ledger_setting(db,'EMPLOYEE_FUNDS_'+currency,'1.1.4.001' if currency=='ARS' else '1.1.4.002')).code


def lock_employee(db,entity_id):
    employee=db.get(m.Entity,entity_id)
    if not employee or employee.type != m.EntityType.EMPLOYEE:
        raise HTTPException(400,'Debe seleccionar una entidad de tipo empleado.')
    db.query(m.Entity).filter_by(id=entity_id).update({m.Entity.name:m.Entity.name},synchronize_session=False)
    return employee


def balances(db,entity_id):
    quantities={'ARS':Decimal(0),'USD':Decimal(0)}
    bases={'ARS':Decimal(0),'USD':Decimal(0)}
    for row in db.query(EmployeeFundOperation).filter_by(entity_id=entity_id):
        quantities[row.currency]+=row.amount; bases[row.currency]+=row.base_amount
        if row.other_currency:
            quantities[row.other_currency]+=row.other_amount; bases[row.other_currency]+=row.other_base_amount
    return quantities,bases


def carrying_delta(db,entity_id,currency,delta,rate):
    spot=money(delta*(rate if currency=='USD' else 1))
    amounts,bases=balances(db,entity_id)
    balance=amounts[currency]
    if currency=='USD' and balance*delta<0:
        closing=min(abs(balance),abs(delta))
        sign=1 if delta>0 else -1
        correction=money(sign*closing*(bases[currency]/balance-rate))
        return spot+correction
    return spot


def journal(db,date,description,center,postings,document_id=None):
    """Postings are signed debits in ARS. FX balancing is explicit and configured."""
    entry=m.JournalEntry(date=date,description=description,cost_center=center,document_id=document_id)
    total=Decimal(0)
    for code,amount,entity_id in postings:
        account(db,code); amount=money(amount)
        if not amount: continue
        entry.lines.append(m.JournalLine(account_code=code,entity_id=entity_id,
            debit=float(max(amount,0)),credit=float(max(-amount,0)),description=description))
        total+=amount
    if total:
        key='EMPLOYEE_FX_GAIN' if total>0 else 'EMPLOYEE_FX_LOSS'
        code=get_ledger_setting(db,key,'4.2.1.001' if total>0 else '5.2.1.001')
        account(db,code)
        entry.lines.append(m.JournalLine(account_code=code,debit=float(max(-total,0)),credit=float(max(total,0)),description='Diferencia de cambio de fondos del empleado'))
    entry.total_amount=sum(line.debit for line in entry.lines)
    if not entry.lines: raise HTTPException(400,'El movimiento no genera un importe contable válido.')
    db.add(entry); db.flush(); return entry


def record_movement(db,data,user):
    employee=lock_employee(db,data.entity_id)
    digest=hashlib.sha256(data.model_dump_json().encode()).hexdigest()
    existing=db.query(EmployeeFundOperation).filter_by(request_key=data.request_key).first()
    if existing:
        if existing.payload_hash!=digest: raise HTTPException(409,'La solicitud ya se usó con otros datos.')
        return existing
    rate=Decimal(data.exchange_rate) if data.currency=='USD' or data.kind=='FX' else Decimal(1)
    amount=money(data.amount)
    available,_=balances(db,employee.id)
    if data.kind=='RETURN' and available[data.currency]<amount:
        raise HTTPException(400,'La devolución supera el saldo disponible del empleado.')
    if data.kind=='REIMBURSE' and amount>max(-available[data.currency],0):
        raise HTTPException(400,'El reintegro supera la deuda con el empleado; registre el excedente como adelanto.')
    signed=-amount if data.kind in ('RETURN','FX') else amount
    base=carrying_delta(db,employee.id,data.currency,signed,rate)
    postings=[(employee_account(db,data.currency),base,employee.id)]
    other_currency=other_amount=other_base=None
    cash=None
    if data.kind=='FX':
        available,_=balances(db,employee.id)
        if available[data.currency]<amount: raise HTTPException(400,'Saldo insuficiente en la moneda de origen para convertir.')
        other_currency='ARS' if data.currency=='USD' else 'USD'
        other_amount=money(amount*rate if data.currency=='USD' else amount/rate)
        if other_amount<=0: raise HTTPException(400,'La conversión debe dar al menos un centavo.')
        other_base=carrying_delta(db,employee.id,other_currency,other_amount,rate)
        postings.append((employee_account(db,other_currency),other_base,employee.id))
    else:
        if not data.treasury_account: raise HTTPException(400,'Seleccione la cuenta de caja/banco.')
        treasury=account(db,data.treasury_account)
        if treasury.code in (get_ledger_setting(db,'EMPLOYEE_FUNDS_ARS','1.1.4.001'),get_ledger_setting(db,'EMPLOYEE_FUNDS_USD','1.1.4.002')):
            raise HTTPException(400,'La cuenta de caja/banco debe ser distinta a la del empleado.')
        spot=money(signed*(rate if data.currency=='USD' else 1))
        postings.append((treasury.code,-spot,None))
        if data.payment_method=='CASH':
            position=db.query(CashPosition).filter_by(date=data.date.date().isoformat(),status='OPEN').first()
            if not position: raise HTTPException(400,'Abra la caja de la fecha del movimiento.')
            cash=CashMovement(cash_position_id=position.id,currency=data.currency,amount=float(-signed),
                source='employee_funds',description=data.description,created_by=user.id)
            db.add(cash); db.flush()
    entry=journal(db,data.date,data.description,data.cost_center,postings)
    op=EmployeeFundOperation(request_key=data.request_key,payload_hash=digest,entity_id=employee.id,kind=data.kind,
        currency=data.currency,amount=signed,exchange_rate=rate,base_amount=base,other_currency=other_currency,
        other_amount=other_amount,other_base_amount=other_base,date=data.date,description=data.description,
        journal_id=entry.id,cash_movement_id=cash.id if cash else None,created_by=user.id)
    db.add(op); db.flush()
    audit(db,user,'MOVIMIENTO',op.id,data.description)
    return op


def audit(db,user,action,target,description):
    db.add(AuditLog(user_id=user.id,username=user.username,action=action,module='employee_expenses',target_id=target,description=description))


def approve_claim(db,claim,user):
    """Approve once, settling each provider from employee funds; never calls ARCA."""
    lock_employee(db,claim.entity_id)
    # Conditional transition serializes two reviewers without duplicate documents.
    updated=db.query(m.ExpenseClaim).filter_by(id=claim.id,status=m.ExpenseClaimStatus.SUBMITTED).update(
        {m.ExpenseClaim.status:m.ExpenseClaimStatus.APPROVED},synchronize_session=False)
    if not updated: raise HTTPException(409,'La rendición ya cambió de estado. Recargue la pantalla.')
    if claim.reimbursement_doc_id or any(i.generated_doc_id for i in claim.items):
        raise HTTPException(409,'La rendición ya tiene comprobantes generados y requiere revisión.')
    if not claim.items: raise HTTPException(400,'La rendición no tiene comprobantes.')
    meta=db.get(ClaimFunding,claim.id)
    currency=meta.currency if meta else 'ARS'; rate=Decimal(meta.exchange_rate) if meta else Decimal(1)
    if currency=='ARS': rate=Decimal(1)
    # Lock providers in stable order so two employees cannot approve the same receipt concurrently.
    for provider_id in sorted({item.provider_id for item in claim.items if item.provider_id}):
        db.query(m.Entity).filter_by(id=provider_id).update({m.Entity.name:m.Entity.name},synchronize_session=False)
    total=Decimal(0); postings=[]
    for item in claim.items:
        provider=db.get(m.Entity,item.provider_id) if item.provider_id else None
        if not provider or provider.type not in (m.EntityType.PROVIDER,m.EntityType.MIXED):
            raise HTTPException(400,'Seleccione un proveedor registrado para cada ticket/factura.')
        expense_account=account(db,item.account_code or '')
        amount=money(item.amount); net=money(item.net_amount); vat=money(item.vat_amount)
        if amount<=0 or net<0 or vat<0 or net+vat!=amount:
            raise HTTPException(400,'Revise neto, IVA y total. Las percepciones/impuestos adicionales requieren su imputación contable antes de aprobar.')
        if any(money(getattr(item,key,0)) for key in ('iibb_perception','iva_perception','ganancias_perception','municipal_tax','other_taxes')):
            raise HTTPException(400,'Esta rendición requiere imputar las cuentas de impuestos adicionales antes de aprobar.')
        number=(item.invoice_number or '').strip()
        if not number or number=='0000-00000000': raise HTTPException(400,'Ingrese el número real de cada ticket/factura.')
        if db.query(m.Document).filter_by(entity_id=provider.id,doc_type=m.DocumentType.PURCHASE_INVOICE,number=number,line=item.line).filter(m.Document.status!=m.DocumentStatus.CANCELLED).first():
            raise HTTPException(409,f'El comprobante {number} ya está registrado para ese proveedor.')
        doc=m.Document(entity_id=provider.id,doc_type=m.DocumentType.PURCHASE_INVOICE,number=number,line=item.line,
            date=item.date,currency=currency,exchange_rate=float(rate),total_amount=float(amount),total_amount_ars=float(money(amount*rate)),
            cost_center=claim.cost_center,status=m.DocumentStatus.CLOSED,notes=f'Rendición {claim.id}',attachment_url=item.attachment_url)
        doc.lines=[m.DocumentLine(description=item.description,qty=1,unit_price=float(net),net_amount=float(net),
            vat_rate=item.vat_rate,vat_amount=float(vat),total_amount=float(amount),accounting_account_id=expense_account.id)]
        db.add(doc); db.flush()
        create_journal_entry_for_document(db,doc)
        pay=m.Document(entity_id=provider.id,doc_type=m.DocumentType.PAYMENT,number='RND-'+doc.id[:12],date=item.date,
            currency=currency,exchange_rate=float(rate),total_amount=float(amount),total_amount_ars=float(money(amount*rate)),
            cost_center=claim.cost_center,status=m.DocumentStatus.CLOSED,notes=f'Pagado con fondos del empleado. Rendición {claim.id}')
        db.add(pay); db.flush()
        provider_code=provider.account_code or get_ledger_setting(db,'PROVIDERS','2.1.1.001')
        # Each payment clears the provider against a dedicated employee clearing account.
        clearing=get_ledger_setting(db,'EMPLOYEE_CLEARING','2.1.4.099')
        journal(db,item.date,pay.notes,claim.cost_center,[(provider_code,amount*rate,provider.id),(clearing,-amount*rate,claim.entity_id)],pay.id)
        postings.append((clearing,amount*rate,claim.entity_id))
        db.add(m.Application(from_document_id=pay.id,to_document_id=doc.id,cost_center=claim.cost_center,
            amount_applied=float(amount),amount_applied_ars=float(money(amount*rate)),exchange_rate=float(rate)))
        vehicles=sorted({link.vehicle_id for link in item.vehicles})
        cents=int(money(amount*rate)*100)
        for index,vehicle in enumerate(vehicles):
            db.add(m.DocumentVehicleExpense(document_id=doc.id,vehicle_id=vehicle,
                amount=(cents//len(vehicles)+(index<cents%len(vehicles)))/100,percentage=100/len(vehicles),notes=item.category))
        item.generated_doc_id=doc.id; total+=amount
    delta=-total; base=carrying_delta(db,claim.entity_id,currency,delta,rate)
    postings.append((employee_account(db,currency),base,claim.entity_id))
    entry=journal(db,claim.date,f'Rendición aprobada: {claim.title}',claim.cost_center,postings)
    db.add(EmployeeFundOperation(request_key='claim:'+claim.id,payload_hash=claim.id,entity_id=claim.entity_id,kind='CLAIM',
        currency=currency,amount=delta,base_amount=base,exchange_rate=rate,date=claim.date,description=claim.title,
        claim_id=claim.id,journal_id=entry.id,created_by=user.id))
    claim.status=m.ExpenseClaimStatus.APPROVED
    audit(db,user,'APROBACION',claim.id,claim.title)
