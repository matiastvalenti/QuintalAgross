from test_api_helper import ApiTester

tester = ApiTester()

print("== TESTS DE INVENTARIO ==")

# Listados core
tester.check("Listar Productos", "GET", "/inventory/products/")
tester.check("Listar Depositos", "GET", "/inventory/warehouses/")
tester.check("Listar Rubros", "GET", "/inventory/rubros/")
tester.check("Dashboard Stock Summary", "GET", "/dashboard/summary")

# Creamos un deposito rapido
wh_data = {"name": "DEPOSITO TEST AUTOMATIZADO"}
wh_res = tester.check("Crear Deposito", "POST", "/inventory/warehouses/", expected_status=[200, 201], body=wh_data)

if wh_res and 'id' in wh_res:
    wh_id = wh_res['id']
    tester.check("Eliminar Deposito", "DELETE", f"/inventory/warehouses/{wh_id}", expected_status=[200, 204])

# Intentar buscar un producto (buscador)
tester.check("Buscar Producto", "GET", "/inventory/products/", params={"search": "a"})

tester.print_summary("Inventario")
