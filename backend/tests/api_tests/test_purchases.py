from test_api_helper import ApiTester

tester = ApiTester()

print("== TESTS DE COMPRAS ==")

tester.check("Listar Ordenes de Compra", "GET", "/purchases/purchase-orders/")
tester.check("Listar Remitos de Compra (Ingresos)", "GET", "/sales/delivery-notes/", params={"note_type": "PURCHASE"})
tester.check("Listar Facturas de Compra (API Gral Documentos)", "GET", "/accounting/documents/", params={"doc_type": "PURCHASE_INVOICE"})
tester.check("Listar Notas de Credito Proveedor", "GET", "/accounting/documents/", params={"doc_type": "PURCHASE_CREDIT_NOTE"})

tester.print_summary("Compras")
