from fastapi import APIRouter
from . import cheque_router, cash_router

router = APIRouter(prefix="/finance", tags=["Finance"])

router.include_router(cheque_router.router)
router.include_router(cash_router.router)
router.include_router(cash_router.rates_router)
