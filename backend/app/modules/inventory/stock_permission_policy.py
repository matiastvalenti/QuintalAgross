"""Política de autorización de movimientos de stock."""

from fastapi import HTTPException


MOVEMENT_PERMISSIONS = {
    "TRANSFER": "transfer",
    "ADJUSTMENT": "adjust",
    "INGRESS": "manage",
    "EGRESS": "manage",
}


def required_movement_permission(movement_type: str) -> str:
    if not isinstance(movement_type, str):
        raise HTTPException(
            status_code=400,
            detail="Tipo de movimiento inválido",
        )

    movement_type = movement_type.strip().upper()

    permission = MOVEMENT_PERMISSIONS.get(movement_type)

    if permission is None:
        raise HTTPException(
            status_code=400,
            detail="Tipo de movimiento no permitido",
        )

    return permission
