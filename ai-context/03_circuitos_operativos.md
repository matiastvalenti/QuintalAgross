# Circuitos operativos de Quintal Agross

El sistema tiene dos circuitos principales: circuito de clientes y circuito de proveedores.

Ambos circuitos son parecidos, pero no deben mezclarse.

## Circuito de clientes

El circuito de clientes representa ventas realizadas por Quintal Agross.

Flujo:

OV → RV → FV → Recibo

## OV — Orden de Venta

La OV representa el pedido o compromiso comercial con el cliente.

Debe contener:

- Cliente
- Fecha
- Punto de venta o numeración interna
- Productos
- Cantidades
- Precio
- Bonificación
- IVA
- Moneda
- Tipo de cambio
- Condición de venta
- Vendedor
- Centro de costo
- Observaciones
- Estado

La OV no necesariamente impacta cuenta corriente.

La OV puede reservar stock si el sistema lo define así.

## RV — Remito de Venta

El RV representa la entrega física al cliente.

Debe poder generarse desde una OV.

Reglas:

1. Puede ser total o parcial.
2. No debe permitir remitir más cantidad que la pendiente.
3. Debe actualizar la cantidad entregada de la OV.
4. Debe impactar stock de salida cuando se confirma o despacha.
5. Debe mantener trazabilidad contra la OV.

## FV — Factura de Venta

La FV representa la deuda del cliente.

Puede generarse:

- Manualmente.
- Desde una OV.
- Desde remitos vinculados, si el sistema lo permite.

Reglas:

1. Puede ser total o parcial.
2. No debe permitir facturar más cantidad que la pendiente.
3. Debe actualizar la cantidad facturada de la OV.
4. Debe generar movimiento de cuenta corriente del cliente.
5. Debe mantener trazabilidad contra OV y/o RV.

## Recibo

El Recibo representa la cobranza al cliente.

Reglas:

1. Debe aplicarse contra facturas de venta, notas de débito u otros documentos pendientes de cobro.
2. Puede cancelar total o parcialmente.
3. Debe actualizar el saldo de los documentos aplicados.
4. Debe mantener trazabilidad de aplicaciones.
5. Puede generar diferencia de cambio si corresponde.

## Circuito de proveedores

El circuito de proveedores representa compras realizadas por Quintal Agross.

Flujo:

OC → RC → FC → Orden de Pago

## OC — Orden de Compra

La OC representa el compromiso de compra con el proveedor.

Debe contener:

- Proveedor
- Fecha
- Productos
- Cantidades
- Precio
- Bonificación
- IVA
- Moneda
- Tipo de cambio
- Condición de compra/pago
- Centro de costo
- Observaciones
- Estado

La OC no necesariamente impacta cuenta corriente.

## RC — Remito de Compra

El RC representa la recepción física desde un proveedor.

Debe poder generarse desde una OC.

Reglas:

1. Puede ser total o parcial.
2. No debe permitir recibir más cantidad que la pendiente.
3. Debe actualizar la cantidad recibida de la OC.
4. Debe impactar stock de entrada cuando se confirma.
5. Debe mantener trazabilidad contra la OC.

## FC — Factura de Compra

La FC representa la deuda de Quintal Agross con el proveedor.

Puede generarse:

- Manualmente.
- Desde una OC.
- Desde remitos de compra vinculados, si el sistema lo permite.

Reglas:

1. Puede ser total o parcial.
2. No debe permitir facturar más cantidad que la pendiente.
3. Debe actualizar la cantidad facturada de la OC.
4. Debe generar movimiento de cuenta corriente del proveedor.
5. Debe mantener trazabilidad contra OC y/o RC.

## Orden de Pago

La Orden de Pago representa el pago realizado a un proveedor.

Reglas:

1. Debe aplicarse contra facturas de compra, notas de débito de compra u otros documentos pendientes de pago.
2. Puede cancelar total o parcialmente.
3. Debe actualizar el saldo de los documentos aplicados.
4. Debe mantener trazabilidad de aplicaciones.
5. Puede generar diferencia de cambio si corresponde.

## Regla general de trazabilidad

Todo documento generado desde otro debe conservar vínculo con su origen.

Ejemplos:

- RV generado desde OV.
- FV generada desde OV.
- FV generada desde RV.
- RC generado desde OC.
- FC generada desde OC.
- FC generada desde RC.
- Recibo aplicado a FV.
- Orden de Pago aplicada a FC.

El usuario debe poder entender de dónde viene cada documento y qué cantidad queda pendiente.
