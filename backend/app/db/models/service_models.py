"""Customer service work; reuse farms, entities, machinery and vehicles."""
from datetime import datetime
from sqlalchemy import Column, String, Numeric, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship, backref
from app.db.session import Base
from app.db.models.models import generate_uuid


class ServiceWork(Base):
    __tablename__ = 'service_works'
    id = Column(String, primary_key=True, default=generate_uuid)
    description = Column(String, nullable=False)
    date = Column(DateTime, nullable=False, default=datetime.utcnow)
    entity_id = Column(String, ForeignKey('entities.id'), nullable=False)
    farm_id = Column(String, ForeignKey('farms.id'), nullable=False)
    product_id = Column(String, ForeignKey('products.id'), nullable=False)
    machinery_id = Column(String, ForeignKey('machinery.id'))
    vehicle_id = Column(String, ForeignKey('vehicles.id'))
    activity = Column(String, nullable=False)
    unit = Column(String, nullable=False)
    quantity = Column(Numeric(18, 6), nullable=False)
    unit_price = Column(Numeric(18, 6), nullable=False)
    vat_rate = Column(Numeric(6, 4), nullable=False)
    currency = Column(String, nullable=False)
    exchange_rate = Column(Numeric(18, 6), nullable=False)
    cost_center = Column(Integer, nullable=False, default=1)
    status = Column(String, nullable=False, default='PLANNED')
    revision = Column(Integer, nullable=False, default=0)
    notes = Column(String)
    created_by = Column(String)
    entity = relationship('Entity')
    farm = relationship('Farm')
    product = relationship('Product')
    machinery = relationship('Machinery')
    vehicle = relationship('Vehicle')
    costs = relationship('ServiceWorkCost', back_populates='work', cascade='all, delete-orphan')


class ServiceWorkCost(Base):
    __tablename__ = 'service_work_costs'
    id = Column(String, primary_key=True, default=generate_uuid)
    work_id = Column(String, ForeignKey('service_works.id'), nullable=False, index=True)
    category = Column(String, nullable=False)
    description = Column(String, nullable=False)
    employee_id = Column(String, ForeignKey('entities.id'))
    account_id = Column(String, ForeignKey('accounts.id'), nullable=False)
    unit = Column(String, nullable=False)
    quantity = Column(Numeric(18, 6), nullable=False)
    unit_cost = Column(Numeric(18, 6), nullable=False)
    currency = Column(String, nullable=False)
    exchange_rate = Column(Numeric(18, 6), nullable=False)
    date = Column(DateTime, nullable=False, default=datetime.utcnow)
    work = relationship('ServiceWork', back_populates='costs')
    employee = relationship('Entity')
    account = relationship('Account')


class ServiceWorkBilling(Base):
    __tablename__ = 'service_work_billings'
    id = Column(String, primary_key=True, default=generate_uuid)
    work_id = Column(String, ForeignKey('service_works.id'), nullable=False, index=True)
    document_line_id = Column(String, ForeignKey('document_lines.id'), nullable=False, unique=True)
    quantity = Column(Numeric(18, 6), nullable=False)
    work = relationship('ServiceWork')
    line = relationship('DocumentLine', backref=backref('service_billings', cascade='all, delete-orphan'))


class ServiceInvoiceRequest(Base):
    __tablename__ = 'service_invoice_requests'
    key = Column(String, primary_key=True)
    payload_hash = Column(String, nullable=False)
    document_id = Column(String, ForeignKey('documents.id'), nullable=False)
    document = relationship("Document", backref=backref("service_invoice_requests", cascade="all, delete-orphan"))
