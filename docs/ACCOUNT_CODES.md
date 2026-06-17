Códigos de cuentas por defecto

Este archivo describe los códigos de cuenta que se crean automáticamente al iniciar la aplicación. Sirven como cuentas fallback para gastos y ventas de servicios cuando las facturas no traen una cuenta explícita.

- 2.FUEL: Compras - Combustible (estaciones de servicio, nafta)
- 2.MEALS: Compras - Comidas y viáticos (restaurantes, catering)
- 2.SERVICES: Compras - Servicios profesionales (honorarios, mantenimiento)
- 2.TICKET: Compras - Tickets y peajes
- 2.OTHER: Compras - Varios
- 4.SERVICES: Ventas - Servicios (cuando la empresa factura servicios en ventas)
- 4.OTHER: Ventas - Varios
- 6.OTHER: Gastos - Varios (gastos operativos generales)
- 1.1.5: Stock - Inventario (cuenta usada para stock)

Uso:
- Cuando se crea una línea de documento sin `product_id` y sin `account_code`, el sistema intentará inferir la cuenta por palabras clave en la descripción.
- Si no encuentra coincidencias, usará la cuenta `2.OTHER` o `6.OTHER` según el contexto (compra/gasto) o `4.OTHER` para ventas.

Puedes editar o extender esta lista en `api/app/db/session.py` en el bloque de migraciones.
