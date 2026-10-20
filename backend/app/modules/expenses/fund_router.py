from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, OperationalError
from app.db.session import get_db
from app.db.models.models import Entity, EntityType, ExpenseClaim, ExpenseClaimStatus, Vehicle
from app.db.models.auth_models import User
from app.db.models.commercial_models import Account
from app.db.models.employee_fund_models import EmployeeAccess, EmployeeFundOperation, ClaimFunding
from app.modules.auth.auth_router import get_current_user
from .access import scope, require, allowed, own_entity
from .fund_schemas import FundInput, AccessInput
from .funds import record_movement, balances, audit

router=APIRouter(prefix='/employee-funds',tags=['Fondos y rendiciones de empleados'])

@router.get('/catalogs')
def catalogs(db:Session=Depends(get_db),user=Depends(get_current_user)):
    """Only expose employees within the current user's configured scope."""
    require(db,user,'employee_expenses')
    employees=db.query(Entity).filter_by(type=EntityType.EMPLOYEE)
    if not allowed(db,user,'employee_expenses_all'):
        employees=employees.filter(Entity.id==own_entity(db,user))
    return dict(employees=[dict(id=e.id,name=e.name) for e in employees],
        providers=[dict(id=e.id,name=e.name) for e in db.query(Entity).filter(Entity.type.in_([EntityType.PROVIDER,EntityType.MIXED]))],
        accounts=[dict(id=a.id,code=a.code,name=a.name) for a in db.query(Account).filter_by(active=True)],
        vehicles=[dict(id=v.id,name=v.name) for v in db.query(Vehicle).filter_by(active=True)])

@router.get('/access')
def list_access(db:Session=Depends(get_db),user=Depends(get_current_user)):
    require(db,user,'users')
    links={row.user_id:row.entity_id for row in db.query(EmployeeAccess)}
    return [dict(id=u.id,name=u.full_name or u.username,entity_id=links.get(u.id),permissions=u.permissions or {}) for u in db.query(User)]

@router.put('/access/{user_id}')
def set_access(user_id:str,data:AccessInput,db:Session=Depends(get_db),user=Depends(get_current_user)):
    """Administrators explicitly map an authenticated user to an employee."""
    require(db,user,'users','edit')
    if not db.get(User,user_id): raise HTTPException(404,'Usuario inexistente')
    if data.entity_id:
        employee=db.get(Entity,data.entity_id)
        if not employee or employee.type!=EntityType.EMPLOYEE: raise HTTPException(400,'Empleado inválido')
    existing=db.get(EmployeeAccess,user_id)
    if not data.entity_id:
        if existing: db.delete(existing)
    elif existing: existing.entity_id=data.entity_id
    else: db.add(EmployeeAccess(user_id=user_id,entity_id=data.entity_id))
    audit(db,user,'VINCULO_USUARIO',user_id,str(data.entity_id))
    db.commit(); return {'ok':True}

@router.get('/{entity_id}')
def statement(entity_id:str,db:Session=Depends(get_db),user=Depends(get_current_user)):
    """Cumulative balances by currency; unapproved claims are shown separately."""
    scope(db,user,entity_id)
    amounts,bases=balances(db,entity_id)
    pending={'ARS':0.0,'USD':0.0}
    for claim in db.query(ExpenseClaim).filter_by(entity_id=entity_id,status=ExpenseClaimStatus.SUBMITTED):
        meta=db.get(ClaimFunding,claim.id); pending[meta.currency if meta else 'ARS']+=claim.total_amount
    rows=db.query(EmployeeFundOperation).filter_by(entity_id=entity_id).order_by(EmployeeFundOperation.date,EmployeeFundOperation.created_at,EmployeeFundOperation.id).all()
    return dict(balances={k:float(v) for k,v in amounts.items()},pending=pending,
        movements=[dict(id=r.id,kind=r.kind,date=r.date,currency=r.currency,amount=float(r.amount),
            exchange_rate=float(r.exchange_rate),other_currency=r.other_currency,
            other_amount=float(r.other_amount) if r.other_amount is not None else None,
            description=r.description,journal_id=r.journal_id,claim_id=r.claim_id) for r in rows])

@router.post('/movements')
def create_movement(data:FundInput,db:Session=Depends(get_db),user=Depends(get_current_user)):
    """Atomic funds movement with balanced accounting and retry protection."""
    scope(db,user,data.entity_id); require(db,user,'employee_funds','create')
    try:
        row=record_movement(db,data,user); db.commit()
        return {'id':row.id}
    except (IntegrityError,OperationalError):
        db.rollback(); raise HTTPException(409,'Hubo otro movimiento simultáneo. Reintente la misma solicitud.')
    except Exception:
        db.rollback(); raise
