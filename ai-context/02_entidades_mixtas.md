# Entidades mixtas en Quintal Agross

El sistema debe manejar una única base de entidades comerciales.

Una entidad puede actuar como:

- Cliente
- Proveedor
- Cliente y proveedor al mismo tiempo
- Empleado / vendedor

El sistema no debe asumir que cliente y proveedor son registros completamente separados. En Quintal Agross muchas entidades pueden comprarnos y también vendernos.

## Regla principal

Una misma razón social o CUIT no debería duplicarse como cliente y proveedor separado.

Si una entidad ya existe como cliente y luego también se necesita usar como proveedor, debe convertirse a entidad mixta.

Si una entidad ya existe como proveedor y luego también se necesita usar como cliente, debe convertirse a entidad mixta.

## Tipos de entidad

Los tipos esperados son:

- `CLIENT`: entidad que solo nos compra.
- `PROVIDER`: entidad que solo nos vende.
- `MIXED`: entidad que nos compra y también nos vende.
- `EMPLOYEE`: empleado, vendedor u otro uso interno.

## CUIT / identificación fiscal

El CUIT o identificación fiscal debe usarse como dato fuerte para detectar duplicados.

Reglas:

1. Si se crea una entidad con un CUIT que ya existe, el sistema debe advertirlo.
2. No se debe crear automáticamente un duplicado.
3. Debe ofrecerse usar la entidad existente.
4. Si corresponde, debe convertirse la entidad existente a `MIXED`.
5. Si por algún motivo se permite duplicar, debe quedar claramente justificado y trazable.

## Ejemplo

Caso:

Una empresa llamada Agro X ya existe como cliente porque nos compra agroinsumos.

Luego Agro X empieza a vendernos cereal o servicios.

No debe crearse otro registro “Agro X proveedor”.

Debe quedar:

Entidad: Agro X
Tipo: `MIXED`

Y dentro de esa entidad deben existir dos vistas:

1. Vista como cliente.
2. Vista como proveedor.

## Vista como cliente

Cuando una entidad actúa como cliente, el sistema debe mostrar y operar con:

- OV: Orden de Venta
- RV: Remito de Venta
- FV: Factura de Venta
- Recibo
- Notas de débito de venta
- Notas de crédito de venta
- Diferencias de cambio de venta
- Aplicaciones de cobros

El saldo de esta vista representa lo que el cliente le debe a Quintal Agross.

## Vista como proveedor

Cuando una entidad actúa como proveedor, el sistema debe mostrar y operar con:

- OC: Orden de Compra
- RC: Remito de Compra
- FC: Factura de Compra
- Orden de Pago
- Notas de débito de compra
- Notas de crédito de compra
- Diferencias de cambio de compra
- Aplicaciones de pagos

El saldo de esta vista representa lo que Quintal Agross le debe al proveedor.

## Vista consolidada

Para entidades mixtas, el sistema debe permitir una vista consolidada.

La vista consolidada debe mostrar:

- Saldo como cliente
- Saldo como proveedor
- Posición neta informativa

La posición neta no debe compensar automáticamente los saldos.

Ejemplo:

Saldo como cliente: Agro X nos debe USD 5.000
Saldo como proveedor: Quintal Agross le debe USD 2.000
Posición neta informativa: Agro X nos debe USD 3.000

Esto no significa que el sistema deba cancelar automáticamente los USD 2.000 contra los USD 5.000.

Para compensar saldos debe existir una acción explícita, registrada y trazable.

## Reglas de implementación

1. No crear clientes y proveedores duplicados por defecto.
2. Priorizar una entidad única con `type = MIXED`.
3. Las pantallas deben mostrar claramente el rol en el que se está trabajando.
4. Los resúmenes de cuenta deben poder filtrarse por rol:
   - Cliente
   - Proveedor
   - Consolidado

5. Los documentos de venta y de compra no deben mezclarse sin separación visual.
6. Las aplicaciones de cobros y pagos deben respetar el tipo de circuito.
7. La vista consolidada es informativa, no contable automática.

## Impacto en pantallas

Las pantallas de entidades deben permitir identificar si una entidad es:

- Cliente
- Proveedor
- Mixta

Las pantallas de cuenta corriente deben tener pestañas o filtros claros:

- Como cliente
- Como proveedor
- Consolidado

Las pantallas de documentos deben evitar confusiones entre documentos de venta y documentos de compra.

## Impacto en backend

El backend debe poder consultar los documentos de una entidad separando:

- Documentos donde actúa como cliente.
- Documentos donde actúa como proveedor.
- Documentos consolidados.

La lógica de saldo no debe depender solo del nombre de la entidad, sino del tipo de documento y del rol operativo.

## Impacto en frontend

El frontend debe mostrar la información de forma entendible para enviar o explicar a clientes/proveedores.

Para una entidad mixta, el usuario debe poder generar o visualizar:

- Resumen como cliente.
- Resumen como proveedor.
- Resumen consolidado.

Cada resumen debe ser claro y no mezclar movimientos sin indicar su origen.
