# 📖 Reglas Contables - Quintal Agross

Este documento define las bases técnicas y contables del motor de cuentas corrientes.

## 1. Convención Multimoneda

- **Moneda Funcional**: ARS (Peso Argentino). Todo el sistema debe ser capaz de expresar saldos en ARS.
- **Moneda de Gestión**: USD (Dólar Estadounidense).
- **Tipo de Cambio (TC)**:
  - Para documentos en ARS, el TC es 1.0.
  - Para documentos en USD, el TC es obligatorio y representa el valor de 1 USD en ARS al momento del alta.

### Campos de Almacenamiento

En cada documento se guardan:

1. `total_amount`: Monto en la moneda original de la transacción.
2. `exchange_rate`: Cotización utilizada.
3. `total_amount_ars`: `total_amount * exchange_rate`. Este valor queda "congelado" para representar la deuda histórica en moneda local.

## 2. Redondeos

- Se utilizarán **2 decimales** para importes monetarios.
- El redondeo se aplica en el cálculo de `total_amount_ars` y al repartir aplicaciones parciales.

## 3. Lógica de Documentos

- **Deuda (Suma al Saldo)**: `INVOICE` (Factura), `DEBIT_NOTE` (Nota de Débito).
- **Crédito (Resta al Saldo)**: `RECEIPT` (Recibo), `CREDIT_NOTE` (Nota de Crédito), `PAYMENT` (Orden de Pago).

## 4. Aplicaciones

- Una aplicación vincula un documento de **Crédito** con uno de **Deuda**.
- Se registra `amount_applied` (en la moneda de la factura destino) y `amount_applied_ars` (calculado).
- Esto permite detectar **Diferencias de Cambio** cuando el TC del Pago difiere del TC de la Factura (a implementar en T2.1.6).
