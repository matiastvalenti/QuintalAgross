from datetime import datetime
from decimal import Decimal
from typing import Literal, Annotated
from pydantic import BaseModel, Field, model_validator

Positive = Annotated[Decimal, Field(gt=0, max_digits=18, decimal_places=6, allow_inf_nan=False)]
Nonnegative = Annotated[Decimal, Field(ge=0, max_digits=18, decimal_places=6, allow_inf_nan=False)]


class WorkInput(BaseModel):
    description: str = Field(min_length=1, max_length=250)
    date: datetime
    entity_id: str
    farm_id: str
    product_id: str
    machinery_id: str | None = None
    vehicle_id: str | None = None
    activity: Literal['DRONE', 'FREIGHT', 'OTHER_SERVICES']
    unit: Literal['HA', 'KM']
    quantity: Positive
    unit_price: Nonnegative
    vat_rate: Annotated[Decimal, Field(ge=0, le=1, decimal_places=4, allow_inf_nan=False)]
    currency: Literal['ARS', 'USD']
    exchange_rate: Positive = Decimal('1')
    cost_center: Literal[1, 2] = 1
    status: Literal['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] = 'PLANNED'
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode='after')
    def equipment(self):
        if not self.machinery_id and not self.vehicle_id:
            raise ValueError('Seleccione un equipo o vehículo')
        if self.currency == 'USD' and 'exchange_rate' not in self.model_fields_set:
            raise ValueError('Indique el tipo de cambio para USD')
        if self.currency == 'ARS':
            self.exchange_rate = Decimal('1')
        return self


class CostInput(BaseModel):
    category: Literal['LABOR', 'FUEL', 'REPAIR', 'OTHER']
    description: str = Field(min_length=1, max_length=250)
    employee_id: str | None = None
    account_id: str
    unit: Literal['H', 'HA', 'KM', 'UNIT']
    quantity: Positive
    unit_cost: Nonnegative
    currency: Literal['ARS', 'USD']
    exchange_rate: Positive = Decimal('1')
    date: datetime

    @model_validator(mode='after')
    def labor(self):
        if self.category == 'LABOR' and (not self.employee_id or self.unit == 'UNIT'):
            raise ValueError('Mano de obra requiere empleado y unidad H, HA o KM')
        if self.currency == 'USD' and 'exchange_rate' not in self.model_fields_set:
            raise ValueError('Indique el tipo de cambio para USD')
        if self.currency == 'ARS':
            self.exchange_rate = Decimal('1')
        return self


class BillingItem(BaseModel):
    work_id: str
    quantity: Positive


class InvoiceInput(BaseModel):
    request_key: str = Field(min_length=8, max_length=100)
    items: list[BillingItem] = Field(min_length=1, max_length=100)
    date: datetime
    letter: Literal['A', 'B', 'C', 'M']
    exchange_rate: Positive
    cost_center: Literal[1, 2] = 1
