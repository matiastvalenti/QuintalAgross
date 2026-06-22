/**
 * openStandaloneWindow.js
 *
 * Helper para abrir formularios como ventanas popup del navegador.
 * Usa window.open() estándar — funciona en Chrome, Firefox y cualquier browser.
 *
 * NO usa Electron, ipcRenderer, ipcMain ni BrowserWindow.
 * El sistema debe ejecutarse con: npm run dev → http://localhost:5173
 */

export function openStandaloneWindow(path, name = '_blank', options = {}) {
  const width = options.width || 1280;
  const height = options.height || 820;

  const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

  const features = [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'resizable=yes',
    'scrollbars=yes',
    'toolbar=no',
    'menubar=no',
    'location=no',
    'status=no'
  ].join(',');

  const newWindow = window.open(path, name, features);

  if (!newWindow) {
    alert('El navegador bloqueó la ventana emergente. Permití pop-ups para este sitio.');
    return null;
  }

  newWindow.focus();
  return newWindow;
}

// ── Shortcuts para formularios frecuentes ──

export function openNuevaOrdenVenta(options = {}) {
  const { draft_id, ...windowOptions } = options;
  let path = "/standalone/ordenes-venta/nueva";
  if (draft_id) path += `?draft_id=${draft_id}`;
  return openStandaloneWindow(path, draft_id ? `ov-draft-${draft_id}` : "orden-venta-nueva", windowOptions);
}

export function openNuevoRemito(ovId, options = {}) {
  const { draft_key, draft_id, ...windowOptions } = options;
  let path = ovId
    ? `/standalone/remitos/nuevo?ov_id=${ovId}`
    : "/standalone/remitos/nuevo";
  if (draft_key) path += `&draft_key=${encodeURIComponent(draft_key)}`;
  if (draft_id) path += (path.includes('?') ? '&' : '?') + `draft_id=${draft_id}`;
  
  return openStandaloneWindow(path, ovId ? `remito-ov-${ovId}` : (draft_id ? `remito-draft-${draft_id}` : "remito-nuevo"), windowOptions);
}

export function openNuevaFactura(params = {}, options = {}) {
  const { ov_id, lines, draft_id } = params;
  let path = "/standalone/facturas/nueva";
  let windowName = "factura-nueva";
  
  if (draft_id) {
    path += `?draft_id=${draft_id}`;
    windowName = `factura-draft-${draft_id}`;
  } else if (ov_id) {
    path += `?ov_id=${ov_id}`;
    if (lines) path += `&lines=${lines}`;
    windowName = `factura-ov-${ov_id}`;
  }
  
  return openStandaloneWindow(path, windowName, options);
}

export function openEditOrdenVenta(id, options = {}) {
  return openStandaloneWindow(`/standalone/ordenes-venta/${id}`, `orden-venta-${id}`, options);
}

export function openEditRemito(id, options = {}) {
  return openStandaloneWindow(`/standalone/remitos/${id}`, `remito-${id}`, options);
}

export function openEditFactura(id, options = {}) {
  return openStandaloneWindow(`/standalone/facturas/${id}`, `factura-${id}`, options);
}
// === NOTAS DE DÉBITO ===
export function openNuevaNotaDebito(options = {}) {
  const { factura_id, ...windowOptions } = options;
  let path = '/standalone/notas-debito/nueva';
  let windowName = 'nueva-nota-debito';

  if (factura_id) {
    path += `?factura_id=${factura_id}`;
    windowName = `nota-debito-factura-${factura_id}`;
  }

  return openStandaloneWindow(path, windowName, windowOptions);
}

export function openEditNotaDebito(id, options = {}) {
  return openStandaloneWindow(`/standalone/notas-debito/${id}`, `nota-debito-${id}`, options);
}

// === NOTAS DE CRÉDITO ===
export function openNuevaNotaCredito(options = {}) {
  const { factura_id, ...windowOptions } = options;
  let path = '/standalone/notas-credito/nueva';
  let windowName = 'nueva-nota-credito';

  if (factura_id) {
    path += `?factura_id=${factura_id}`;
    windowName = `nota-credito-factura-${factura_id}`;
  }

  return openStandaloneWindow(path, windowName, windowOptions);
}

export function openEditNotaCredito(id, options = {}) {
  return openStandaloneWindow(`/standalone/notas-credito/${id}`, `nota-credito-${id}`, options);
}

// === NOTAS DE DÉBITO DE COMPRA ===
export function openNuevaNotaDebitoCompra(options = {}) {
  const { factura_id, ...windowOptions } = options;
  let path = '/standalone/notas-debito-compra/nueva';
  let windowName = 'nueva-nota-debito-compra';

  if (factura_id) {
    path += `?factura_id=${factura_id}`;
    windowName = `nota-debito-compra-factura-${factura_id}`;
  }

  return openStandaloneWindow(path, windowName, windowOptions);
}

export function openEditNotaDebitoCompra(id, options = {}) {
  return openStandaloneWindow(`/standalone/notas-debito-compra/${id}`, `nota-debito-compra-${id}`, options);
}

// === NOTAS DE CRÉDITO DE COMPRA ===
export function openNuevaNotaCreditoCompra(options = {}) {
  const { factura_id, ...windowOptions } = options;
  let path = '/standalone/notas-credito-compra/nueva';
  let windowName = 'nueva-nota-credito-compra';

  if (factura_id) {
    path += `?factura_id=${factura_id}`;
    windowName = `nota-credito-compra-factura-${factura_id}`;
  }

  return openStandaloneWindow(path, windowName, windowOptions);
}

export function openEditNotaCreditoCompra(id, options = {}) {
  return openStandaloneWindow(`/standalone/notas-credito-compra/${id}`, `nota-credito-compra-${id}`, options);
}
// === ÓRDENES DE COMPRA ===
export function openNuevaOrdenCompra(options = {}) {
  return openStandaloneWindow("/standalone/ordenes-compra/nueva", "orden-compra-nueva", options);
}

export function openEditPurchaseOrder(id, options = {}) {
  return openStandaloneWindow(`/standalone/ordenes-compra/${id}`, `orden-compra-${id}`, options);
}


export function openEditOrdenCompra(id, options = {}) {
  return openStandaloneWindow(`/standalone/ordenes-compra/${id}`, `orden-compra-${id}`, options);
}

// === REMITOS DE ENTRADA ===
export function openNuevoRemitoEntrada(ocId, options = {}) {
  const { draft_key, ...windowOptions } = options;
  let path = ocId
    ? `/standalone/remitos-entrada/nuevo?oc_id=${ocId}`
    : "/standalone/remitos-entrada/nuevo";
  if (draft_key) path += `&draft_key=${encodeURIComponent(draft_key)}`;
  return openStandaloneWindow(path, ocId ? `remito-entrada-oc-${ocId}` : "remito-entrada-nuevo", windowOptions);
}

export function openEditRemitoEntrada(id, options = {}) {
  return openStandaloneWindow(`/standalone/remitos-entrada/${id}`, `remito-entrada-${id}`, options);
}

// === FACTURAS DE COMPRA ===
export function openNuevaFacturaCompra(params = {}, options = {}) {
  const { oc_id, lines, draft_id } = params; // Changed ov_id to oc_id
  let path = "/standalone/facturas-compra/nueva";
  let windowName = "factura-compra-nueva";
  
  if (draft_id) {
    path += `?draft_id=${draft_id}`;
    windowName = `factura-compra-draft-${draft_id}`;
  } else if (oc_id) { // Changed ov_id to oc_id
    path += `?oc_id=${oc_id}`; // Changed ov_id to oc_id
    if (lines) path += `&lines=${lines}`;
    windowName = `factura-compra-oc-${oc_id}`; // Changed ov_id to oc_id
  }
  
  return openStandaloneWindow(path, windowName, options);
}

export function openEditFacturaCompra(id, options = {}) {
  return openStandaloneWindow(`/standalone/facturas-compra/${id}`, `factura-compra-${id}`, options);
}

// === RECIBOS Y PAGOS ===
export function openNuevoRecibo(options = {}) {
  const entityId = options.entityId ? `?entityId=${options.entityId}` : "";
  return openStandaloneWindow(`/standalone/recibos/nuevo${entityId}`, "recibo-nuevo", options);
}

export function openEditRecibo(id, options = {}) {
  const mode = options.mode || "view";
  return openStandaloneWindow(`/standalone/recibos/${id}?mode=${mode}`, `recibo-${id}`, options);
}

export function openNuevoPago(options = {}) {
  let path = "/standalone/pagos/nuevo?isPayment=true";
  if (options.entityId) path += `&entityId=${options.entityId}`;
  if (options.draft_id) path += `&draft_id=${options.draft_id}`;
  return openStandaloneWindow(path, "pago-nuevo", options);
}

export function openEditPago(id, options = {}) {
  const mode = options.mode || "view";
  return openStandaloneWindow(`/standalone/pagos/${id}?mode=${mode}&isPayment=true`, `pago-${id}`, options);
}

// === RENDICIÓN DE GASTOS ===
export function openNuevaRendicion(options = {}) {
  return openStandaloneWindow("/standalone/gastos/nuevo", "rendicion-nueva", options);
}

export function openEditRendicion(id, options = {}) {
  return openStandaloneWindow(`/standalone/gastos/${id}`, `rendicion-${id}`, options);
}

// === RESUMEN DE CUENTA ===
export function openResumenCuenta(entityId = null, options = {}) {
  const path = entityId ? `/standalone/resumen-cuenta/${entityId}` : "/standalone/resumen-cuenta";
  return openStandaloneWindow(path, entityId ? `resumen-${entityId}` : "resumen-cuenta", options);
}

// === ENTIDADES Y CRM ===
export function openEntitiesManager(options = {}) {
  return openStandaloneWindow("/standalone/entidades", "entidades-manager", options);
}

export function openEntityDashboard(id, options = {}) {
  return openStandaloneWindow(`/standalone/crm/entidad/${id}`, `entity-dashboard-${id}`, options);
}

// === AUTH Y AUDITORÍA ===
export function openUsersManager(options = {}) {
  return openStandaloneWindow("/standalone/usuarios", "users-manager", options);
}

export function openAuditLogs(options = {}) {
  return openStandaloneWindow("/standalone/auditoria", "audit-logs", options);
}

// === FLOTA ===
export function openFleetManager(options = {}) {
  return openStandaloneWindow("/standalone/flota", "fleet-manager", options);
}






