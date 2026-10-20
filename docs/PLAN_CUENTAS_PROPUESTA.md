# Plan de cuentas inicial — propuesta operativa

Pendiente de revisión por el contador. Los códigos propuestos son convenciones del sistema, no una codificación obligatoria de ARCA ni un plan completo de estados contables.

Se separan ingresos y costos de insumos, granos, dron/aplicaciones y fletes. El módulo de trabajos también admite otros servicios. La pantalla Servicios y trabajos → Plan de cuentas inicial permite revisar y agregar únicamente las cuentas faltantes; no modifica nombres, estados ni asignaciones existentes. No se ejecuta al arrancar ni durante una factura.

| Código | Cuenta propuesta |
| --- | --- |
| 1.1.1.001 | Caja |
| 1.1.1.002 | Bancos |
| 1.1.1.003 | Cheques en cartera |
| 1.1.2.001 | Clientes |
| 1.1.3.001 | IVA crédito fiscal |
| 1.1.3.004 | Retenciones sufridas |
| 2.1.1.001 | Proveedores |
| 2.1.2.001 | IVA débito fiscal |
| 2.1.2.004 | Retenciones a depositar |
| 4.1.1.001 | Ventas de insumos |
| 5.1.1.001 | Costo de insumos vendidos |
| 4.1.2.001 | Ventas de granos |
| 5.1.2.001 | Costo de granos comercializados |
| 4.1.3.001 | Servicios de dron y aplicaciones |
| 4.1.4.001 | Servicios de fletes |
| 4.1.9.001 | Otros servicios |
| 5.1.3.001 | Personal - Dron y aplicaciones |
| 5.1.3.002 | Combustible - Dron y aplicaciones |
| 5.1.3.003 | Reparaciones - Dron y aplicaciones |
| 5.1.3.099 | Otros costos - Dron y aplicaciones |
| 5.1.4.001 | Personal - Fletes |
| 5.1.4.002 | Combustible - Fletes |
| 5.1.4.003 | Reparaciones - Fletes |
| 5.1.4.099 | Otros costos - Fletes |
| 5.1.9.001 | Personal - Otros servicios |
| 5.1.9.002 | Combustible - Otros servicios |
| 5.1.9.003 | Reparaciones - Otros servicios |
| 5.1.9.099 | Otros costos - Otros servicios |

## Uso en el sistema

- Las facturas de servicios imputan ingresos según la actividad del trabajo. Las claves SERVICE_DRONE_SALES, SERVICE_FREIGHT_SALES y SERVICE_OTHER_SERVICES_SALES permiten configurar sus cuentas en LedgerSetting.
- Las cuentas de insumos y granos se proponen para los circuitos existentes. No se reasignan automáticamente productos o comprobantes históricos.
- Los costos de trabajos se cargan netos de IVA, con empleado cuando corresponda, unidad y tarifa elegidas por trabajo. Los importes USD se convierten al TC guardado en cada costo. No se generan automáticamente sueldos, pagos, consumos de stock ni asientos por estos costos de gestión, evitando duplicarlos con los comprobantes de compra.
- El margen previsto compara el importe neto previsto del trabajo con los costos cargados. El resultado facturado compara facturación neta activa (incluidos borradores) con esos costos; no representa un cierre contable definitivo ni asegura que todos los gastos estén cargados.
- Antes del uso real corresponde definir inventarios/costo de venta, impuestos y retenciones particulares, diferencias de cambio, depreciaciones y gastos comunes con el contador.

Referencia conceptual consultada: [FACPCE, Contabilidad y Auditoría](https://www.facpce.org.ar/wp-content/uploads/2020/07/Contabilidad-y-AuditoriaCC.pdf), sobre la diferencia entre las necesidades del plan de cuentas del ERP y las de los estados contables. La propuesta de códigos y actividades de este archivo es específica de Quintal Agross.
