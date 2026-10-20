from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models.models import Entity, Vehicle
from app.db.models.commercial_models import Product, Account
from app.db.models.field_models import Farm, Machinery
from app.db.models.service_models import ServiceWork, ServiceWorkCost
from app.modules.auth.auth_router import check_permission, get_current_user
from .schemas import WorkInput, CostInput, InvoiceInput
from .service import active_record, validate_work, describe_work, lock_work, used_quantity, invoice_work
from .account_plan import PLAN, add_missing_accounts

router = APIRouter(prefix='/service-works', tags=['Servicios y trabajos'],
                   dependencies=[Depends(check_permission('service_works', 'view'))])


@router.get('/catalogs')
def catalogs(db: Session = Depends(get_db)):
    """Existing masters used by service work; no fictitious records."""
    def rows(model, active=False):
        query = db.query(model)
        if active:
            query = query.filter(model.active == True)
        return [dict(id=r.id,name=r.name,**({'type':r.type} if model is Entity else {}),
            **({'code':r.code} if model is Account else {})) for r in query.all()]
    return dict(entities=rows(Entity),farms=rows(Farm,True),machinery=rows(Machinery,True),
        vehicles=rows(Vehicle,True),accounts=rows(Account,True),
        products=[dict(id=p.id,name=p.name) for p in db.query(Product).filter_by(is_service=True,active=True)])


@router.get('/account-plan')
def account_plan(db: Session = Depends(get_db)):
    existing = {a.code:a for a in db.query(Account)}
    return [dict(code=code,name=name,existing_name=existing[code].name if code in existing else None,
                 exists=code in existing) for code,name in PLAN]


@router.post('/account-plan', dependencies=[Depends(check_permission('ledger','create'))])
def install_plan(db: Session = Depends(get_db)):
    """Explicitly add missing proposal accounts; retain all existing configuration."""
    try:
        created = add_missing_accounts(db)
        db.commit()
        return {'created':created}
    except Exception:
        db.rollback()
        raise


@router.get('')
def list_works(entity_id: str | None = None, cost_center: int | None = None,
               db: Session = Depends(get_db)):
    query = db.query(ServiceWork)
    if entity_id:
        query = query.filter_by(entity_id=entity_id)
    if cost_center:
        query = query.filter_by(cost_center=cost_center)
    return [describe_work(db,w) for w in query.order_by(ServiceWork.date.desc(),ServiceWork.id).all()]


@router.post('', dependencies=[Depends(check_permission('service_works','create'))])
def create_work(data: WorkInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    validate_work(db,data)
    work = ServiceWork(**data.model_dump(),created_by=getattr(user,'username','Sistema'))
    db.add(work)
    db.commit()
    return describe_work(db,work)


@router.put('/{work_id}', dependencies=[Depends(check_permission('service_works','edit'))])
def update_work(work_id: str, data: WorkInput, db: Session = Depends(get_db)):
    work = db.get(ServiceWork,work_id)
    if not work:
        raise HTTPException(404,'Trabajo no encontrado')
    try:
        lock_work(db,work)
        if used_quantity(db,work.id)>0:
            raise HTTPException(409,'El trabajo está facturado. Corrija o anule primero sus comprobantes vinculados')
        validate_work(db,data)
        for key,value in data.model_dump().items():
            setattr(work,key,value)
        db.commit()
        return describe_work(db,work)
    except Exception:
        db.rollback()
        raise


def validate_cost(db, work, data):
    if work.status == 'CANCELLED':
        raise HTTPException(409,'No se pueden modificar costos de un trabajo anulado')
    active_record(db,Account,data.account_id,'Cuenta de costo')
    if data.employee_id:
        employee = active_record(db,Entity,data.employee_id,'Empleado')
        if getattr(employee.type,'value',employee.type) != 'employee':
            raise HTTPException(400,'Seleccione una entidad de tipo empleado')


@router.post('/{work_id}/costs', dependencies=[Depends(check_permission('service_works','edit'))])
def add_cost(work_id: str, data: CostInput, db: Session = Depends(get_db)):
    work = db.get(ServiceWork,work_id)
    if not work:
        raise HTTPException(404,'Trabajo no encontrado')
    validate_cost(db,work,data)
    db.add(ServiceWorkCost(work_id=work.id,**data.model_dump()))
    db.commit()
    db.expire(work,['costs'])
    return describe_work(db,work)


@router.put('/{work_id}/costs/{cost_id}', dependencies=[Depends(check_permission('service_works','edit'))])
def update_cost(work_id: str, cost_id: str, data: CostInput, db: Session = Depends(get_db)):
    cost = db.query(ServiceWorkCost).filter_by(id=cost_id,work_id=work_id).first()
    if not cost:
        raise HTTPException(404,'Costo no encontrado')
    validate_cost(db,cost.work,data)
    for key,value in data.model_dump().items():
        setattr(cost,key,value)
    db.commit()
    return describe_work(db,cost.work)


@router.delete('/{work_id}/costs/{cost_id}', dependencies=[Depends(check_permission('service_works','edit'))])
def delete_cost(work_id: str, cost_id: str, db: Session = Depends(get_db)):
    cost = db.query(ServiceWorkCost).filter_by(id=cost_id,work_id=work_id).first()
    if not cost:
        raise HTTPException(404,'Costo no encontrado')
    work = cost.work
    if work.status=='CANCELLED':
        raise HTTPException(409,'El trabajo está anulado')
    db.delete(cost)
    db.commit()
    db.expire(work,['costs'])
    return describe_work(db,work)


@router.post('/invoice', dependencies=[Depends(check_permission('sales_invoices','create'))])
def create_invoice(data: InvoiceInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Create a draft invoice with live allocation of partial service quantities."""
    doc = invoice_work(db,data,user)
    return dict(id=doc.id,number=doc.number,is_draft=doc.is_draft,total_amount=doc.total_amount,currency=doc.currency)
