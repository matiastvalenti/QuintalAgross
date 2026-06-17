import os
import uuid
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

from app.core.config import settings

engine = create_engine(
    settings.DATABASE_URL, connect_args={"check_same_thread": False}
)

def run_migrations(engine):
    """
    Inicializa tablas y estructuras básicas.
    Para cambios de esquema incrementales, use 'alembic upgrade head'.
    """
    from app.db.base import Base # Discover models
    try:
        # Esto crea tablas básicas que no existen. 
        # Columnas nuevas deberían venir por Alembic, pero parchearemos las críticas por ahora.
        Base.metadata.create_all(bind=engine)
        
        # Parche manual de columnas para Purchase Orders (Fix 500 error)
        with engine.connect() as conn:
            # Patch for purchase_order_lines
            for col in ['unit_cost', 'total_cost', 'qty_received', 'qty_invoiced']:
                try:
                    conn.execute(text(f"ALTER TABLE purchase_order_lines ADD COLUMN {col} REAL DEFAULT 0.0"))
                    conn.commit()
                    print(f"Patched: Added {col} to purchase_order_lines")
                except Exception:
                    pass # Column already exists
                    
            # Patch for purchase_orders (cabecera)
            for col in ['warehouse_id', 'vendedor', 'salesperson_id', 'attachment_url']:
                try:
                    conn.execute(text(f"ALTER TABLE purchase_orders ADD COLUMN {col} TEXT"))
                    conn.commit()
                    print(f"Patched: Added {col} to purchase_orders")
                except Exception:
                    pass # Column already exists
            
            # Patch for commission_payments
            for col in ['sales_order_id', 'delivery_note_id', 'source_document_id']:
                try:
                    conn.execute(text(f"ALTER TABLE commission_payments ADD COLUMN {col} TEXT"))
                    conn.commit()
                    print(f"Patched: Added {col} to commission_payments")
                except Exception:
                    pass # Column already exists

            # Patch for sales_orders
            for col in ['total_cost', 'created_by', 'updated_by', 'salesperson_id', 'commission_amount']:
                try:
                    conn.execute(text(f"ALTER TABLE sales_orders ADD COLUMN {col} REAL" if 'amount' in col or 'cost' in col else f"ALTER TABLE sales_orders ADD COLUMN {col} TEXT"))
                    conn.commit()
                    print(f"Patched: Added {col} to sales_orders")
                except Exception:
                    pass

            # Patch Entity: nuevos campos de configuración de comisión (v2)
            for col_def in [
                ("commission_mode",          "TEXT DEFAULT 'BY_COLLECTION'"),
                ("commission_currency",      "TEXT DEFAULT 'USD'"),
                ("commission_exchange_mode", "TEXT DEFAULT 'INVOICE_RATE'"),
                ("margin_commission_pct",    "REAL DEFAULT 100.0"),
            ]:
                try:
                    conn.execute(text(f"ALTER TABLE entities ADD COLUMN {col_def[0]} {col_def[1]}"))
                    conn.commit()
                    print(f"Patched: Added {col_def[0]} to entities")
                except Exception:
                    pass  # Column already exists

        print("Estructura de Base de Datos verificada y parcheada.")
    except Exception as e:
        print(f"Error en inicialización de DB: {e}")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
