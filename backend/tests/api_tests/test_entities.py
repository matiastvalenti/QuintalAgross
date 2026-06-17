from test_api_helper import ApiTester

tester = ApiTester()

print("== TESTS DE ENTIDADES (CLIENTES Y PROVEEDORES) ==")

# Listados Generales
tester.check("Listar Entidades", "GET", "/entities/")
tester.check("Obtener Categorias Fiscales", "GET", "/entities/meta/tax-categories")
tester.check("Reporte Ageing Clientes", "GET", "/entities/reports/ageing", params={"type": "client"})

# Para entidades, crearemos una entidad en duro y la testearemos
new_entity = {
    "name": "TEST ENTITY AUTOMATIZADA",
    "is_client": True,
    "is_supplier": False,
    "document_type": "CUIT",
    "document_number": "30111111118",
    "tax_category_id": 1
}

res = tester.check("Crear Entidad de Prueba", "POST", "/entities/", expected_status=[200, 201], body=new_entity)

if res and 'id' in res:
    entity_id = res['id']
    tester.check("Obtener Entidad Creada", "GET", f"/entities/{entity_id}")
    
    # Update entity
    update_data = {"name": "TEST ENTITY AUTOMATIZADA (ACTUALIZADA)"}
    tester.check("Actualizar Entidad", "PUT", f"/entities/{entity_id}", body=update_data)
    
    # Delete entity
    tester.check("Eliminar Entidad", "DELETE", f"/entities/{entity_id}", expected_status=[200, 204])

tester.print_summary("Entidades")
