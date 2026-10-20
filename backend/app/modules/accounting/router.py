from fastapi import APIRouter
from . import fx_router, document_router, financial_automation_router, ledger_router, iva_router, perception_router, accounts_router, applications_router
from app.modules.fx import router as rates_router

router = APIRouter(prefix="/accounting", tags=["accounting"])

router.include_router(fx_router.router)
router.include_router(rates_router.router)
router.include_router(document_router.router)
router.include_router(applications_router.router, prefix="/applications")
router.include_router(financial_automation_router.router)
router.include_router(ledger_router.router)
router.include_router(iva_router.router)
router.include_router(perception_router.router)
router.include_router(accounts_router.router)
