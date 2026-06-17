from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Enum, Integer, Text, Boolean, Numeric
from sqlalchemy.orm import relationship
import enum
from datetime import datetime
from app.db.session import Base
from app.db.models.models import generate_uuid

class Farm(Base):
    """Establecimientos / Campos"""
    __tablename__ = "farms"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    location = Column(String)
    province_id = Column(Integer, ForeignKey("provinces.id"), nullable=True)
    locality_id = Column(Integer, ForeignKey("localities.id"), nullable=True)
    total_hectares = Column(Numeric(15, 2), default=0)
    ownership_type = Column(String) # PROPIO, ARRENDADO
    active = Column(Boolean, default=True)

    lots = relationship("Lot", back_populates="farm", cascade="all, delete-orphan")
    province = relationship("Province")
    locality = relationship("Locality")

class Lot(Base):
    """Lotes dentro de un establecimiento"""
    __tablename__ = "lots"

    id = Column(String, primary_key=True, default=generate_uuid)
    farm_id = Column(String, ForeignKey("farms.id"), nullable=False)
    name = Column(String, nullable=False)
    hectares = Column(Numeric(15, 2), default=0)
    soil_type = Column(String)
    active = Column(Boolean, default=True)

    farm = relationship("Farm", back_populates="lots")
    activities = relationship("FieldActivity", back_populates="lot")

class FieldActivity(Base):
    """Actividad agrícola en un lote para una campaña (Ej: Siembra de Soja en Lote 1, 23/24)"""
    __tablename__ = "field_activities"

    id = Column(String, primary_key=True, default=generate_uuid)
    lot_id = Column(String, ForeignKey("lots.id"), nullable=False)
    harvest_id = Column(String, ForeignKey("harvests.id"), nullable=False)
    grain_type_id = Column(String, ForeignKey("grain_types.id"), nullable=True) # El cultivo
    
    status = Column(String, default="PLANNING") # PLANNING, IN_PROGRESS, COMPLETED
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    estimated_yield = Column(Numeric(15, 2)) # Rinde estimado (kg/ha)
    actual_yield = Column(Numeric(15, 2)) # Rinde real obtenido
    
    observations = Column(Text)

    lot = relationship("Lot", back_populates="activities")
    harvest = relationship("Harvest")
    grain_type = relationship("GrainType")
    usages = relationship("FieldInputUsage", back_populates="activity")

class FieldInputUsage(Base):
    """Consumo de insumos (Semillas, Químicos, Combustible) en una actividad"""
    __tablename__ = "field_input_usages"

    id = Column(String, primary_key=True, default=generate_uuid)
    activity_id = Column(String, ForeignKey("field_activities.id"), nullable=False)
    product_id = Column(String, ForeignKey("products.id"), nullable=True) # Referencia al maestro de productos
    
    date = Column(DateTime, default=datetime.utcnow)
    quantity = Column(Numeric(15, 2), default=0)
    unit_price = Column(Numeric(15, 2), default=0) # Para costeo
    total_cost = Column(Numeric(15, 2), default=0)
    
    machinery_id = Column(String, ForeignKey("machinery.id"), nullable=True) # Maquinaria usada
    
    activity = relationship("FieldActivity", back_populates="usages")
    product = relationship("Product")
    machinery = relationship("Machinery")

class Machinery(Base):
    """Activos de maquinaria"""
    __tablename__ = "machinery"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    brand = Column(String)
    model = Column(String)
    serial_number = Column(String)
    type = Column(String) # TRACTOR, COSECHADORA, PULVERIZADORA, etc.
    purchase_date = Column(DateTime)
    active = Column(Boolean, default=True)
