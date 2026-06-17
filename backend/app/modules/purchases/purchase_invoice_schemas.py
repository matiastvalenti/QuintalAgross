from pydantic import BaseModel, Field
from typing import List, Optional, Union
from datetime import datetime
from decimal import Decimal

class AISupplier(BaseModel):
    name: Optional[str] = None
    cuit: Optional[str] = None
    iva_condition: Optional[str] = None
    address: Optional[str] = None

class AITotals(BaseModel):
    net: Optional[float] = None
    vat_10_5: Optional[float] = 0
    vat_21: Optional[float] = 0
    vat_27: Optional[float] = 0
    perception_vat: Optional[float] = 0
    perception_iibb: Optional[float] = 0
    other_taxes: Optional[float] = 0
    total: Optional[float] = None

class AIInvoice(BaseModel):
    invoice_type: Optional[str] = None
    point_of_sale: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    currency: Optional[str] = "ARS"
    exchange_rate: Optional[float] = 1.0
    cae: Optional[str] = None
    cae_due_date: Optional[str] = None
    payment_terms: Optional[str] = None
    due_date: Optional[str] = None
    totals: Optional[AITotals] = None

class AIPresentation(BaseModel):
    envase: Optional[str] = None
    unidad: Optional[str] = None
    capacidad: Optional[float] = None

class AICandidate(BaseModel):
    id: str
    name: str
    confidence: Optional[float] = None
    reason: Optional[str] = None
    container_size: Optional[str] = None

class AIItem(BaseModel):
    line_no: int
    raw_description: str
    supplier_item_code: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    unit_price: Optional[float] = None
    line_subtotal: Optional[float] = None
    vat_rate: Optional[float] = None
    matched_product_id: Optional[str] = None
    matched_product_name: Optional[str] = None
    match_confidence: float
    match_reason: Optional[str] = None
    presentation: Optional[AIPresentation] = None
    candidate_products: List[AICandidate] = []  # Productos candidatos para selección manual
    candidates: List[AICandidate] = []
    needs_review: bool = False
    calculated_fields: List[str] = []

class AIPurchaseInvoiceLoader(BaseModel):
    document_type: str = "purchase_invoice"
    supplier: AISupplier
    invoice: AIInvoice
    items: List[AIItem]
    warnings: List[str] = []
