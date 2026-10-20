from fastapi import APIRouter
from . import purchase_order_router, purchase_invoice_router, price_comparison_router, purchase_delivery_note_router, pending_items_router

router = APIRouter(prefix="/purchases", tags=["purchases"])

router.include_router(purchase_order_router.router)
router.include_router(purchase_invoice_router.router)
router.include_router(price_comparison_router.router)
router.include_router(purchase_delivery_note_router.router)
router.include_router(pending_items_router.router)
