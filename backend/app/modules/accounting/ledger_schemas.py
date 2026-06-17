from pydantic import BaseModel, ConfigDict
from typing import Optional, List

class AccountBase(BaseModel):
    code: str
    name: str
    active: bool = True

class AccountCreate(AccountBase):
    pass

class AccountUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    active: Optional[bool] = None

class AccountResponse(AccountBase):
    id: str
    model_config = ConfigDict(from_attributes=True)
