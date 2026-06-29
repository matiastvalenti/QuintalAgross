from fastapi import APIRouter
from app.modules.entities import router as entities
from app.modules.accounting import router as accounting
from app.modules.finance import router as finance
from app.modules.inventory import router as inventory
from app.modules.sales import router as sales

from app.modules.purchases import router as purchases
from app.modules.logistics import vehicle_router
from app.modules import config_router
from app.modules.dashboard import dashboard_router
from app.modules.expenses import expense_router
from app.modules.reports import reports_router
from app.modules.auth import auth_router
from app.modules.tasks import task_router
from app.modules.search_router import router as search_router
from app.modules.field import field_router
from app.modules.inventory import grain_router
from app.modules.accounting.application_router import router as application_router
from app.modules.accounting.applications_router import router as sales_applications_router
from app.modules.entities.accounts_router import accounts_router
from app.api.ai_router import router as ai_router

api_router = APIRouter()

api_router.include_router(entities.router)
api_router.include_router(accounting.router)
api_router.include_router(application_router)
api_router.include_router(sales_applications_router)
api_router.include_router(finance.router)
api_router.include_router(inventory.router)
api_router.include_router(sales.router)

api_router.include_router(purchases.router)
api_router.include_router(vehicle_router.router)
api_router.include_router(config_router.router)
api_router.include_router(dashboard_router.router)
api_router.include_router(expense_router.router)
api_router.include_router(reports_router.router)
api_router.include_router(auth_router.router)
api_router.include_router(task_router.router)
api_router.include_router(field_router.router)
api_router.include_router(grain_router.router)
api_router.include_router(search_router)
api_router.include_router(accounts_router)
api_router.include_router(ai_router)

from app.modules.accounting import commission_router
api_router.include_router(commission_router.router)
