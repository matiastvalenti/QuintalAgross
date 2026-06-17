from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, List
from app.db.models.models import EntityType

class EntityPerceptionBase(BaseModel):
    tax_name: str
    category: Optional[str] = None
    rate: float = 0.0
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class EntityPerception(EntityPerceptionBase):
    id: str
    entity_id: str
    model_config = ConfigDict(from_attributes=True)

class EntityBase(BaseModel):
    name: str
    type: EntityType = EntityType.CLIENT
    code: Optional[str] = None
    tax_id: Optional[str] = None
    tax_category: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    contact_name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = "Argentina"
    country_id: Optional[int] = None
    province_id: Optional[int] = None
    locality_id: Optional[int] = None
    price_list_id: Optional[str] = None
    salesperson_id: Optional[str] = None
    business_unit: Optional[str] = None
    account_code: Optional[str] = None
    is_salesperson: bool = False
    commission_type: Optional[str] = None
    commission_pct: float = 0.0
    # v2 commission config
    commission_mode: Optional[str] = "BY_COLLECTION"
    commission_currency: Optional[str] = "USD"
    commission_exchange_mode: Optional[str] = "INVOICE_RATE"
    margin_commission_pct: Optional[float] = 100.0
    notes: Optional[str] = None
    credit_limit: float = 0.0
    credit_status: str = "OK"

class EntityCreate(EntityBase):
    create_linked: bool = False

class EntityUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[EntityType] = None
    # ... (other fields remain optional)
    code: Optional[str] = None
    tax_id: Optional[str] = None
    tax_category: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    contact_name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    country_id: Optional[int] = None
    province_id: Optional[int] = None
    locality_id: Optional[int] = None
    price_list_id: Optional[str] = None
    salesperson_id: Optional[str] = None
    business_unit: Optional[str] = None
    account_code: Optional[str] = None
    is_salesperson: Optional[bool] = None
    commission_type: Optional[str] = None
    commission_pct: Optional[float] = None
    # v2 commission config
    commission_mode: Optional[str] = None
    commission_currency: Optional[str] = None
    commission_exchange_mode: Optional[str] = None
    margin_commission_pct: Optional[float] = None
    notes: Optional[str] = None
    credit_limit: Optional[float] = None
    credit_status: Optional[str] = None

class Entity(EntityBase):
    id: str
    linked_entity_id: Optional[str] = None
    perceptions: List[EntityPerception] = []
    model_config = ConfigDict(from_attributes=True)

class AccountMovementBase(BaseModel):
    date: datetime
    description: str
    currency: str = "ARS"
    debit: float = 0.0
    credit: float = 0.0
    exchange_rate: float = 1.0

class AccountMovementCreate(AccountMovementBase):
    pass

class AccountMovement(AccountMovementBase):
    id: int
    entity_id: str
    model_config = ConfigDict(from_attributes=True)

class LedgerResponse(BaseModel):
    entity: Entity
    movements: List[AccountMovement]
    balance: float
    model_config = ConfigDict(from_attributes=True)

class EntityCRMNoteBase(BaseModel):
    category: str = "Visita"
    content: str
    date: datetime = datetime.utcnow()
    promise_date: Optional[datetime] = None
    next_follow_up: Optional[datetime] = None
    is_completed: bool = True

class EntityCRMNoteCreate(EntityCRMNoteBase):
    pass

class EntityCRMNote(EntityCRMNoteBase):
    id: str
    entity_id: str
    user_id: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class EntityDashboardSummary(BaseModel):
    id: str
    name: str
    type: str
    tax_id: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    total_balance: float
    total_balance_usd: float = 0.0
    overdue_balance: float
    unbilled_balance: float
    unbilled_balance_usd: float = 0.0
    checks_pending: float
    credit_limit: float
    credit_status: str
    avg_days_to_pay: float = 0.0
    performance_score: float = 100.0
    
    aging: List[dict] # [{label: '0-30', amount: 100}, ...]
    recent_activity: List[dict]
    history: List[dict] # [{month: 'Jan', amount: 1000}, ...]
    top_products: List[dict] # [{name: 'Semilla', qty: 10, amount: 500}, ...]
    pending_logistics: List[dict] = []
    open_orders: List[dict] = []
    crm_notes: List[EntityCRMNote] = []
    model_config = ConfigDict(from_attributes=True)

class EntityAgeing(BaseModel):
    id: str
    name: str
    code: Optional[str] = None
    total_balance: float
    overdue_balance: float
    aging_buckets: List[dict] # [{label: 'A vencer', amount: X}, ...]
    credit_limit: float
    credit_status: str
    conditions: List[dict] = []

class AgeingReportResponse(BaseModel):
    report_date: datetime
    type: str # 'client' or 'provider'
    summary: dict # {total_debt: X, total_overdue: X}
    data: List[EntityAgeing]
