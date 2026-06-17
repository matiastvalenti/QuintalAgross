"""Schemas Pydantic para el módulo de productos."""
from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional
from enum import Enum


# ── Catalogs ──
class Unit(BaseModel):
    id: str
    name: str
    short_name: str
    model_config = ConfigDict(from_attributes=True)

class Container(BaseModel):
    id: str
    name: str
    capacity: float
    unit_id: str
    unit: Optional[Unit] = None
    model_config = ConfigDict(from_attributes=True)

class TaxType(BaseModel):
    id: str
    name: str
    rate: float
    active: bool
    account_code: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)
    
class Category(BaseModel):
    id: str
    name: str
    active: bool
    model_config = ConfigDict(from_attributes=True)

class SubCategory(BaseModel):
    id: str
    category_id: str
    name: str
    active: bool
    category: Optional[Category] = None
    model_config = ConfigDict(from_attributes=True)

class CategoryCreate(BaseModel):
    name: str
    active: bool = True

class SubCategoryCreate(BaseModel):
    name: str
    active: bool = True


# ── Create ──
class ProductCreate(BaseModel):
    name: str
    sku: Optional[str] = None
    
    # New FKs
    subcategory_id: str
    container_id: Optional[str] = None
    tax_type_id: str
    
    quantity_per_container: float = 1.0
    unit_of_measure: Optional[str] = None
    cost_price: float = 0.0
    active_principle: Optional[str] = None
    concentration: Optional[str] = None

    # Accounting
    sales_account_id: Optional[str] = None
    purchase_account_id: Optional[str] = None
    stock_account_id: Optional[str] = None
    
    is_service: bool = False
    active: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        v = v.strip()
        if len(v) < 2:
            raise ValueError("El nombre debe tener al menos 2 caracteres")
        return v


# ── Update (parcial) ──
class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    subcategory_id: Optional[str] = None
    container_id: Optional[str] = None
    tax_type_id: Optional[str] = None
    quantity_per_container: Optional[float] = None
    unit_of_measure: Optional[str] = None
    cost_price: Optional[float] = None
    active_principle: Optional[str] = None
    concentration: Optional[str] = None
    
    sales_account_id: Optional[str] = None
    purchase_account_id: Optional[str] = None
    stock_account_id: Optional[str] = None
    is_service: Optional[bool] = None
    active: Optional[bool] = None


# ── Response ──
class ProductResponse(BaseModel):
    id: str
    name: str
    sku: Optional[str] = None
    
    subcategory_id: Optional[str] = None
    subcategory: Optional[SubCategory] = None
    
    container_id: Optional[str] = None
    container: Optional[Container] = None
    quantity_per_container: float
    unit_of_measure: Optional[str] = None
    cost_price: float = 0.0
    
    tax_type_id: Optional[str] = None
    tax_type: Optional[TaxType] = None
    
    active_principle: Optional[str] = None
    concentration: Optional[str] = None

    sales_account_id: Optional[str] = None
    purchase_account_id: Optional[str] = None
    stock_account_id: Optional[str] = None
    is_service: bool
    active: bool
    min_stock: float = 0.0

    # Stock info (populated in router)
    in_qty: float = 0.0
    out_qty: float = 0.0
    total_stock: float = 0.0
    total_reserved: float = 0.0
    total_available: float = 0.0

    model_config = ConfigDict(from_attributes=True)
