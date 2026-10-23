"""Recuentos físicos de inventario."""

import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, DateTime, ForeignKey,
    Numeric, Text, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.db.base import Base


class StockCount(Base):
    __tablename__ = "stock_counts"

    id = Column(String, primary_key=True,
                default=lambda: str(uuid.uuid4()))
    warehouse_id = Column(String, ForeignKey("warehouses.id"),
                          nullable=False)
    status = Column(String(20), nullable=False, default="PENDING")
    counted_by = Column(String, nullable=False)
    approved_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)

    lines = relationship(
        "StockCountLine", back_populates="count",
        cascade="all, delete-orphan"
    )


class StockCountLine(Base):
    __tablename__ = "stock_count_lines"

    id = Column(String, primary_key=True,
                default=lambda: str(uuid.uuid4()))
    count_id = Column(String, ForeignKey("stock_counts.id"),
                      nullable=False)
    product_id = Column(String, ForeignKey("products.id"),
                        nullable=False)
    system_qty = Column(Numeric(12, 2), nullable=False)
    reserved_qty = Column(Numeric(12, 2), nullable=False)
    counted_qty = Column(Numeric(12, 2), nullable=False)
    difference = Column(Numeric(12, 2), nullable=False)

    count = relationship("StockCount", back_populates="lines")

    __table_args__ = (
        UniqueConstraint("count_id", "product_id",
                         name="uq_stock_count_product"),
    )
