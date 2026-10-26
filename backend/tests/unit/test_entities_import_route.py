"""Evita que el alta masiva quede desconectada de las rutas públicas."""
from pathlib import Path


def test_excel_import_is_mounted_before_generic_entity_id_route():
    source = (Path(__file__).resolve().parents[2] / "app/api/router.py").read_text(encoding="utf-8")
    assert "from app.modules.entities.import_router import router as entities_import_router" in source
    assert "api_router.include_router(entities_import_router)" in source
    assert source.index("api_router.include_router(entities_import_router)") < source.index(
        "api_router.include_router(entities.router)"
    )
