from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional
from enum import Enum

class ExpenseClaimStatus(str, Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REIMBURSED = "REIMBURSED"
    REJECTED = "REJECTED"

class ExpenseItemBase(BaseModel):
    date: datetime
    description: str
    category: Optional[str] = None
    amount: float
    vat_rate: float = 0.21
    vat_amount: float = 0.0
    net_amount: float = 0.0
    line: str = "A" # A, B, C, etc
    
    # Additional taxes
    iibb_perception: float = 0.0
    iva_perception: float = 0.0
    ganancias_perception: float = 0.0
    municipal_tax: float = 0.0
    other_taxes: float = 0.0
    
    account_code: Optional[str] = None
    
    provider_id: Optional[str] = None
    provider_name: Optional[str] = None
    provider_tax_id: Optional[str] = None
    invoice_number: Optional[str] = None
    attachment_url: Optional[str] = None

class ExpenseItemCreate(ExpenseItemBase):
    vehicle_ids: List[str] = []

class ExpenseItemResponse(ExpenseItemBase):
    id: str
    claim_id: str
    generated_doc_id: Optional[str] = None
    vehicle_ids: List[str] = []
    
    model_config = {
        "from_attributes": True
    }

class ExpenseClaimBase(BaseModel):
    entity_id: str
    title: str
    date: datetime
    notes: Optional[str] = None
    unidad_negocio: Optional[str] = None
    campana: Optional[str] = None
    por_cta_orden: bool = False
    cost_center: int = 1

class ExpenseClaimCreate(ExpenseClaimBase):
    items: List[ExpenseItemCreate] = []

class ExpenseClaimResponse(ExpenseClaimBase):
    id: str
    status: ExpenseClaimStatus
    total_amount: float
    created_at: datetime
    updated_at: datetime
    
    employee_name: Optional[str] = None
    items: List[ExpenseItemResponse] = []
    
    model_config = {
        "from_attributes": True
    }
