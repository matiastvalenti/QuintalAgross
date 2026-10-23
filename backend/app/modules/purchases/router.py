from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models.commercial_models import SaleCondition
from app.modules.auth.auth_router import check_permission
from . import purchase_order_router, purchase_invoice_router, price_comparison_router, purchase_delivery_note_router, pending_items_router

router = APIRouter(prefix="/purchases", tags=["purchases"])

@router.get("/purchase-conditions/", dependencies=[Depends(check_permission("purchase_orders", "view"))])
def list_purchase_conditions(db: Session = Depends(get_db)):
    """Opciones de pago de compras. Comparte catálogo con condiciones comerciales."""
    return db.query(SaleCondition).all()


router.include_router(purchase_order_router.router)
router.include_router(purchase_invoice_router.router)
router.include_router(price_comparison_router.router)
router.include_router(purchase_delivery_note_router.router)
router.include_router(pending_items_router.router)
