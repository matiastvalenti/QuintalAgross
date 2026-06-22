# Auditoría de Backend - Cuenta Corriente Bimonetaria

## 1. Modelos existentes
El sistema actual utiliza los siguientes modelos principales:
- **Entidades:** `Entity` (define clientes, proveedores, etc.), `EntityPerception`, `EntityCRMNote`.
- **Documentos:** `Document` (cabecera universal para facturas, recibos, órdenes de pago, notas de crédito/débito), `DocumentLine` (renglones), `DocumentHistory`.
- **Pagos:** `PaymentItem` (asociado a `Document`, registra efectivo, cheques, transferencias).
- **Aplicaciones:** `Application` (vincula un documento de crédito, como un recibo, con un documento de débito, como una factura, gestionando qué monto se pagó de cuál).
- Existe también un modelo `AccountMovement` marcado como *legacy* que registraba movimientos contables básicos.

## 2. Diferenciación de comprobantes
Se utiliza una única tabla `documents` (modelo `Document`). La diferenciación se hace a través del campo `doc_type` que utiliza el enumerador `DocumentType`:
- **Facturas de Venta:** `INVOICE`, `FCE_MIPYME`
- **Facturas de Compra:** `PURCHASE_INVOICE`
- **Recibos:** `RECEIPT`
- **Órdenes de Pago:** `PAYMENT`
También existen las variantes para notas de crédito/débito de compras y ventas.

## 3. Entidades Mixtas
Sí, el enum `EntityType` en `models.py` soporta explícitamente `CLIENT`, `PROVIDER`, `MIXED` y `EMPLOYEE`. Además, el modelo `Entity` tiene un campo `linked_entity_id` que se usa para relacionar la ficha de un cliente con su correspondiente ficha de proveedor (si fuesen separadas).

## 4. Validación de CUIT duplicado
**No existe validación estricta.** En `Entity`, el campo `tax_id` (CUIT) está indexado, pero no tiene restricción `unique=True`. En el endpoint de creación de entidades (`/entities/` en `router.py`), solo se verifica la unicidad del `code` autogenerado, pero no se impide crear dos entidades con el mismo CUIT.

## 5. Cálculo actual del saldo de cuenta corriente
Actualmente, el saldo se calcula de forma dinámica agregando datos en tiempo real (por ejemplo, en el endpoint `/entities/{entity_id}/dashboard`). 
- Hace sumatorias (usando SQLAlchemy `func.sum`) del campo `total_amount_ars` y `total_amount` de la tabla `documents`.
- Utiliza el tipo de comprobante para definir si suma o resta (los `debit_types` suman al saldo y el resto restan).
- Las "Deudas" y "Créditos" se traen calculando cuánto de la factura fue aplicado mediante cruces en la tabla `Application`.

## 6. Manejo de monedas (ARS y USD)
El sistema actual **mezcla y convierte**.
- El modelo `Document` guarda `total_amount` (moneda original) y `total_amount_ars` (monto original convertido a pesos usando el `exchange_rate`).
- Al calcular los saldos en el dashboard, se genera un `total_balance` (en pesos, sumando `total_amount_ars`) y se intenta generar un `total_balance_usd` filtrando estrictamente los documentos cuya moneda origen es USD.
- Sin embargo, **las aplicaciones (`Application`) sí diferencian** cuánto se aplicó en pesos y cuánto en origen, y tienen su propio `exchange_rate`. Hay herramientas para crear diferencias de cambio (`fx_service`), pero el resumen global suma todo en pesos en muchos lugares.

## 7. Endpoint recomendado
Conviene crear un endpoint nuevo para no romper los listados de dashboard actuales. 
- **Sugerencia:** `GET /entities/{entity_id}/cuenta-corriente` 
- Deberá consultar la tabla `Document` (y opcionalmente `Application`), pero en vez de devolver sumatorias globales, deberá retornar una lista ordenada cronológicamente de los movimientos, mapeando los importes a las columnas `debe_pesos`, `haber_pesos`, `debe_usd` y `haber_usd` según si el `currency` original del documento fue ARS o USD y respetando la vista (cliente/proveedor).

## 8. Primer archivo a modificar
El archivo **`backend/app/modules/entities/accounts_router.py`** (actualmente importado en el `api_router` como `accounts_router`) o en su defecto **`backend/app/modules/entities/router.py`**. Allí es donde se deben crear las consultas que reconstruyan el resumen bimonetario sin modificar la estructura de datos existente.

## 9. Archivos demasiado grandes (Refactor futuro)
- **`backend/app/modules/accounting/document_router.py`**: Tiene más de 2700 líneas. Maneja creación, validación, integración de cheques, retenciones y control de stock todo en los mismos endpoints.
- **`backend/app/db/models/models.py`** (791 líneas) y **`commercial_models.py`** (714 líneas).

## 10. Cambios mínimos recomendados (V1)
1. **No tocar la base de datos:** La información necesaria (moneda, cotización, importe original) ya existe en `Document` y `Application`.
2. **Crear endpoint de lectura:** Hacer un nuevo endpoint `GET /entities/{id}/cuenta-corriente` que traiga todos los documentos de la entidad en estado distinto de `DRAFT` o `CANCELLED`.
3. **Lógica en memoria:** Ordenar los documentos por fecha y generar el arreglo del resumen calculando el Debe/Haber en la moneda nativa del documento y acumulando los saldos `saldo_pesos` y `saldo_usd` por separado de forma iterativa.
4. **Manejar diferencias de cambio:** Mostrar los documentos generados por diferencia de cambio en pesos, identificando el comprobante de origen.
