# Alcance funcional confirmado — Quintal Agross

Estado: relevamiento del 20/10/2026. Requisitos confirmados; no implica funcionalidades implementadas o validadas.

## Compras y ventas
- Compras: orden, remito, factura, ND/NC, orden de pago, cuenta corriente y detalle de saldos de proveedores.
- Ventas: orden, remito, factura, ND/NC, recibo, cuenta corriente y detalle de saldos de clientes.
- Registrar liquidaciones primarias y secundarias de granos.
- Registrar por separado Cuenta de Venta y Líquido Producto.
- El objetivo es emitir facturas electrónicas desde el sistema. Desarrollar y validar en homologación antes de habilitar producción.

## Servicios propios
- Los trabajos son realizados por empleados de la empresa y cobrados al cliente.
- Unidades de cobro confirmadas: hectáreas (HA) y kilómetros (KM), según servicio.
- Registrar trabajo, ejecución y saldo pendiente de facturar, con vínculo a factura y cobro.
- Pendiente: confirmar si se cobran insumos por separado y cómo se registra su consumo.

## Inventario y presentaciones
- Manejar más de un stock/depósito.
- Operación mediante envases y contenido: bidón, bolsa, frasco y otras presentaciones.
- Conservar tipo de envase, contenido por envase y unidad del contenido.
- Mostrar cantidad de envases y equivalencia en unidad base; evitar confundir precio por envase con precio por litro/kilo.
- Lotes y vencimientos no son necesarios en esta etapa; no volverlos obligatorios.
- Se permite fraccionar envases.
- Se permiten salidas con stock insuficiente, mostrando una advertencia; no bloquear por saldo negativo.

## Líquido producto
El ejemplo privado aportado identifica el comprobante como Cuenta de Venta y Líquido Producto, letra A y código 60. Incluye:
- Moneda y tipo de cambio.
- Producto, unidad, factura vinculada y cantidad.
- Precio e importe de venta.
- Comisión e indicador porcentual.
- Precio e importe de costo.
- Neto de venta, comisión, neto de costo, IVA, gastos, tributos y total.
- CAE y fecha de vencimiento.

El ejemplo sirve para definir campos; no establece por sí solo la regla fiscal ni el sentido de la deuda. Confirmar quién liquida a quién y cómo se registra en cuenta corriente antes de implementar. No incorporar el comprobante privado al repositorio.

## Base existente inspeccionada
- Product ya tiene container_id, quantity_per_container, unit_of_measure e is_service.
- Warehouse y StockItem ya separan cantidades por depósito.
- Las líneas de movimientos tienen lote y vencimiento opcionales.
Reutilizar estos modelos y validar sus flujos; no crear catálogos duplicados.

## Criterios de aceptación
- La equivalencia entre envases y contenido se conserva en orden, remito, factura y stock.
- Un traslado disminuye el origen y aumenta el destino por la misma cantidad.
- Un servicio se factura por su unidad de trabajo y no genera stock ficticio.
- La factura vinculada a un remito no duplica el movimiento de mercadería.
- No se duplica una deuda al vincular una liquidación con otros comprobantes.
- Cuenta de cliente y proveedor separadas para entidades mixtas; consolidado informativo.


## Ventas y cobranzas: nuevas reglas confirmadas
- Se puede facturar antes de entregar; debe quedar visible lo pendiente de remitir.
- El precio de productos se carga por litro o kilogramo, no por envase.
- Ventas en ARS o USD.
- Referencia de cotización: Banco Nación, divisas. Pendiente confirmar compra o venta.
- Cobros en pesos a cotización del día o cotización manual acordada.
- Al aplicar el cobro a una deuda con distinta cotización, generar automáticamente la ND/NC correspondiente a la porción aplicada y mantener trazabilidad.
- No cambiar deuda pactada en ARS a deuda ajustable por USD sin una regla explícita.
- La generación de la nota interna no equivale a autorización fiscal: validar emisión en homologación.
