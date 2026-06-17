from sqlalchemy import Column, Integer, String, Date, DateTime, Boolean, Numeric, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base
from app.db.models.models import Entity, Document

class Cheque(Base):
    __tablename__ = "cheques"
    __table_args__ = (
        UniqueConstraint("banco", "nro_cheque", "cuit_emisor", name="uq_cheque_key"),
        Index("ix_cheques_estado", "estado"),
        Index("ix_cheques_f_pago", "f_pago"),
        Index("ix_cheques_banco", "banco"),
        Index("ix_cheques_estado_fpago", "estado", "f_pago"),
    )

    id = Column(Integer, primary_key=True, index=True)
    
    # Traceability
    entity_id = Column(String, ForeignKey("entities.id"), nullable=True, index=True) # El cliente que lo entrego
    source_document_id = Column(String, ForeignKey("documents.id"), nullable=True, index=True) # El recibo de origen
    
    endorsee_id = Column(String, ForeignKey("entities.id"), nullable=True, index=True) # A quien se endoso (Proveedor)
    endorsement_date = Column(DateTime, nullable=True)

    banco = Column(String, nullable=False)
    nro_cheque = Column(String, nullable=False)
    tipo = Column(String, nullable=True)

    importe = Column(Numeric(14, 2), nullable=True)
    moneda = Column(String, nullable=True) # ARS, USD

    f_pago = Column(Date, nullable=True) # Fecha de cobro/pago (diferido)
    f_movimiento = Column(Date, nullable=True)
    movimiento = Column(String, nullable=True)

    cliente_dador = Column(String, nullable=True) # Texto legacy/manual
    cuit_emisor = Column(String, nullable=False, default="")
    beneficiario = Column(String, nullable=True)
    
    entregado_a = Column(String, nullable=True) # Texto legacy
    fecha_entrega = Column(Date, nullable=True)
    nro_orden_pago = Column(String, nullable=True)

    rechazado = Column(Boolean, nullable=False, default=False)
    nd_realizada = Column(Boolean, nullable=False, default=False)
    nd_diferida = Column(Boolean, nullable=False, default=False)  # ND postergada para el futuro
    nd_diferida_notas = Column(String, nullable=True)

    f_vencimiento = Column(Date, nullable=True)

    estado = Column(String, nullable=False, default="EN_CARTERA") # EN_CARTERA, DEPOSITADO, ENDOSADO, RECHAZADO, COBRADO

    notas = Column(String, nullable=True)
    cost_center = Column(Integer, default=1) # 1 ARCA, 2 Interno

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    entity = relationship("Entity", foreign_keys=[entity_id])
    endorsee = relationship("Entity", foreign_keys=[endorsee_id])
    source_document = relationship("Document", foreign_keys=[source_document_id])

    alerts = relationship("AlertLog", back_populates="cheque", cascade="all, delete-orphan")
    attachments = relationship("Attachment", back_populates="cheque", cascade="all, delete-orphan")

class Attachment(Base):
    __tablename__ = "attachments"
    id = Column(Integer, primary_key=True, index=True)
    cheque_id = Column(Integer, ForeignKey("cheques.id"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_type = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)
    uploaded_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    cheque = relationship("Cheque", back_populates="attachments")

class AlertLog(Base):
    __tablename__ = "alert_logs"
    id = Column(Integer, primary_key=True, index=True)
    cheque_id = Column(Integer, ForeignKey("cheques.id"), nullable=False, index=True)
    alert_type = Column(String, nullable=False)
    scheduled_for = Column(Date, nullable=False)
    sent_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    cheque = relationship("Cheque", back_populates="alerts")
