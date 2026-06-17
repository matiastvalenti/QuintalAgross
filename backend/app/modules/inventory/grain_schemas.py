from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

class GrainTypeBase(BaseModel):
    name: str
    short_name: str
    active: bool = True

class GrainTypeSchema(GrainTypeBase):
    id: str
    model_config = {
        "from_attributes": True
    }

class HarvestBase(BaseModel):
    name: str
    is_current: bool = False

class HarvestSchema(HarvestBase):
    id: str
    model_config = {
        "from_attributes": True
    }

# ─── CONTRACTS ───
class GrainContractBase(BaseModel):
    number: str
    entity_id: str
    grain_type_id: str
    harvest_id: str
    date: datetime
    type: str # PURCHASE, SALE
    total_kilos: Decimal
    price_per_ton: Optional[Decimal] = None
    currency: str = "USD"
    cost_center: Optional[int] = 1
    observations: Optional[str] = None

class GrainContractCreate(GrainContractBase):
    pass

class GrainContractSchema(GrainContractBase):
    id: str
    delivered_kilos: Decimal
    status: str
    entity_name: Optional[str] = None
    grain_name: Optional[str] = None
    harvest_name: Optional[str] = None
    
    model_config = {
        "from_attributes": True
    }

class GrainMovementBase(BaseModel):
    entity_id: str
    grain_type_id: str
    harvest_id: str
    date: datetime
    type: str # ENTRY, EXIT
    gross_kilos: Decimal = Decimal('0')
    tare_kilos: Decimal = Decimal('0')
    net_kilos: Decimal = Decimal('0')
    discount_pct: Decimal = Decimal('0')
    clean_kilos: Decimal = Decimal('0')
    cpe_number: Optional[str] = None
    ticket_number: Optional[str] = None
    observations: Optional[str] = None
    contract_id: Optional[str] = None
    cost_center: Optional[int] = 1

class GrainMovementCreate(GrainMovementBase):
    pass

class GrainMovementSchema(GrainMovementBase):
    id: str
    entity_name: Optional[str] = None
    grain_name: Optional[str] = None
    harvest_name: Optional[str] = None
    contract_number: Optional[str] = None
    model_config = {
        "from_attributes": True
    }

# ─── SETTLEMENT ITEMS & TAXES ───
class GrainSettlementItemBase(BaseModel):
    line_type: str # DEBIT / CREDIT
    activity: Optional[str] = None
    movement: Optional[str] = None
    account_code: Optional[str] = None
    description: str
    quantity: Decimal = Decimal('0')
    unit_price: Decimal = Decimal('0')
    subtotal: Decimal = Decimal('0')
    vat_rate: Decimal = Decimal('0')
    vat_amount: Decimal = Decimal('0')
    total_amount: Decimal = Decimal('0')

class GrainSettlementItemSchema(GrainSettlementItemBase):
    id: str
    model_config = {
        "from_attributes": True
    }

class GrainSettlementTaxBase(BaseModel):
    tax_type: str # PERCEPTION / RETENTION / EXPENSE
    category: str
    jurisdiction: Optional[str] = None
    base_amount: Decimal = Decimal('0')
    rate: Decimal = Decimal('0')
    amount: Decimal = Decimal('0')

class GrainSettlementTaxSchema(GrainSettlementTaxBase):
    id: str
    model_config = {
        "from_attributes": True
    }

# ─── SETTLEMENTS ───
class GrainSettlementBase(BaseModel):
    entity_id: str
    broker_id: Optional[str] = None
    grain_type_id: str
    harvest_id: str
    number: str
    date: datetime
    input_date: Optional[datetime] = None
    
    settlement_type: str = "PRIMARY"
    operation_type: str = "PURCHASE"
    
    # Header fields
    coe_number: Optional[str] = None
    cost_center: Optional[int] = 1
    business_unit: Optional[str] = None
    sisa_status: Optional[str] = None
    price_pacted: Optional[Decimal] = None
    grade: Optional[str] = None
    grade_value: Optional[Decimal] = None
    factor: Optional[Decimal] = None
    contract_number: Optional[str] = None
    jurisdiction_origin: Optional[str] = None
    jurisdiction_destination: Optional[str] = None
    
    total_kilos: Decimal
    price_per_ton: Decimal
    currency: str = "USD"
    exchange_rate: Decimal = Decimal('1.0')
    
    gross_amount: Optional[Decimal] = Decimal('0')
    vat_amount: Optional[Decimal] = Decimal('0')
    perceptions_amount: Optional[Decimal] = Decimal('0')
    retentions_amount: Optional[Decimal] = Decimal('0')
    expenses_amount: Optional[Decimal] = Decimal('0')
    adjustments_amount: Optional[Decimal] = Decimal('0')
    
    net_amount: Optional[Decimal] = Decimal('0')
    observations: Optional[str] = None
    
    # Commissions support
    salesperson_id: Optional[str] = None
    vendedor: Optional[str] = None

class GrainSettlementCreate(GrainSettlementBase):
    items: List[GrainSettlementItemBase] = []
    taxes: List[GrainSettlementTaxBase] = []
    movement_ids: Optional[List[str]] = []

class GrainSettlementSchema(GrainSettlementBase):
    id: str
    status: str
    entity_name: Optional[str] = None
    broker_name: Optional[str] = None
    grain_name: Optional[str] = None
    
    items: List[GrainSettlementItemSchema] = []
    taxes: List[GrainSettlementTaxSchema] = []
    
    model_config = {
        "from_attributes": True
    }
