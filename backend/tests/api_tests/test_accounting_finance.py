from test_api_helper import ApiTester

tester = ApiTester()

print("== TESTS DE CONTABILIDAD Y FINANZAS ==")

# Finanzas (Caja y Banco)
tester.check("Tasas de Cambio", "GET", "/finance/rates/latest")
tester.check("Listar Cheques", "GET", "/finance/cheques/")
tester.check("Listar Recibos de Cobro", "GET", "/accounting/documents/", params={"doc_type": "RECEIPT"})
tester.check("Listar Ordenes de Pago", "GET", "/accounting/documents/", params={"doc_type": "PAYMENT"})

# Contabilidad General 
tester.check("Listar Plan de Cuentas (Libro Mayor)", "GET", "/accounting/accounts-ledger/")
tester.check("Listar Asientos Manuales", "GET", "/accounting/accounts-ledger/entries")

# Tasks y Dashboard
tester.check("Notificaciones Activadas", "GET", "/tasks/notifications", params={"unread_only": "true"})
tester.check("Dashboard Ventas 30 dias", "GET", "/dashboard/sales-chart", params={"days": "30"})

tester.print_summary("Contabilidad y Finanzas")
