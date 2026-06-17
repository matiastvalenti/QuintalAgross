from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

class StockAdjustmentCreate(BaseModel):
    product_id: str
    warehouse_id: str
    qty: Decimal
    notes: Optional[str] = None
    date: Optional[datetime] = None

class StockTransferCreate(BaseModel):
    product_id: str
    from_warehouse_id: str
    to_warehouse_id: str
    qty: Decimal
    notes: Optional[str] = None
    date: Optional[datetime] = None

# ── Multi-line Movements (Complex) ──

class StockMovementLineCreate(BaseModel):
    product_id: str
    qty: Decimal
    batch: Optional[str] = None
    expiry_date: Optional[datetime] = None
    container_qty: Optional[Decimal] = None
    container_type: Optional[str] = None
    notes: Optional[str] = None

class StockMovementHeaderCreate(BaseModel):
    number: Optional[str] = None
    date: Optional[datetime] = None
    movement_type: str # ADJUSTMENT, TRANSFER, INGRESS, EGRESS
    from_warehouse_id: Optional[str] = None
    to_warehouse_id: Optional[str] = None
    transporter: Optional[str] = None
    driver: Optional[str] = None
    cost_center: Optional[str] = None
    notes: Optional[str] = None
    lines: List[StockMovementLineCreate]

class StockMovementLineResponse(BaseModel):
    id: str
    product_id: str
    product_name: Optional[str] = None
    qty: float
    batch: Optional[str] = None
    expiry_date: Optional[datetime] = None
    container_qty: Optional[float] = None
    container_type: Optional[str] = None
    notes: Optional[str] = None

    model_config = {
        "from_attributes": True
    }

class StockMovementHeaderResponse(BaseModel):
    id: str
    number: Optional[str] = None
    date: datetime
    movement_type: str
    from_warehouse_id: Optional[str] = None
    from_warehouse_name: Optional[str] = None
    to_warehouse_id: Optional[str] = None
    to_warehouse_name: Optional[str] = None
    transporter: Optional[str] = None
    driver: Optional[str] = None
    cost_center: Optional[str] = None
    notes: Optional[str] = None
    status: str
    lines: List[StockMovementLineResponse]

    model_config = {
        "from_attributes": True
    }
