import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Enum, JSON, ForeignKey, Float
from sqlalchemy.orm import relationship
import enum
from datetime import datetime
from app.db.session import Base

def generate_uuid():
    return str(uuid.uuid4())

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    OWNER = "owner"
    OPERATOR = "operator"
    VIEWER = "viewer"

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    roles = Column(JSON, default=["viewer"]) # Array of roles
    permissions = Column(JSON, default={}) # { "sales.view": True, ... }
    active = Column(Boolean, default=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

class Role(Base):
    __tablename__ = "roles"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, unique=True, nullable=False)
    description = Column(String, nullable=True)
    permissions = Column(JSON, default={}) # { "sales": "full", "finance": "none" }
    is_system = Column(Boolean, default=False)

class CashPosition(Base):
    __tablename__ = "cash_positions"

    id = Column(String, primary_key=True, default=generate_uuid)
    date = Column(String, index=True) # YYYY-MM-DD
    opening_balances = Column(JSON) # { "ARS": 100, "USD": 50 }
    closing_balances = Column(JSON, nullable=True)
    
    opened_by = Column(String, nullable=False)
    opened_at = Column(DateTime, default=datetime.utcnow)
    
    closed_by = Column(String, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    
    status = Column(String, default="OPEN") # OPEN, CLOSED

class CashMovement(Base):
    __tablename__ = "cash_movements"

    id = Column(String, primary_key=True, default=generate_uuid)
    cash_position_id = Column(String, ForeignKey("cash_positions.id"), index=True)
    currency = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    source = Column(String) # 'order', 'adjustment', 'expense', etc.
    description = Column(String)
    
    cash_position = relationship("CashPosition", backref="movements")
    
    created_by = Column(String, nullable=True) # User ID (optional)
    created_at = Column(DateTime, default=datetime.utcnow)

class ExchangeRate(Base):
    __tablename__ = "exchange_rates"

    id = Column(String, primary_key=True, default=generate_uuid)
    currency = Column(String, nullable=False) # e.g. "USD"
    buy = Column(Float, nullable=False)
    sell = Column(Float, nullable=False)
    wholesale = Column(Float, nullable=True)
    
    timestamp = Column(DateTime, default=datetime.utcnow)
    changed_by = Column(String, nullable=True)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, index=True)
    username = Column(String)
    action = Column(String) # e.g. "CREATE", "UPDATE", "DELETE", "LOGIN"
    module = Column(String) # e.g. "sales_orders", "users"
    target_id = Column(String, nullable=True) # ID of the affected resource
    description = Column(String) # Human readable detail
    data = Column(JSON, nullable=True) # Optional JSON with changes or context
    ip_address = Column(String, nullable=True)
    
    timestamp = Column(DateTime, default=datetime.utcnow)
