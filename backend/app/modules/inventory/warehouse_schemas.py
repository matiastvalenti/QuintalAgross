"""Schemas Pydantic para warehouses y stock."""
from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional, List
from enum import Enum


# ── Enums ──
class WarehouseOwnership(str, Enum):
    PROPIO = "PROPIO"
    TERCERO = "TERCERO"

class StockControlMode(str, Enum):
    NONE = "NONE"
    WARNING = "WARNING"
    STRICT = "STRICT"

# ── Warehouse ──
class WarehouseCreate(BaseModel):
    name: str
    code: Optional[str] = None
    address: Optional[str] = None
    active: bool = True
    ownership: WarehouseOwnership = WarehouseOwnership.PROPIO
    low_stock_control: StockControlMode = StockControlMode.WARNING
    no_stock_control: StockControlMode = StockControlMode.STRICT
    account_code: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        v = v.strip()
        if len(v) < 2:
            raise ValueError("El nombre debe tener al menos 2 caracteres")
        return v


class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    address: Optional[str] = None
    active: Optional[bool] = None
    ownership: Optional[WarehouseOwnership] = None
    low_stock_control: Optional[StockControlMode] = None
    no_stock_control: Optional[StockControlMode] = None
    account_code: Optional[str] = None


class WarehouseResponse(BaseModel):
    id: str
    name: str
    code: Optional[str] = None
    address: Optional[str] = None
    active: bool
    ownership: WarehouseOwnership
    low_stock_control: StockControlMode
    no_stock_control: StockControlMode
    account_code: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# ── StockItem ──
class StockItemResponse(BaseModel):
    id: str
    product_id: str
    warehouse_id: str
    qty_on_hand: float
    qty_reserved: float
    product_name: Optional[str] = None
    warehouse_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# ── StockMovement ──
class StockMovementResponse(BaseModel):
    id: str
    stock_item_id: str
    movement_type: str
    qty: float
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    model_config = ConfigDict(from_attributes=True)
