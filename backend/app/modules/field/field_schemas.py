from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

# --- FARMS ---
class FarmBase(BaseModel):
    name: str
    location: Optional[str] = None
    province_id: Optional[int] = None
    locality_id: Optional[int] = None
    total_hectares: Decimal = Decimal('0')
    ownership_type: Optional[str] = None # PROPIO, ARRENDADO

class FarmCreate(FarmBase):
    pass

class FarmSchema(FarmBase):
    id: str
    active: bool
    model_config = {
        "from_attributes": True
    }

# --- LOTS ---
class LotBase(BaseModel):
    farm_id: str
    name: str
    hectares: Decimal = Decimal('0')
    soil_type: Optional[str] = None

class LotCreate(LotBase):
    pass

class LotSchema(LotBase):
    id: str
    active: bool
    model_config = {
        "from_attributes": True
    }

# --- MACHINERY ---
class MachineryBase(BaseModel):
    name: str
    brand: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    type: Optional[str] = None
    purchase_date: Optional[datetime] = None

class MachineryCreate(MachineryBase):
    pass

class MachinerySchema(MachineryBase):
    id: str
    active: bool
    model_config = {
        "from_attributes": True
    }

# --- FIELD ACTIVITIES ---
class FieldActivityBase(BaseModel):
    lot_id: str
    harvest_id: str
    grain_type_id: Optional[str] = None
    status: str = "PLANNING"
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    estimated_yield: Optional[Decimal] = None
    actual_yield: Optional[Decimal] = None
    observations: Optional[str] = None

class FieldActivityCreate(FieldActivityBase):
    pass

class FieldActivitySchema(FieldActivityBase):
    id: str
    model_config = {
        "from_attributes": True
    }

# --- INPUT USAGES ---
class FieldInputUsageBase(BaseModel):
    activity_id: str
    product_id: Optional[str] = None
    date: datetime
    quantity: Decimal = Decimal('0')
    unit_price: Decimal = Decimal('0')
    total_cost: Decimal = Decimal('0')
    machinery_id: Optional[str] = None

class FieldInputUsageCreate(FieldInputUsageBase):
    pass

class FieldInputUsageSchema(FieldInputUsageBase):
    id: str
    model_config = {
        "from_attributes": True
    }
