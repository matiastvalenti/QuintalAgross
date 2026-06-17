# 📋 Tablero de Tareas - Quintal Agross

## 🛠 Cómo usar este tablero

Este archivo es el **Roadmap oficial** del proyecto. Se utiliza en conjunto con `TASKS_STATE.json` para llevar un seguimiento preciso del progreso.

- **IA**: Antes de empezar, lee este archivo y `CONTRIBUTING_AI.md`.
- **Flujo**: Elige una tarea con estado `TODO`, cámbiala a `DOING`, impleméntala y luego muévela a `DONE`.
- **Sincronización**: Siempre actualiza tanto este archivo (marcando el checkbox) como el archivo `TASKS_STATE.json`.

## 🤖 Reglas para la IA

1. **No romper la estructura**: Mantener la separación `api/` (Python) y `web/` (React).
2. **Estilos**: Usar exclusivamente **CSS Modules**. Prohibido crear estilos globales nuevos fuera de `tokens.css`.
3. **Dependencias**: Si una tarea requiere una nueva librería, instálala y actualiza `requirements.txt` o `package.json`.
4. **Validación**: Cada tarea `DONE` debe ser funcional y no romper el build.

---

## 🗺 Roadmap de Desarrollo

### Fase 0 — Bootstrap (Completada)

- [x] **T0.1.1** Estructura base API (FastAPI)
- [x] **T0.1.2** Estructura base Web (Vite + React)
- [x] **T0.1.3** Scripts de inicio (run-api.bat, run-web.bat)

### Fase 1 — Auth + Roles

- [x] **T1.1.1** Implementar JWT Authentication en Backend
- [x] **T1.1.2** Modelo de Usuarios y Roles (Admin, Operador, Consultor)
- [x] **T1.1.3** Pantalla de Login en Frontend
- [x] **T1.1.4** Middleware de protección de rutas

### 🔥 Fase 2 — Core Contable REAL (Motor de Cuentas Corrientes)

_Esta fase es el corazón del sistema. El objetivo es reemplazar la lógica manual por un motor que entienda aplicaciones y saldos._

- [x] **T2.1.1** Crear modelo `Document` (Factura, NC, ND, Recibo, Pago)
  - _Criterio_: Definir tipos de comprobante, numeración y estados. Diferenciar entre comprobantes de Deuda (Factura/ND) y Crédito (Recibo/NC/Pago).
- [x] **T2.1.2** Crear modelo `Application` (Aplicación entre comprobantes)
  - _Criterio_: Permitir vincular un Recibo/NC con una o varias Facturas/ND. Es una relación M:N con montos aplicados.
- [x] **T2.1.3** Implementar Lógica de Pagos Parciales
  - _Criterio_: Un comprobante puede estar "Abierto", "Parcialmente Pagado" o "Cerrado" basado en la suma de sus aplicaciones.
- [x] **T2.1.4** Cálculo de Saldo Vivo por Comprobante
  - _Criterio_: Endpoint para obtener el listado de facturas pendientes con su saldo remanente real.
- [x] **T2.1.5** Ledger Multimoneda Real (Cuenta Corriente Detallada)
  - _Criterio_: La UI debe mostrar qué pagos aplicaron a qué facturas, manejando saldo en ARS y equivalencia en USD.
- [x] **T2.1.6** ND Automática por Diferencia de Cambio
  - _Criterio_: Al aplicar un crédito con un tipo de cambio distinto al de la factura original, el sistema debe calcular la diferencia y ofrecer generar una ND/NC automática por ajuste de cotización.

### 🔥 Fase 3 — Flujo Comercial Enlazado (Ventas/Compras)

_Flujo obligatorio: OV/OC → Remito → Factura. Remito impacta stock, Factura impacta cuenta corriente + IVA. Todo queda enlazado con trazabilidad completa._

**Modelos base**

- [x] **T3.0.1** Definir entidades: OV/OC/Remito como "documentos operativos" y Factura como Document
- [x] **T3.1.1** Modelo `Product` + categorías (herbicida/insecticida/etc) + `iva_rate` + cuentas contables
- [x] **T3.1.2** Modelo `Warehouse` / `StockItem`

**Ventas (OV → Remito → Factura)**

- [x] **T3.2.1** Crear OV (`SalesOrder` + `SalesOrderLine`)
- [x] **T3.2.2** Crear Remito desde OV (copiar líneas, `source_order_id`) + impacto stock (-)
- [x] **T3.2.3** Crear Factura desde Remito(s) (crea `DocumentLines`, enlaza `source_delivery_note_ids[]`) + cuenta corriente
- [x] **T3.2.4** Reporte: Remitos pendientes de facturar (ventas)

**Compras (OC → Remito → Factura)**

- [x] **T3.3.1** Crear OC (`PurchaseOrder` + `PurchaseOrderLine`)
- [x] **T3.3.2** Crear Remito desde OC + impacto stock (+)
- [x] **T3.3.3** Crear Factura compra desde Remito(s) + cuenta proveedor
- [x] **T3.3.4** Reporte: Remitos pendientes de facturar (compras)

**PDFs**

- [x] **T3.4.1** PDFs: Remito preimpreso (márgenes exactos) + Factura PDF básico
- [x] **T10.0.1** Estandarización Modular de Frontend y Backend (Refactor de Carpetas e Imports)

### Fase 4 — Finance (Cheques/Alertas/ND Auto)

_Esta fase depende críticamente de que el Core de la Fase 2 sea sólido._

- [x] **T4.1.1** Módulo de Cartera de Cheques (Físicos y E-cheqs)
- [x] **T4.1.2** Sistema de alertas de vencimiento (Email/UI)
- [x] **T4.1.3** Automatización de Notas de Débito por intereses de cheques

### Fase 5 — Taxes + ARCA

- [x] **T5.1.1** Integración con API de ARCA (Factura Electrónica)
- [x] **T5.1.2** Libros de IVA Digital (Exportación CSV + TXT formato ARCA RG 3685)
- [x] **T5.1.3** Configuración de Alícuotas por Producto/Servicio
- [x] **T5.1.4** Cálculo automático de Percepciones de IIBB basado en padrón

### Fase 6 — Grains

- [x] **T6.0.1** Módulo de Contratos de Grano (Compra/Venta)
- [x] **T6.0.2** Gestión de Cartas de Porte y Tickets (Ingresos/Egresos)
- [x] **T6.0.3** Dashboard de cumplimiento de contratos (Entregado vs Pendiente)
- [x] **T6.0.4** Liquidación de Granos (LPG AFIP) - Integración técnica

### Fase 7 — Field + Activos

- [x] **T7.1.1** Gestión de Lotes y Campañas
- [x] **T7.1.2** Módulo de Maquinaria y Consumos (Gasoil/Semillas)
- [x] **T7.1.3** Dashboard de Rentabilidad por Hectárea
