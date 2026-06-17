from test_api_helper import ApiTester

tester = ApiTester()

print("== TESTS DE VENTAS ==")

# Listados Generales
tester.check("Listar Ordenes de Venta", "GET", "/sales/sales-orders/")
tester.check("Listar Remitos de Venta", "GET", "/sales/delivery-notes/")
tester.check("Listar Facturas de Venta", "GET", "/accounting/documents/", params={"doc_type": "INVOICE"})
tester.check("Listar Notas de Credito", "GET", "/accounting/documents/", params={"doc_type": "CREDIT_NOTE"})
tester.check("Listar Condiciones de Venta", "GET", "/sales/sale-conditions/")
tester.check("Configuraciones POS (Puntos de Venta)", "GET", "/config/pos")

# Intentaremos crear la cabecera vacia de una orden de venta para probar la transaccion
# Para no ensuciar, la borraremos
new_ov_data = {
    "entity_id": "00000000-0000-0000-0000-000000000000", # Asumimos q existe el ID, falla 422 si la tipamos mal, fallara 400 si no existe
    "warehouse_id": "00000000-0000-0000-0000-000000000000", 
    "issue_date": "2024-01-01",
    "status": "DRAFT",
    "pv": "0001",
    "currency": "USD",
    "exchange_rate": 1000,
    "items": []
}

ov_res = tester.check("Validar Creacion OV (Test)", "POST", "/sales/sales-orders/", expected_status=[200, 201, 400, 404], body=new_ov_data) # Puede devolver 400/404 al no existir el UUID falso
# No importa si falla el 400, estamos verificando que responde el endpoint y no crashea

tester.print_summary("Ventas")
