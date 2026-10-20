# Auditoría de Flujos Operativos - Quintal Agross

Este documento contiene la auditoría completa de los flujos operativos de clientes y proveedores en el sistema Quintal Agross.

---

## 1. Flujo Clientes — OV (Orden de Venta)

* **Cómo se crea una OV**:
  Se crea mediante una solicitud HTTP POST a `/sales-orders/` definida en [sales_order_router.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/modules/sales/sales_order_router.py#L178-L183). El frontend expone este flujo en [SalesOrderForm.jsx](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/sales/SalesOrderForm.jsx).
* **Qué campos guarda**:
  Guarda `entity_id` (cliente), `warehouse_id` (depósito), `number` (formato `"PV-Numero"`), `date`, `status` (`DRAFT`, `CONFIRMED`, `PARTIALLY_DELIVERED`, etc.), `currency`, `exchange_rate`, `cost_center`, `sale_condition_id`, `total_amount`, `total_cost`, `margin_amount`, `vendedor`, `salesperson_id` y `commission_amount`. Las líneas de detalle (`SalesOrderLine`) guardan `product_id`, `qty`, `qty_delivered`, `qty_invoiced`, `unit_price`, `discount_pct`, `vat_rate`, `unit_cost`, `total_cost` y `margin_amount`.
* **Si permite cantidades parciales**:
  **OK**. Las cantidades de la orden son `qty` (total comprometido), y se trackean entregas y facturaciones parciales en los campos `qty_delivered` y `qty_invoiced`.
* **Si guarda `qty_delivered` y `qty_invoiced`**:
  **OK**. Se definen como columnas numéricas en `SalesOrderLine` dentro de [commercial_models.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/db/models/commercial_models.py#L339-L340).
* **Cómo se calcula estado**:
  **OK / Parcial**. El estado (`status`) de la OV se recalcula dinámicamente mediante la función `recalc_sales_order_status` en [sales_utils.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/modules/sales/sales_utils.py#L160) comparando las sumas de las cantidades entregadas (`qty_delivered`) e invoiced (`qty_invoiced`) de cada línea respecto a `qty`, usando una tolerancia para punto flotante (`0.0001`). Los estados resultantes son `COMPLETED`, `FULLY_DELIVERED`, `PARTIALLY_DELIVERED`, `INVOICED`, `PARTIALLY_INVOICED`, `CONFIRMED`, etc.
* **Qué errores o riesgos hay**:
  * **Riesgo**: Los valores `qty_delivered` y `qty_invoiced` de la OV dependen de actualizaciones manuales/secuenciales en los routers de remitos y facturas. Si un proceso falla a mitad de camino o se editan/cancelan documentos relacionados sin pasar por las funciones controladoras, se genera desalineación de estados. Para mitigar esto, existe un mecanismo fuzzy de recuperación (`sync_sales_order_traceability`) que se ejecuta al listar/leer, pero es computacionalmente costoso porque realiza búsquedas tipo texto e intercepciones de bases de datos.

---

## 2. Flujo Clientes — RV (Remito de Venta)

* **Cómo se genera un Remito de Venta desde OV**:
  Se genera en el endpoint POST `/delivery-notes/` en [delivery_note_router.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/modules/sales/delivery_note_router.py) que permite vincular opcionalmente un `sales_order_id`. El frontend maneja este formulario en [DeliveryNoteForm.jsx](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/sales/DeliveryNoteForm.jsx).
* **Si puede ser parcial**:
  **OK**. Permite especificar una cantidad (`qty`) menor a la pendiente de la orden de venta enlazada.
* **Si impide remitir más que lo pendiente**:
  **OK**. Durante la creación del remito, el backend valida línea por línea que `line.qty` del remito no supere el pendiente de la OV (`qty - qty_delivered`).
* **Si actualiza `qty_delivered`**:
  **OK**. Al confirmar/despachar el remito, se actualizan las cantidades en la OV y se recalcula su estado.
* **Si impacta stock**:
  **OK**. Impacta el stock físico restando la cantidad entregada (`qty_on_hand` disminuye) del depósito seleccionado y reduciendo/liberando la cantidad reservada (`qty_reserved` disminuye) si la OV previa había reservado stock.
* **Si mantiene vínculo con OV**:
  **OK**. Se mantiene a través del campo `sales_order_id` en `DeliveryNote` y `source_sales_line_id` en `DeliveryNoteLine`.
* **Qué errores o riesgos hay**:
  * **Riesgo**: Si un remito confirmado se cancela o modifica, el backend debe revertir las cantidades en la orden y el stock. Si existe inconsistencia en los estados intermedios del remito, o si se elimina directamente de la base de datos sin disparar las reversiones del stock, los inventarios quedan desfasados.

---

## 3. Flujo Clientes — FV (Factura de Venta)

* **Cómo se genera una Factura de Venta**:
  Se genera como un `Document` de tipo `INVOICE` a través de los endpoints expuestos en [document_router.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/modules/accounting/document_router.py). El frontend interactúa a través de [InvoiceForm.jsx](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/sales/InvoiceForm.jsx).
* **Si puede crearse manualmente**:
  **OK**. El sistema permite crear facturas de venta directas sin necesidad de remito u orden previa.
* **Si puede crearse desde OV**:
  **OK**. Se puede facturar una orden de venta directamente vinculando sus ítems.
* **Si puede crearse desde RV**:
  **OK**. El endpoint `/documents/bulk-invoice` permite facturar uno o varios remitos acumulando sus cantidades.
* **Si permite facturación parcial por ítem**:
  **OK**. Se pueden asociar cantidades parciales en las líneas del documento.
* **Si impide facturar más que lo pendiente**:
  **OK / Parcial**. El backend valida y restringe los límites al crear facturas desde OV o RV, pero un error de redondeo decimal podría permitir pequeñas diferencias en la sumatoria.
* **Si actualiza `qty_invoiced`**:
  **OK**. Al persistir e impactar la factura en la base de datos, se incrementa `qty_invoiced` en las líneas de la orden o remito de origen.
* **Si mantiene vínculo con OV/RV**:
  **OK**. Se almacena la trazabilidad mediante `InvoiceDeliveryNoteLink` y `source_sales_line_id` en las líneas.
* **Si impacta cuenta corriente**:
  **OK**. Al crearse la factura en estado `OPEN`, impacta de manera inmediata en la cuenta corriente del cliente como un saldo deudor (Débito).
* **Qué errores o riesgos hay**:
  * **Riesgo**: La creación de facturas desde múltiples remitos a la vez (`bulk-invoice`) puede fallar si los remitos están en distintas monedas o poseen tipos de cambio desactualizados, lo que genera inconsistencia en los totales registrados en pesos argentinos (`total_amount_ars`).

---

## 4. Flujo Clientes — Recibo

* **Cómo se crea un recibo**:
  Se crea como un `Document` con tipo `RECEIPT` que recopila ítems de cobro (`PaymentItem` como transferencias, cheques, efectivo) y se asocia a la entidad. En el frontend se gestiona mediante [ReceiptForm.jsx](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/finance/ReceiptForm.jsx).
* **Si aplica contra facturas/ND**:
  **OK**. Se realiza mediante la creación de registros en la tabla de imputaciones `Application` vinculando el recibo (origen) con la factura o nota de débito (destino).
* **Si permite aplicación parcial**:
  **OK**. La aplicación define un `amount_applied` que puede ser inferior al total del documento de cobro o de la factura.
* **Si actualiza saldos**:
  **OK**. Los saldos pendientes no se almacenan como columnas fijas, sino que se calculan en tiempo real al restar de la factura (`total_amount`) el total de las aplicaciones recibidas.
* **Si maneja moneda ARS/USD**:
  **OK**. El recibo soporta bimonetariedad guardando el tipo de cambio y realizando conversiones automáticas en `amount_applied_ars`.
* **Si maneja diferencia de cambio**:
  **OK**. Al aplicar fondos con tipos de cambio diferentes entre el recibo y la factura de venta en dólares, el servicio [fx_service.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/modules/accounting/fx_service.py) genera automáticamente notas de débito o crédito por diferencia de cambio (`DEBIT_NOTE`/`CREDIT_NOTE` con flag `is_fx_adjustment = True`).
* **Qué errores o riesgos hay**:
  * **Riesgo**: Si un usuario elimina una aplicación (`Application`), el sistema revierte los saldos pero debe anular o eliminar las ND/NC por diferencia de cambio que fueron generadas automáticamente. Si estas últimas ya poseen CAE (facturación electrónica AFIP), no se pueden borrar físicamente de la base de datos, lo que requiere un control estricto de anulación.

---

## 5. Flujo Proveedores — OC (Orden de Compra)

* **Cómo se crea una OC**:
  Se crea mediante POST a `/purchase-orders/` implementado en [purchase_order_router.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/modules/purchases/purchase_order_router.py).
* **Qué campos guarda**:
  Guarda `entity_id` (proveedor), `warehouse_id`, `number` (`OC-XXXX`), `date`, `currency`, `exchange_rate`, `cost_center`, `sale_condition_id`, `total_amount`, `status`, `notes`.
* **Si guarda `qty_received` y `qty_invoiced`**:
  **OK**. Se encuentran definidos en la clase `PurchaseOrderLine` en [commercial_models.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/db/models/commercial_models.py#L547-L548).
* **Cómo calcula estado**:
  **OK**. Al igual que las ventas, se evalúa en `recalc_purchase_order_status` dentro de [sales_utils.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/modules/sales/sales_utils.py#L240) contrastando `qty_received` y `qty_invoiced` contra la cantidad pedida.
* **Qué errores o riesgos hay**:
  * **Riesgo**: El flujo de compras no cuenta con un método de "sincronización y sanación fuzzy" (`sync_sales_order_traceability`) tan avanzado como el de ventas. Si ocurre una desincronización manual en las cantidades de una OC, no hay un proceso automático en el backend para corregirla salvo editando la orden.

---

## 6. Flujo Proveedores — RC (Remito de Compra)

* **Cómo se genera un Remito de Compra desde OC**:
  Se utiliza el mismo modelo `DeliveryNote` parametrizado con `note_type = OrderType.PURCHASE`. Se vincula a la OC mediante `purchase_order_id`. El frontend expone esto en [PurchaseDeliveryNoteForm.jsx](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/purchases/PurchaseDeliveryNoteForm.jsx).
* **Si puede ser parcial**:
  **OK**. Permite el ingreso parcial de mercadería.
* **Si impide recibir más que lo pendiente**:
  **OK**. Valida que la cantidad recibida no exceda `qty - qty_received` en la línea de la OC.
* **Si actualiza `qty_received`**:
  **OK**. Suma a `qty_received` en la OC al momento de confirmarse.
* **Si impacta stock de entrada**:
  **OK**. Suma al stock físico (`qty_on_hand`) del depósito destino.
* **Si mantiene vínculo con OC**:
  **OK**. Se almacena en la cabecera `purchase_order_id` y en las líneas `source_purchase_line_id`.
* **Qué errores o riesgos hay**:
  * **Riesgo**: La recepción física de un remito de compra a veces puede diferir de las cantidades especificadas por el proveedor en su remito de papel. Si se carga de más por error, se altera el stock de forma incorrecta y se bloquean facturaciones posteriores si superan los límites de la OC enlazada.

---

## 7. Flujo Proveedores — FC (Factura de Compra)

* **Cómo se crea una Factura de Compra**:
  Se crea como un `Document` de tipo `PURCHASE_INVOICE`. El backend permite procesar un archivo PDF/imagen mediante OCR/IA en el endpoint POST `/purchase-invoices/process` y luego persistirlo usando `/purchase-invoices/load` en [purchase_invoice_router.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/modules/purchases/purchase_invoice_router.py).
* **Si puede crearse manualmente**:
  **OK**. Se puede omitir el procesamiento por IA y crearla de forma manual.
* **Si puede crearse desde OC**:
  **OK**. Al procesar la factura con IA, el backend busca de manera automática órdenes de compra abiertas para ese proveedor y vincula las líneas asociando el `source_purchase_line_id`.
* **Si puede crearse desde RC**:
  **Parcial / Falta**. El enlace directo de facturación de compra a partir de un remito de compra no está tan estructurado como en ventas. El sistema prioriza el matching contra la OC.
* **Si permite facturación parcial por ítem**:
  **OK**. Admite cantidades e importes parciales.
* **Si impide facturar más que lo pendiente**:
  **OK / Parcial**. El backend realiza las validaciones, pero el matching automático de IA puede proponer asociaciones erróneas que el usuario debe validar manualmente en el frontend.
* **Si actualiza `qty_invoiced`**:
  **OK**. Actualiza `qty_invoiced` en las líneas de la OC origen.
* **Si mantiene vínculo con OC/RC**:
  **OK**. Mantiene trazabilidad a través de `source_purchase_line_id` en las líneas de la factura.
* **Si impacta cuenta corriente proveedor**:
  **OK**. Impacta de forma inmediata la cuenta corriente del proveedor sumando un saldo acreedor (Crédito).
* **Qué errores o riesgos hay**:
  * **Riesgo**: El procesamiento automático por IA (Gemini / Regex Fallback) de facturas de proveedores puede cometer errores de emparejamiento de ítems si las descripciones del proveedor no coinciden con las del catálogo interno de Quintal Agross, requiriendo revisión rigurosa antes de guardar.

---

## 8. Flujo Proveedores — Orden de Pago

* **Cómo se crea**:
  Se crea como un `Document` de tipo `PAYMENT` y se gestiona en el frontend mediante [PaymentsPage.jsx](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/finance/PaymentsPage.jsx).
* **Si aplica contra FC/ND compra**:
  **OK**. Utiliza la misma estructura de imputación financiera manual `Application`.
* **Si permite aplicación parcial**:
  **OK**. Permite imputar montos parciales a una o más facturas de compra.
* **Si actualiza saldos**:
  **OK**. Se recalculan dinámicamente mediante las relaciones de aplicaciones de fondos.
* **Si maneja ARS/USD**:
  **OK**. Soporta transacciones bimonetarias y conversión de tipo de cambio.
* **Si maneja diferencia de cambio**:
  **OK**. El motor de FX genera las correspondientes ND/NC por diferencia de cambio en compras si existen discrepancias de cotización en el momento del pago de facturas en dólares.
* **Qué errores o riesgos hay**:
  * **Riesgo**: Una mala cotización cargada en el pago bimonetario puede generar diferencias de cambio ficticias muy elevadas, afectando los saldos reales de la cuenta corriente del proveedor.

---

## 9. Trazabilidad

### Vínculos Existentes
* **OV → RV**: **OK**. Enlazado por `sales_order_id` y `source_sales_line_id`.
* **OV → FV**: **OK**. Enlazado por `source_sales_line_id` en las líneas del documento.
* **RV → FV**: **OK**. Vinculación mediante la tabla intermedia `InvoiceDeliveryNoteLink`.
* **OC → RC**: **OK**. Enlazado por `purchase_order_id` and `source_purchase_line_id`.
* **OC → FC**: **OK**. Enlazado por `source_purchase_line_id` en las líneas del documento.
* **RC → FC**: **Parcial**. Existe trazabilidad indirecta si ambos están vinculados a la misma OC, pero no hay una tabla puente obligatoria de Remito-Factura en compras equivalente a la de ventas.
* **FV → Recibo**: **OK**. Vinculados por la tabla `Application`.
* **FC → Orden de Pago**: **OK**. Vinculados por la tabla `Application`.

### Vínculos Faltantes / Riesgos
* Falta mayor robustez en el circuito de remitos de compra hacia facturas de compra (`RC → FC`) sin depender exclusivamente de que exista una OC de por medio.
* **Duplicados/Confusiones**: El campo `vendedor` (string de texto libre) convive con `salesperson_id` (relación a `Entity`). Esto a veces provoca que los reportes de comisiones busquen coincidencias de texto tipo fuzzy ("Bigot" vs "Claudio Bigot") en lugar de usar la clave primaria UUID.

---

## 10. Estados y pendientes

* **Cómo se calcula pendiente de remitir**:
  Se calcula restando la cantidad entregada a la cantidad original: `qty - qty_delivered` (o `qty_received` en compras) en las líneas de las órdenes.
* **Cómo se calcula pendiente de facturar**:
  Se calcula restando la cantidad facturada a la cantidad original: `qty - qty_invoiced`.
* **Cómo se calcula pendiente de cobrar/pagar**:
  Se obtiene restando el total de aplicaciones financieras del total del documento: `total_amount - (suma de amount_applied)`.
* **Si los estados se recalculan o quedan guardados**:
  **Parcial / Riesgo**. Los estados de los documentos y órdenes se almacenan físicamente en la columna `status` de la base de datos. Sin embargo, para evitar que queden desactualizados por fallos concurrentes o cargas parciales, el sistema ejecuta funciones de recálculo (`recalc_sales_order_status`, `recalc_purchase_order_status`, `_recalc_document_status`) cada vez que se modifican o consultan los comprobantes relacionados.
* **Qué conviene mejorar primero**:
  Asegurar que los recálculos se realicen dentro de transacciones atómicas (`DB Transactions`) y unificar el reporte de comisiones para que dependa únicamente de `salesperson_id` eliminando el uso de strings libres en `vendedor`.

---

## 11. Cuenta corriente

* **Confirmar si FV/Recibo impactan vista cliente**:
  **OK**. Impactan en la cuenta corriente visible del cliente a través de `/accounts/{entity_id}/ledger?view=customer` en [accounts_router.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/modules/entities/accounts_router.py).
* **Confirmar si FC/Orden de Pago impactan vista proveedor**:
  **OK**. Impactan filtrando por la vista `supplier`.
* **Confirmar si entidades MIXED funcionan con ambos circuitos**:
  **OK**. El ledger de la entidad permite la vista `consolidated` para mostrar la cuenta corriente unificada de clientes que actúan a la vez como proveedores (entidades mixtas).

---

## 12. Stock

* **Qué documentos impactan stock**:
  Únicamente los Remitos (`DeliveryNote`) y los Ajustes Manuales de stock (`StockMovementHeader`). Las facturas y órdenes de venta/compra no tocan el stock físico.
* **En qué momento impactan stock**:
  * **Remitos**: Al cambiar su estado a `DISPATCHED` (Despachado / Confirmado).
  * **Ajustes**: Al crearse en estado `CONFIRMED`.
* **Si hay riesgo de doble impacto**:
  **OK (Controlado)**. Al editar o anular un remito, el backend revierte el movimiento de stock anterior en base a la línea histórica (`StockMovement`) antes de aplicar el nuevo saldo.
* **Si hay riesgo de no impactar**:
  **Riesgo**. Si un remito se queda en estado `DRAFT`, el stock físico no se entera del despacho de la mercadería, aunque la orden de venta ya figure como "remitiéndose".

---

## 13. Archivos grandes

* **Identificar archivos demasiado grandes**:
  * [delivery_note_router.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/modules/sales/delivery_note_router.py) posee 2174 líneas y concentra lógica compleja de validación, confirmación, reversión y cálculos de stock.
  * [document_router.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/modules/accounting/document_router.py) posee 2712 líneas manejando la facturación, los cobros, retenciones y el envío por correo.
* **Propuesta de refactor seguro**:
  * Separar la lógica impositiva y de comunicación con AFIP de [document_router.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/modules/accounting/document_router.py) hacia un servicio autónomo `afip_billing_service.py`.
  * Extraer las rutinas de impacto y reversión de inventarios de [delivery_note_router.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/modules/sales/delivery_note_router.py) a un manager específico `stock_delivery_service.py`.

---

## 14. Recomendación de implementación

### Orden exacto de próximos cambios:
1. **Backend**:
   * Implementar transacciones de base de datos (`db.begin()`) explícitas en el guardado de remitos y facturas para evitar actualizaciones parciales en caso de caídas del servidor.
   * Migrar los reportes y filtros de comisiones basados en texto (`vendedor`) hacia el identificador UUID único (`salesperson_id`).
2. **Frontend**:
   * Optimizar la selección manual de productos resultantes del OCR en la carga de facturas de compra en [PurchaseInvoiceForm.jsx](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/purchases/PurchaseInvoiceForm.jsx) para evitar errores del usuario.
3. **Refactor**:
   * Iniciar la modularización de [document_router.py](file:///c:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/backend/app/modules/accounting/document_router.py) aislando las funciones auxiliares.

### Qué NO conviene tocar todavía:
* No modificar la lógica actual del motor de diferencias de cambio (`fx_engine.py` y `fx_service.py`), ya que cualquier alteración impactará de forma masiva en el cálculo de saldos históricos bimonetarios de las cuentas corrientes.
