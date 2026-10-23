"""Permisos para operaciones de inventario."""

from app.modules.auth.auth_router import check_permission


stock_view = check_permission("inventory", "view")
stock_adjust = check_permission("inventory", "adjust")
stock_transfer = check_permission("inventory", "transfer")
stock_count = check_permission("inventory", "count")
stock_approve = check_permission("inventory", "approve")
stock_manage = check_permission("inventory", "manage")
