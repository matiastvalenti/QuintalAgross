import pytest
from fastapi import HTTPException

from app.modules.auth.security_policy import (
    ensure_initial_password, ensure_role_assignment_allowed, verify_setup_token
)


def test_instalacion_rechaza_token_ausente_o_incorrecto():
    for provided, configured in [("x", ""), ("", "configurada"), ("distinta", "configurada")]:
        with pytest.raises(HTTPException) as err:
            verify_setup_token(provided, configured)
        assert err.value.status_code == 403
    verify_setup_token("configurada", "configurada")


def test_contrasena_inicial_exige_largo_minimo():
    with pytest.raises(HTTPException) as err:
        ensure_initial_password("admin")
    assert err.value.status_code == 422
    ensure_initial_password("clave-segura-2026")


def test_nadie_puede_escalar_roles_por_permiso_de_usuarios():
    for actor, requested, existing in [
        (["viewer"], ["admin"], []),
        (["admin"], ["owner"], []),
        (["admin"], ["viewer"], ["owner"]),
        (["viewer"], [], ["admin"]),
    ]:
        with pytest.raises(HTTPException) as err:
            ensure_role_assignment_allowed(actor, requested, existing)
        assert err.value.status_code == 403
    ensure_role_assignment_allowed(["owner"], ["owner", "admin"])
    ensure_role_assignment_allowed(["admin"], ["admin"])
    ensure_role_assignment_allowed(["viewer"], ["viewer"])
