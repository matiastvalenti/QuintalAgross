from fastapi import APIRouter
from . import sales_order_router, delivery_note_router, sale_condition_router, commission_router, pending_items_router

router = APIRouter(prefix="/sales", tags=["sales"])

router.include_router(sales_order_router.router)
router.include_router(delivery_note_router.router)
router.include_router(sale_condition_router.router)
router.include_router(commission_router.router)
router.include_router(pending_items_router.router)
