# Visión general del proyecto Quintal Agross

Quintal Agross es un sistema ERP agro-comercial y contable pensado para administrar operaciones de clientes, proveedores y entidades mixtas.

El sistema no debe pensarse como módulos aislados de “clientes” y “proveedores”, sino como un sistema basado en **entidades comerciales**. Una entidad puede actuar como cliente, como proveedor o como ambas cosas.

## Entidades

Una entidad representa una persona, empresa o razón social con la que Quintal Agross opera.

Una entidad puede ser:

- Cliente
- Proveedor
- Cliente/Proveedor mixto
- Empleado / vendedor

La regla principal es que una misma razón social o CUIT no debería duplicarse como cliente y proveedor separado. Si una entidad nos compra y también nos vende, debe manejarse como entidad mixta.

## Circuito de clientes

El circuito de clientes representa operaciones donde Quintal Agross vende.

El flujo correcto es:

OV → RV → FV → Recibo

Donde:

- OV = Orden de Venta
- RV = Remito de Venta
- FV = Factura de Venta
- Recibo = Documento que cancela total o parcialmente facturas o notas de débito de venta

La OV representa el compromiso comercial.
El RV representa la entrega física de mercadería.
La FV representa la deuda del cliente.
El Recibo representa la cobranza.

## Circuito de proveedores

El circuito de proveedores representa operaciones donde Quintal Agross compra.

El flujo correcto es:

OC → RC → FC → Orden de Pago

Donde:

- OC = Orden de Compra
- RC = Remito de Compra
- FC = Factura de Compra
- Orden de Pago = Documento que cancela total o parcialmente facturas o notas de débito de compra

La OC representa el compromiso de compra.
El RC representa la recepción física de mercadería.
La FC representa la deuda con el proveedor.
La Orden de Pago representa el pago realizado al proveedor.

## Entidades mixtas

Muchas entidades pueden actuar como cliente y proveedor al mismo tiempo.

Ejemplo:

Una empresa puede comprarnos agroinsumos, pero también puede vendernos cereal, servicios o mercadería.

En esos casos, el sistema debe permitir ver:

1. Cuenta como cliente.
2. Cuenta como proveedor.
3. Vista consolidada.

La vista consolidada debe ser informativa. No debe compensar automáticamente saldos de cliente contra saldos de proveedor salvo que exista una acción explícita de compensación con trazabilidad.

## Resumen de cuenta

El resumen de cuenta debe ser dinámico y entendible.

Para una entidad mixta, debe poder mostrarse:

### Vista como cliente

Debe incluir:

- Facturas de venta
- Notas de débito de venta
- Notas de crédito de venta
- Recibos
- Aplicaciones
- Diferencias de cambio de venta

El saldo representa lo que el cliente le debe a Quintal Agross.

### Vista como proveedor

Debe incluir:

- Facturas de compra
- Notas de débito de compra
- Notas de crédito de compra
- Órdenes de pago
- Aplicaciones
- Diferencias de cambio de compra

El saldo representa lo que Quintal Agross le debe al proveedor.

### Vista consolidada

Debe mostrar:

- Saldo como cliente
- Saldo como proveedor
- Posición neta informativa

La posición neta no debe reemplazar los saldos separados.

## Regla principal del sistema

Antes de agregar nuevas funcionalidades, se debe cerrar correctamente el núcleo:

1. Entidades mixtas.
2. Circuito de clientes: OV → RV → FV → Recibo.
3. Circuito de proveedores: OC → RC → FC → Orden de Pago.
4. Resúmenes de cuenta claros y dinámicos.
5. Aplicaciones de pagos/cobros con trazabilidad.

Todo lo demás —dashboard avanzado, IA interna, reportes complejos, campo, cereales, comisiones avanzadas— debe considerarse secundario hasta que el núcleo funcione correctamente.
