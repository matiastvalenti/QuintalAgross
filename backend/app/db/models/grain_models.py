from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Enum, Integer, Text, Boolean, Numeric
from sqlalchemy.orm import relationship
import enum
from datetime import datetime
from app.db.session import Base
from app.db.models.models import generate_uuid

class GrainType(Base):
    """Tipos de granos (Soja, Maíz, Trigo, etc.)"""
    __tablename__ = "grain_types"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, unique=True) # Soja
    short_name = Column(String, nullable=False) # SOJ
    active = Column(Boolean, default=True)

class Harvest(Base):
    """Campañas (Ej: 23/24)"""
    __tablename__ = "harvests"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, unique=True) # 23/24
    is_current = Column(Boolean, default=False)

class GrainMovementType(str, enum.Enum):
    ENTRY = "ENTRY"
    EXIT = "EXIT"

class SettlementType(str, enum.Enum):
    PRIMARY = "PRIMARY"     # Compra de granos (generalmente)
    SECONDARY = "SECONDARY" # Venta de granos (generalmente)

class OperationType(str, enum.Enum):
    PURCHASE = "PURCHASE"
    SALE = "SALE"

class GrainContract(Base):
    """Contratos de compra o venta de granos."""
    __tablename__ = "grain_contracts"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    number = Column(String, nullable=False, unique=True)
    entity_id = Column(String, ForeignKey("entities.id"), nullable=False)
    grain_type_id = Column(String, ForeignKey("grain_types.id"), nullable=False)
    harvest_id = Column(String, ForeignKey("harvests.id"), nullable=False)
    
    date = Column(DateTime, default=datetime.utcnow)
    type = Column(Enum(OperationType), nullable=False)
    
    total_kilos = Column(Numeric(15, 2), nullable=False)
    delivered_kilos = Column(Numeric(15, 2), default=0) # Kilos ya entregados/recibidos
    
    price_per_ton = Column(Numeric(15, 2))
    currency = Column(String, default="USD")
    
    cost_center = Column(Integer, default=1) # 1 ARCA, 2 Interno
    observations = Column(Text)
    status = Column(String, default="OPEN") # OPEN, CLOSED, CANCELLED
    
    # Relationships
    entity = relationship("Entity")
    grain_type = relationship("GrainType")
    harvest = relationship("Harvest")
    movements = relationship("GrainMovement", back_populates="contract")

class GrainMovement(Base):
    """
    Movimiento de grano (Sin Balanza). 
    Puede ser registro de CPe, Certificado de Depósito, etc.
    """
    __tablename__ = "grain_movements"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    entity_id = Column(String, ForeignKey("entities.id"), nullable=False)
    grain_type_id = Column(String, ForeignKey("grain_types.id"), nullable=False)
    harvest_id = Column(String, ForeignKey("harvests.id"), nullable=False)
    contract_id = Column(String, ForeignKey("grain_contracts.id"), nullable=True)
    
    date = Column(DateTime, default=datetime.utcnow)
    type = Column(Enum(GrainMovementType), nullable=False)
    
    gross_kilos = Column(Numeric(15, 2), default=0)
    tare_kilos = Column(Numeric(15, 2), default=0)
    net_kilos = Column(Numeric(15, 2), default=0)
    
    # Descuentos (Humedad, Zaranda, etc)
    discount_pct = Column(Numeric(5, 2), default=0)
    clean_kilos = Column(Numeric(15, 2), default=0)
    
    cpe_number = Column(String) # Carta de Porte
    ticket_number = Column(String) # Ticket externo
    
    observations = Column(Text)
    settled = Column(Boolean, default=False) # Si ya fue liquidado
    settlement_id = Column(String, ForeignKey("grain_settlements.id"), nullable=True)
    cost_center = Column(Integer, default=1) # 1 ARCA, 2 Interno
    
    # Relationships
    entity = relationship("Entity")
    grain_type = relationship("GrainType")
    harvest = relationship("Harvest")
    contract = relationship("GrainContract", back_populates="movements")

class GrainSettlement(Base):
    """
    Liquidación de Granos (LPG) - Estructura Completa SinAgro.
    """
    __tablename__ = "grain_settlements"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    entity_id = Column(String, ForeignKey("entities.id"), nullable=False)
    broker_id = Column(String, ForeignKey("entities.id"), nullable=True) # Corredora
    grain_type_id = Column(String, ForeignKey("grain_types.id"), nullable=False)
    harvest_id = Column(String, ForeignKey("harvests.id"), nullable=False)
    
    number = Column(String, nullable=False, unique=True)
    date = Column(DateTime, default=datetime.utcnow) # Fecha Comprobante
    input_date = Column(DateTime, default=datetime.utcnow) # Fecha Imputacion
    
    settlement_type = Column(Enum(SettlementType), default=SettlementType.PRIMARY)
    operation_type = Column(Enum(OperationType), default=OperationType.PURCHASE)
    
    # Header fields from SinAgro
    coe_number = Column(String)
    cost_center = Column(Integer, default=1)
    business_unit = Column(String)
    sisa_status = Column(String) # SISA
    price_pacted = Column(Numeric(15, 2))
    grade = Column(String)
    grade_value = Column(Numeric(15, 2))
    factor = Column(Numeric(5, 2))
    contract_number = Column(String)
    jurisdiction_origin = Column(String)
    jurisdiction_destination = Column(String)
    
    # Financial Totals
    total_kilos = Column(Numeric(15, 2), nullable=False)
    price_per_ton = Column(Numeric(15, 2), nullable=False)
    currency = Column(String, default="USD")
    exchange_rate = Column(Numeric(15, 2), default=1.0)
    
    gross_amount = Column(Numeric(15, 2))
    vat_amount = Column(Numeric(15, 2), default=0)
    perceptions_amount = Column(Numeric(15, 2), default=0)
    retentions_amount = Column(Numeric(15, 2), default=0)
    expenses_amount = Column(Numeric(15, 2), default=0)
    adjustments_amount = Column(Numeric(15, 2), default=0)
    
    net_amount = Column(Numeric(15, 2)) # Total Liquido / A Cobrar o Pagar
    
    observations = Column(Text)
    status = Column(String, default="OPEN")
    
    # Internal salesperson for commissions
    salesperson_id = Column(String, ForeignKey("entities.id"), nullable=True)
    vendedor = Column(String) # Virtual or fallback name
    
    # Link to Document (CC)
    document_id = Column(String, ForeignKey("documents.id"))
    
    # Relationships
    entity = relationship("Entity", foreign_keys=[entity_id])
    broker = relationship("Entity", foreign_keys=[broker_id])
    grain_type = relationship("GrainType")
    harvest = relationship("Harvest")
    document = relationship("Document", back_populates="grain_settlement")
    
    items = relationship("GrainSettlementItem", back_populates="settlement", cascade="all, delete-orphan")
    taxes = relationship("GrainSettlementTax", back_populates="settlement", cascade="all, delete-orphan")
    movements = relationship("GrainMovement", foreign_keys="[GrainMovement.settlement_id]")

class GrainSettlementItem(Base):
    """Renglones de la Liquidación (Débitos/Créditos)"""
    __tablename__ = "grain_settlement_items"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    settlement_id = Column(String, ForeignKey("grain_settlements.id"), nullable=False)
    
    line_type = Column(String) # DEBIT / CREDIT
    activity = Column(String)
    movement = Column(String) # Ej: Fisico
    account_code = Column(String)
    description = Column(String)
    
    quantity = Column(Numeric(15, 2), default=0)
    unit_price = Column(Numeric(15, 2), default=0)
    subtotal = Column(Numeric(15, 2), default=0)
    vat_rate = Column(Numeric(5, 2), default=0) # 10.5, 21, etc
    vat_amount = Column(Numeric(15, 2), default=0)
    total_amount = Column(Numeric(15, 2), default=0)
    
    settlement = relationship("GrainSettlement", back_populates="items")

class GrainSettlementTax(Base):
    """Impuestos, Retenciones y Percepciones de la LPG"""
    __tablename__ = "grain_settlement_taxes"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    settlement_id = Column(String, ForeignKey("grain_settlements.id"), nullable=False)
    
    tax_type = Column(String) # PERCEPTION / RETENTION / EXPENSE
    category = Column(String) # Ej: IVA, Ganancias, Sellos
    jurisdiction = Column(String) # Ej: Buenos Aires
    base_amount = Column(Numeric(15, 2), default=0)
    rate = Column(Numeric(5, 2), default=0)
    amount = Column(Numeric(15, 2), default=0)
    
    settlement = relationship("GrainSettlement", back_populates="taxes")
