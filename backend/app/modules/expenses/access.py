from fastapi import HTTPException
from app.db.models.employee_fund_models import EmployeeAccess
from app.modules.auth.auth_router import get_effective_permissions


def allowed(db, user, module, action='view'):
    return bool(set(user.roles or []) & {'admin','owner'}) or get_effective_permissions(user,db).get(module,{}).get(action) is True


def require(db, user, module, action='view'):
    if not allowed(db,user,module,action):
        raise HTTPException(403, f'No tiene permiso: {module}.{action}')


def scope(db,user,entity_id):
    require(db,user,'employee_expenses')
    if allowed(db,user,'employee_expenses_all'):
        return
    access=db.get(EmployeeAccess,user.id)
    if not access or access.entity_id != entity_id:
        raise HTTPException(403,'Solo puede acceder a sus propios movimientos de empleado.')


def own_entity(db,user):
    access=db.get(EmployeeAccess,user.id)
    return access.entity_id if access else None
