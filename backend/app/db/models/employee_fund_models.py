"""Employee funds: additive tables, leaving historical documents untouched."""
from datetime import datetime
from sqlalchemy import Column, String, ForeignKey, Numeric, DateTime, Integer, Date
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.db.models.models import generate_uuid

class EmployeeAccess(Base):
    __tablename__ = 'employee_user_access'
    user_id = Column(String, ForeignKey('users.id'), primary_key=True)
    entity_id = Column(String, ForeignKey('entities.id'), nullable=False)

class ClaimFunding(Base):
    __tablename__ = 'expense_claim_funding'
    claim_id = Column(String, ForeignKey('expense_claims.id'), primary_key=True)
    currency = Column(String, nullable=False, default='ARS')
    exchange_rate = Column(Numeric(18,6), nullable=False, default=1)
    review_note = Column(String, nullable=True)
    claim = relationship('ExpenseClaim', backref='funding_records')

class EmployeeFundOperation(Base):
    __tablename__ = 'employee_fund_operations'
    id = Column(String, primary_key=True, default=generate_uuid)
    request_key = Column(String, unique=True, nullable=False)
    payload_hash = Column(String, nullable=False)
    entity_id = Column(String, ForeignKey('entities.id'), nullable=False, index=True)
    kind = Column(String, nullable=False)
    currency = Column(String, nullable=False)
    amount = Column(Numeric(18,2), nullable=False)
    exchange_rate = Column(Numeric(18,6), nullable=False)
    base_amount = Column(Numeric(18,2), nullable=False)
    other_base_amount = Column(Numeric(18,2))
    other_currency = Column(String)
    other_amount = Column(Numeric(18,2))
    date = Column(DateTime, nullable=False)
    description = Column(String, nullable=False)
    claim_id = Column(String, ForeignKey('expense_claims.id'), unique=True)
    journal_id = Column(String, ForeignKey('journal_entries.id'), nullable=False)
    cash_movement_id = Column(String, ForeignKey('cash_movements.id'))
    created_by = Column(String, ForeignKey('users.id'))
    created_at = Column(DateTime, default=datetime.utcnow)

class EmployeeReceiptUpload(Base):
    __tablename__ = 'employee_receipt_uploads'
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey('users.id'), nullable=False)
    mime_type = Column(String, nullable=False)


class EmployeeFundCut(Base):
    __tablename__ = 'employee_fund_cuts'
    id = Column(String, primary_key=True, default=generate_uuid)
    entity_id = Column(String, ForeignKey('entities.id'), nullable=False, index=True)
    cutoff_date = Column(Date, nullable=False)
    reason = Column(String, nullable=False)
    created_by = Column(String, ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime)
    resolved_by = Column(String, ForeignKey('users.id'))
    resolution_note = Column(String)
