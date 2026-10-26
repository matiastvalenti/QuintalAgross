"""Reglas de instalación y asignación de roles sin acceso a la base de datos."""
import secrets
from fastapi import HTTPException


def verify_setup_token(provided: str, configured: str) -> None:
    if not configured or not provided or not secrets.compare_digest(provided, configured):
        raise HTTPException(status_code=403, detail="Instalación no habilitada o clave inválida")


def ensure_initial_password(password: str) -> None:
    if len(password or "") < 12:
        raise HTTPException(status_code=422, detail="La contraseña inicial debe tener al menos 12 caracteres")


def ensure_role_assignment_allowed(actor_roles, requested_roles, existing_roles=()) -> None:
    actor = set(actor_roles or [])
    affected = set(requested_roles or []) | set(existing_roles or [])
    if "owner" in affected and "owner" not in actor:
        raise HTTPException(status_code=403, detail="Solo un propietario puede administrar propietarios")
    if "admin" in affected and not ({"admin", "owner"} & actor):
        raise HTTPException(status_code=403, detail="Solo administración puede gestionar administradores")
