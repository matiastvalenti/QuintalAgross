from datetime import datetime, date
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, Field, model_validator

class FundInput(BaseModel):
    request_key: str = Field(min_length=8,max_length=100)
    entity_id: str
    kind: Literal['ADVANCE','RETURN','REIMBURSE','FX']
    currency: Literal['ARS','USD']
    amount: Decimal = Field(gt=0,max_digits=18,decimal_places=2)
    exchange_rate: Decimal = Field(gt=0,max_digits=18,decimal_places=6)
    date: datetime
    description: str = Field(min_length=1,max_length=500)
    treasury_account: str | None = None
    payment_method: Literal['CASH','TRANSFER'] = 'TRANSFER'
    cost_center: Literal[1,2] = 1

class AccessInput(BaseModel):
    entity_id: str | None = None


class CutInput(BaseModel):
    cutoff_date: date
    reason: str = Field(min_length=3,max_length=1000)

class CutResolution(BaseModel):
    note: str = Field(min_length=3,max_length=1000)
