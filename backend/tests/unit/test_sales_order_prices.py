"""La validación de precio debe funcionar también si se llama directamente a la API."""
import pytest
from pydantic import ValidationError
from app.modules.sales.sales_order_schemas import SalesOrderLineCreate, SalesOrderCreate, SalesOrderUpdate


@pytest.mark.parametrize("price", [0, -1, float("nan"), float("inf")])
def test_rechaza_precios_no_validos(price):
    with pytest.raises(ValidationError, match="precio unitario"):
        SalesOrderLineCreate(qty=20, unit_price=price, product_id="p-1")


def test_rechaza_precio_omitido():
    with pytest.raises(ValidationError):
        SalesOrderLineCreate(qty=20, product_id="p-1")


def test_acepta_precios_positivos_y_validos():
    line = SalesOrderLineCreate(qty=20, unit_price=4.8, product_id="p-1")
    assert line.unit_price == 4.8


def test_no_deja_crear_ni_editar_ov_con_linea_sin_precio():
    invalid = {"qty": 20, "unit_price": 0, "product_id": "p-1"}
    with pytest.raises(ValidationError):
        SalesOrderCreate(entity_id="cliente-1", lines=[invalid])
    with pytest.raises(ValidationError):
        SalesOrderUpdate(lines=[invalid])


def test_ov_debe_contener_por_lo_menos_un_producto():
    with pytest.raises(ValidationError):
        SalesOrderCreate(entity_id='cliente-1', lines=[])
    with pytest.raises(ValidationError):
        SalesOrderCreate(entity_id='cliente-1')
    with pytest.raises(ValidationError):
        SalesOrderUpdate(lines=[])
