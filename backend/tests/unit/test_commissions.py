import pytest
from datetime import datetime
from app.modules.sales.commission_router import get_commission_summary
from app.db.models.commercial_models import SalesOrder, OrderStatus
from app.db.models.models import Entity, EntityType

def test_commission_summary_empty(db):
    """Test summary when no data exists."""
    summary = get_commission_summary(db=db)
    assert len(summary) == 0

def test_commission_summary_with_ov(db):
    """Test summary with a single sales order."""
    # 1. Create a salesperson
    sp = Entity(name="Vendedor Test", type=EntityType.EMPLOYEE, is_salesperson=True)
    db.add(sp)
    db.commit()
    
    # 2. Create a Sales Order
    ov = SalesOrder(
        number="OV-0001",
        date=datetime.now(),
        salesperson_id=sp.id,
        total_amount=1000.0,
        commission_amount=100.0,
        commission_paid_amount=20.0,
        status=OrderStatus.PENDING
    )
    db.add(ov)
    db.commit()
    
    summary = get_commission_summary(db=db)
    
    assert len(summary) == 1
    assert summary[0].salesperson_name == "Vendedor Test"
    assert summary[0].total_commission == 100.0
    assert summary[0].paid_commission == 20.0
    assert summary[0].pending_commission == 80.0
    assert summary[0].document_count == 1
