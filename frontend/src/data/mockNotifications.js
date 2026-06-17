// TODO: Reemplazar por endpoint real (ej. GET /api/v1/notifications/operational)
// Estructura preparada para recibir datos del backend

export const mockOperationalData = {
  critical: [
    {
      id: 'crit_1',
      title: 'Facturas vencidas',
      qty: 7,
      qtyLabel: 'comprobantes',
      description: 'Impacto estimado u$s 85.000',
      actionText: 'Ver facturas',
      route: '/ventas/facturas'
    },
    {
      id: 'crit_2',
      title: 'Cheques a depositar hoy',
      qty: 5,
      qtyLabel: 'documentos',
      description: 'Valores en cartera listos',
      actionText: 'Ir a Cheques',
      route: '/finanzas/cheques'
    },
    {
      id: 'crit_3',
      title: 'Clientes con mora',
      qty: 3,
      qtyLabel: 'cuentas',
      description: 'Cuentas corrientes bloqueadas',
      actionText: 'Ir a Gestor de Mora',
      route: '/finanzas/mora'
    }
  ],
  warning: [
    {
      id: 'warn_1',
      title: 'Diferencias de cambio pendientes',
      qty: 4,
      qtyLabel: 'registros',
      description: 'Requieren nota de débito/crédito',
      actionText: 'Ir a Aplicaciones',
      route: '/finanzas/aplicaciones'
    },
    {
      id: 'warn_2',
      title: 'Liquidaciones sin confirmar',
      qty: 2,
      qtyLabel: 'liquidaciones',
      description: 'Pendiente revisión contable',
      actionText: 'Ir a Cereales',
      route: '/cereales/liquidaciones-secundarias'
    },
    {
      id: 'warn_3',
      title: 'Remitos sin facturar',
      qty: 3,
      qtyLabel: 'remitos',
      description: 'Despachos listos para facturar',
      actionText: 'Ir a Remitos',
      route: '/ventas/remitos'
    }
  ],
  info: [
    {
      id: 'info_1',
      title: 'Órdenes listas para despacho',
      qty: 6,
      qtyLabel: 'órdenes',
      description: 'Aprobadas por crédito',
      actionText: 'Ir a Órdenes',
      route: '/ventas/orden-venta'
    },
    {
      id: 'info_2',
      title: 'Contratos pendientes',
      qty: 1,
      qtyLabel: 'contrato',
      description: 'Falta firma digital',
      actionText: 'Ir a Contratos',
      route: '/cereales/contratos'
    },
    {
      id: 'info_3',
      title: 'Stock crítico',
      qty: 2,
      qtyLabel: 'artículos',
      description: 'Por debajo del mínimo',
      actionText: 'Ir a Artículos',
      route: '/inventario/articulos'
    }
  ]
};

export const getCriticalCount = () => {
  return mockOperationalData.critical.reduce((acc, item) => acc + item.qty, 0);
};
