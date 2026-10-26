# Triggering reload for db migrations (v2)
from fastapi import APIRouter, Depends, HTTPException, status, Body
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional, Dict
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
import os
import uuid
from app.modules.auth.security_policy import ensure_role_assignment_allowed, verify_setup_token, ensure_initial_password

from app.db.session import get_db
from app.db.models.auth_models import User, Role, AuditLog

def _load_env():
    import pathlib
    base_dir = pathlib.Path(__file__).parent.parent.parent.parent
    env_path = base_dir / ".env"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    val = val.strip().split("#")[0].strip()
                    os.environ.setdefault(key.strip(), val)
_load_env()

SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is required")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 24 hours

pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

router = APIRouter(prefix="/auth", tags=["Auth"])

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict
    refresh_token: Optional[str] = None

class RefreshRequest(BaseModel):
    refresh_token: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class UserCreate(BaseModel):
    email: str
    username: Optional[str] = None
    password: str
    full_name: Optional[str] = None
    roles: List[str] = ["viewer"]

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# -------------------------------------------------------------------
# Refresh token utilities
# -------------------------------------------------------------------
REFRESH_TOKEN_EXPIRE_DAYS = 30

def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        identity: str = payload.get("sub")
        if identity is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    # Buscar por username primero, luego por email
    user = db.query(User).filter(User.username == identity).first()
    if not user:
        user = db.query(User).filter(User.email == identity).first()
        
    if user is None or not user.active:
        raise credentials_exception
    return user

def log_action(
    user: User, 
    action: str, 
    module: str, 
    description: str, 
    db: Session,
    target_id: Optional[str] = None,
    data: Optional[dict] = None
):
    """Registra una acción en el log de auditoría"""
    log_entry = AuditLog(
        user_id=user.id,
        username=user.username or user.email,
        action=action,
        module=module,
        target_id=target_id,
        description=description,
        data=data
    )
    db.add(log_entry)
    db.commit()

def get_effective_permissions(user: User, db: Session) -> Dict[str, Dict[str, bool]]:
    """Calcula la unión de todos los permisos del usuario basado en sus roles y overrides"""
    # Si es admin o owner, tiene todo por defecto (hardcoded como fallback)
    is_super = "admin" in user.roles or "owner" in user.roles
    
    # 1. Traer permisos de todos sus roles
    effective: Dict[str, Dict[str, bool]] = {}
    user_roles = db.query(Role).filter(Role.name.in_(user.roles)).all()
    
    for role in user_roles:
        if not role.permissions or not isinstance(role.permissions, dict):
            continue
            
        for module, actions in role.permissions.items():
            if module not in effective:
                effective[module] = {"view": False, "create": False, "edit": False, "delete": False}
            
            if isinstance(actions, dict):
                for action, value in actions.items():
                    if value is True:
                        effective[module][action] = True
                    
    # 2. Aplicar super-permisos si aplica
    if is_super:
        # Podríamos dejarlo así para que se base en el rol "Administrador" de la DB, 
        # pero por seguridad forzamos si el array de roles tiene 'admin'
        pass 

    # 3. Overrides directos del usuario (si los hubiera en el futuro, por ahora User.permissions es Dict[str, bool] antiguo)
    # Explicit user overrides take precedence over inherited roles (including False).
    for module, actions in (user.permissions or {}).items():
        if isinstance(actions, dict):
            effective.setdefault(module, {})
            effective[module].update({action: value for action, value in actions.items() if isinstance(value, bool)})
    
    return effective

def check_permission(module: str, action: str):
    """Dependency para verificar permisos granulares"""
    async def permission_checker(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):
        # Admin y Owner pasan todo
        if "admin" in current_user.roles or "owner" in current_user.roles:
            return current_user
            
        perms = get_effective_permissions(current_user, db)
        module_perms = perms.get(module, {})
        
        if module_perms.get(action) is True:
            return current_user
            
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"No tiene permiso para {action} en el módulo {module}"
        )
    return permission_checker

def check_roles(required_roles: List[str]):
    # Deprecated en favor de check_permission, pero lo mantenemos por compatibilidad
    async def role_checker(current_user: User = Depends(get_current_user)):
        if "admin" in current_user.roles or "owner" in current_user.roles:
            return current_user
        for role in required_roles:
            if role in current_user.roles:
                return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permisos para realizar esta acción"
        )
    return role_checker

@router.post("/register", response_model=dict)
def register_user(
    user_in: UserCreate,
    current_user: User = Depends(check_permission("users", "create")),
    db: Session = Depends(get_db)
):
    ensure_role_assignment_allowed(current_user.roles, user_in.roles)
    # Check if user exists
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="El email ya est\u00e1 registrado")
    
    new_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        roles=user_in.roles
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "Usuario creado correctamente", "user_id": new_user.id}

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # Prioritizamos búsqueda por username, luego email
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user:
        user = db.query(User).filter(User.email == form_data.username).first()
        
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta cuenta está deshabilitada. Contacte al administrador.",
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username or user.email, "roles": user.roles}, 
        expires_delta=access_token_expires
    )
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()

    # Log login action
    log_action(
        user=user,
        action="LOGIN",
        module="auth",
        description=f"Inicio de sesión exitoso: @{user.username or user.email}",
        db=db
    )
    
    # Issue a refresh token alongside the access token
    refresh_token = create_refresh_token({"sub": user.username or user.email})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "refresh_token": refresh_token,
        "user": {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "name": user.full_name,
            "roles": user.roles,
            "permissions": get_effective_permissions(user, db)
        }
    }

@router.post("/refresh", response_model=Token)
async def refresh_token(data: RefreshRequest, db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Refresh token inválido o expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(data.refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        identity: str = payload.get("sub")
        if identity is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(User).filter(User.username == identity).first()
    if not user:
        user = db.query(User).filter(User.email == identity).first()
        
    if not user or not user.active:
        raise credentials_exception
        
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    new_access_token = create_access_token(
        data={"sub": user.username or user.email, "roles": user.roles}, 
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": new_access_token,
        "token_type": "bearer",
        "refresh_token": data.refresh_token, # Reuse same refresh token
        "user": {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "name": user.full_name,
            "roles": user.roles,
            "permissions": get_effective_permissions(user, db)
        }
    }

@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        return {"message": "La recuperación por correo aún no está habilitada. Solicitá el cambio a un administrador."}
        
    # Generate recovery token (15 min expire)
    recovery_token = jwt.encode(
        {"sub": user.email, "exp": datetime.utcnow() + timedelta(minutes=15), "action": "recovery"},
        SECRET_KEY, 
        algorithm=ALGORITHM
    )
    
    # En producción, enviar recovery_token via email (smtp configurado en mailer.py)
    # Por ahora, el token se genera pero no se expone en la respuesta
    
    return {
        "message": "La recuperación por correo aún no está habilitada. Solicitá el cambio a un administrador."
    }

@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(data.token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        action: str = payload.get("action")
        if email is None or action != "recovery":
            raise HTTPException(status_code=400, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=400, detail="Token expirado o inválido")
        
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
    user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    
    return {"message": "Contraseña actualizada correctamente"}

class InitialInstallRequest(BaseModel):
    email: str
    username: str
    password: str
    full_name: str
    setup_token: str

@router.post("/install")
def install_first_user(data: InitialInstallRequest, db: Session = Depends(get_db)):
    """Alta inicial: exige secreto de instalación y contraseña robusta."""
    verify_setup_token(data.setup_token, os.environ.get("QUINTAL_SETUP_TOKEN", ""))
    if db.query(User).count() > 0:
        raise HTTPException(status_code=409, detail="El sistema ya está inicializado")
    ensure_initial_password(data.password)

    new_user = User(
        email=data.email,
        username=data.username,
        hashed_password=get_password_hash(data.password),
        full_name=data.full_name,
        roles=["admin", "owner"],
        active=True
    )
    db.add(new_user)
    db.commit()
    return {"message": "Administrador inicial creado. Desactivá QUINTAL_SETUP_TOKEN tras configurar el sistema."}

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

@router.get("/me")
async def read_users_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username,
        "name": current_user.full_name,
        "roles": current_user.roles,
        "permissions": get_effective_permissions(current_user, db)
    }

@router.put("/me")
async def update_profile(
    data: ProfileUpdate, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    if data.full_name:
        current_user.full_name = data.full_name
    if data.email:
        if data.email != current_user.email:
            existing = db.query(User).filter(User.email == data.email).first()
            if existing:
                raise HTTPException(status_code=400, detail="El email ya está en uso")
            current_user.email = data.email
    
    db.commit()
    return {
        "message": "Perfil actualizado",
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "name": current_user.full_name,
            "roles": current_user.roles,
            "permissions": current_user.permissions or {}
        }
    }

@router.put("/change-password")
async def change_password(
    data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
    
    current_user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    return {"message": "Contraseña actualizada correctamente"}

# -------------------------------------------------------------------
# Administrative User Management
# -------------------------------------------------------------------

class UserAdminCreate(BaseModel):
    email: str
    username: str
    password: str
    full_name: str
    roles: List[str]
    permissions: Optional[Dict[str, Dict[str, bool]]] = {}
    active: bool = True

class UserAdminUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    username: Optional[str] = None
    roles: Optional[List[str]] = None
    permissions: Optional[Dict[str, Dict[str, bool]]] = None
    active: Optional[bool] = None
    password: Optional[str] = None

@router.get("/users")
def list_users(
    current_user: User = Depends(check_permission("users", "view")),
    db: Session = Depends(get_db)
):
    return db.query(User).all()

@router.post("/users")
async def create_user_admin(
    user_in: UserAdminCreate,
    current_user: User = Depends(check_permission("users", "create")),
    db: Session = Depends(get_db)
):
    ensure_role_assignment_allowed(current_user.roles, user_in.roles)
    # Check email
    if db.query(User).filter(User.email == user_in.email).first():
        raise HTTPException(status_code=400, detail="El email ya está registrado")
    # Check username
    if db.query(User).filter(User.username == user_in.username).first():
        raise HTTPException(status_code=400, detail="El nombre de usuario ya está en uso")
    
    new_user = User(
        email=user_in.email,
        username=user_in.username,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        roles=user_in.roles,
        permissions=user_in.permissions or {},
        active=user_in.active
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    log_action(current_user, "CREATE", "users", f"Creado usuario {new_user.username}", db, target_id=new_user.id)
    
    return new_user

@router.put("/users/{user_id}")
async def update_user_admin(
    user_id: str,
    user_in: UserAdminUpdate,
    current_user: User = Depends(check_permission("users", "edit")),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    ensure_role_assignment_allowed(current_user.roles, user_in.roles or [], user.roles)
    if user_in.permissions is not None and not ({"admin", "owner"} & set(current_user.roles or [])):
        raise HTTPException(status_code=403, detail="Solo administración puede modificar permisos")

    if user_in.full_name is not None: user.full_name = user_in.full_name
    if user_in.email is not None: user.email = user_in.email
    if user_in.username is not None: user.username = user_in.username
    if user_in.roles is not None: user.roles = user_in.roles
    if user_in.permissions is not None: user.permissions = user_in.permissions
    if user_in.active is not None: user.active = user_in.active
    if user_in.password: user.hashed_password = get_password_hash(user_in.password)
    
    db.commit()
    
    log_action(current_user, "UPDATE", "users", f"Actualizado usuario {user.username}", db, target_id=user.id)
    
    return user

@router.delete("/users/{user_id}")
async def delete_user_admin(
    user_id: str,
    current_user: User = Depends(check_permission("users", "delete")),
    db: Session = Depends(get_db)
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    ensure_role_assignment_allowed(current_user.roles, [], user.roles)
    username_deleted = user.username
    db.delete(user)
    db.commit()
    
    log_action(current_user, "DELETE", "users", f"Eliminado usuario {username_deleted}", db, target_id=user_id)
    
    return {"ok": True}

class RoleSchema(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    permissions: Dict[str, Dict[str, bool]] = {}
    is_system: bool = False

    class Config:
        from_attributes = True

def ensure_system_roles(db: Session):
    # Definimos la estructura básica para los roles de sistema
    def get_full_access():
        modules = ["sales_orders", "sales_delivery", "sales_invoices", "sales_quotes", "customers", 
                   "purchase_orders", "purchase_delivery", "purchase_invoices", "suppliers", 
                   "products", "items", "stock_moves", "service_works", "employee_expenses", "employee_expenses_all", "employee_review", "employee_funds", "employee_reconciliation", "employee_expense_exceptions",
                   "warehouses",
                    "grain_primary_settlements",
                    "grain_secondary_settlements",
                    "grain_contracts",
                    "grain_movements",
                    "grain_stock",
                    "cash", "banks", "cheques", "payments",
                    "ledger", "journal", "accounting_reports", "users"]
        return {m: {"view": True, "create": True, "edit": True, "delete": True} for m in modules}

    def get_read_only():
        perms = get_full_access()
        for m in perms:
            perms[m] = {"view": m != "employee_expenses_all", "create": False, "edit": False, "delete": False}
        return perms

    roles = [
        {
            "name": "Administrador", 
            "is_system": True, 
            "description": "Acceso total a todos los módulos y acciones del sistema.", 
            "permissions": get_full_access()
        },
        {
            "name": "Operador", 
            "is_system": True, 
            "description": "Permisos de gestión operativa diaria.", 
            "permissions": {
                **get_read_only(),
                "sales_orders": {"view": True, "create": True, "edit": True, "delete": False},
                "sales_delivery": {"view": True, "create": True, "edit": True, "delete": False},
                "sales_invoices": {"view": True, "create": True, "edit": False, "delete": False},
                "sales_quotes": {"view": True, "create": True, "edit": True, "delete": False},
                "customers": {"view": True, "create": True, "edit": True, "delete": False},
                "purchase_orders": {"view": True, "create": True, "edit": True, "delete": False},
                "purchase_invoices": {"view": True, "create": True, "edit": False, "delete": False},
                "suppliers": {"view": True, "create": True, "edit": True, "delete": False},
                "items": {"view": True, "create": True, "edit": True, "delete": False},
                "stock_moves": {"view": True, "create": True, "edit": False, "delete": False},
                "warehouses": {"view": True, "create": False, "edit": False, "delete": False},
                "cash": {"view": True, "create": True, "edit": False, "delete": False},
                "banks": {"view": True, "create": False, "edit": False, "delete": False},
                "cheques": {"view": True, "create": True, "edit": True, "delete": False},
                "payments": {"view": True, "create": True, "edit": False, "delete": False},
            }
        },
        {
            "name": "Consultor", 
            "is_system": True, 
            "description": "Acceso de solo lectura para auditoría y reportes.", 
            "permissions": get_read_only()
        },
    ]
    for r_data in roles:
        role = db.query(Role).filter(Role.name == r_data["name"]).first()
        if not role:
            new_role = Role(**r_data)
            db.add(new_role)
        else:
            if role.is_system:
                current_permissions = dict(role.permissions or {})
                default_permissions = r_data["permissions"]

                for module, actions in default_permissions.items():
                    if module not in current_permissions:
                        current_permissions[module] = actions.copy()

                role.permissions = current_permissions
                role.description = r_data["description"]
    db.commit()

@router.get("/roles", response_model=List[RoleSchema])
def list_roles(
    current_user: User = Depends(check_permission("users", "view")),
    db: Session = Depends(get_db)
):
    ensure_system_roles(db)
    return db.query(Role).all()

@router.post("/roles", response_model=RoleSchema)
async def create_role(
    role_in: RoleSchema, 
    current_user: User = Depends(check_permission("users", "create")),
    db: Session = Depends(get_db)
):
    new_role = Role(
        name=role_in.name,
        description=role_in.description,
        permissions=role_in.permissions,
        is_system=False
    )
    db.add(new_role)
    db.commit()
    db.refresh(new_role)
    
    log_action(current_user, "CREATE", "roles", f"Creado perfil {new_role.name}", db, target_id=new_role.id)
    
    return new_role

@router.put("/roles/{role_id}", response_model=RoleSchema)
async def update_role(
    role_id: str, 
    role_in: RoleSchema, 
    current_user: User = Depends(check_permission("users", "edit")),
    db: Session = Depends(get_db)
):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    if role.is_system and role.name != role_in.name:
         raise HTTPException(status_code=400, detail="No se puede cambiar el nombre de un rol de sistema")
    
    role.name = role_in.name
    role.description = role_in.description
    role.permissions = role_in.permissions
    db.commit()
    
    log_action(current_user, "UPDATE", "roles", f"Actualizado perfil {role.name}", db, target_id=role.id)
    
    return role

@router.delete("/roles/{role_id}")
async def delete_role(
    role_id: str, 
    current_user: User = Depends(check_permission("users", "delete")),
    db: Session = Depends(get_db)
):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    if role.is_system:
        raise HTTPException(status_code=400, detail="No se pueden eliminar roles de sistema")
    
    role_name = role.name
    db.delete(role)
    db.commit()
    
    log_action(current_user, "DELETE", "roles", f"Eliminado perfil {role_name}", db, target_id=role_id)
    
    return {"ok": True}

@router.get("/audit-logs")
def get_audit_logs(
    page: int = 1,
    limit: int = 50,
    module: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_permission("users", "view"))
):
    """Retorna los logs de auditoría con soporte para paginación y filtrado."""
    query = db.query(AuditLog)
    
    if module:
        query = query.filter(AuditLog.module == module)
        
    offset = (page - 1) * limit
    return query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()

@router.post("/patch-usernames")
def patch_missing_usernames(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Asigna username a todos los usuarios que no tienen uno, basado en su nombre completo."""
    import unicodedata, re

    if "admin" not in current_user.roles and "owner" not in current_user.roles:
        raise HTTPException(status_code=403, detail="Solo administradores")

    def to_username(name: str) -> str:
        nfkd = unicodedata.normalize('NFD', name)
        ascii_str = nfkd.encode('ascii', 'ignore').decode('ascii')
        return re.sub(r'[^a-z0-9_]', '', ascii_str.strip().lower().replace(' ', '_'))

    users_to_patch = db.query(User).filter(
        (User.username == None) | (User.username == "")
    ).all()

    updated = []
    for u in users_to_patch:
        if u.full_name:
            candidate = to_username(u.full_name)
        elif u.email:
            candidate = u.email.split('@')[0].lower().replace('.', '_')
        else:
            candidate = f"user_{u.id[:8]}"

        base = candidate
        counter = 1
        while db.query(User).filter(User.username == candidate, User.id != u.id).first():
            candidate = f"{base}_{counter}"
            counter += 1

        u.username = candidate
        updated.append({"user": u.full_name or u.email, "username": candidate})

    db.commit()
    return {"patched": len(updated), "details": updated}
