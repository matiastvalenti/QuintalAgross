"""Autorización de operaciones de stock."""

from fastapi import HTTPException
from app.modules.auth.auth_router import get_effective_permissions
from .stock_permission_policy import required_movement_permission


def authorize_stock_action(db, user, action):
    if user is None or not getattr(user, "active", False):
        raise HTTPException(401, "Usuario inactivo o no autenticado")

    roles = getattr(user, "roles", None) or []
    if "admin" in roles or "owner" in roles:
        return user

    permissions = get_effective_permissions(user, db)
    if permissions.get("inventory", {}).get(action) is True:
        return user

    raise HTTPException(
        403, f"Sin permiso para {action} en inventario"
    )


def authorize_stock_movement(db, user, movement_type):
    action = required_movement_permission(movement_type)
    return authorize_stock_action(db, user, action)
