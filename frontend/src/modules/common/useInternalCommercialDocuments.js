import { useWindow } from "../../context/WindowContext";

/**
 * Apertura única de documentos comerciales dentro del gestor de ventanas del ERP.
 * Las rutas /standalone quedan únicamente para compatibilidad con enlaces viejos.
 */
const FORM_WINDOW = { width: 1270, height: 780, minWidth: 720, minHeight: 470, allowMultiple: true };

function readDraft(prefix, id) {
  if (!id) return null;
  try {
    return JSON.parse(localStorage.getItem(`${prefix}${id}`) || "null");
  } catch {
    return null;
  }
}

function idOf(item) {
  return item && typeof item === "object" ? item.id : item;
}

export function useInternalCommercialDocuments() {
  const { openWindow } = useWindow();
  const open = (type, props, title, key, options = {}) => openWindow(type, props, {
    ...FORM_WINDOW,
    ...options,
    title: options.title || title,
    singletonKey: options.singletonKey || key,
  });

  const openNuevaFactura = (params = {}, options = {}) => {
    const { draft_id, ov_id, source_delivery_note_id, entity_id, id } = params;
    if (id) return openEditFactura(id, options);
    const draft = readDraft("invoice_draft_", draft_id);
    const sourceType = source_delivery_note_id ? "delivery-note"
      : ov_id ? "sales-order"
      : draft?.sourceType || null;
    const sourceId = source_delivery_note_id || ov_id
      || draft?.deliveryNoteId || draft?.salesOrderId || draft?.ovId || null;
    const lines = params.lines
      ? String(params.lines).split(",").filter(Boolean)
      : null;
    return open("invoice-form", {
      mode: "new",
      draftId: draft_id || null,
      initialSourceType: sourceType,
      initialSourceId: sourceId,
      initialEntityId: entity_id || null,
      preselectedLines: lines,
      initialDnIds: draft?.initialDnIds || null,
    }, "Nueva Factura de Venta",
    `sales-invoice-new-${draft_id || sourceId || "manual"}`, options);
  };

  const openEditFactura = (value, options = {}) => {
    const id = idOf(value);
    if (!id) return;
    return open("invoice-form", { mode: "edit", id }, `Factura de Venta ${id}`, `sales-invoice-${id}`, options);
  };

  const openNuevaFacturaCompra = (params = {}, options = {}) => {
    const { draft_id, oc_id, remito_id } = params;
    const draft = readDraft("purchase_invoice_draft_", draft_id);
    const sourceType = oc_id ? "purchase-order"
      : remito_id ? "delivery-note"
      : draft?.sourceType || null;
    const sourceId = oc_id || remito_id
      || draft?.purchaseOrderId || draft?.ocId || draft?.deliveryNoteId || null;
    return open("purchase-invoice-form", {
      mode: "new",
      draftId: draft_id || null,
      initialSourceType: sourceType,
      initialSourceId: sourceId,
      preselectedLines: params.lines ? String(params.lines).split(",").filter(Boolean) : null,
    }, "Nueva Factura de Compra",
    `purchase-invoice-new-${draft_id || sourceId || "manual"}`, options);
  };

  const openEditFacturaCompra = (value, options = {}) => {
    const id = idOf(value);
    if (!id) return;
    return open("purchase-invoice-form", { mode: "edit", id }, `Factura de Compra ${id}`, `purchase-invoice-${id}`, options);
  };

  const openNuevoRemito = (ovId = null, options = {}) => {
    const preselectedLines = options.preselectedLines || readDraft("", options.draft_key);
    return open("delivery-note", {
      mode: "new", ov_id: ovId || null,
      preselectedLines: Array.isArray(preselectedLines) ? preselectedLines : null,
      autoOpenSelector: false,
    }, ovId ? "Remito desde Orden de Venta" : "Nuevo Remito de Venta",
    `sales-remito-new-${ovId || "direct"}-${options.draft_key || "default"}`, options);
  };

  const openEditRemito = (value, options = {}) => {
    const id = idOf(value);
    if (!id) return;
    return open("delivery-note", { mode: "edit", id }, `Remito de Venta ${id}`, `sales-remito-${id}`, options);
  };

  const openNuevoRemitoEntrada = (ocId = null, options = {}) => {
    const preselectedLines = options.preselectedLines || readDraft("", options.draft_key);
    return open("purchase-delivery-note", {
      mode: "new", oc_id: ocId || null,
      preselectedLines: Array.isArray(preselectedLines) ? preselectedLines : null,
      autoOpenSelector: false,
    }, ocId ? "Remito desde Orden de Compra" : "Nuevo Remito de Entrada",
    `purchase-remito-new-${ocId || "direct"}-${options.draft_key || "default"}`, options);
  };

  const openEditRemitoEntrada = (value, options = {}) => {
    const id = idOf(value);
    if (!id) return;
    return open("purchase-delivery-note", { mode: "edit", id }, `Remito de Entrada ${id}`, `purchase-remito-${id}`, options);
  };

  const openEditOrdenVenta = (value, options = {}) => {
    const id = idOf(value);
    if (!id) return;
    return open("sales-order", { mode: "edit", id }, `Orden de Venta ${id}`, `sales-order-${id}`, options);
  };

  const openEditPurchaseOrder = (value, options = {}) => {
    const id = idOf(value);
    if (!id) return;
    return open("purchase-order", { mode: "edit", id }, `Orden de Compra ${id}`, `purchase-order-${id}`, options);
  };

  const openNote = (purchase, debit, value = null, options = {}) => {
    const id = options.mode === "edit" ? idOf(value) : null;
    const invoiceId = !id && value && typeof value === "object" ? value.factura_id : null;
    const docType = purchase
      ? (debit ? "PURCHASE_DEBIT_NOTE" : "PURCHASE_CREDIT_NOTE")
      : (debit ? "DEBIT_NOTE" : "CREDIT_NOTE");
    const title = `${debit ? "Nota de Débito" : "Nota de Crédito"} de ${purchase ? "Compra" : "Venta"}`;
    return open(purchase ? "purchase-invoice-form" : "invoice-form", {
      mode: id ? "edit" : "new",
      id: id || null,
      initialDocType: docType,
      initialSourceType: invoiceId ? "invoice" : null,
      initialSourceId: invoiceId || null,
    }, id ? `${title} ${id}` : `Nueva ${title}`,
    `${docType.toLowerCase()}-${id || invoiceId || "new"}`, options);
  };

  const openNuevaNotaDebito = (params = {}, options = {}) => openNote(false, true, params, options);
  const openEditNotaDebito = (value, options = {}) => openNote(false, true, value, { ...options, mode: "edit" });
  const openNuevaNotaCredito = (params = {}, options = {}) => openNote(false, false, params, options);
  const openEditNotaCredito = (value, options = {}) => openNote(false, false, value, { ...options, mode: "edit" });
  const openNuevaNotaDebitoCompra = (params = {}, options = {}) => openNote(true, true, params, options);
  const openEditNotaDebitoCompra = (value, options = {}) => openNote(true, true, value, { ...options, mode: "edit" });
  const openNuevaNotaCreditoCompra = (params = {}, options = {}) => openNote(true, false, params, options);
  const openEditNotaCreditoCompra = (value, options = {}) => openNote(true, false, value, { ...options, mode: "edit" });

  return {
    openNuevaFactura, openEditFactura,
    openNuevaFacturaCompra, openEditFacturaCompra,
    openNuevoRemito, openEditRemito,
    openNuevoRemitoEntrada, openEditRemitoEntrada,
    openEditOrdenVenta, openEditPurchaseOrder,
    openNuevaNotaDebito, openEditNotaDebito, openNuevaNotaCredito, openEditNotaCredito,
    openNuevaNotaDebitoCompra, openEditNotaDebitoCompra,
    openNuevaNotaCreditoCompra, openEditNotaCreditoCompra,
  };
}
