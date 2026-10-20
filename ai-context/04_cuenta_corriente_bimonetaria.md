# Cuenta corriente bimonetaria

La cuenta corriente de Quintal Agross debe ser bimonetaria.

Esto significa que el sistema debe mantener saldos separados en pesos y en dólares, sin convertir automáticamente todos los movimientos a una sola moneda.

Cada movimiento debe impactar en la columna correspondiente según su moneda original.

## Objetivo

El resumen de cuenta debe permitir entender claramente:

1. Qué comprobantes componen el saldo.
2. Qué movimientos son de venta o de compra.
3. Qué moneda tiene cada comprobante.
4. Qué cotización se usó.
5. Cómo evoluciona el saldo en pesos.
6. Cómo evoluciona el saldo en dólares.
7. Qué saldo queda como cliente.
8. Qué saldo queda como proveedor.
9. Qué posición consolidada tiene una entidad mixta.

## Columnas del resumen

La cuenta corriente debe tener, como mínimo, estas columnas:

- Fecha
- Comprobante
- Descripción
- Circuito
- Número
- Vencimiento
- Moneda
- Cotización
- Debe Pesos
- Haber Pesos
- Saldo Pesos
- Debe USD
- Haber USD
- Saldo USD

## Nombre de la columna “Circuito”

La columna que identifica si el movimiento pertenece a venta o compra debe llamarse:

`Circuito`

Valores posibles:

- Venta
- Compra
- Cobranza
- Pago
- Ajuste
- Diferencia de Cambio

También puede usarse combinada con el tipo de comprobante.

Ejemplos:

- Factura de Venta
- Factura de Compra
- Recibo de Cliente
- Orden de Pago a Proveedor
- Nota de Débito de Venta
- Nota de Débito de Compra
- Nota de Crédito de Venta
- Nota de Crédito de Compra
- Diferencia de Cambio de Venta
- Diferencia de Cambio de Compra

## Comprobante

La columna `Comprobante` debe mostrar el tipo de documento.

Ejemplos:

- OV
- RV
- FV
- Recibo
- OC
- RC
- FC
- Orden de Pago
- Nota de Débito
- Nota de Crédito
- Diferencia de Cambio

## Número

La columna `Número` debe mostrar el número real del comprobante.

Ejemplos:

- 0003-00000066
- 0001-00000187
- 0003-00000072

## Moneda

La columna `Moneda` debe mostrar la moneda original del comprobante.

Valores esperados:

- ARS
- USD

En pantalla puede mostrarse como:

- $
- U$S

Pero internamente debe mantenerse como:

- ARS
- USD

## Cotización

La columna `Cotización` debe mostrar el tipo de cambio utilizado en ese comprobante o aplicación.

Reglas:

1. Si el comprobante está en pesos, la cotización puede ser 1.
2. Si el comprobante está en dólares, debe mostrar la cotización usada.
3. Los recibos y órdenes de pago deben guardar la cotización con la que se aplicaron.
4. Las diferencias de cambio deben poder reconstruirse desde la cotización original y la cotización de pago/cobro.

## Debe y Haber por moneda

La cuenta debe tener debe/haber separado para pesos y dólares.

Columnas:

- Debe Pesos
- Haber Pesos
- Saldo Pesos
- Debe USD
- Haber USD
- Saldo USD

Un movimiento en pesos solo debe impactar columnas de pesos.

Un movimiento en dólares solo debe impactar columnas de dólares.

No se debe convertir automáticamente un comprobante en dólares a pesos para sumarlo al saldo pesos, salvo en un total informativo separado.

## Vista como cliente

En la vista como cliente, el saldo representa lo que el cliente le debe a Quintal Agross.

Reglas:

- Factura de Venta aumenta el saldo del cliente.
- Nota de Débito de Venta aumenta el saldo del cliente.
- Nota de Crédito de Venta reduce el saldo del cliente.
- Recibo reduce el saldo del cliente.
- Diferencia de Cambio de Venta puede aumentar o reducir el saldo según corresponda.

### Cliente en pesos

Si el comprobante está en ARS:

- Factura de Venta / Nota de Débito: Debe Pesos.
- Recibo / Nota de Crédito: Haber Pesos.
- El Saldo Pesos se recalcula acumulado.

### Cliente en dólares

Si el comprobante está en USD:

- Factura de Venta / Nota de Débito: Debe USD.
- Recibo / Nota de Crédito: Haber USD.
- El Saldo USD se recalcula acumulado.

## Vista como proveedor

En la vista como proveedor, el saldo representa lo que Quintal Agross le debe al proveedor.

Para que el resumen sea entendible, se debe mantener una convención clara y documentada.

Regla recomendada para proveedores:

- Factura de Compra aumenta la deuda con el proveedor.
- Nota de Débito de Compra aumenta la deuda con el proveedor.
- Nota de Crédito de Compra reduce la deuda con el proveedor.
- Orden de Pago reduce la deuda con el proveedor.
- Diferencia de Cambio de Compra puede aumentar o reducir el saldo según corresponda.

En pantalla puede mostrarse con la misma lógica visual:

- Lo que aumenta el saldo se muestra en Debe.
- Lo que reduce el saldo se muestra en Haber.

O puede usarse lógica contable estricta:

- Facturas de compra al Haber.
- Pagos al Debe.

La decisión debe ser única para todo el sistema y no debe cambiar por pantalla.

Para Quintal Agross se recomienda usar una lógica operativa entendible:

- Debe = aumenta saldo reclamable de esa vista.
- Haber = reduce saldo de esa vista.

Así, en vista proveedor, una FC aumenta el saldo que se le debe al proveedor y una Orden de Pago lo reduce.

## Vista consolidada

Para entidades mixtas, la vista consolidada debe mostrar:

- Saldo cliente pesos
- Saldo cliente USD
- Saldo proveedor pesos
- Saldo proveedor USD
- Posición neta pesos
- Posición neta USD
- Total informativo convertido a una cotización de referencia

La vista consolidada no debe compensar automáticamente documentos.

La compensación debe ser una acción explícita y trazable.

## Total informativo convertido

Además de los saldos separados, el sistema puede mostrar un total informativo:

`Saldo total pesos + USD convertido a cotización de referencia`

Ejemplo:

Saldo Pesos: $3.718.114,60
Saldo USD: U$S 8.996,89
Cotización referencia: 932,50
Total informativo: $12.107.714,53

Este total es solo informativo.

No reemplaza los saldos separados.

## Saldo anterior

El resumen debe contemplar saldo anterior.

Si se consulta desde una fecha posterior al inicio histórico de la entidad, el sistema debe calcular:

- Saldo anterior pesos
- Saldo anterior USD

Luego debe continuar acumulando los movimientos del período seleccionado.

## Saldo a vencer

El sistema debe poder mostrar saldo a vencer.

Saldo a vencer significa saldo de comprobantes pendientes cuyo vencimiento todavía no ocurrió.

Debe calcularse separado por moneda:

- Saldo a vencer pesos
- Saldo a vencer USD

## Saldo vencido

El sistema también debería permitir calcular saldo vencido.

Saldo vencido significa saldo de comprobantes pendientes cuyo vencimiento ya pasó.

Debe calcularse separado por moneda:

- Saldo vencido pesos
- Saldo vencido USD

## Ordenamiento

El resumen debe ordenarse por fecha de operación.

Si hay varios movimientos el mismo día, debe respetarse un orden estable:

1. Fecha
2. Fecha de creación
3. Tipo de comprobante
4. Número
5. ID interno

## Aplicaciones

Los recibos y órdenes de pago deben mostrar claramente contra qué documentos fueron aplicados.

Ejemplo:

Recibo 0001-00000187 aplicado a FV 0003-00000066.

Orden de Pago 0001-00000045 aplicada a FC 0002-00000321.

Las aplicaciones deben poder reconstruirse.

## Diferencias de cambio

Las diferencias de cambio deben quedar separadas como movimientos propios.

Deben mostrar:

- Comprobante generado
- Documento origen
- Cotización original
- Cotización de aplicación
- Importe calculado
- Moneda
- Saldo resultante

## Formato visual recomendado

La grilla de cuenta corriente debe tener este orden:

Fecha | Comprobante | Descripción | Circuito | Número | Vto | Moneda | Cotización | Debe Pesos | Haber Pesos | Saldo Pesos | Debe USD | Haber USD | Saldo USD

## Regla clave

Nunca mezclar saldos de pesos y dólares en una sola columna principal.

Los saldos principales deben mantenerse separados:

- Saldo Pesos
- Saldo USD

Cualquier conversión debe mostrarse como total informativo adicional.
