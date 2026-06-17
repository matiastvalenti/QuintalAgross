from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class PosDocumentConfigBase(BaseModel):
    document_type: str
    last_number: int = 0

class PosDocumentConfigCreate(PosDocumentConfigBase):
    pass

class PosDocumentConfigResponse(PosDocumentConfigBase):
    id: str
    pos_id: str

    class Config:
        from_attributes = True

class PointOfSaleBase(BaseModel):
    pv: str
    name: str
    active: bool = True

class PointOfSaleCreate(PointOfSaleBase):
    document_configs: List[PosDocumentConfigCreate] = []

class PointOfSaleUpdate(BaseModel):
    pv: Optional[str] = None
    name: Optional[str] = None
    active: Optional[bool] = None
    document_configs: Optional[List[PosDocumentConfigCreate]] = None

class PointOfSaleResponse(PointOfSaleBase):
    id: str
    document_configs: List[PosDocumentConfigResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
