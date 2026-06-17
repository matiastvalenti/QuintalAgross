# Ajuste por Diferencia de Cambio (FX Adjustment) — T2.1.6

## Descripción

Cuando se aplica un crédito (recibo/pago) a una factura en moneda extranjera con un TC distinto al de la factura, se genera una diferencia de cambio que debe facturarse como **ND** (si el TC subió) o **NC** (si bajó).

## Lógica de Cálculo

1. Se toma el `TC factura` y el `TC aplicación`.
2. Por cada **línea** de la factura, se calcula la proporción aplicada:
   - `applied_to_line = amount_applied × (line.total / invoice.total)`
3. Se calcula la diferencia en ARS:
   - `diff = applied_to_line × (TC_app - TC_fac)`
4. Se descompone respetando la alícuota IVA de la línea:
   - `neto = diff / (1 + vat_rate)`
   - `iva = diff - neto`
5. Si `diff > 0` → ND. Si `diff < 0` → NC (montos absolutos).

## Reglas

| Regla            | Detalle                                                         |
| ---------------- | --------------------------------------------------------------- |
| **Umbral**       | Si `abs(diff_total) < 1 ARS` → sin ajuste                       |
| **Redondeo**     | 2 decimales. Ajuste de centavos en la línea de mayor neto       |
| **Moneda**       | La ND/NC siempre en ARS                                         |
| **Idempotencia** | `FxAdjustmentLink` tiene unique constraint por `application_id` |
| **Trazabilidad** | Se guardan TC factura, TC app, monto aplicado, diff total       |

## Endpoints

| Endpoint                                             | Método | Descripción                |
| ---------------------------------------------------- | ------ | -------------------------- |
| `/documents/applications/{id}/fx-adjustment/preview` | POST   | Calcula borrador           |
| `/documents/applications/{id}/fx-adjustment/confirm` | POST   | Genera ND/NC (idempotente) |
| `/documents/{id}/fx-links`                           | GET    | Lista ajustes vinculados   |

## Modelos Nuevos

- `DocumentLine`: renglones de factura con `vat_rate`
- `FxAdjustmentLink`: vínculo entre aplicación y ND/NC generada
- `ApplicationAllocation`: stub para futura asignación manual
