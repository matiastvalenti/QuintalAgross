"""Schemas Pydantic para Remitos (DeliveryNote)."""
from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional, List
from datetime import datetime


# ── Lines ──
class DeliveryNoteLineCreate(BaseModel):
    """Schema for creating a delivery note line.
    Includes validation to ensure numeric fields are sensible.
    """
    source_sales_line_id: Optional[str] = None
    source_purchase_line_id: Optional[str] = None
    description: Optional[str] = ""
    qty_packages: Optional[float] = None
    package_size: Optional[float] = None
    package_unit: Optional[str] = None
    qty: float
    unit_price: float = 0.0
    discount_pct: float = 0.0
    vat_rate: float = 0.21
    unit_cost: float = 0.0
    product_id: Optional[str] = None
    line_order: int = 0

    @field_validator("qty")
    @classmethod
    def qty_positive(cls, v):
        if v <= 0:
            raise ValueError("La cantidad debe ser mayor a 0")
        return v

    @field_validator("unit_price", "unit_cost")
    @classmethod
    def non_negative_price(cls, v, info):
        if v < 0:
            raise ValueError(f"{info.field_name} no puede ser negativo")
        return v

    @field_validator("discount_pct")
    @classmethod
    def discount_range(cls, v):
        if not (0 <= v <= 100):
            raise ValueError("El descuento debe estar entre 0 y 100")
        return v

    @field_validator("vat_rate")
    @classmethod
    def vat_non_negative(cls, v):
        if v < 0:
            raise ValueError("El IVA no puede ser negativo")
        return v


from app.modules.inventory.product_schemas import ProductResponse

class DeliveryNoteLineResponse(BaseModel):
    id: str
    delivery_note_id: str
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
    line_order: int
    source_sales_line_id: Optional[str] = None
    source_purchase_line_id: Optional[str] = None
    product_id: Optional[str] = None
    product: Optional[ProductResponse] = None
    qty_invoiced: float
    unit_cost: Optional[float] = 0.0
    total_cost: Optional[float] = 0.0
    model_config = ConfigDict(from_attributes=True)


class DeliveryNoteHistoryResponse(BaseModel):
    id: str
    user: str
    date: datetime
    action: str
    details: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# ── Create from OV ──
class CreateDeliveryNoteFromOV(BaseModel):
    """Crear remito desde una OV. Lines define qty a entregar por OVLine."""
    warehouse_id: str
    number: str
    notes: Optional[str] = None
    cost_center: int = 1
    currency: Optional[str] = None
    exchange_rate: Optional[float] = None
    vendedor: Optional[str] = None
    salesperson_id: Optional[str] = None
    commission_amount: float = 0.0
    sale_condition_id: Optional[str] = None
    due_date: Optional[datetime] = None
    pv: Optional[str] = None
    vehicle_id: Optional[str] = None
    vehicle_driver: Optional[str] = None
    attachment_url: Optional[str] = None
    confirm_now: bool = True
    lines: List[DeliveryNoteLineCreate] = []


# ── Response ──
class DeliveryNoteResponse(BaseModel):
    id: str
    entity_id: str
    warehouse_id: Optional[str] = None
    number: str
    date: datetime
    note_type: str
    delivery_type: str
    sales_order_id: Optional[str] = None
    purchase_order_id: Optional[str] = None
    return_source_id: Optional[str] = None
    status: str
    origin_reference: Optional[str] = None
    notes: Optional[str] = None
    currency: Optional[str] = "ARS"
    exchange_rate: Optional[float] = 1.0
    vendedor: Optional[str] = None
    sale_condition_id: Optional[str] = None
    due_date: Optional[datetime] = None
    vehicle_id: Optional[str] = None
    vehicle_driver: Optional[str] = None
    attachment_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    lines: List[DeliveryNoteLineResponse] = []
    history: List[DeliveryNoteHistoryResponse] = []
    invoices: Optional[List[dict]] = []
    related_delivery_notes: Optional[List[dict]] = []
    invoice_progress: Optional[float] = 0.0
    paid_progress: Optional[float] = 0.0
    model_config = ConfigDict(from_attributes=True)


class DeliveryNoteListResponse(BaseModel):
    """Listado sin líneas."""
    id: str
    entity_id: str
    warehouse_id: Optional[str] = None
    number: str
    date: datetime
    note_type: str
    delivery_type: str
    sales_order_id: Optional[str] = None
    cost_center: int = 1
    status: str
    origin_reference: Optional[str] = None
    attachment_url: Optional[str] = None
    invoice_progress: Optional[float] = 0.0
    paid_progress: Optional[float] = 0.0
    model_config = ConfigDict(from_attributes=True)


# ── Stock preview (para warning) ──
class StockImpactPreview(BaseModel):
    product_id: str
    product_name: str
    warehouse_id: str
    current_qty: float
    movement_qty: float
    resulting_qty: float
    will_be_negative: bool


class ConfirmPreviewResponse(BaseModel):
    delivery_note_id: str
    impacts: List[StockImpactPreview]
    has_negative_stock: bool


# ── Update ──
class DeliveryNoteLineUpdate(BaseModel):
    """Línea para actualizar — source_sales_line_id=None desvincula de la OV."""
    source_sales_line_id: Optional[str] = None
    source_purchase_line_id: Optional[str] = None
    description: Optional[str] = ""
    qty_packages: Optional[float] = None
    package_size: Optional[float] = None
    package_unit: Optional[str] = None
    qty: float
    unit_price: float = 0.0
    discount_pct: float = 0.0
    vat_rate: float = 0.21
    unit_cost: float = 0.0
    product_id: Optional[str] = None
    line_order: int = 0


class DeliveryNoteUpdate(BaseModel):
    number: Optional[str] = None
    date: Optional[datetime] = None
    warehouse_id: Optional[str] = None
    notes: Optional[str] = None
    currency: Optional[str] = None
    exchange_rate: Optional[float] = None
    vendedor: Optional[str] = None
    sale_condition_id: Optional[str] = None
    due_date: Optional[datetime] = None
    pv: Optional[str] = None
    origin_reference: Optional[str] = None
    vehicle_id: Optional[str] = None
    vehicle_driver: Optional[str] = None
    attachment_url: Optional[str] = None
    cost_center: Optional[int] = None
    lines: Optional[List[DeliveryNoteLineUpdate]] = None

# ── Return ──

class CreateReturnDeliveryNote(BaseModel):
    warehouse_id: str
    number: str
    return_source_id: str  # Remito original
    notes: Optional[str] = None
    pv: Optional[str] = None
    vehicle_id: Optional[str] = None
    vehicle_driver: Optional[str] = None
    attachment_url: Optional[str] = None
    lines: List[DeliveryNoteLineCreate] = []


# ── Create Direct (Auto-OV) ──
class CreateDeliveryNoteDirect(BaseModel):
    """Crear remito directo (sin OV previa). Generará OV automática."""
    entity_id: str
    warehouse_id: str
    number: str
    date: Optional[datetime] = None
    notes: Optional[str] = None
    pv: Optional[str] = None
    currency: Optional[str] = "ARS"
    exchange_rate: Optional[float] = 1.0
    vendedor: Optional[str] = None
    sale_condition_id: Optional[str] = None
    due_date: Optional[datetime] = None
    vehicle_id: Optional[str] = None
    vehicle_driver: Optional[str] = None
    salesperson_id: Optional[str] = None
    attachment_url: Optional[str] = None
    cost_center: int = 1
    confirm_now: bool = True
    lines: List[DeliveryNoteLineCreate]

# ── Manual Linking ──
class ManualLinkMatch(BaseModel):
    dn_line_id: str
    ov_line_id: str
    qty: float

class MultiDeliveryNoteInvoiceCreate(BaseModel):
    delivery_note_ids: List[str]
    doc_type: str = "FA"
    pv: Optional[str] = None
    number: Optional[str] = None
    date: Optional[datetime] = None

class ManualLinkRequest(BaseModel):
    matches: List[ManualLinkMatch]
