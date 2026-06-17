from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ConfigBase(BaseModel):
    name: str
    active: bool = True
    account_code: Optional[str] = None
    tax_id: Optional[str] = None

class ConfigCreate(ConfigBase):
    pass

class ConfigUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None
    account_code: Optional[str] = None
    tax_id: Optional[str] = None

class ConfigResponse(ConfigBase):
    id: str
    class Config:
        from_attributes = True

class BusinessUnitResponse(ConfigResponse):
    account_code: Optional[str] = None

class CampaignResponse(ConfigResponse):
    pass

class BankResponse(ConfigResponse):
    pass

class PDFConfigUpdate(BaseModel):
    positions: dict

class PDFConfigResponse(BaseModel):
    config_key: str
    positions: dict
    updated_at: datetime
    class Config:
        from_attributes = True
