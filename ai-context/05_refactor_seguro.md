# Refactor seguro y orden de trabajo

El proyecto Quintal Agross tiene archivos grandes y módulos con mucha lógica acumulada.

El objetivo no es reescribir todo de golpe, sino ordenar el sistema de forma progresiva y segura.

## Regla principal

No hacer refactors masivos.

Todo cambio debe ser pequeño, verificable y relacionado con una única tarea.

## Archivos grandes detectados

Algunos archivos concentran demasiada lógica y deben refactorizarse de a poco:

- `frontend/src/modules/sales/SalesOrderForm.jsx`
- `frontend/src/modules/sales/InvoiceForm.jsx`
- `backend/app/modules/sales/delivery_note_router.py`
- `backend/app/modules/accounting/document_router.py`
- `backend/app/modules/sales/sales_order_router.py`

Estos archivos no deben seguir creciendo sin control.

## Estrategia correcta

Cuando haya que modificar un archivo grande:

1. No reescribirlo completo.
2. No cambiar diseño y lógica al mismo tiempo.
3. No mover código sin una razón clara.
4. Extraer una función, hook, componente o servicio por vez.
5. Verificar que el comportamiento siga igual después del cambio.
6. No tocar módulos no relacionados.

## Orden recomendado de refactor

### Frontend

Los formularios grandes deben dividirse progresivamente en:

- Hooks de carga de datos.
- Hooks de cálculo de totales.
- Hooks de guardado.
- Componentes de cabecera.
- Componentes de grilla de productos.
- Componentes de panel lateral.
- Componentes de footer/totales.
- Modales separados.

Ejemplo:

`SalesOrderForm.jsx` no debe contener para siempre toda la lógica de:

- Estado del formulario.
- Carga inicial.
- Cálculo de totales.
- Grilla de productos.
- Modales de remito/factura.
- Historial.
- Guardado.
- Impresión.
- Envío por mail.

Cada parte debe separarse de a poco.

### Backend

Los routers grandes no deben contener toda la lógica de negocio.

Los routers deben ocuparse principalmente de:

- Recibir requests.
- Validar permisos.
- Llamar servicios.
- Devolver responses.

La lógica de negocio debe moverse progresivamente a servicios.

Ejemplo:

`document_router.py` no debería contener toda la lógica de:

- Creación de documentos.
- Recalculo de saldos.
- Aplicaciones.
- Diferencias de cambio.
- Comisiones.
- Sanitización de respuesta.
- Trazabilidad.

Eso debe dividirse en servicios.

## Servicios recomendados

Crear o fortalecer servicios como:

- `account_statement_service.py`
- `document_service.py`
- `application_service.py`
- `fx_difference_service.py`
- `sales_order_service.py`
- `delivery_note_service.py`
- `purchase_order_service.py`
- `traceability_service.py`

## Regla para nuevos servicios

Un servicio debe tener una responsabilidad clara.

Ejemplo:

`account_statement_service.py` debe encargarse solo de calcular resúmenes de cuenta y saldos.

No debe crear facturas, remitos ni recibos.

## Cómo trabajar con agentes de IA

Cada tarea para un agente debe incluir:

1. Objetivo.
2. Archivos permitidos.
3. Archivos prohibidos.
4. Reglas de negocio.
5. Criterios de aceptación.
6. Qué pruebas hacer.
7. Confirmación de que leyó `ai-context`.

## Prohibido

No hacer:

- Refactor completo del sistema.
- Cambios simultáneos en frontend y backend si no es necesario.
- Reescritura completa de formularios.
- Cambios de diseño no pedidos.
- Cambios de modelo de datos sin explicar impacto.
- Eliminación de código sin confirmar uso.
- Cambios en módulos secundarios mientras se trabaja en el núcleo.

## Prioridad actual

La prioridad actual del proyecto es:

1. Entidades mixtas.
2. Cuenta corriente bimonetaria.
3. Circuito clientes: OV → RV → FV → Recibo.
4. Circuito proveedores: OC → RC → FC → Orden de Pago.
5. Refactor progresivo de archivos grandes relacionados con esos puntos.

Todo lo demás queda secundario.
