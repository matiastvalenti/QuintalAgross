from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Optional, List, Dict, Any
from app.db.models.models import DocumentType, CurrencyType, DocumentStatus, PaymentMethod, DocumentReasonType

# ──────────────────────────────────────────────
# DocumentLine schemas
# ──────────────────────────────────────────────
class DocumentLineBase(BaseModel):
    description: Optional[str] = ""
    product_id: Optional[str] = None
    qty_packages: Optional[float] = None
    package_size: Optional[float] = None
    package_unit: Optional[str] = None
    qty: float = 1.0
    unit_price: float = 0.0
    discount_pct: float = 0.0
    net_amount: float = 0.0
    vat_rate: float = 0.21        # 0.21, 0.105, 0.27, 0.0
    vat_amount: float = 0.0
    total_amount: float = 0.0
    unit_cost: float = 0.0
    cost_price: Optional[float] = None
    line_order: int = 0
    source_dn_line_id: Optional[str] = None
    source_sales_line_id: Optional[str] = None
    source_purchase_line_id: Optional[str] = None
    accounting_account_id: Optional[str] = None  # Cuenta contable
    stock_movement_id: Optional[str] = None

class UnitBasicResponse(BaseModel):
    id: str
    name: str
    short_name: str
    model_config = ConfigDict(from_attributes=True)

class ContainerBasicResponse(BaseModel):
    id: str
    name: str
    capacity: float
    unit: Optional[UnitBasicResponse] = None
    model_config = ConfigDict(from_attributes=True)

class ProductBasicResponse(BaseModel):
    id: str
    name: str
    sku: Optional[str] = None
    quantity_per_container: Optional[float] = 1.0
    sales_account_code: Optional[str] = None
    container: Optional[ContainerBasicResponse] = None
    model_config = ConfigDict(from_attributes=True)

class DocumentLineResponse(DocumentLineBase):
    id: str
    document_id: str
    product: Optional[ProductBasicResponse] = Field(None, validation_alias="product_info", serialization_alias="product")
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class DocumentLineCreate(DocumentLineBase):
    product_id: Optional[str] = None

class DocumentVehicleExpenseBase(BaseModel):
    vehicle_id: str
    amount: float = 0.0
    percentage: float = 0.0
    notes: Optional[str] = None

class DocumentVehicleExpenseCreate(DocumentVehicleExpenseBase):
    pass

class DocumentVehicleExpenseResponse(DocumentVehicleExpenseBase):
    id: str
    document_id: str
    model_config = ConfigDict(from_attributes=True)

# ──────────────────────────────────────────────
# DocumentPerception schemas
# ──────────────────────────────────────────────
class DocumentPerceptionBase(BaseModel):
    tax_name: str
    jurisdiction: Optional[str] = None
    base_amount: float = 0.0
    rate: float = 0.0
    amount: float = 0.0

class DocumentPerceptionCreate(DocumentPerceptionBase):
    pass

class DocumentPerceptionResponse(DocumentPerceptionBase):
    id: str
    document_id: str
    model_config = ConfigDict(from_attributes=True)

# ──────────────────────────────────────────────
# DocumentRetention schemas
# ──────────────────────────────────────────────
class DocumentRetentionBase(BaseModel):
    tax_name: str
    jurisdiction: Optional[str] = None
    certificate_number: Optional[str] = None
    base_amount: float = 0.0
    amount: float = 0.0

class DocumentRetentionCreate(DocumentRetentionBase):
    pass

class DocumentRetentionResponse(DocumentRetentionBase):
    id: str
    document_id: str
    model_config = ConfigDict(from_attributes=True)

# ──────────────────────────────────────────────
# PaymentItem schemas
# ──────────────────────────────────────────────
class PaymentItemBase(BaseModel):
    type: PaymentMethod
    amount: float
    description: Optional[str] = None
    reference_number: Optional[str] = None
    bank_name: Optional[str] = None
    due_date: Optional[datetime] = None

class PaymentItemCreate(PaymentItemBase):
    pass

class PaymentItemResponse(PaymentItemBase):
    id: str
    document_id: str
    model_config = ConfigDict(from_attributes=True)


class DocumentHistoryResponse(BaseModel):
    id: str
    user: str
    date: datetime
    action: str
    details: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

# ──────────────────────────────────────────────
# Application schemas
# ──────────────────────────────────────────────
class ApplicationBase(BaseModel):
    from_document_id: Optional[str] = None
    to_document_id: str
    amount_applied: float
    exchange_rate: Optional[float] = None  # TC al momento de aplicar; si None, usa TC del doc crédito

class ApplicationCreate(ApplicationBase):
    pass

class ApplicationResponse(ApplicationBase):
    id: str
    amount_applied_ars: float
    exchange_rate: float # Override to make it non-optional in response
    created_at: datetime
    # Extra fields for traceability injected by router
    to_document_number: Optional[str] = None
    to_document_date: Optional[datetime] = None
    to_document_total: Optional[float] = None
    to_document_applied: Optional[float] = None
    # Campos de la factura destino necesarios para reconstruir TC Factura y moneda
    to_document_currency: Optional[str] = None        # moneda de la factura (USD, ARS)
    to_document_exchange_rate: Optional[float] = None # TC histórico de la factura
    model_config = ConfigDict(from_attributes=True)

# ──────────────────────────────────────────────
# Document schemas
# ──────────────────────────────────────────────
class DocumentBase(BaseModel):
    doc_type: DocumentType
    number: str
    date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    currency: CurrencyType = CurrencyType.ARS
    exchange_rate: float = 1.0
    total_amount: float
    net_amount: float = 0.0
    line: Optional[str] = None
    notes: Optional[str] = None  # Observaciones/notas
    attachment_url: Optional[str] = None
    sale_condition_id: Optional[str] = None
    vendedor: Optional[str] = None
    salesperson_id: Optional[str] = None
    commission_amount: float = 0.0
    cost_center: Optional[int] = 1  # 1 = ARCA, 2 = Interno
    is_fx_adjustment: Optional[bool] = False
    warehouse_id: Optional[str] = None  # Para movimientos de stock de facturas
    reason_type: Optional[DocumentReasonType] = None
    is_exchange_difference: Optional[bool] = False
    source_invoice_id: Optional[str] = None
    return_stock: Optional[bool] = False

class DocumentCreate(DocumentBase):
    entity_id: str
    reimbursement_entity_id: Optional[str] = None
    lines: Optional[List[DocumentLineCreate]] = None
    payments: Optional[List[PaymentItemCreate]] = None
    applications: Optional[List[ApplicationCreate]] = None
    vehicle_expenses: Optional[List[DocumentVehicleExpenseCreate]] = None
    perceptions: Optional[List[DocumentPerceptionCreate]] = None
    retentions: Optional[List[DocumentRetentionCreate]] = None
    is_initial_load: Optional[bool] = False

class DocumentUpdate(BaseModel):
    number: Optional[str] = None
    date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    currency: Optional[CurrencyType] = None
    exchange_rate: Optional[float] = None
    total_amount: Optional[float] = None
    line: Optional[str] = None
    attachment_url: Optional[str] = None
    lines: Optional[List[DocumentLineCreate]] = None
    payments: Optional[List[PaymentItemCreate]] = None
    applications: Optional[List[ApplicationCreate]] = None
    vehicle_expenses: Optional[List[DocumentVehicleExpenseCreate]] = None
    perceptions: Optional[List[DocumentPerceptionCreate]] = None
    sale_condition_id: Optional[str] = None
    cost_center: Optional[int] = None  # If None, keep existing
    salesperson_id: Optional[str] = None
    vendedor: Optional[str] = None
    entity_id: Optional[str] = None
    notes: Optional[str] = None



class DocumentResponse(DocumentBase):
    id: str
    entity_id: str
    entity_name: Optional[str] = None
    entity_tax_id: Optional[str] = None
    entity_code: Optional[str] = None
    attachment_url: Optional[str] = None
    total_amount_ars: float
    status: DocumentStatus
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    vendedor: Optional[str] = None
    salesperson_id: Optional[str] = None
    commission_amount: float = 0.0
    is_initial_load: bool = False
    # Applications made BY this document (e.g. receipt applying to invoices)
    applied_to: List[ApplicationResponse] = []
    # Applications made TO this document (e.g. invoices being paid)
    applied_by: List[ApplicationResponse] = []
    vehicle_expenses: List[DocumentVehicleExpenseResponse] = []
    perceptions: List[DocumentPerceptionResponse] = []
    retentions: List[DocumentRetentionResponse] = []
    history: List[DocumentHistoryResponse] = []
    
    # Traceability progress (0 to 100)
    delivered_pct: float = 0.0
    invoiced_pct: float = 0.0
    paid_pct: float = 0.0

    # Trazabilidad OV / Remito y saldo
    sales_orders: List[Dict[str, Any]] = []
    delivery_notes: List[Dict[str, Any]] = []
    pending_amount: Optional[float] = None
    amount_applied: Optional[float] = None
    
    model_config = ConfigDict(from_attributes=True)

class DocumentWithLinesResponse(DocumentResponse):
    lines: List[DocumentLineResponse] = []
    payments: List[PaymentItemResponse] = []



# ──────────────────────────────────────────────
# Ledger schemas
# ──────────────────────────────────────────────
class LedgerEntryResponse(DocumentResponse):
    applied_amount: float
    applied_amount_ars: float
    remaining: float
    remaining_ars: float
    amount_ars: float
    amount_usd: float
    balance_ars: float
    balance_usd: float

class ApplicationDetailResponse(ApplicationResponse):
    from_doc_number: Optional[str] = None
    from_doc_type: Optional[DocumentType] = None
    from_doc_currency: Optional[CurrencyType] = None
    to_doc_number: Optional[str] = None
    to_doc_type: Optional[DocumentType] = None
    to_doc_currency: Optional[CurrencyType] = None

class CommissionPaymentDetailResponse(BaseModel):
    id: str
    document_id: Optional[str] = None
    source_document_id: Optional[str] = None
    salesperson_id: str
    date: datetime
    amount_usd: float
    exchange_rate: float
    amount_ars: float
    notes: Optional[str] = None
    created_at: datetime
    # Extras
    doc_number: Optional[str] = None
    doc_type: Optional[DocumentType] = None
    source_doc_number: Optional[str] = None
    source_doc_type: Optional[DocumentType] = None
    salesperson_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class BalanceSummaryResponse(BaseModel):
    entity_id: str
    entity_name: str
    entity_code: Optional[str] = None
    entity_type: str
    currency: CurrencyType
    balance: float
    balance_ars: float

# ──────────────────────────────────────────────
# FX Adjustment schemas
# ──────────────────────────────────────────────
class FxPreviewLineResponse(BaseModel):
    invoice_line_id: str
    description: str
    vat_rate: float
    applied_original_currency: float
    ars_at_invoice_rate: float
    ars_at_application_rate: float
    diff_ars_total: float
    net_ars: float
    vat_ars: float

class VatBreakdown(BaseModel):
    net: float
    vat: float
    total: float

class FxPreviewResponse(BaseModel):
    needs_adjustment: bool
    sign: str                          # "ND" | "NC" | "NONE"
    lines: List[FxPreviewLineResponse] = []
    total_net_ars: float = 0.0
    total_vat_ars: float = 0.0
    total_ars: float = 0.0
    vat_by_rate: Dict[str, VatBreakdown] = {}
    reason: str = ""
    tc_invoice: float = 0.0
    tc_application: float = 0.0
    applied_amount_original: float = 0.0

class FxConfirmResponse(BaseModel):
    fx_link_id: str
    generated_document_id: str
    generated_doc_type: DocumentType
    generated_doc_number: str
    total_ars: float
    already_existed: bool  # True si era idempotente (ya existía)

class FxLinkResponse(BaseModel):
    id: str
    source_application_id: str
    source_document_id: str
    generated_document_id: str
    tc_invoice: float
    tc_application: float
    applied_amount_original: float
    diff_total_ars: float
    created_at: datetime
    generated_doc_type: Optional[DocumentType] = None
    generated_doc_number: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class OpenItemResponse(BaseModel):
    id: str
    number: str
    date: datetime
    doc_type: DocumentType
    total_amount: float
    applied_amount: float
    remaining: float
    currency: CurrencyType
    exchange_rate: float
    payment_items: Optional[List[PaymentItemResponse]] = None
    entity_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

# ──────────────────────────────────────────────
# Interest schemas
# ──────────────────────────────────────────────
class CheckInterestPreviewRequest(BaseModel):
    receipt_date: datetime
    checks: List[PaymentItemCreate]
    monthly_rate: float = 0.0

class CheckInterestItemResponse(BaseModel):
    id: Optional[str] = None
    reference_number: str
    due_date: datetime
    amount: float
    days: int
    interest_amount: float

class CheckInterestPreviewResponse(BaseModel):
    items: List[CheckInterestItemResponse]
    total_interest: float
    monthly_rate: float

class CheckInterestConfirmRequest(BaseModel):
    receipt_id: str
    monthly_rate: float
    interest_amount: float
    notes: Optional[str] = None
