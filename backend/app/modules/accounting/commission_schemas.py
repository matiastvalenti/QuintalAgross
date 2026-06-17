from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class CommissionPaymentCreate(BaseModel):
    seller_id: str
    document_ids: Optional[List[str]] = []
    currency: str
    amount: float
    exchange_rate: Optional[float] = 1.0
    payment_method: Optional[str] = "CASH"
    notes: Optional[str] = None
    original_currency: str

class CommissionPaymentResponse(BaseModel):
    id: str
    salesperson_id: str
    document_id: Optional[str]
    date: datetime
    original_currency: str
    currency: str
    amount: float
    exchange_rate: float
    applied_amount: float
    payment_method: Optional[str]
    notes: Optional[str]

    class Config:
        orm_mode = True
