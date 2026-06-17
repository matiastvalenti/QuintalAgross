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
  return openStandaloneWindow("/standalone/ordenes-venta/nueva", "orden-venta-nueva", options);
}

export function openNuevoRemito(ovId, options = {}) {
  const { draft_key, ...windowOptions } = options;
  let path = ovId
    ? `/standalone/remitos/nuevo?ov_id=${ovId}`
    : "/standalone/remitos/nuevo";
  if (draft_key) path += `&draft_key=${encodeURIComponent(draft_key)}`;
  return openStandaloneWindow(path, ovId ? `remito-ov-${ovId}` : "remito-nuevo", windowOptions);
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
export function openNuevaNotaDebito({ factura_id } = {}, options = {}) {
  let path = '/standalone/notas-debito/nueva';
  let windowName = 'nueva-nota-debito';

  if (factura_id) {
    path += `?factura_id=${factura_id}`;
    windowName = `nota-debito-factura-${factura_id}`;
  }
  
  return openStandaloneWindow(path, windowName, options);
}

export function openEditNotaDebito(id, options = {}) {
  return openStandaloneWindow(`/standalone/notas-debito/${id}`, `nota-debito-${id}`, options);
}
