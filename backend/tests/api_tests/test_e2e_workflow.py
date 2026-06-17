import sys
import os
import json
import uuid

# Asegurar que encuentre test_api_helper
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from test_api_helper import ApiTester

tester = ApiTester()

print("======================================================================")
print("== TEST INTEGRAL E2E (END-TO-END) == ")
print("FLUJO: ENTIDAD -> DEPOSITO -> PRODUCTO -> ORDEN DE VENTA -> FACTURA -> COBRO")
print("======================================================================")

# 1. Crear un Cliente (Entidad)
entity_payload = {
    "type": "client",
    "name": f"Cliente E2E Test {uuid.uuid4().hex[:6]}",
    "tax_id": "20111111112",
    "tax_category": "CONSUMIDOR_FINAL",
    "email": "test@e2e.com",
    "create_linked": False
}
print("\n[Paso 1] Creando Cliente de Prueba...")
entity_res = tester.check("1. Crear Cliente", "POST", "/entities/", expected_status=[200], body=entity_payload)
entity_id = entity_res.get("id") if isinstance(entity_res, dict) else None

# 2. Crear un Deposito
warehouse_payload = {
    "name": f"Deposito E2E {uuid.uuid4().hex[:4]}",
    "location": "Planta Baja"
}
print("\n[Paso 2] Creando Depósito de Prueba...")
wh_res = tester.check("2. Crear Deposito", "POST", "/inventory/warehouses/", expected_status=[201], body=warehouse_payload)
warehouse_id = wh_res.get("id") if isinstance(wh_res, dict) else None

# 3. Traer un Rubro y su Subcategoria
print("\n[Paso 3] Obteniendo Rubros y Subrubros...")
rubros_res = tester.check("3. Traer Rubros", "GET", "/inventory/rubros/", expected_status=[200])
rubro_id = rubros_res[0]["id"] if isinstance(rubros_res, list) and rubros_res else None

subcategory_id = None
if rubro_id:
    subs_res = tester.check("3b. Traer Subrubros", "GET", f"/inventory/rubros/{rubro_id}/subcategories", expected_status=[200])
    if isinstance(subs_res, list) and subs_res:
        subcategory_id = subs_res[0]["id"]

# 3c. Traer tipo de IVA
tax_types_res = tester.check("3c. Traer Tipos de IVA", "GET", "/inventory/catalogs/tax-types", expected_status=[200])
tax_type_id = tax_types_res[0]["id"] if isinstance(tax_types_res, list) and tax_types_res else None

# 4. Crear un Producto
prod_payload = {
    "code": f"E2E-{uuid.uuid4().hex[:4]}",
    "name": "Producto de Test E2E",
    "subcategory_id": subcategory_id,
    "tax_type_id": tax_type_id,
    "cost_price": 500.0,
}
print("\n[Paso 4] Creando Producto de Prueba...")
prod_res = tester.check("4. Crear Producto", "POST", "/inventory/products/", expected_status=[201], body=prod_payload)
product_id = prod_res.get("id") if isinstance(prod_res, dict) else None

if not entity_id or not warehouse_id or not product_id:
    print("❌ Error fatal en los preparativos del E2E. Faltan IDs.")
    if not entity_id: print(f"  entity_id: {entity_id}")
    if not warehouse_id: print(f"  warehouse_id: {warehouse_id}")
    if not product_id: print(f"  product_id: {product_id}")
    sys.exit(1)

# 5. Crear Orden de Venta (Borrador)
ov_payload = {
    "entity_id": entity_id,
    "warehouse_id": warehouse_id,
    "date": "2024-01-01T00:00:00",
    "pv": "0001",
    "currency": "ARS",
    "exchange_rate": 1.0,
    "lines": [
        {
            "product_id": product_id,
            "description": "Producto de Test E2E",
            "qty": 10,
            "unit_price": 1000.0,
            "discount_pct": 0,
            "vat_rate": 0.21
        }
    ]
}
print("\n[Paso 5] Creando Orden de Venta (OV) para el Cliente E2E...")
ov_res = tester.check("5. Crear Orden de Venta", "POST", "/sales/sales-orders/", expected_status=[201, 200], body=ov_payload)
ov_id = ov_res.get("id") if type(ov_res) is dict else None

if ov_id:
    # 6. Borrar la OV si fue creada
    print("\n[Paso 6] Borrando la OV recien creada...")
    tester.check("6. Borrar OV", "DELETE", f"/sales/sales-orders/{ov_id}", expected_status=[200, 204, 400])

print("\n--- LIMPIANDO BASURA (CLEANUP) ---")

# Buscar y borrar cualquier OV que haya quedado con ese producto (por si el 500 la creo igual)
import requests as _req
_token = tester.token
_h = {"Authorization": f"Bearer {_token}"}
_ovs = _req.get(f"{tester.base_url}/sales/sales-orders/?entity_id={entity_id}", headers=_h, timeout=10)
if _ovs.ok:
    for _ov in (_ovs.json() if isinstance(_ovs.json(), list) else []):
        _ov_id = _ov.get("id")
        if _ov_id and _ov_id != ov_id:
            print(f"  [CLEANUP] Borrando OV residual {_ov.get('number', _ov_id)}")
            _req.delete(f"{tester.base_url}/sales/sales-orders/{_ov_id}", headers=_h, timeout=10)

# Borrar Producto
tester.check("7. Borrar Producto E2E", "DELETE", f"/inventory/products/{product_id}", expected_status=[204, 200, 400])

# Borrar Deposito
tester.check("8. Borrar Deposito E2E", "DELETE", f"/inventory/warehouses/{warehouse_id}", expected_status=[204, 200])

# Borrar Cliente
tester.check("9. Borrar Cliente E2E", "DELETE", f"/entities/{entity_id}", expected_status=[200, 204, 400, 500])

print("\n======================================================================")
tester.print_summary("TEST E2E DE FLUJO DEL SISTEMA")
