from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from enum import Enum

class VehicleType(str, Enum):
    TRUCK = "TRUCK"
    VAN = "VAN"
    CAR = "CAR"
    HARVESTER = "HARVESTER"
    PULVERIZER = "PULVERIZER"
    DRONE_AGRAS = "DRONE_AGRAS"
    DRONE_MAVIC = "DRONE_MAVIC"
    OTHER = "OTHER"

class VehicleBase(BaseModel):
    name: str
    plate: Optional[str] = None
    type: VehicleType = VehicleType.OTHER
    driver_name: Optional[str] = None
    driver_id: Optional[str] = None
    active: bool = True
    notes: Optional[str] = None
    insurance_due: Optional[datetime] = None
    vtv_due: Optional[datetime] = None

class VehicleCreate(VehicleBase):
    pass

class VehicleUpdate(BaseModel):
    name: Optional[str] = None
    plate: Optional[str] = None
    type: Optional[VehicleType] = None
    driver_name: Optional[str] = None
    driver_id: Optional[str] = None
    active: Optional[bool] = None
    notes: Optional[str] = None
    insurance_due: Optional[datetime] = None
    vtv_due: Optional[datetime] = None

class VehicleResponse(VehicleBase):
    id: str
    created_at: datetime

    model_config = {
        "from_attributes": True
    }

class DocumentVehicleExpenseBase(BaseModel):
    vehicle_id: str
    amount: float = 0.0
    percentage: float = 100.0
    notes: Optional[str] = None

class DocumentVehicleExpenseResponse(DocumentVehicleExpenseBase):
    id: str
    document_id: str

    model_config = {
        "from_attributes": True
    }
