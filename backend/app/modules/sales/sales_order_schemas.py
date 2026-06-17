"""Schemas Pydantic para Órdenes de Venta."""
from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional, List
from datetime import datetime


from app.modules.inventory.product_schemas import ProductResponse

# ── Lines ──
class SalesOrderLineCreate(BaseModel):
    id: Optional[str] = None
    description: Optional[str] = ""
    qty_packages: Optional[float] = None
    package_size: Optional[float] = None
    package_unit: Optional[str] = None
    qty: float = 1.0
    unit_price: float = 0.0
    discount_pct: float = 0.0
    vat_rate: float = 0.21
    unit_cost: float = 0.0
    cost_price: Optional[float] = None # Alias para soportar frontend
    product_id: Optional[str] = None
    line_order: int = 0

    @field_validator("qty")
    @classmethod
    def qty_positive(cls, v):
        if v <= 0:
            raise ValueError("La cantidad debe ser mayor a 0")
        return v


class SalesOrderLineResponse(BaseModel):
    id: str
    order_id: str
    description: Optional[str] = ""
    qty_packages: Optional[float] = None
    package_size: Optional[float] = None
    package_unit: Optional[str] = None
    qty: float
    unit_price: float
    discount_pct: float
    vat_rate: float
    net_amount: float
    vat_amount: float
    total_amount: float
    unit_cost: float = 0.0
    cost_price: Optional[float] = 0.0
    total_cost: float = 0.0
    margin_amount: float = 0.0
    line_order: int
    product_id: Optional[str] = None
    product: Optional[ProductResponse] = None
    qty_delivered: float
    qty_invoiced: float = 0.0
    model_config = ConfigDict(from_attributes=True)


class EntityMinimal(BaseModel):
    id: str
    name: str
    legal_name: Optional[str] = None
    tax_id: Optional[str] = None
    cuit: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class DeliveryNoteMinimal(BaseModel):
    id: str
    number: str
    date: datetime
    status: str
    delivery_type: str
    model_config = ConfigDict(from_attributes=True)


class InvoiceMinimal(BaseModel):
    id: str
    number: str
    date: datetime
    doc_type: str
    status: str
    total_amount: float
    currency: str
    model_config = ConfigDict(from_attributes=True)


class SalesOrderHistoryResponse(BaseModel):
    id: str
    user: str
    date: datetime
    action: str
    details: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# ── Order ──
class SalesOrderCreate(BaseModel):
    entity_id: str
    pv: Optional[str] = None
    warehouse_id: Optional[str] = None
    number: Optional[str] = None
    currency: str = "ARS"
    exchange_rate: float = 1.0
    cost_center: int = 1
    date: Optional[datetime] = None
    invoice_date: Optional[datetime] = None
    origin_reference: Optional[str] = None
    sale_condition_id: Optional[str] = None
    due_date: Optional[datetime] = None
    header_notes: Optional[str] = None
    order_number: Optional[str] = None
    shipping_number: Optional[str] = None
    vendedor: Optional[str] = None
    salesperson_id: Optional[str] = None
    commission_amount: float = 0.0
    business_unit: Optional[str] = None
    price_list: Optional[str] = None
    direct_rep: bool = False
    vehicle_id: Optional[str] = None
    vehicle_driver: Optional[str] = None
    notes: Optional[str] = None
    attachment_url: Optional[str] = None
    lines: List[SalesOrderLineCreate] = []


    @field_validator("number", mode="before")
    @classmethod
    def process_number(cls, v):
        if not v:
            return None
        return str(v).strip()


class SalesOrderUpdate(BaseModel):
    warehouse_id: Optional[str] = None
    cost_center: Optional[int] = None
    number: Optional[str] = None
    pv: Optional[str] = None
    date: Optional[datetime] = None
    currency: Optional[str] = None
    exchange_rate: Optional[float] = None
    invoice_date: Optional[datetime] = None
    origin_reference: Optional[str] = None
    sale_condition_id: Optional[str] = None
    due_date: Optional[datetime] = None
    header_notes: Optional[str] = None
    order_number: Optional[str] = None
    shipping_number: Optional[str] = None
    vendedor: Optional[str] = None
    salesperson_id: Optional[str] = None
    commission_amount: Optional[float] = None
    business_unit: Optional[str] = None
    price_list: Optional[str] = None
    direct_rep: Optional[bool] = None
    vehicle_id: Optional[str] = None
    vehicle_driver: Optional[str] = None
    notes: Optional[str] = None
    attachment_url: Optional[str] = None
    lines: Optional[List[SalesOrderLineCreate]] = None


class SalesOrderResponse(BaseModel):
    id: str
    entity_id: str
    pv: Optional[str] = None
    warehouse_id: Optional[str] = None
    entity: Optional[EntityMinimal] = None
    number: str
    date: datetime
    currency: str
    exchange_rate: float
    cost_center: int = 1
    total_amount: float
    total_cost: float = 0.0
    margin_amount: float = 0.0
    status: str
    source: str
    sale_condition_id: Optional[str] = None
    due_date: Optional[datetime] = None
    invoice_date: Optional[datetime] = None
    origin_reference: Optional[str] = None
    header_notes: Optional[str] = None
    order_number: Optional[str] = None
    shipping_number: Optional[str] = None
    vendedor: Optional[str] = None
    salesperson_id: Optional[str] = None
    commission_amount: float = 0.0
    business_unit: Optional[str] = None
    price_list: Optional[str] = None
    direct_rep: bool = False
    vehicle_id: Optional[str] = None
    vehicle_driver: Optional[str] = None
    notes: Optional[str] = None
    attachment_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    
    # Traceability progress (0 to 100)
    delivery_progress: float = 0.0
    invoice_progress: float = 0.0
    paid_progress: float = 0.0
    
    lines: List[SalesOrderLineResponse] = []
    delivery_notes: List[DeliveryNoteMinimal] = []
    invoices: List[InvoiceMinimal] = []
    history: List[SalesOrderHistoryResponse] = []
    model_config = ConfigDict(from_attributes=True)


class SalesOrderListResponse(BaseModel):
    """Respuesta ligera para listados (sin líneas)."""
    id: str
    entity_id: str
    entity: Optional[EntityMinimal] = None
    warehouse_id: Optional[str] = None
    number: str
    date: datetime
    currency: str
    cost_center: int = 1
    total_amount: float
    total_cost: float = 0.0
    margin_amount: float = 0.0
    status: str
    source: str
    origin_reference: Optional[str] = None
    delivery_progress: float = 0.0 # 0 to 100
    invoice_progress: float = 0.0 # 0 to 100
    invoiced_amount: float = 0.0
    paid_progress: float = 0.0 # 0 to 100
    created_by: Optional[str] = None
    attachment_url: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)
