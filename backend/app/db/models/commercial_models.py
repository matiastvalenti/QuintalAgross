"""
Modelos del flujo comercial enlazado — Fase 3.
Cadena: OV/OC → Remito(s) → Factura(s) (Document)

Sin impacto en stock ni cuenta corriente (eso viene en T3.2.2+).
"""
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Enum, Integer, Text, Boolean, UniqueConstraint, Numeric
from sqlalchemy.orm import relationship, backref
import enum
from datetime import datetime
from app.db.session import Base
from app.db.models.models import generate_uuid, CurrencyType

# ──────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────
class OrderStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"             # Listo para remitir
    PARTIALLY_DELIVERED = "PARTIALLY_DELIVERED"
    FULLY_DELIVERED = "FULLY_DELIVERED" 
    PARTIALLY_INVOICED = "PARTIALLY_INVOICED"
    INVOICED = "INVOICED"
    
    # Estados combinados (Matriz de Trazabilidad)
    REMITIDO_PARCIAL_FACTURADO_PARCIAL = "REMITIDO_PARCIAL_FACTURADO_PARCIAL"
    REMITIDO_TOTAL_FACTURADO_PARCIAL = "REMITIDO_TOTAL_FACTURADO_PARCIAL"
    REMITIDO_PARCIAL_FACTURADO_TOTAL = "REMITIDO_PARCIAL_FACTURADO_TOTAL"
    
    COMPLETED = "COMPLETED"             # Remitido y Facturado Totalmente
    CANCELLED = "CANCELLED"

class DeliveryNoteStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    DISPATCHED = "DISPATCHED"  # Impactó stock
    INVOICED = "INVOICED"      # Facturado
    PARTIAL = "PARTIAL"        # Parcialmente facturado
    CANCELLED = "CANCELLED"

class OrderType(str, enum.Enum):
    SALE = "SALE"
    PURCHASE = "PURCHASE"

class DeliveryNoteType(str, enum.Enum):
    STANDARD = "STANDARD"
    RETURN = "RETURN"

class WarehouseOwnership(str, enum.Enum):
    PROPIO = "PROPIO"
    TERCERO = "TERCERO"

class StockControlMode(str, enum.Enum):
    NONE = "NONE"       # No hace Control
    WARNING = "WARNING" # Muestra la advertencia y me deja continuar
    STRICT = "STRICT"   # Muestra la advertencia y no me deja continuar

# ══════════════════════════════════════════════
# CATALOGS (Tablas Maestras)
# ══════════════════════════════════════════════

class Account(Base):
    """Cuenta Contable (Ej: Ventas, Compras, Stock)"""
    __tablename__ = "accounts"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    code = Column(String, nullable=False, unique=True, index=True) # Ej: 4.1.1.001
    name = Column(String, nullable=False) # Ej: Ventas de Herbicidas
    active = Column(Boolean, default=True)

class Category(Base):
    """Rubro (Ej: Herbicidas, Fertilizantes)"""
    __tablename__ = "categories"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, unique=True)
    active = Column(Boolean, default=True)
    
    subcategories = relationship("SubCategory", back_populates="category", cascade="all, delete-orphan")

class SubCategory(Base):
    """Subrubro (Ej: Glifosatos, Graminicidas)"""
    __tablename__ = "subcategories"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    category_id = Column(String, ForeignKey("categories.id"), nullable=False)
    name = Column(String, nullable=False)
    active = Column(Boolean, default=True)
    
    category = relationship("Category", back_populates="subcategories")

class Unit(Base):
    """Unidad de Medida (Ej: Litro, Kilo, Unidad)"""
    __tablename__ = "units"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, unique=True) # Litro
    short_name = Column(String, nullable=False) # L
    
class Container(Base):
    """Envase (Ej: Bidón 20L, Bolsa 40KG)"""
    __tablename__ = "containers"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, unique=True)
    capacity = Column(Float, nullable=False, default=1.0)
    unit_id = Column(String, ForeignKey("units.id"), nullable=False)
    
    unit = relationship("Unit")

class TaxType(Base):
    """Condición IVA (Ej: 21%, 10.5%)"""
    __tablename__ = "tax_types"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, unique=True) # 21%
    rate = Column(Float, nullable=False) # 0.21
    active = Column(Boolean, default=True)
    account_code = Column(String, nullable=True)
    
    account = relationship("Account", foreign_keys=[account_code], primaryjoin="TaxType.account_code == Account.code")

class SaleCondition(Base):
    """Condición de Venta / Pago (Ej: Neto 30 días)"""
    __tablename__ = "sale_conditions"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    description = Column(String, nullable=False, unique=True) # Ej: Neto 30 días
    due_days = Column(Integer, default=0) # Días para el vto
    interest_rate = Column(Float, default=0.0) # Mora mensual
    financing_rate = Column(Float, default=0.0) # Financiación
    active = Column(Boolean, default=True)

class BusinessUnit(Base):
    """Unidad de Negocio (Ej: Agronomía, Semillas)"""
    __tablename__ = "business_units"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, unique=True)
    active = Column(Boolean, default=True)
    account_code = Column(String, nullable=True)
    
    account = relationship("Account", foreign_keys=[account_code], primaryjoin="BusinessUnit.account_code == Account.code")

class Campaign(Base):
    """Campaña (Ej: Campaña 24-25)"""
    __tablename__ = "campaigns"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, unique=True)
    active = Column(Boolean, default=True)

# ══════════════════════════════════════════════
# PRODUCT (Producto / Servicio)
# ══════════════════════════════════════════════
class Product(Base):
    __tablename__ = "products"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, index=True)
    sku = Column(String, nullable=True, unique=True, index=True) # Código interno
    
    # Clasificación
    subcategory_id = Column(String, ForeignKey("subcategories.id"), nullable=True)
    
    # Datos Comerciales
    container_id = Column(String, ForeignKey("containers.id"), nullable=True)
    quantity_per_container = Column(Float, default=1.0) # Cantidad total que viene en el envase
    unit_of_measure = Column(String, nullable=True) # Ej: LT, KG, UN
    cost_price = Column(Float, default=0.0) # Último costo conocido / costo promedio
    
    # Datos Impositivos
    tax_type_id = Column(String, ForeignKey("tax_types.id"), nullable=True)
    
    # Datos Técnicos
    active_principle = Column(String, nullable=True)
    concentration = Column(String, nullable=True)
    
    # Cuentas contables
    sales_account_id = Column(String, ForeignKey("accounts.id"), nullable=True)
    purchase_account_id = Column(String, ForeignKey("accounts.id"), nullable=True)
    stock_account_id = Column(String, ForeignKey("accounts.id"), nullable=True)  # NULL si es servicio
    min_stock = Column(Float, default=0.0) # Stock mínimo para alertas

    is_service = Column(Boolean, default=False)
    active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    subcategory = relationship("SubCategory")
    container = relationship("Container")
    tax_type = relationship("TaxType")
    stock_items = relationship("StockItem", back_populates="product", cascade="all, delete-orphan")
    
    sales_account = relationship("Account", foreign_keys=[sales_account_id], primaryjoin="Product.sales_account_id == Account.id")
    purchase_account = relationship("Account", foreign_keys=[purchase_account_id], primaryjoin="Product.purchase_account_id == Account.id")
    stock_account = relationship("Account", foreign_keys=[stock_account_id], primaryjoin="Product.stock_account_id == Account.id")
    
    
# ══════════════════════════════════════════════
# WAREHOUSE (Depósito)
# ══════════════════════════════════════════════
class Warehouse(Base):
    __tablename__ = "warehouses"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, unique=True, index=True)
    code = Column(String, nullable=True, unique=True)      # Código corto (ej: "DEP1")
    address = Column(String, nullable=True)
    active = Column(Boolean, default=True)
    
    ownership = Column(Enum(WarehouseOwnership), default=WarehouseOwnership.PROPIO)
    
    # ── Controles de Stock ──
    low_stock_control = Column(Enum(StockControlMode), default=StockControlMode.WARNING)
    no_stock_control = Column(Enum(StockControlMode), default=StockControlMode.STRICT)
    account_code = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    stock_items = relationship("StockItem", back_populates="warehouse", cascade="all, delete-orphan")
    account = relationship("Account", foreign_keys=[account_code], primaryjoin="Warehouse.account_code == Account.code")


# ══════════════════════════════════════════════
# STOCK ITEM (Producto × Depósito → cantidad)
# ══════════════════════════════════════════════
class StockItem(Base):
    """Saldo de stock de un producto en un depósito."""
    __tablename__ = "stock_items"
    __table_args__ = (
        UniqueConstraint("product_id", "warehouse_id", name="uq_product_warehouse"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    product_id = Column(String, ForeignKey("products.id"), nullable=False, index=True)
    warehouse_id = Column(String, ForeignKey("warehouses.id"), nullable=False)
    
    qty_on_hand = Column(Numeric(12, 2), default=0.00) # Stock físico
    qty_reserved = Column(Numeric(12, 2), default=0.00) # Reservado por OV abierta

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    product = relationship("Product", back_populates="stock_items")
    warehouse = relationship("Warehouse", back_populates="stock_items")


# ══════════════════════════════════════════════
# SALES ORDER (Orden de Venta / Pedido)
# ══════════════════════════════════════════════
class SalesOrder(Base):
    __tablename__ = "sales_orders"

    id = Column(String, primary_key=True, default=generate_uuid)
    entity_id = Column(String, ForeignKey("entities.id"), nullable=False)
    warehouse_id = Column(String, ForeignKey("warehouses.id"), nullable=True)
    
    number = Column(String, unique=True, index=True, nullable=False) # e.g. "OV-0001"
    date = Column(DateTime, nullable=False, default=datetime.utcnow)
    status = Column(Enum(OrderStatus), default=OrderStatus.DRAFT, nullable=False)
    
    source = Column(String, default="MANUAL") # "MANUAL", "AUTO_REMITO"
    origin_reference = Column(String, nullable=True) # Referencia externa

    currency = Column(String, default="ARS")
    exchange_rate = Column(Numeric(10, 4), default=1.0)
    cost_center = Column(Integer, default=1) # 1 ARCA, 2 Interno
    
    sale_condition_id = Column(String, ForeignKey("sale_conditions.id"), nullable=True)
    due_date = Column(DateTime, nullable=True)
    invoice_date = Column(DateTime, nullable=True) # Ex tax_date

    total_amount = Column(Numeric(14, 2), default=0.0) # Bruto con impuestos
    total_cost = Column(Numeric(14, 2), default=0.0) # Suma del costo de las líneas
    margin_amount = Column(Numeric(14, 2), default=0.0) # Ganancia neta (Neto - Costo)
    
    notes = Column(Text, nullable=True) # Notas externas (pie)
    header_notes = Column(Text, nullable=True) # Notas internas
    order_number = Column(String, nullable=True) # Nro pedido cliente
    shipping_number = Column(String, nullable=True) # Nro remito manual ref
    vendedor = Column(String, nullable=True)
    salesperson_id = Column(String, ForeignKey("entities.id"), nullable=True)
    commission_amount = Column(Numeric(14, 2), default=0.0)
    commission_paid = Column(Boolean, default=False)
    commission_paid_amount = Column(Numeric(14, 2), default=0.0)
    commission_payment_date = Column(DateTime, nullable=True)
    
    business_unit = Column(String, nullable=True)
    price_list = Column(String, nullable=True)
    direct_rep = Column(Boolean, default=False)
    attachment_url = Column(String, nullable=True) 
    
    # Logistica
    vehicle_id = Column(String, ForeignKey("vehicles.id"), nullable=True)
    vehicle_driver = Column(String, nullable=True)

    sale_condition = relationship("SaleCondition")
    warehouse = relationship("Warehouse")
    lines = relationship("SalesOrderLine", back_populates="order", cascade="all, delete-orphan")
    delivery_notes = relationship("DeliveryNote", back_populates="sales_order")
    created_at = Column(DateTime, default=datetime.utcnow)
    
    entity = relationship("Entity", primaryjoin="SalesOrder.entity_id == Entity.id", foreign_keys=[entity_id], backref="sales_orders")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String, nullable=True) # Nombre/ID del usuario
    updated_by = Column(String, nullable=True)
    history = relationship("SalesOrderHistory", back_populates="order", cascade="all, delete-orphan", order_by="SalesOrderHistory.date.desc()")
    salesperson = relationship("Entity", primaryjoin="SalesOrder.salesperson_id == Entity.id", foreign_keys=[salesperson_id])


class SalesOrderLine(Base):
    __tablename__ = "sales_order_lines"

    id = Column(String, primary_key=True, default=generate_uuid)
    order_id = Column(String, ForeignKey("sales_orders.id"), nullable=False)
    product_id = Column(String, ForeignKey("products.id"), nullable=False)
    
    description = Column(String)
    
    qty_packages = Column(Numeric(12, 2), nullable=True) # Cantidad física de envases
    package_size = Column(Numeric(12, 2), nullable=True) # Contenido por envase
    package_unit = Column(String, nullable=True)         # Unidad (LT, KG)
    qty = Column(Numeric(12, 2), nullable=False)         # Unidades totales equivalentes
    
    unit_price = Column(Numeric(14, 2), nullable=False)
    discount_pct = Column(Numeric(5, 2), default=0.0)
    vat_rate = Column(Numeric(5, 2), default=0.21)

    net_amount = Column(Numeric(14, 2))
    vat_amount = Column(Numeric(14, 2))
    total_amount = Column(Numeric(14, 2))
    
    # Rentabilidad
    unit_cost = Column(Numeric(14, 2), default=0.0) # Costo al momento de venta
    total_cost = Column(Numeric(14, 2), default=0.0) # unit_cost * qty
    margin_amount = Column(Numeric(14, 2), default=0.0) # net_amount - total_cost
    
    # Control de entregas y facturación
    qty_delivered = Column(Numeric(12, 2), default=0.00)
    qty_invoiced = Column(Numeric(12, 2), default=0.00)

    line_order = Column(Integer, default=0)

    order = relationship("SalesOrder", back_populates="lines")
    product = relationship("Product")
    
    @property
    def cost_price(self):
        return self.unit_cost or 0.0



class SalesOrderHistory(Base):
    __tablename__ = "sales_order_history"

    id = Column(String, primary_key=True, default=generate_uuid)
    order_id = Column(String, ForeignKey("sales_orders.id"), nullable=False)
    user = Column(String, nullable=False)
    date = Column(DateTime, default=datetime.utcnow)
    action = Column(String) # CREACION, MODIFICACION, CONFIRMACION, CANCELACION, etc
    details = Column(Text) # JSON o descripción de lo que cambió

    order = relationship("SalesOrder", back_populates="history")


# ══════════════════════════════════════════════
# DELIVERY NOTE (Remito)
# ══════════════════════════════════════════════
class DeliveryNote(Base):
    __tablename__ = "delivery_notes"

    id = Column(String, primary_key=True, default=generate_uuid)
    sales_order_id = Column(String, ForeignKey("sales_orders.id"), nullable=True)
    purchase_order_id = Column(String, ForeignKey("purchase_orders.id"), nullable=True)
    
    entity_id = Column(String, ForeignKey("entities.id"), nullable=False)
    warehouse_id = Column(String, ForeignKey("warehouses.id"), nullable=False)

    number = Column(String, unique=True, index=True, nullable=False)
    date = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    status = Column(Enum(DeliveryNoteStatus), default=DeliveryNoteStatus.DRAFT, index=True)
    
    note_type = Column(Enum(OrderType), default=OrderType.SALE)
    delivery_type = Column(Enum(DeliveryNoteType), default=DeliveryNoteType.STANDARD)
    
    origin_reference = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    
    currency = Column(String, default="ARS")
    exchange_rate = Column(Numeric(10, 4), default=1.0)
    cost_center = Column(Integer, default=1) # 1 ARCA, 2 Interno
    vendedor = Column(String, nullable=True)
    
    # Logistica
    vehicle_id = Column(String, ForeignKey("vehicles.id"), nullable=True)
    vehicle_driver = Column(String, nullable=True)
    salesperson_id = Column(String, ForeignKey("entities.id"), nullable=True)
    commission_amount = Column(Numeric(14, 2), default=0.0)
    commission_paid = Column(Boolean, default=False)
    commission_paid_amount = Column(Numeric(14, 2), default=0.0)
    commission_payment_date = Column(DateTime, nullable=True)
    
    sale_condition_id = Column(String, ForeignKey("sale_conditions.id"), nullable=True)
    due_date = Column(DateTime, nullable=True)
    
    total_cost = Column(Numeric(14, 2), default=0.0)
    margin_amount = Column(Numeric(14, 2), default=0.0)
    attachment_url = Column(String, nullable=True) 
    
    return_source_id = Column(String, ForeignKey("delivery_notes.id"), nullable=True)

    sale_condition = relationship("SaleCondition")
    lines = relationship("DeliveryNoteLine", back_populates="delivery_note", cascade="all, delete-orphan")
    sales_order = relationship("SalesOrder", back_populates="delivery_notes", foreign_keys=[sales_order_id])
    purchase_order = relationship("PurchaseOrder", back_populates="delivery_notes", foreign_keys=[purchase_order_id])
    
    return_source = relationship("DeliveryNote", remote_side=[id], backref="returns")
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

    entity = relationship("Entity", primaryjoin="DeliveryNote.entity_id == Entity.id", foreign_keys=[entity_id], backref="delivery_notes")
    history = relationship("DeliveryNoteHistory", back_populates="delivery_note", cascade="all, delete-orphan", order_by="DeliveryNoteHistory.date.desc()")
    salesperson = relationship("Entity", primaryjoin="DeliveryNote.salesperson_id == Entity.id", foreign_keys=[salesperson_id])

    # Facturas generadas
    invoices = relationship("InvoiceDeliveryNoteLink", back_populates="delivery_note")


class DeliveryNoteLine(Base):
    __tablename__ = "delivery_note_lines"

    id = Column(String, primary_key=True, default=generate_uuid)
    delivery_note_id = Column(String, ForeignKey("delivery_notes.id"), nullable=False)
    
    # Copia de datos para inmutabilidad (snapshot)
    product_id = Column(String, ForeignKey("products.id"), nullable=True) # Opcional si es texto libre
    description = Column(String)
    qty = Column(Numeric(12, 2), nullable=False)

    # Financial Snapshot (para persistencia aunque cambie el producto)
    unit_price = Column(Numeric(14, 2), default=0.0)
    discount_pct = Column(Numeric(5, 2), default=0.0)
    vat_rate = Column(Numeric(5, 4), default=0.21)

    net_amount = Column(Numeric(14, 2))
    vat_amount = Column(Numeric(14, 2))
    total_amount = Column(Numeric(14, 2))

    qty_invoiced = Column(Numeric(12, 2), default=0.0)

    # Rentabilidad preservada en el remito
    unit_cost = Column(Numeric(14, 2), default=0.0)
    total_cost = Column(Numeric(14, 2), default=0.0)

    # Referencias de origen
    source_sales_line_id = Column(String, ForeignKey("sales_order_lines.id"), nullable=True)
    source_purchase_line_id = Column(String, ForeignKey("purchase_order_lines.id"), nullable=True)
    
    line_order = Column(Integer, default=0)


    delivery_note = relationship("DeliveryNote", back_populates="lines")
    product = relationship("Product")


class DeliveryNoteHistory(Base):
    __tablename__ = "delivery_note_history"

    id = Column(String, primary_key=True, default=generate_uuid)
    delivery_note_id = Column(String, ForeignKey("delivery_notes.id"), nullable=False)
    user = Column(String, nullable=False)
    date = Column(DateTime, default=datetime.utcnow)
    action = Column(String) # CREACION, MODIFICACION, ANULACION, etc
    details = Column(Text) # JSON o descripción de lo que cambió

    delivery_note = relationship("DeliveryNote", back_populates="history")


# ══════════════════════════════════════════════
# PURCHASE ORDER (Orden de Compra)
# ══════════════════════════════════════════════
class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(String, primary_key=True, default=generate_uuid)
    entity_id = Column(String, ForeignKey("entities.id"), nullable=False)
    number = Column(String, index=True, nullable=False, unique=True)
    date = Column(DateTime, default=datetime.utcnow)
    warehouse_id = Column(String, ForeignKey("warehouses.id"), nullable=True) # Added for parity
    currency = Column(Enum(CurrencyType), default=CurrencyType.ARS)
    exchange_rate = Column(Numeric(10, 4), default=1.0)
    cost_center = Column(Integer, default=1) # 1 ARCA, 2 Interno
    
    sale_condition_id = Column(String, ForeignKey("sale_conditions.id"), nullable=True)
    due_date = Column(DateTime, nullable=True)
    
    notes = Column(String, nullable=True)
    
    total_vat = Column(Numeric(14, 2), default=0.0)
    total_amount = Column(Numeric(14, 2), default=0.0)
    
    vendedor = Column(String, nullable=True)
    salesperson_id = Column(String, ForeignKey("entities.id"), nullable=True)
    
    status = Column(Enum(OrderStatus), default=OrderStatus.DRAFT, index=True)
    origin_reference = Column(String, nullable=True)
    attachment_url = Column(String, nullable=True) 

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    entity = relationship("Entity", primaryjoin="PurchaseOrder.entity_id == Entity.id", foreign_keys=[entity_id], backref="purchase_orders")
    warehouse = relationship("Warehouse", backref="purchase_orders")
    sale_condition = relationship("SaleCondition")
    lines = relationship("PurchaseOrderLine", back_populates="order", cascade="all, delete-orphan")
    delivery_notes = relationship("DeliveryNote", back_populates="purchase_order", foreign_keys="DeliveryNote.purchase_order_id")
    history = relationship("PurchaseOrderHistory", back_populates="order", cascade="all, delete-orphan", order_by="PurchaseOrderHistory.date.desc()")


class PurchaseOrderLine(Base):
    __tablename__ = "purchase_order_lines"

    id = Column(String, primary_key=True, default=generate_uuid)
    order_id = Column(String, ForeignKey("purchase_orders.id"), nullable=False)
    product_id = Column(String, ForeignKey("products.id"), nullable=True)
    description = Column(String)
    
    qty_packages = Column(Numeric(12, 2), nullable=True)
    package_size = Column(Numeric(12, 2), nullable=True)
    package_unit = Column(String, nullable=True)
    qty = Column(Numeric(12, 2), nullable=False)
    
    unit_price = Column(Numeric(14, 2), default=0.0)
    discount_pct = Column(Numeric(5, 2), default=0.0)
    vat_rate = Column(Numeric(5, 2), default=0.21)
    net_amount = Column(Numeric(14, 2), default=0.0)
    vat_amount = Column(Numeric(14, 2), default=0.0)
    total_amount = Column(Numeric(14, 2), default=0.0)
    unit_cost = Column(Numeric(14, 2), default=0.0)
    total_cost = Column(Numeric(14, 2), default=0.0)
    line_order = Column(Integer, default=0)
    
    qty_received = Column(Numeric(12, 2), default=0.0)
    qty_invoiced = Column(Numeric(12, 2), default=0.0)

    order = relationship("PurchaseOrder", back_populates="lines")
    product = relationship("Product")


class PurchaseOrderHistory(Base):
    __tablename__ = "purchase_order_history"

    id = Column(String, primary_key=True, default=generate_uuid)
    order_id = Column(String, ForeignKey("purchase_orders.id"), nullable=False)
    user = Column(String, nullable=False)
    date = Column(DateTime, default=datetime.utcnow)
    action = Column(String) # CREACION, MODIFICACION, CONFIRMACION, CANCELACION, etc
    details = Column(Text) # JSON o descripción de lo que cambió

    order = relationship("PurchaseOrder", back_populates="history")


# ══════════════════════════════════════════════
# INVOICE ↔ DELIVERY NOTE (tabla puente M:N)
# ══════════════════════════════════════════════
class InvoiceDeliveryNoteLink(Base):
    __tablename__ = "invoice_delivery_note_links"

    id = Column(String, primary_key=True, default=generate_uuid)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)        # Factura
    delivery_note_id = Column(String, ForeignKey("delivery_notes.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("Document", backref=backref("source_delivery_notes", cascade="all, delete-orphan"))
    delivery_note = relationship("DeliveryNote", back_populates="invoices")

# ══════════════════════════════════════════════
# STOCK MOVEMENT (Movimiento de stock — audit trail)
# ══════════════════════════════════════════════
class StockMovementType(str, enum.Enum):
    IN = "IN"                # Entrada (remito compra)
    OUT = "OUT"              # Salida (remito venta)
    ADJUSTMENT = "ADJUSTMENT"  # Ajuste manual

class StockMovement(Base):
    """Log inmutable de cada movimiento de stock."""
    __tablename__ = "stock_movements"

    id = Column(String, primary_key=True, default=generate_uuid)
    stock_item_id = Column(String, ForeignKey("stock_items.id"), nullable=False)
    movement_type = Column(Enum(StockMovementType), nullable=False)
    qty = Column(Numeric(12, 2), nullable=False)              # + entrada, - salida
    reference_type = Column(String, nullable=True)   # "DELIVERY_NOTE", "REVERSAL", "ADJUSTMENT"
    reference_id = Column(String, nullable=True)     # ID del remito o ajuste
    revision_id = Column(String, nullable=True)      # Agrupa reverse + re-apply en ediciones
    stock_negative = Column(Boolean, default=False)  # True si dejó stock < 0
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    stock_item = relationship("StockItem", backref="movements")


# ══════════════════════════════════════════════
# CONFIGURATION (Puntos de Venta)
# ══════════════════════════════════════════════
class PointOfSale(Base):
    __tablename__ = "points_of_sale"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    pv = Column(String, nullable=False, index=True) # Ej: "00003"
    name = Column(String, nullable=False) # Ej: "Agronomía"
    active = Column(Boolean, default=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    document_configs = relationship("PosDocumentConfig", back_populates="pos", cascade="all, delete-orphan")

class PosDocumentConfig(Base):
    """Configuración de tipo de documento para un PV específico."""
    __tablename__ = "pos_document_configs"
    __table_args__ = (
        UniqueConstraint("pos_id", "document_type", name="uq_pos_document_type"),
    )
    
    id = Column(String, primary_key=True, default=generate_uuid)
    pos_id = Column(String, ForeignKey("points_of_sale.id"), nullable=False)
    document_type = Column(String, nullable=False) # Ej: "OV", "FA", "FB", "NC", "ND", "RE" (Remito)
    last_number = Column(Integer, default=0) # Último número utilizado
    
    pos = relationship("PointOfSale", back_populates="document_configs")

class PDFConfig(Base):
    """Configuración de diseño de PDF (posiciones de campos)."""
    __tablename__ = "pdf_configs"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    # Ej: 'delivery-note-pre-printed', 'sales-order-standard'
    config_key = Column(String, nullable=False, unique=True, index=True) 
    # JSON string con las posiciones
    positions = Column(Text, nullable=False) 
    
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# ══════════════════════════════════════════════
# STOCK MOVEMENT DOCUMENT (Header/Lines)
# ══════════════════════════════════════════════

class StockMovementHeader(Base):
    """Cabecera de un movimiento de stock manual (Ajuste o Transferencia)."""
    __tablename__ = "stock_movement_headers"

    id = Column(String, primary_key=True, default=generate_uuid)
    number = Column(String, unique=True, index=True) 
    date = Column(DateTime, default=datetime.utcnow)
    
    # ADJUSTMENT, TRANSFER, INGRESS, EGRESS
    movement_type = Column(String, default="ADJUSTMENT") 
    
    from_warehouse_id = Column(String, ForeignKey("warehouses.id"), nullable=True)
    to_warehouse_id = Column(String, ForeignKey("warehouses.id"), nullable=True)
    
    transporter = Column(String, nullable=True)
    driver = Column(String, nullable=True)
    cost_center = Column(Integer, default=1) # 1 ARCA, 2 Interno
    notes = Column(Text, nullable=True)
    
    status = Column(String, default="CONFIRMED") # DRAFT, CONFIRMED, CANCELLED
    
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String, nullable=True)

    from_warehouse = relationship("Warehouse", foreign_keys=[from_warehouse_id])
    to_warehouse = relationship("Warehouse", foreign_keys=[to_warehouse_id])
    lines = relationship("StockMovementLine", back_populates="header", cascade="all, delete-orphan")

class StockMovementLine(Base):
    """Línea de un movimiento de stock manual."""
    __tablename__ = "stock_movement_lines"

    id = Column(String, primary_key=True, default=generate_uuid)
    header_id = Column(String, ForeignKey("stock_movement_headers.id"), nullable=False)
    product_id = Column(String, ForeignKey("products.id"), nullable=False)
    
    qty = Column(Numeric(12, 2), nullable=False)
    
    # Lote y Vencimiento
    batch = Column(String, nullable=True)
    expiry_date = Column(DateTime, nullable=True)
    
    # Envases
    container_qty = Column(Numeric(12, 2), nullable=True)
    container_type = Column(String, nullable=True)
    
    notes = Column(String, nullable=True)

    header = relationship("StockMovementHeader", back_populates="lines")
    product = relationship("Product")

class Bank(Base):
    """Banco (Maestro de Bancos)"""
    __tablename__ = "banks"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, unique=True, index=True)
    tax_id = Column(String, nullable=True) # CUIT del banco
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
