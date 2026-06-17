from fastapi import APIRouter
from . import product_router, rubros_router, catalog_router, import_router, warehouse_router, stock_router

router = APIRouter(prefix="/inventory", tags=["inventory"])

router.include_router(product_router.router)
router.include_router(warehouse_router.router)
router.include_router(rubros_router.router)
router.include_router(catalog_router.router)
router.include_router(import_router.router)
router.include_router(stock_router.router)
from . import dashboard_router
router.include_router(dashboard_router.router)
