from pydantic import BaseModel, ConfigDict
from typing import Optional

class SaleConditionBase(BaseModel):
    description: str
    due_days: int = 0
    interest_rate: float = 0.0
    financing_rate: float = 0.0
    active: bool = True

class SaleConditionCreate(SaleConditionBase):
    pass

class SaleConditionUpdate(BaseModel):
    description: Optional[str] = None
    due_days: Optional[int] = None
    interest_rate: Optional[float] = None
    financing_rate: Optional[float] = None
    active: Optional[bool] = None

class SaleCondition(SaleConditionBase):
    id: str
    model_config = ConfigDict(from_attributes=True)
