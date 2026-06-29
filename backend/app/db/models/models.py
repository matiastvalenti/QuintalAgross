import uuid
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Enum, Integer, UniqueConstraint, Boolean, Text, Index, func, column
from sqlalchemy.orm import relationship
import enum
from datetime import datetime
from app.db.session import Base
from app.db.models.auth_models import User, Role

def generate_uuid():
    return str(uuid.uuid4())

class EntityType(str, enum.Enum):
    CLIENT = "client"
    PROVIDER = "provider"
    MIXED = "mixed"
    EMPLOYEE = "employee"

class CurrencyType(str, enum.Enum):
    ARS = "ARS"
    USD = "USD"

class DocumentType(str, enum.Enum):
    INVOICE = "INVOICE"
    FCE_MIPYME = "FCE_MIPYME"
    LIQ_SDAD_PUB = "LIQ_SDAD_PUB"
    OTROS_RG1415 = "OTROS_RG1415"
    OTROS_NO_RG1415 = "OTROS_NO_RG1415"
    RECEIPT = "RECEIPT"
    TIQUET_FACTURA = "TIQUET_FACTURA"
    DEBIT_NOTE = "DEBIT_NOTE"
    CREDIT_NOTE = "CREDIT_NOTE"
    PAYMENT = "PAYMENT"
    PURCHASE_INVOICE = "PURCHASE_INVOICE"
    PURCHASE_DEBIT_NOTE = "PURCHASE_DEBIT_NOTE"
    PURCHASE_CREDIT_NOTE = "PURCHASE_CREDIT_NOTE"
    LPG_PRIMARY = "LPG_PRIMARY"
    LPG_SECONDARY = "LPG_SECONDARY"

class PaymentMethod(str, enum.Enum):
    CASH = "CASH"
    CHECK = "CHECK"
    TRANSFER = "TRANSFER"
    CREDIT_CARD = "CREDIT_CARD"
    RETENTION = "RETENTION"
    DEPOSIT = "DEPOSIT"
    OTHER = "OTHER"

class VehicleType(str, enum.Enum):
    TRACTOR = "TRACTOR"
    TRUCK = "TRUCK"
    PICKUP = "PICKUP"
    PULVERIZER = "PULVERIZER"
    DRONE_AGRAS = "DRONE_AGRAS"
    DRONE_MAVIC = "DRONE_MAVIC"
    OTHER = "OTHER"

class DocumentReasonType(str, enum.Enum):
    RETURN = "RETURN"
    DISCOUNT = "DISCOUNT"
    BILLING_ERROR = "BILLING_ERROR"
    COMMERCIAL_ADJUSTMENT = "COMMERCIAL_ADJUSTMENT"
    INTEREST = "INTEREST"
    EXCHANGE_DIFFERENCE = "EXCHANGE_DIFFERENCE"
    SURCHARGE = "SURCHARGE"
    ADMIN_EXPENSE = "ADMIN_EXPENSE"
    OTHER = "OTHER"

class CommissionMode(str, enum.Enum):
    BY_COLLECTION = "BY_COLLECTION"   # % sobre neto facturado, liberado según cobro
    BY_MARGIN     = "BY_MARGIN"       # % sobre margen (precio - costo) por línea
    BY_CASH       = "BY_CASH"         # % sobre efectivo cobrado

class CommissionExchangeMode(str, enum.Enum):
    INVOICE_RATE    = "INVOICE_RATE"    # TC de la factura
    COLLECTION_RATE = "COLLECTION_RATE" # TC del cobro
    PAYMENT_RATE    = "PAYMENT_RATE"    # TC del día de liquidación

class CommissionApplicationStatus(str, enum.Enum):
    PENDING   = "PENDING"    # Generada pero no disponible (cliente no pagó)
    AVAILABLE = "AVAILABLE"  # Disponible para liquidar
    PARTIAL   = "PARTIAL"    # Parcialmente liquidada
    PAID      = "PAID"       # Totalmente liquidada
    ADVANCED  = "ADVANCED"   # Adelantada (pagada antes del cobro)

class DocumentStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    OPEN = "OPEN"
    PARTIAL = "PARTIAL"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"

class CommissionPayment(Base):
    __tablename__ = "commission_payments"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    # Linked to a Document (Invoice/DN/OV whose commission is being paid)
    document_id = Column(String, ForeignKey("documents.id"), nullable=True)
    delivery_note_id = Column(String, ForeignKey("delivery_notes.id"), nullable=True)
    sales_order_id = Column(String, ForeignKey("sales_orders.id"), nullable=True)
    
    # Linked to the payment document (Receipt/Payment) that paid this commission
    source_document_id = Column(String, ForeignKey("documents.id"), nullable=True)

    salesperson_id = Column(String, ForeignKey("entities.id"), nullable=False)
    
    date = Column(DateTime, default=datetime.utcnow)
    
    # Monedas y montos
    original_currency = Column(String, nullable=True) # ARS o USD (moneda de la comision originaria)
    currency = Column(String, nullable=True) # ARS o USD (moneda en la que se pagó)
    exchange_rate = Column(Float, default=1.0) # TC del día del pago
    amount = Column(Float, default=0.0) # Monto bruto pagado (en 'currency')
    applied_amount = Column(Float, default=0.0) # Monto aplicado a cancelar el pendiente (en 'original_currency')
    
    payment_method = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("Document", foreign_keys=[document_id])
    source_document = relationship("Document", foreign_keys=[source_document_id])
    salesperson = relationship("Entity", foreign_keys=[salesperson_id])
    sales_order = relationship("SalesOrder", foreign_keys=[sales_order_id], primaryjoin="CommissionPayment.sales_order_id == SalesOrder.id")

class ExpenseClaimStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REIMBURSED = "REIMBURSED"
    REJECTED = "REJECTED"

# ──────────────────────────────────────────────
# Entity
# ──────────────────────────────────────────────
class Entity(Base):
    __tablename__ = "entities"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, index=True)
    type = Column(Enum(EntityType), default=EntityType.CLIENT)
    
    # Identificacion
    code = Column(String, unique=True, index=True, nullable=True)
    tax_id = Column(String, index=True, nullable=True) # CUIT
    tax_category = Column(String, nullable=True) # RI, Monotributo, etc
    
    # Contacto
    email = Column(String, index=True, nullable=True)
    phone = Column(String, nullable=True)
    contact_name = Column(String, nullable=True)
    
    # Domicilio
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    zip_code = Column(String, nullable=True)
    country = Column(String, default="Argentina")
    
    # Geo References (Strict)
    country_id = Column(Integer, nullable=True) # ForeignKey("countries.id")
    province_id = Column(Integer, nullable=True) # ForeignKey("provinces.id")
    locality_id = Column(Integer, nullable=True) # ForeignKey("localities.id")
    
    # Comercial / Config
    price_list_id = Column(String, nullable=True)
    salesperson_id = Column(String, ForeignKey("entities.id"), nullable=True)
    is_salesperson = Column(Boolean, default=False)
    commission_type = Column(String, nullable=True) # 'fixed', 'markup'
    commission_pct = Column(Float, default=0.0)
    # Nueva configuración de comisión (v2)
    commission_mode          = Column(String, default="BY_COLLECTION") # CommissionMode
    commission_currency      = Column(String, default="USD")           # USD | ARS
    commission_exchange_mode = Column(String, default="INVOICE_RATE")  # CommissionExchangeMode
    margin_commission_pct    = Column(Float, default=100.0)            # % del margen que le corresponde al vendedor
    business_unit = Column(String, nullable=True)
    account_code = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    
    # CRM / Riesgo
    credit_limit = Column(Float, default=0.0)
    credit_status = Column(String, default="OK") # OK, WARNING, BLOCKED
    
    # Linked Entity (Client <-> Provider)
    linked_entity_id = Column(String, ForeignKey("entities.id"), nullable=True)
    linked_entity = relationship("Entity", remote_side=[id], foreign_keys=[linked_entity_id])
    
    salesperson = relationship("Entity", remote_side=[id], foreign_keys=[salesperson_id])
    
    movements = relationship("AccountMovement", back_populates="entity")
    documents = relationship("Document", back_populates="entity", foreign_keys="Document.entity_id")
    perceptions = relationship("EntityPerception", back_populates="entity", cascade="all, delete-orphan")
    crm_notes = relationship("EntityCRMNote", back_populates="entity", cascade="all, delete-orphan", order_by="desc(EntityCRMNote.date)")

# ──────────────────────────────────────────────
# EntityCRMNote (Timeline / CRM)
# ──────────────────────────────────────────────
class EntityCRMNote(Base):
    __tablename__ = "entity_crm_notes"

    id = Column(String, primary_key=True, default=generate_uuid)
    entity_id = Column(String, ForeignKey("entities.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=True) # Who wrote it
    
    date = Column(DateTime, default=datetime.utcnow)
    category = Column(String, default="Visita") # Visita, Llamada, Compromiso de Pago, etc
    content = Column(Text, nullable=False)
    
    # Optional field for a "Payment Promise" date
    promise_date = Column(DateTime, nullable=True)
    
    # Task / Reminder fields
    next_follow_up = Column(DateTime, nullable=True)
    is_completed = Column(Boolean, default=True) # If it's a historic note it's True. If it's a future reminder it's False until done.
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    
    entity = relationship("Entity", back_populates="crm_notes")
    user = relationship("User")

# ──────────────────────────────────────────────
# EntityPerception (Percepciones de Clientes)
# ──────────────────────────────────────────────
class EntityPerception(Base):
    __tablename__ = "entity_perceptions"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    entity_id = Column(String, ForeignKey("entities.id"), nullable=False)
    
    tax_name = Column(String, nullable=False) # IIBB, IVA, etc
    category = Column(String) # Solo si aplica
    rate = Column(Float, default=0.0) # Alicuota
    
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    
    entity = relationship("Entity", back_populates="perceptions")

# ──────────────────────────────────────────────
# Vehicle (Flota)
# ──────────────────────────────────────────────
class Vehicle(Base):
    __tablename__ = "vehicles"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    plate = Column(String, nullable=True) # Patente
    type = Column(Enum(VehicleType), default=VehicleType.OTHER)
    driver_name = Column(String, nullable=True) # Chofer por defecto
    driver_id = Column(String, nullable=True) # DNI/Legajo
    active = Column(Boolean, default=True)
    notes = Column(String, nullable=True)
    
    insurance_due = Column(DateTime, nullable=True) # Vencimiento Seguro
    vtv_due = Column(DateTime, nullable=True)      # Vencimiento VTV
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    expenses = relationship("DocumentVehicleExpense", back_populates="vehicle")

# ──────────────────────────────────────────────
# Document (cabecera)
# ──────────────────────────────────────────────
class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        # Uniqueness rule: doc_type + line (fiscal letter A/B/C) + number.
        # 'number' already contains the sales point prefix (e.g. '0003-00000001'),
        # so no separate sales_point column is needed in the constraint.
        # Different doc types CAN share the same number: INVOICE-A 0003-00000001
        # and DEBIT_NOTE-A 0003-00000001 are valid (independent sequences per type).
        # Different letters of the same type also have independent sequences:
        # INVOICE-A 0003-00000001 and INVOICE-B 0003-00000001 are valid.
        # We use func.coalesce(line, "") so that documents without a fiscal letter,
        # such as RECEIPT/PAYMENT, are also protected against duplicates, since in 
        # SQLite NULL != NULL in unique indexes.
        Index(
            "uq_documents_type_line_number", 
            "doc_type", 
            func.coalesce(column("line"), ""), 
            "number", 
            unique=True
        ),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    entity_id = Column(String, ForeignKey("entities.id"), index=True)
    doc_type = Column(Enum(DocumentType), index=True)
    number = Column(String, index=True, nullable=False)
    date = Column(DateTime, default=datetime.utcnow, index=True)
    due_date = Column(DateTime, nullable=True)
    
    currency = Column(Enum(CurrencyType), default=CurrencyType.ARS)
    exchange_rate = Column(Float, default=1.0)
    total_amount = Column(Float, default=0.0)
    total_amount_ars = Column(Float, default=0.0)
    allocated_amount = Column(Float, default=0.0) # To track how much of this payment is used (for commissions or other payouts)
    
    status = Column(Enum(DocumentStatus), default=DocumentStatus.OPEN, index=True)
    line = Column(String, nullable=True)  # L1/L2
    notes = Column(String, nullable=True)
    attachment_url = Column(String, nullable=True) 
    sale_condition_id = Column(String, ForeignKey("sale_conditions.id"), nullable=True)
    
    # Internal Tracking
    unidad_negocio = Column(String, nullable=True) # Cereales, Hacienda, Agroinsumos, etc
    campana = Column(String, nullable=True) # 24/25, etc
    por_cta_orden = Column(Boolean, default=False)
    
    # Optional fields for Debit/Credit Notes
    reason_type = Column(Enum(DocumentReasonType), nullable=True)
    is_exchange_difference = Column(Boolean, default=False)
    source_invoice_id = Column(String, ForeignKey("documents.id"), nullable=True)
    return_stock = Column(Boolean, default=False)
    
    # Logistica / Gastos / Centros de Costo
    cost_center = Column(Integer, default=1) # 1 ARCA, 2 Interno
    vehicle_id = Column(String, ForeignKey("vehicles.id"), nullable=True)
    
    # Depósito para movimientos de stock
    warehouse_id = Column(String, ForeignKey("warehouses.id"), nullable=True)
    
    vehicle_driver = Column(String, nullable=True) # Nombre del chofer al momento
    vendedor = Column(String, nullable=True)
    salesperson_id = Column(String, ForeignKey("entities.id"), nullable=True)
    commission_amount = Column(Float, default=0.0)
    commission_paid = Column(Boolean, default=False)
    commission_paid_amount = Column(Float, default=0.0)
    commission_payment_date = Column(DateTime, nullable=True)
    
    # AFIP / ARCA Integration
    cae = Column(String, nullable=True)
    cae_due_date = Column(DateTime, nullable=True)
    afip_status = Column(String, nullable=True) # PENDING, APPROVED, REJECTED
    afip_xml_request = Column(Text, nullable=True)
    afip_xml_response = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    is_initial_load = Column(Boolean, default=False)
    is_fx_adjustment = Column(Boolean, default=False) # Marcador para notas por Dif. de Cambio (Afecta Ledger USD)

    # Grain settlement relationship
    grain_settlement = relationship("GrainSettlement", back_populates="document", uselist=False)
    perceptions = relationship("DocumentPerception", back_populates="document", cascade="all, delete-orphan")
    retentions = relationship("DocumentRetention", back_populates="document", cascade="all, delete-orphan")

    history = relationship("DocumentHistory", back_populates="document", cascade="all, delete-orphan", order_by="DocumentHistory.date.desc()")

    entity = relationship("Entity", back_populates="documents", foreign_keys=[entity_id])
    salesperson = relationship("Entity", foreign_keys=[salesperson_id])
    sale_condition = relationship("SaleCondition", foreign_keys=[sale_condition_id])
    lines = relationship("DocumentLine", back_populates="document", cascade="all, delete-orphan")
    
    # Aplicaciones
    applied_to = relationship("Application", foreign_keys="Application.from_document_id", back_populates="from_document", cascade="all, delete-orphan")
    applied_by = relationship("Application", foreign_keys="Application.to_document_id", back_populates="to_document", cascade="all, delete-orphan")
    
    # FX links como factura origen
    fx_links_as_source = relationship("FxAdjustmentLink", foreign_keys="FxAdjustmentLink.source_document_id", back_populates="source_document", cascade="all, delete-orphan")
    fx_links_as_generated = relationship("FxAdjustmentLink", foreign_keys="FxAdjustmentLink.generated_document_id", back_populates="generated_document", cascade="all, delete-orphan")
    
    # Medios de pago (usado en Recibos/Pagos)
    payments = relationship("PaymentItem", back_populates="document", cascade="all, delete-orphan")
    
    # Contabilidad
    journal_entries = relationship("JournalEntry", back_populates="document", cascade="all, delete-orphan")
    
    @property
    def entity_name(self) -> str:
        if self.entity:
            return self.entity.name
        return f"ID: {self.entity_id}" if self.entity_id else "No entity"

# ──────────────────────────────────────────────
# PaymentItem (Medios de pago en un Recibo/Pago)
# ──────────────────────────────────────────────
class PaymentItem(Base):
    __tablename__ = "payment_items"

    id = Column(String, primary_key=True, default=generate_uuid)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    cost_center = Column(Integer, default=1) # Hereda del documento
    type = Column(Enum(PaymentMethod), nullable=False)
    amount = Column(Float, nullable=False)
    description = Column(String)
    
    # Metadata opcional
    reference_number = Column(String, nullable=True)
    bank_name = Column(String, nullable=True)
    due_date = Column(DateTime, nullable=True) # Para cheques
    
    document = relationship("Document", back_populates="payments")

# ──────────────────────────────────────────────
# DocumentLine (renglones de factura/ND/NC)
# ──────────────────────────────────────────────
class DocumentLine(Base):
    __tablename__ = "document_lines"

    id = Column(String, primary_key=True, default=generate_uuid)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    product_id = Column(String, ForeignKey("products.id"), nullable=True)
    description = Column(String, nullable=False)
    
    qty_packages = Column(Float, nullable=True)
    package_size = Column(Float, nullable=True)
    package_unit = Column(String, nullable=True)
    qty = Column(Float, default=1.0)
    
    unit_price = Column(Float, default=0.0)
    discount_pct = Column(Float, default=0.0)
    net_amount = Column(Float, nullable=False)       # sin IVA
    vat_rate = Column(Float, nullable=False)          # 0.21, 0.105, 0.27, 0.0
    vat_amount = Column(Float, nullable=False)        # net_amount * vat_rate
    total_amount = Column(Float, nullable=False)      # net + vat
    unit_cost = Column(Float, default=0.0)
    total_cost = Column(Float, default=0.0)
    line_order = Column(Integer, default=0)
    
    # Cuenta contable (se setea desde el producto o manual)
    accounting_account_id = Column(String, ForeignKey("accounts.id"), nullable=True)
    
    # Links to origin lines
    source_dn_line_id = Column(String, ForeignKey("delivery_note_lines.id"), nullable=True)
    source_sales_line_id = Column(String, ForeignKey("sales_order_lines.id"), nullable=True)
    source_purchase_line_id = Column(String, ForeignKey("purchase_order_lines.id"), nullable=True)
    
    # Stock Movement link
    stock_movement_id = Column(String, ForeignKey("stock_movements.id"), nullable=True)

    document = relationship("Document", back_populates="lines")
    product = relationship("Product")
    
    @property
    def cost_price(self):
        return self.unit_cost or 0.0



# ──────────────────────────────────────────────
# DocumentPerception (Percepciones de IIBB/IVA aplicadas)
# ──────────────────────────────────────────────
class DocumentPerception(Base):
    __tablename__ = "document_perceptions"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    
    tax_name = Column(String, nullable=False) # IIBB, IVA, etc
    jurisdiction = Column(String) # Ej: Buenos Aires
    base_amount = Column(Float, default=0.0)
    rate = Column(Float, default=0.0)
    amount = Column(Float, default=0.0)
    
    document = relationship("Document", back_populates="perceptions")


# ──────────────────────────────────────────────
# DocumentRetention (Retenciones de IIBB/IVA/Ganancias)
# ──────────────────────────────────────────────
class DocumentRetention(Base):
    __tablename__ = "document_retentions"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    
    tax_name = Column(String, nullable=False) # IIBB, IVA, Ganancias
    jurisdiction = Column(String) # Ej: Buenos Aires
    certificate_number = Column(String) # Nro de certificado
    base_amount = Column(Float, default=0.0)
    amount = Column(Float, default=0.0)
    
    document = relationship("Document", back_populates="retentions")


class DocumentHistory(Base):
    __tablename__ = "document_history"

    id = Column(String, primary_key=True, default=generate_uuid)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    user = Column(String, nullable=False)
    date = Column(DateTime, default=datetime.utcnow)
    action = Column(String) # CREACION, MODIFICACION, ANULACION, etc
    details = Column(Text) # JSON o descripción de lo que cambió

    document = relationship("Document", back_populates="history")

# ──────────────────────────────────────────────
# DocumentVehicleExpense (Imputacion de gastos a vehiculos)
# ──────────────────────────────────────────────
class DocumentVehicleExpense(Base):
    __tablename__ = "document_vehicle_expenses"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    vehicle_id = Column(String, ForeignKey("vehicles.id"), nullable=False)
    
    amount = Column(Float, default=0.0) # Monto imputado al vehiculo
    percentage = Column(Float, default=100.0) # % del total del documento
    notes = Column(String, nullable=True)
    
    document = relationship("Document", backref="vehicle_expenses")
    vehicle = relationship("Vehicle", back_populates="expenses")


# ──────────────────────────────────────────────
# Application (crédito → deuda)
# ──────────────────────────────────────────────
class Application(Base):
    __tablename__ = "applications"

    id = Column(String, primary_key=True, default=generate_uuid)
    from_document_id = Column(String, ForeignKey("documents.id"))  # Recibo/NC/Pago
    to_document_id = Column(String, ForeignKey("documents.id"))    # Factura/ND
    cost_center = Column(Integer, default=1)
    amount_applied = Column(Float)
    amount_applied_ars = Column(Float)
    exchange_rate = Column(Float, default=1.0)  # TC al momento de aplicar
    created_at = Column(DateTime, default=datetime.utcnow)

    from_document = relationship("Document", foreign_keys=[from_document_id], back_populates="applied_to")
    to_document = relationship("Document", foreign_keys=[to_document_id], back_populates="applied_by")
    
    fx_link = relationship("FxAdjustmentLink", back_populates="source_application", uselist=False, cascade="all, delete-orphan")

# ──────────────────────────────────────────────
# FxAdjustmentLink (vínculo ND/NC generada)
# ──────────────────────────────────────────────
class FxAdjustmentLink(Base):
    __tablename__ = "fx_adjustment_links"
    __table_args__ = (
        UniqueConstraint("source_application_id", name="uq_fx_per_application"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    source_application_id = Column(String, ForeignKey("applications.id"), nullable=False, unique=True)
    source_document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    generated_document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    cost_center = Column(Integer, default=1)
    
    # Trazabilidad del cálculo
    tc_invoice = Column(Float, nullable=False)
    tc_application = Column(Float, nullable=False)
    applied_amount_original = Column(Float, nullable=False)
    diff_total_ars = Column(Float, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)

    source_application = relationship("Application", back_populates="fx_link")
    source_document = relationship("Document", foreign_keys=[source_document_id], back_populates="fx_links_as_source")
    generated_document = relationship("Document", foreign_keys=[generated_document_id], back_populates="fx_links_as_generated")

# ──────────────────────────────────────────────
# ApplicationAllocation (stub para futuro)
# ──────────────────────────────────────────────
class ApplicationAllocation(Base):
    """Reservado para asignación explícita de aplicaciones a líneas.
    Por ahora el sistema usa distribución proporcional automática."""
    __tablename__ = "application_allocations"

    id = Column(String, primary_key=True, default=generate_uuid)
    application_id = Column(String, ForeignKey("applications.id"), nullable=False)
    document_line_id = Column(String, ForeignKey("document_lines.id"), nullable=False)
    applied_net_amount = Column(Float, default=0.0)
    applied_vat_amount = Column(Float, default=0.0)
    applied_total_amount = Column(Float, default=0.0)

# ──────────────────────────────────────────────
# AccountMovement (legacy, mantenemos)
# ──────────────────────────────────────────────
class AccountMovement(Base):
    __tablename__ = "account_movements"

    id = Column(Integer, primary_key=True, index=True)
    entity_id = Column(String, ForeignKey("entities.id"), index=True)
    date = Column(DateTime, default=datetime.utcnow)
    description = Column(String)
    currency = Column(Enum(CurrencyType), default=CurrencyType.ARS)
    exchange_rate = Column(Float, default=1.0)
    debit = Column(Float, default=0.0)
    credit = Column(Float, default=0.0)
    cost_center = Column(Integer, default=1) # 1 ARCA, 2 Interno

    entity = relationship("Entity", back_populates="movements")


# ──────────────────────────────────────────────
# Expense Claim (Rendición de Gastos)
# ──────────────────────────────────────────────
class ExpenseClaim(Base):
    __tablename__ = "expense_claims"

    id = Column(String, primary_key=True, default=generate_uuid)
    entity_id = Column(String, ForeignKey("entities.id"), nullable=False) # El empleado
    title = Column(String, nullable=False)
    date = Column(DateTime, default=datetime.utcnow)
    
    status = Column(Enum(ExpenseClaimStatus), default=ExpenseClaimStatus.DRAFT)
    total_amount = Column(Float, default=0.0)
    notes = Column(Text, nullable=True)
    
    # Internal Tracking
    cost_center = Column(Integer, default=1) # 1 ARCA, 2 Interno
    unidad_negocio = Column(String, nullable=True)
    campana = Column(String, nullable=True)
    por_cta_orden = Column(Boolean, default=False)
    
    # Reimbursement info
    reimbursed_at = Column(DateTime, nullable=True)
    reimbursement_doc_id = Column(String, ForeignKey("documents.id"), nullable=True) # Pago vinculado
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    employee = relationship("Entity")
    items = relationship("ExpenseItem", back_populates="claim", cascade="all, delete-orphan")
    reimbursement_doc = relationship("Document")

class ExpenseItem(Base):
    __tablename__ = "expense_items"

    id = Column(String, primary_key=True, default=generate_uuid)
    claim_id = Column(String, ForeignKey("expense_claims.id"), nullable=False)
    
    date = Column(DateTime, default=datetime.utcnow)
    description = Column(String, nullable=False)
    category = Column(String, nullable=True) 
    amount = Column(Float, nullable=False) # Total (Calculated: net + vat + perceptions + other)
    
    # Attachment/Proof (Optional)
    attachment_url = Column(String, nullable=True) 
    
    # Tax details
    provider_id = Column(String, ForeignKey("entities.id"), nullable=True) 
    provider_name = Column(String, nullable=True)
    provider_tax_id = Column(String, nullable=True) # CUIT
    invoice_number = Column(String, nullable=True) # Full number PV-Num
    line = Column(String, default="A") # A, B, C, M, etc
    
    net_amount = Column(Float, default=0.0)
    vat_rate = Column(Float, default=0.21) # 0.21, 0.105, etc
    vat_amount = Column(Float, default=0.0)
    
    # Additional taxes (Matching Ledger/Purchase requirements)
    iibb_perception = Column(Float, default=0.0)
    iva_perception = Column(Float, default=0.0)
    ganancias_perception = Column(Float, default=0.0)
    municipal_tax = Column(Float, default=0.0)
    other_taxes = Column(Float, default=0.0)
    
    # Accounting link (Generic account per item)
    account_code = Column(String, nullable=True)
    
    generated_doc_id = Column(String, ForeignKey("documents.id"), nullable=True)
    
    claim = relationship("ExpenseClaim", back_populates="items")
    # Multiple vehicles support via join table
    vehicles = relationship("ExpenseItemVehicle", back_populates="expense_item", cascade="all, delete-orphan")

class ExpenseItemVehicle(Base):
    __tablename__ = "expense_item_vehicles"
    id = Column(String, primary_key=True, default=generate_uuid)
    expense_item_id = Column(String, ForeignKey("expense_items.id"), nullable=False)
    vehicle_id = Column(String, ForeignKey("vehicles.id"), nullable=False)
    
    expense_item = relationship("ExpenseItem", back_populates="vehicles")
    vehicle = relationship("Vehicle")

# ──────────────────────────────────────────────
# CONTABILIDAD (LEDGER / JOURNAL)
# ──────────────────────────────────────────────
class JournalEntry(Base):
    __tablename__ = "journal_entries"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    document_id = Column(String, ForeignKey("documents.id"), nullable=True) # doc origen si lo hay
    date = Column(DateTime, default=datetime.utcnow)
    description = Column(String, nullable=False)
    cost_center = Column(Integer, default=1) # 1 ARCA, 2 Interno
    
    # Monto total del asiento
    total_amount = Column(Float, default=0.0)
    
    # Relaciones
    document = relationship("Document", back_populates="journal_entries")
    lines = relationship("JournalLine", back_populates="entry", cascade="all, delete-orphan")

class JournalLine(Base):
    __tablename__ = "journal_lines"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    entry_id = Column(String, ForeignKey("journal_entries.id"), nullable=False)
    
    account_code = Column(String, nullable=False)
    description = Column(String, nullable=True) # opcional detalle
    
    debit = Column(Float, default=0.0)  # Debe
    credit = Column(Float, default=0.0) # Haber
    
    # Puede vincular a una entidad (como un cliente o proveedor en deudores/acreedores por venta)
    entity_id = Column(String, ForeignKey("entities.id"), nullable=True)
    
    entry = relationship("JournalEntry", back_populates="lines")
    entity = relationship("Entity")

class LedgerSetting(Base):
    __tablename__ = "ledger_settings"
    
    key = Column(String, primary_key=True)
    value = Column(String, nullable=False) # El código de cuenta
    description = Column(String, nullable=True)


# ──────────────────────────────────────────────
# CommissionApplication (comisión generada por doc/cobro)
# ──────────────────────────────────────────────
class CommissionApplication(Base):
    """Registra la comisión generada por cada factura o cobro.
    No genera comprobantes fiscales. Es 100% interno."""
    __tablename__ = "commission_applications"

    id              = Column(String, primary_key=True, default=generate_uuid)
    seller_id       = Column(String, ForeignKey("entities.id"), nullable=False, index=True)

    # Origen de la comisión
    document_id     = Column(String, ForeignKey("documents.id"),  nullable=True)  # Factura/ND
    collection_id   = Column(String, ForeignKey("documents.id"),  nullable=True)  # Recibo (BY_CASH)
    delivery_note_id= Column(String, ForeignKey("delivery_notes.id"), nullable=True)
    sales_order_id  = Column(String, ForeignKey("sales_orders.id"), nullable=True)

    # Montos duales (siempre almacenar ambos)
    commission_amount_usd = Column(Float, default=0.0)
    commission_amount_ars = Column(Float, default=0.0)
    exchange_rate         = Column(Float, default=1.0)   # TC al momento de generación

    # Liberación (BY_COLLECTION)
    available_amount_usd  = Column(Float, default=0.0)   # Porción disponible (cobrada)
    available_amount_ars  = Column(Float, default=0.0)

    # Neto base para el cálculo
    base_net_usd    = Column(Float, default=0.0)   # neto sin IVA en USD
    base_net_ars    = Column(Float, default=0.0)

    # Modo con que se calculó
    commission_mode = Column(String, default="BY_COLLECTION")
    commission_pct  = Column(Float, default=0.0)

    application_date = Column(DateTime, default=datetime.utcnow)
    status           = Column(String, default="PENDING")  # CommissionApplicationStatus

    # Pagado
    paid_amount_usd  = Column(Float, default=0.0)
    paid_amount_ars  = Column(Float, default=0.0)

    notes       = Column(String, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

    # Relationships
    seller          = relationship("Entity", foreign_keys=[seller_id])
    document        = relationship("Document", foreign_keys=[document_id])
    collection      = relationship("Document", foreign_keys=[collection_id])


# ──────────────────────────────────────────────
# CommissionSettlement (liquidación interna)
# ──────────────────────────────────────────────
class CommissionSettlement(Base):
    """Registra una liquidación interna de comisión al vendedor.
    NO genera comprobantes fiscales, NO afecta IVA ni cuenta corriente."""
    __tablename__ = "commission_settlements"

    id          = Column(String, primary_key=True, default=generate_uuid)
    seller_id   = Column(String, ForeignKey("entities.id"), nullable=False, index=True)

    date        = Column(DateTime, default=datetime.utcnow)
    currency    = Column(String, default="USD")
    exchange_rate = Column(Float, default=1.0)   # TC del día de liquidación

    amount_usd  = Column(Float, default=0.0)
    amount_ars  = Column(Float, default=0.0)

    is_advance  = Column(Boolean, default=False) # True = adelanto
    notes       = Column(String, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    created_by  = Column(String, nullable=True)

    seller  = relationship("Entity", foreign_keys=[seller_id])
    lines   = relationship("CommissionSettlementLine", back_populates="settlement",
                           cascade="all, delete-orphan")


class CommissionSettlementLine(Base):
    """Línea de una liquidación: vincula la liquidación con una CommissionApplication."""
    __tablename__ = "commission_settlement_lines"

    id              = Column(String, primary_key=True, default=generate_uuid)
    settlement_id   = Column(String, ForeignKey("commission_settlements.id"), nullable=False)
    application_id  = Column(String, ForeignKey("commission_applications.id"), nullable=False)

    amount_usd      = Column(Float, default=0.0)
    amount_ars      = Column(Float, default=0.0)

    settlement      = relationship("CommissionSettlement", back_populates="lines")
    application     = relationship("CommissionApplication")


