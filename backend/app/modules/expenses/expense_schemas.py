from pydantic import BaseModel, Field, ConfigDict, model_validator
from datetime import datetime
from typing import List, Optional, Literal
from enum import Enum

class ExpenseClaimStatus(str, Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REIMBURSED = "REIMBURSED"
    REJECTED = "REJECTED"

class ExpenseItemBase(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    date: datetime
    description: str
    category: Optional[str] = None
    amount: float = Field(ge=0)
    vat_rate: float = Field(default=0.21,ge=0,le=1)
    vat_amount: float = Field(default=0,ge=0)
    net_amount: float = Field(default=0,ge=0)
    line: str = "A" # A, B, C, etc
    
    # Additional taxes
    iibb_perception: float = Field(default=0,ge=0)
    iva_perception: float = Field(default=0,ge=0)
    ganancias_perception: float = Field(default=0,ge=0)
    municipal_tax: float = Field(default=0,ge=0)
    other_taxes: float = Field(default=0,ge=0)
    
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
    authorization_reason: Optional[str] = None
    authorized_by: Optional[str] = None
    authorized_name: Optional[str] = None
    authorized_at: Optional[datetime] = None
    vehicle_ids: List[str] = []
    
    model_config = {
        "from_attributes": True
    }

class ExpenseClaimBase(BaseModel):
    currency: Literal['ARS','USD'] = 'ARS'
    exchange_rate: float = Field(default=1,gt=0,allow_inf_nan=False)

    @model_validator(mode='after')
    def valid_rate(self):
        if self.currency == 'ARS': self.exchange_rate = 1
        elif 'exchange_rate' not in self.model_fields_set:
            raise ValueError('Indique el tipo de cambio de la rendición en USD.')
        return self

    entity_id: str
    title: str
    date: datetime
    notes: Optional[str] = None
    unidad_negocio: Optional[str] = None
    campana: Optional[str] = None
    por_cta_orden: bool = False
    cost_center: Literal[1,2] = 1

class ExpenseClaimCreate(ExpenseClaimBase):
    items: List[ExpenseItemCreate] = []

class ExpenseClaimResponse(ExpenseClaimBase):
    id: str
    status: ExpenseClaimStatus
    total_amount: float
    created_at: datetime
    updated_at: datetime
    
    review_note: Optional[str] = None
    employee_name: Optional[str] = None
    items: List[ExpenseItemResponse] = []
    
    model_config = {
        "from_attributes": True
    }


class ReceiptException(BaseModel):
    item_id: str
    reason: str = Field(min_length=3,max_length=1000)

class ExpenseApproval(BaseModel):
    without_receipts: List[ReceiptException] = Field(default_factory=list,max_length=100)
