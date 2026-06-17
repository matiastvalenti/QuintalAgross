# Rediseño Visual de Remitos

## Goal Description
El objetivo es migrar la estructura visual del componente `DeliveryNoteForm.jsx` (Remitos) para que replique exactamente el "look & feel" y la distribución de `SalesOrderForm.jsx` (Nueva Orden de Venta). La funcionalidad, las variables y la lógica de backend no se modificarán en esta fase.

Dado que `DeliveryNoteForm.module.css` ya está importando internamente a `SalesOrderForm.module.css`, contamos con todas las clases de CSS recién creadas (como `.rightCol`, `.summaryPanel`, etc.). 

## Proposed Changes

### [MODIFY] [DeliveryNoteForm.jsx](file:///C:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/sales/DeliveryNoteForm.jsx)
1. **Header Compacto**: Reestructurar `.headerLine` y `.compactHeaderTitle` para que el título y los breadcrumbs se desplieguen horizontalmente.
2. **Layout de Dos Columnas**: Usar `.bodyTwoColumns` como base.
   - **Columna Izquierda (`.leftCol`)**: Incluirá el buscador de productos, y la tabla de ítems (`.itemsPanel`). Se limitará la vista de tabla para coincidir con la altura de la columna derecha.
   - **Columna Derecha (`.rightCol`)**: Incluirá el bloque `.sideBlock` de Cliente y un bloque `.sideBlock` de datos adicionales (ej. Transporte/Depósito) en un contenedor grid que fuerce altura completa (`height: 100%`).
3. **Módulo de Relaciones y Estado (`.relationsBar`)**: Inyectar la botonera compacta y secuencial (OV → Remito → Factura → Cobro). Adaptada al contexto del Remito (dándole foco activo a "Remito").
4. **Resumen Operativo (`.summaryPanel`)**: Crear el panel denso inferior con las métricas claves (Cliente, Total Litros, Estado, Chofer, etc.).
5. **Footer Compacto (`.footerCompact`)**: Alinear en una sola fila los valores consolidados al pie de la pantalla.

> [!WARNING]
> No se eliminará ningún campo funcional que exista actualmente en el Remito (ej: Chofer, Patente, Transporte), simplemente se reubicarán dentro del bloque Administrativo de la derecha o en el Resumen Operativo según corresponda.

## Verification Plan
1. Ejecutar el servidor y navegar a la sección de Remitos.
2. Validar que la alineación vertical de las columnas izquierda y derecha coincida exactamente como en Orden de Venta.
3. Asegurarse de que no haya scroll global y que el diseño encaje en una vista limpia.
