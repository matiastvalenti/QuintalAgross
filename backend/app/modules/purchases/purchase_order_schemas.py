from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
from app.db.models.models import CurrencyType
from app.db.models.commercial_models import OrderStatus

class DeliveryNoteMinimal(BaseModel):
    id: str
    number: str
    date: datetime
    status: str

    model_config = {
        "from_attributes": True
    }

class PurchaseOrderLineBase(BaseModel):
    product_id: Optional[str] = None
    description: Optional[str] = ""
    qty: Decimal
    unit_price: Decimal
    discount_pct: Decimal = Field(default=Decimal("0.0"))
    vat_rate: Decimal = Field(default=Decimal("0.21"))

class PurchaseOrderLineCreate(PurchaseOrderLineBase):
    pass

class PurchaseOrderLineResponse(PurchaseOrderLineBase):
    id: str
    order_id: str
    net_amount: Decimal
    vat_amount: Decimal
    total_amount: Decimal
    line_order: int
    qty_received: Decimal

    model_config = {
        "from_attributes": True
    }

class PurchaseOrderBase(BaseModel):
    entity_id: str
    number: Optional[str] = None
    date: datetime = Field(default_factory=datetime.utcnow)
    warehouse_id: Optional[str] = None
    currency: CurrencyType = CurrencyType.ARS
    exchange_rate: Decimal = Decimal("1.0")
    origin_reference: Optional[str] = None
    notes: Optional[str] = None
    attachment_url: Optional[str] = None
    vendedor: Optional[str] = None
    salesperson_id: Optional[str] = None
    cost_center: int = 1
    sale_condition_id: Optional[str] = None
    due_date: Optional[datetime] = None

class PurchaseOrderCreate(PurchaseOrderBase):
    lines: List[PurchaseOrderLineCreate]

class PurchaseOrderUpdate(BaseModel):
    entity_id: Optional[str] = None
    date: Optional[datetime] = None
    currency: Optional[CurrencyType] = None
    exchange_rate: Optional[Decimal] = None
    origin_reference: Optional[str] = None
    notes: Optional[str] = None
    attachment_url: Optional[str] = None
    cost_center: Optional[int] = None
    sale_condition_id: Optional[str] = None
    due_date: Optional[datetime] = None
    lines: Optional[List[PurchaseOrderLineCreate]] = None

class PurchaseOrderHistoryDetail(BaseModel):
    id: str
    order_id: str
    action: str
    description: Optional[str] = None
    date: datetime
    user_id: Optional[str] = None
    username: Optional[str] = None

    model_config = {
        "from_attributes": True
    }

class PurchaseOrderResponse(PurchaseOrderBase):
    id: str
    status: OrderStatus
    total_amount: Optional[Decimal] = Decimal("0.0")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    lines: List[PurchaseOrderLineResponse]
    delivery_notes: List[DeliveryNoteMinimal] = []
    
    # Traceability
    delivery_progress: Optional[float] = 0.0
    invoice_progress: Optional[float] = 0.0
    invoices: Optional[List[dict]] = []
    history: Optional[List[PurchaseOrderHistoryDetail]] = []

    model_config = {
        "from_attributes": True
    }

class PurchaseOrderListResponse(BaseModel):
    id: str
    entity_id: str
    entity_name: Optional[str] = None
    warehouse_id: Optional[str] = None
    number: str
    date: datetime
    status: OrderStatus
    total_amount: Optional[Decimal] = Decimal("0.0")
    currency: CurrencyType
    cost_center: int = 1
    attachment_url: Optional[str] = None
    
    # Traceability
    delivery_progress: Optional[float] = 0.0
    invoice_progress: Optional[float] = 0.0
    paid_progress: Optional[float] = 0.0

    model_config = {
        "from_attributes": True
    }
