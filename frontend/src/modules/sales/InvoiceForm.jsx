import React, { useState, useEffect, useMemo } from "react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import Autocomplete from "../../components/ui/Autocomplete";
import AccountSelector from "../../components/ui/AccountSelector";
import { useWindow } from "../../context/WindowContext";
import { useToast } from "../../context/ToastContext";
import { API_URL } from "../../config";
import { TraceabilityStatusBadge } from "../../components/ui/TraceabilityStatusBadge";
import LoadingScreen from "../../components/ui/LoadingScreen";
import {
  Save, Trash2, Printer, X, Receipt, ShoppingBag, Truck, CreditCard,
  Building, User, Link2, Plus, Pencil, CheckCircle, Clock, Activity, FileText, ArrowRight, Search
} from "lucide-react";
import s from "./SalesOrderForm.module.css";
import { padPV, padNumber, joinFullNumber, splitFullNumber } from "../../utils/formatters";

function getInvoiceLineName(line) {
  return (
    line.product_name ||
    line.product?.name ||
    line.product_description ||
    line.description ||
    line.concept ||
    line.name ||
    line.item_name ||
    ""
  );
}

function isSourceLockedLine(line) {
  return Boolean(
    line.sales_order_id ||
    line.delivery_note_id ||
    line.source_sales_line_id ||
    line.source_delivery_line_id ||
    line.source_dn_line_id ||
    line.source_line_id ||
    line.origin_line_id
  );
}

function resolveLineProductId(line) {
  return (
    line.product_id ||
    line.product?.id ||
    line.item?.product_id ||
    null
  );
}

function findProductById(products, productId) {
  if (!productId || !products) return null;
  return products.find((p) => String(p.id) === String(productId)) || null;
}

function resolveProductSalesAccount(line, products) {
  const productId = resolveLineProductId(line);
  const catalogProduct = findProductById(products, productId);

  return (
    line.account_id ||
    line.accounting_account_id ||
    line.sales_account_id ||
    line.product?.sales_account_id ||
    catalogProduct?.sales_account_id ||
    catalogProduct?.revenue_account_id ||
    catalogProduct?.income_account_id ||
    null
  );
}

function getInvoiceOriginInfo(invoice, lines = []) {
  const salesOrderId =
    invoice?.sales_order_id ||
    invoice?.source_sales_order_id ||
    invoice?.origin_sales_order_id ||
    lines.find(l => l.sales_order_id || l.source_sales_order_id)?.sales_order_id ||
    lines.find(l => l.sales_order_id || l.source_sales_order_id)?.source_sales_order_id ||
    invoice?.sales_orders?.[0]?.id ||
    null;

  const salesOrderNumber =
    invoice?.sales_order_number ||
    invoice?.source_sales_order_number ||
    invoice?.origin_number ||
    lines.find(l => l.sales_order_number || l.source_sales_order_number)?.sales_order_number ||
    lines.find(l => l.sales_order_number || l.source_sales_order_number)?.source_sales_order_number ||
    invoice?.sales_orders?.[0]?.number ||
    null;

  return { salesOrderId, salesOrderNumber };
}

function getInvoiceDeliveryNoteInfo(invoice, lines = []) {
  const deliveryNoteId =
    invoice?.delivery_note_id ||
    invoice?.source_delivery_note_id ||
    invoice?.linked_delivery_note_id ||
    lines.find(l => l.delivery_note_id || l.source_delivery_note_id)?.delivery_note_id ||
    lines.find(l => l.delivery_note_id || l.source_delivery_note_id)?.source_delivery_note_id ||
    invoice?.delivery_notes?.[0]?.id ||
    null;

  const deliveryNoteNumber =
    invoice?.delivery_note_number ||
    invoice?.source_delivery_note_number ||
    lines.find(l => l.delivery_note_number || l.source_delivery_note_number)?.delivery_note_number ||
    lines.find(l => l.delivery_note_number || l.source_delivery_note_number)?.source_delivery_note_number ||
    invoice?.delivery_notes?.[0]?.number ||
    null;

  return { deliveryNoteId, deliveryNoteNumber };
}

export default function InvoiceForm(props) {
  const {
    mode: initialMode = "new",
    id: initialId = null,
    windowId,
    initialSourceType = null,
    initialSourceId = null,
    preselectedLines = null,
    draftId = null,
    isStandalone = false,
    initialDocType = "INVOICE"
  } = props;

  const { closeWindow, openWindow } = useWindow();
  const { showToast } = useToast();
  


  const [mode, setMode] = useState(initialMode);
  const [id, setId] = useState(initialId);
  const [loading, setLoading] = useState(initialMode === "edit");
  const [saving, setSaving] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(initialMode === "edit");
  const [activeContextTab, setActiveContextTab] = useState('comercial');
  const [activeBottomTab, setActiveBottomTab] = useState('observaciones');

  
  // Header State
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);
  const [entity, setEntity] = useState(null);
  const [pv, setPv] = useState("0001");
  const [number, setNumber] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [currency, setCurrency] = useState("ARS");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [observations, setObservations] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [selectedConditionId, setSelectedConditionId] = useState("");
  const [status, setStatus] = useState("BORRADOR");
  const [reasonType, setReasonType] = useState("");
  const [returnStock, setReturnStock] = useState(true);
  const [docType, setDocType] = useState(initialDocType);
  const [letter, setLetter] = useState("A");
  const [ctroCosto, setCtroCosto] = useState("1");
  const [sourceNumber, setSourceNumber] = useState("");
  const [sourceOrderId, setSourceOrderId] = useState(null);
  const [sourceDeliveryNoteId, setSourceDeliveryNoteId] = useState(null);
  const [ovHasDeliveryNotes, setOvHasDeliveryNotes] = useState(false);
  const [fullInvoiceData, setFullInvoiceData] = useState(null);
  
  const [sourceInvoiceId, setSourceInvoiceId] = useState(initialSourceType === 'invoice' ? initialSourceId : "");
  const [sourceInvoices, setSourceInvoices] = useState([]);
  
  useEffect(() => {
    if (reasonType === 'EXCHANGE_DIFFERENCE' && entity?.id) {
        const fetchInvoices = async () => {
            try {
                const token = localStorage.getItem("token");
                const res = await fetch(`${API_URL}/accounting/documents/?entity_id=${entity.id}`, { headers: { Authorization: `Bearer ${token}` }});
                if (res.ok) {
                    const data = await res.json();
                    let items = data.items || data;
                    // Filter invoices
                    items = items.filter(i => i.doc_type === 'INVOICE' || i.doc_type === 'PURCHASE_INVOICE');
                    setSourceInvoices(items);
                }
            } catch (e) {
                console.error(e);
            }
        };
        fetchInvoices();
    } else {
        setSourceInvoices([]);
    }
  }, [reasonType, entity?.id]);

  // Lines
  const [items, setItems] = useState([]);
  
  // Selectors
  const [saleConditions, setSaleConditions] = useState([]);
  const [pointsOfSale, setPointsOfSale] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    fetchInitialData();
    fetchProductsCatalog();
    if (mode === "edit" && id) fetchInvoice();
    else if (mode === "new" && initialSourceType === "sales-order" && initialSourceId) {
        fetchFromSource();
    }
  }, []);

  useEffect(() => {
    const handleDocumentMessage = (e) => {
        const payload = e.data;
        if (!payload || payload.type !== 'QUINTAL_DOCUMENT_SAVED') return;
        
        // Si hay una actualización de un documento relacionado (ej: remito o la misma factura) y estamos en modo vista
        if (mode === "edit" && id && (payload.invoiceId === id || payload.salesOrderId === sourceOrderId)) {
            fetchInvoice();
        }
    };

    window.addEventListener("message", handleDocumentMessage);
    let bc;
    try {
        bc = new BroadcastChannel("quintal-documents");
        bc.onmessage = handleDocumentMessage;
    } catch (err) {
        console.error("BroadcastChannel not supported", err);
    }

    return () => {
        window.removeEventListener("message", handleDocumentMessage);
        if (bc) bc.close();
    };
  }, [mode, id, sourceOrderId]);

  const fetchProductsCatalog = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/inventory/products/?active=true`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setProducts(data.items || data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!products?.length || !items?.length) return;

    let changed = false;
    const newItems = items.map((line) => {
      if (!resolveLineProductId(line)) return line;
      if (line.accounting_account_id) return line;

      const accountId = resolveProductSalesAccount(line, products);
      if (!accountId) return line;

      changed = true;
      return {
        ...line,
        accounting_account_id: accountId,
        accountLocked: Boolean(accountId),
      };
    });

    if (changed) {
      setItems(newItems);
    }
  }, [products, items]);

  const fetchInitialData = async () => {
    const token = localStorage.getItem("token");
    const headers = { Authorization: `Bearer ${token}` };
    const [scRes, posRes, spRes] = await Promise.all([
      fetch(`${API_URL}/sales/sale-conditions/`, { headers }),
      fetch(`${API_URL}/config/pos`, { headers }),
      fetch(`${API_URL}/entities/?is_salesperson=true`, { headers }),
    ]);
    if (scRes.ok) setSaleConditions(await scRes.json());
    if (posRes.ok) {
        const pvs = await posRes.json();
        // Filtrar PVs que tengan FA o FC en sus document_configs
        const docTag = docType === 'PURCHASE_INVOICE' ? 'FC' : 'FA';
        const configuredPvs = pvs.filter(p => p.document_configs?.some(c => c.document_type === docTag || c.document_type === 'INVOICE' || c.document_type === 'PURCHASE_INVOICE' || c.document_type.startsWith('F')));
        // Si no hay ninguno configurado formalmente, buscamos por nombre como fallback
        const fallbackPvs = pvs.filter(p => (!p.document_configs || p.document_configs.length === 0) && p.name.toLowerCase().includes('factura'));
        
        const finalPvs = configuredPvs.length > 0 ? configuredPvs : fallbackPvs;
        setPointsOfSale(finalPvs);
        
        if (mode === "new" && !initialSourceId && finalPvs.length > 0) {
            setPv(finalPvs[0].pv);
        }
    }
    if (spRes.ok) setSellers(await spRes.json());
  };

  const fetchNextNumber = async (currentPv) => {
      if (mode !== "new" || !currentPv) return;
      try {
          let docTag = 'FA';
          if (docType === 'PURCHASE_INVOICE') {
              docTag = 'FC';
          } else if (docType === 'CREDIT_NOTE') {
              docTag = `NC${letter}`;
          } else if (docType === 'DEBIT_NOTE') {
              docTag = `ND${letter}`;
          } else if (docType === 'INVOICE') {
              docTag = `F${letter}`;
          }

          const token = localStorage.getItem("token");
          const res = await fetch(`${API_URL}/accounting/documents/next-number?pv=${currentPv}&doc_type=${docTag}`, { headers: { Authorization: `Bearer ${token}` }});
          if (res.ok) {
              const data = await res.json();
              setNumber(data.next_number);
          }
      } catch (e) {
          console.error("Error fetching next number:", e);
      }
  };

  useEffect(() => {
      fetchNextNumber(pv);
  }, [pv, docType, letter]);

  const fetchInvoice = async (docId = id) => {
    if (!docId) return;
    setLoading(true);
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/accounting/documents/${docId}`, { headers: { Authorization: `Bearer ${token}` }});
    if (res.ok) {
        const data = await res.json();

        setFullInvoiceData(data);
        setEntity(data.entity_id ? { id: data.entity_id, name: data.entity_name } : null);
        setDate(data.date.split("T")[0]);
        setDueDate((data.due_date || data.date).split("T")[0]);
        const parsedNum = splitFullNumber(data.number);
        setPv(parsedNum.pv);
        setNumber(parsedNum.num);
        setCurrency(data.currency || "ARS");
        setExchangeRate(data.exchange_rate || 1);
        setSelectedConditionId(data.sale_condition_id || "");
        setSalespersonId(data.salesperson_id || "");
        setCtroCosto(data.cost_center || "1");
        setObservations(data.notes || "");
        setStatus(data.status || "DRAFT");
        setDocType(data.doc_type || "INVOICE");
        setLetter(data.line || "A");
        setReasonType(data.reason_type || "");
        
        // Para cada línea con producto, recuperar el contenido por envase
        // Funciona incluso para facturas viejas sin package_size guardado
        const enrichedLines = await Promise.all(data.lines.map(async (l) => {
            let unitContent = l.package_size && parseFloat(l.package_size) > 1 
                ? parseFloat(l.package_size) 
                : undefined;
            
            // Si tiene product_id pero no package_size guardado, buscar en el API
            if (l.product_id && !unitContent) {
                try {
                    const pRes = await fetch(`${API_URL}/inventory/products/${l.product_id}`, { 
                        headers: { Authorization: `Bearer ${token}` } 
                    });
                    if (pRes.ok) {
                        const prod = await pRes.json();
                        if (prod.quantity_per_container && parseFloat(prod.quantity_per_container) > 1) {
                            unitContent = parseFloat(prod.quantity_per_container);
                        }
                    }
                } catch (e) { /* ignorar si falla */ }
            }
            
            let qtyPackages = l.qty_packages;
            if (qtyPackages === null || qtyPackages === undefined) {
                if (unitContent && unitContent > 0) {
                    qtyPackages = parseFloat(l.qty) / unitContent;
                } else {
                    qtyPackages = parseFloat(l.qty);
                }
            }
            
            return { 
                ...l, 
                id: l.id || Math.random(),
                _unit_content: unitContent,
                qty_packages: qtyPackages
            };
        }));
        setItems(enrichedLines);
    }
    setLoading(false);
  };
  
  const fetchFromSource = async () => {
      setLoading(true);

      const token = localStorage.getItem("token");

      if (initialSourceType === 'invoice' && initialSourceId) {
          const res = await fetch(`${API_URL}/accounting/documents/${initialSourceId}`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
              const data = await res.json();
              if (data.entity_id) setEntity({ id: data.entity_id, name: data.entity_name || "Cliente Origen" });
              setSourceNumber(data.number);
              setCurrency(data.currency || "ARS");
              setExchangeRate(data.exchange_rate || 1);
              setSelectedConditionId(data.sale_condition_id || "");
              setSalespersonId(data.salesperson_id || "");
              setCtroCosto(data.cost_center || "1");
              // Líneas vacías para la nota de débito, el usuario carga los conceptos manualmente.
              setItems([]);
          }
          setLoading(false);
          return;
      }

      // Lógica existente para sales-order
      let draft = null;
      if (draftId) {
          const draftStr = localStorage.getItem(`invoice_draft_${draftId}`);
          if (draftStr) {
              draft = JSON.parse(draftStr);
          } else {
              showToast("No se encontró la selección de la Orden de Venta. Volvé a generar la factura.", "error");
              setLoading(false);
              return;
          }
      }

      const endpoint = initialSourceType === 'delivery-note' 
          ? `${API_URL}/sales/delivery-notes/${initialSourceId}`
          : `${API_URL}/sales/sales-orders/${initialSourceId}`;

      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
          const data = await res.json();
          if (data.entity_id) setEntity({ id: data.entity_id, name: draft?.customerName || data.entity_name || "Cliente Origen" });
          
          if (initialSourceType === 'sales-order') {
              setSourceOrderId(data.id);
              // Check if order has delivery notes based on status or relations
              const statusStr = data.status || "";
              if (
                statusStr.includes("DELIVERED") || 
                statusStr.includes("REMITIDO") ||
                (data.delivery_notes && data.delivery_notes.length > 0)
              ) {
                  setOvHasDeliveryNotes(true);
              }
          } else if (initialSourceType === 'delivery-note') {
              setSourceDeliveryNoteId(data.id);
              setSourceOrderId(data.sales_order_id);
          }

          if (draft) {
              setSourceNumber(draft.salesOrderNumber || draft.deliveryNoteNumber || data.number);
              setPv(draft.pointOfSale || "0001");
              setCurrency(draft.currency || data.currency || "ARS");
              setExchangeRate(draft.exchangeRate || data.exchange_rate || 1);
              setSelectedConditionId(draft.paymentCondition || data.sale_condition_id || "");
              setSalespersonId(draft.sellerId || data.salesperson_id || "");
              setCtroCosto(draft.costCenter || data.cost_center || "1");
              
              setItems(draft.lines.map(l => {
                  const factor = parseFloat(l._unit_content || l.package_size || l.quantity_per_container || 1);
                  const qty = parseFloat(l.qty_to_invoice || l.qty || 1);
                  let qtyPackages = l.qty_packages;
                  if ((qtyPackages === null || qtyPackages === undefined) && factor > 1) {
                      qtyPackages = qty / factor;
                  }
                  const resolvedAccount = resolveProductSalesAccount(l, products);
                  return {
                      id: Math.random(),
                      product_id: l.product_id,
                      description: getInvoiceLineName(l),
                      qty: qty,
                      qty_packages: qtyPackages,
                      _unit_content: factor > 1 ? factor : undefined,
                      _unit_label: l._unit_label || l.package_unit || l.unit_short_name || 'u',
                      _container_name: l._container_name || l.container_name || 'Unidad',
                      unit_price: parseFloat(l.unit_price || 0),
                      discount_pct: parseFloat(l.discount_pct || 0),
                      vat_rate: parseFloat(l.vat_rate || 0.21),
                      source_sales_line_id: l.source_sales_line_id || (initialSourceType === 'sales-order' ? l.id : null),
                      source_dn_line_id: initialSourceType === 'delivery-note' ? l.id : null,
                      accounting_account_id: resolvedAccount,
                      accountLocked: Boolean(resolvedAccount && l.product_id),
                      _account_code: l._account_code || l.sales_account_code || null,
                  };
              }));
          } else {
              setSourceNumber(data.number);
              setCurrency(data.currency || "ARS");

              // preselectedLines puede ser:
              // a) array de objetos completos (viene del modal OV con qty_packages, _unit_content, etc.)
              // b) array de strings/IDs
              // c) null
              const hasFullObjects = preselectedLines && preselectedLines.length > 0 && typeof preselectedLines[0] === 'object';

              if (hasFullObjects) {
                  // Usar los objetos pre-seleccionados directamente (ya traen qty_packages, _unit_content, etc.)
                  setItems(preselectedLines.map(l => {
                      const factor = parseFloat(l._unit_content || l.package_size || 1);
                      const qty = parseFloat(l.qty_to_invoice || l.qty || 1);
                      let qtyPackages = l.qty_packages;
                      if ((qtyPackages === null || qtyPackages === undefined) && factor > 1) {
                          qtyPackages = qty / factor;
                      }
                      const resolvedAccount = resolveProductSalesAccount(l, products);
                      return {
                          id: Math.random(),
                          product_id: l.product_id,
                          description: getInvoiceLineName(l),
                          qty: qty,
                          qty_packages: qtyPackages,
                          _unit_content: factor > 1 ? factor : undefined,
                          _unit_label: l._unit_label || l.package_unit || 'u',
                          _container_name: l._container_name || 'Unidad',
                          unit_price: parseFloat(l.unit_price || 0),
                          discount_pct: parseFloat(l.discount_pct || 0),
                          vat_rate: parseFloat(l.vat_rate || 0.21),
                          source_sales_line_id: l.source_sales_line_id || l.id,
                          accounting_account_id: resolvedAccount,
                          accountLocked: Boolean(resolvedAccount && l.product_id),
                          _account_code: l._account_code || l.sales_account_code || null,
                      };
                  }));
              } else {
                  let linesToInvoice = data.lines.filter(l => (l.qty - (l.qty_invoiced || 0)) > 0);
                  if (preselectedLines && preselectedLines.length > 0) {
                      linesToInvoice = linesToInvoice.filter(l => preselectedLines.includes(l.id));
                  }
                  setItems(linesToInvoice.map(l => {
                      const factor = l.product?.quantity_per_container ? parseFloat(l.product.quantity_per_container) : (l.package_size ? parseFloat(l.package_size) : 1);
                      const qty = l.qty - (l.qty_invoiced || 0);
                      let qtyPackages = l.qty_packages;
                      if ((qtyPackages === null || qtyPackages === undefined) && factor > 1) {
                          qtyPackages = qty / factor;
                      }
                      const resolvedAccount = resolveProductSalesAccount(l, products);
                      return {
                          id: Math.random(),
                          product_id: l.product_id,
                          description: getInvoiceLineName(l),
                          qty: qty,
                          qty_packages: qtyPackages,
                          _unit_content: factor > 1 ? factor : undefined,
                          _unit_label: l.product?.container?.unit?.short_name || l.package_unit || 'u',
                          _container_name: l.product?.container?.name || 'Unidad',
                          unit_price: l.unit_price,
                          discount_pct: l.discount_pct || 0,
                          vat_rate: l.vat_rate || 0.21,
                          source_sales_line_id: l.id,
                          accounting_account_id: resolvedAccount,
                          accountLocked: Boolean(resolvedAccount && l.product_id),
                          _account_code: l.product?.sales_account_code || null,
                      };
                  }));
              }
          }
      }
      setLoading(false);
  };

  const totals = useMemo(() => {
    return items.reduce((acc, i) => {
        // Usar qty correctamente (litros/kg totales, no envases)
        const qty = i.qty || 0;
        const sub = qty * (i.unit_price || 0);
        const bonif = sub * ((i.discount_pct || 0) / 100);
        const net = sub - bonif;
        const vat = net * (i.vat_rate || 0.21);
        acc.subtotal += sub;
        acc.net += net;
        acc.vat += vat;
        acc.total += net + vat;
        return acc;
    }, { subtotal: 0, net: 0, vat: 0, total: 0 });
  }, [items]);

  const handleSave = async () => {
    if (!entity) return showToast("Falta Cliente", "error");
    if (currency === "USD" && exchangeRate <= 1) {
        return showToast("Para moneda USD el Tipo de Cambio debe ser mayor a 1", "error");
    }
    if (reasonType === 'EXCHANGE_DIFFERENCE' && !sourceInvoiceId) {
        return showToast("Seleccioná una factura origen para generar una nota por diferencia de cambio.", "error");
    }
    
    // Nota: NO validamos accounting_account_id aquí.
    // El backend intenta resolverlo automáticamente desde el producto.
    // Si no puede resolverlo, el backend rechaza con mensaje específico.

    setSaving(true);
    const token = localStorage.getItem("token");
    const finalNumber = joinFullNumber(pv, number);
    const payload = {
        doc_type: docType,
        line: letter,
        number: finalNumber || "0001-00000000",
        date: date,
        entity_id: entity.id,
        salesperson_id: salespersonId || null,
        warehouse_id: null,
        sale_condition_id: selectedConditionId,
        currency: currency,
        exchange_rate: exchangeRate,
        notes: observations,
        subtotal: totals.subtotal,
        total_discount: 0,
        net_amount: totals.net,
        total_vat: totals.vat,
        total_amount: totals.total,
        reason_type: reasonType || null,
        return_stock: returnStock,
        source_invoice_id: sourceInvoiceId || null,
        lines: items.map(l => ({
            product_id: l.product_id,
            description: l.description,
            qty_packages: l.qty_packages !== undefined ? l.qty_packages : null,
            qty: l.qty,
            unit_price: l.unit_price,
            discount_pct: l.discount_pct,
            vat_rate: l.vat_rate,
            accounting_account_id: l.accounting_account_id,
            source_sales_line_id: l.source_sales_line_id,
            source_dn_line_id: l.source_dn_line_id
        }))
    };
    

    
    try {
        const url = mode === "edit" ? `${API_URL}/accounting/documents/${id}` : `${API_URL}/accounting/documents/`;
        const res = await fetch(url, {
            method: mode === "edit" ? "PUT" : "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            const docData = await res.json();
            showToast("Factura guardada correctamente", "success");
            const evtName = docType === 'PURCHASE_INVOICE' ? 'purchase-invoice-changed' : 'invoice-changed';
            window.dispatchEvent(new Event(evtName));
            if (window.opener) window.opener.dispatchEvent(new Event(evtName));
            
            // Emit QUINTAL_DOCUMENT_SAVED
            const eventPayload = {
                type: "QUINTAL_DOCUMENT_SAVED",
                documentType: "invoice",
                invoiceId: docData.id,
                salesOrderId: sourceOrderId,
                deliveryNoteId: sourceDeliveryNoteId,
                timestamp: Date.now()
            };
            
            if (window.opener) {
                window.opener.postMessage(eventPayload, "*");
            }
            try {
                const bc = new BroadcastChannel("quintal-documents");
                bc.postMessage(eventPayload);
                bc.close();
            } catch (err) {
                console.error("BroadcastChannel error:", err);
            }

            // Cambiar a modo solo lectura sin cerrar ventana
            setId(docData.id);
            setMode("edit");
            setIsReadOnly(true);
            fetchInvoice(docData.id);
        } else {
            const err = await res.json();
            console.error("ERROR FROM BACKEND:", err);
            showToast(err.detail || err.message || "Error al guardar la factura", "error");
        }
    } catch (e) {
        console.error("NETWORK ERROR:", e);
        showToast("Error de conexión al guardar", "error");
    } finally {
        setSaving(false);
    }
  };

  const searchEntities = async (q) => {
    const res = await fetch(`${API_URL}/entities/?q=${q}&type=client`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
    return res.json();
  };
  
  const searchProducts = async (q) => {
    const res = await fetch(`${API_URL}/inventory/products/?q=${q}&active=true`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
    return res.json();
  };

  const handleUpdateItem = (itemId, field, value) => {
    setItems(items.map(i => {
      if (i.id === itemId) {
        if (isSourceLockedLine(i) && ["product", "product_id", "description", "concept", "qty", "quantity", "qty_packages", "unit"].includes(field)) {
          return i;
        }
        
        if (field === 'accounting_account_id' && i.accountLocked) {
          return i;
        }

        if (field === 'description' || field === 'accounting_account_id') {
          return { ...i, [field]: value };
        }
        
        const numericVal = parseFloat(value) || 0;
        let updated = { ...i, [field]: numericVal };
        
        // Al cambiar envases, recalcular la cantidad total equivalente
        if (field === 'qty_packages') {
            const unitContent = updated._unit_content || (updated.package_size && parseFloat(updated.package_size) > 1 ? parseFloat(updated.package_size) : null);
            if (unitContent) {
                updated.qty = numericVal * unitContent;
            }
        }
        
        return updated;
      }
      return i;
    }));
  };

  const fmt = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val || 0);
  const fmtValue = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency }).format(val || 0);

  if (loading) return <LoadingScreen message="Cargando Factura..." />;

  return (
    <div className={`${s.formCard} ${isStandalone ? s.formCardStandalone : ''}`}>
        
        {/* Header Area */}
        <div className={s.headerLine}>
            <div className={s.titleGroup}>
                <div className={s.compactHeaderTitle}>
                    <h1>
                        <Receipt size={24} style={{ color: 'var(--primary)' }} />
                        <span>{mode === 'edit' ? `${docType === 'CREDIT_NOTE' ? 'Nota de Crédito' : docType === 'DEBIT_NOTE' ? 'Nota de Débito' : 'Factura'} ${joinFullNumber(pv, number)}` : docType === 'CREDIT_NOTE' ? 'Nueva Nota de Crédito' : docType === 'DEBIT_NOTE' ? 'Nueva Nota de Débito' : 'Nueva Factura'}</span>
                    </h1>
                    <div className={s.headerMeta}>
                        {reasonType === 'EXCHANGE_DIFFERENCE' && (
                            <>
                                <span style={{ backgroundColor: '#10b981', color: 'white', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '11px' }}>DIF. CAMBIO</span>
                                <span>&middot;</span>
                            </>
                        )}
                        <span className={s.metaDate}>{new Date(date).toLocaleDateString('es-AR')}</span>
                        {initialSourceType === 'sales-order' && sourceNumber && (
                            <>
                                <span style={{ color: '#24389c', fontWeight: 800 }}>OV {sourceNumber} &middot; {entity?.name || 'Cliente'}</span>
                                <span>&middot;</span>
                            </>
                        )}
                        <span>{date ? (date.includes('T') ? new Date(date).toLocaleDateString('es-AR') : date.split('-').reverse().join('/')) : 'S/F'}</span>
                        <span>&middot;</span>
                        <span>{currency}</span>
                        <span>&middot;</span>
                        <span>TC {exchangeRate}</span>
                        <TraceabilityStatusBadge status={status} />
                    </div>
                </div>
            </div>
            <div className={s.headerActions}>
                {isReadOnly ? (
                  <button className={s.saveBtn} style={{ background: '#64748b', cursor: 'pointer' }} onClick={() => setIsReadOnly(false)}>
                      <Pencil size={16} /> Editar
                  </button>
                ) : (
                  <button className={s.saveBtn} onClick={handleSave} disabled={saving}>
                      {saving ? <div className={s.spinnerSmall} /> : <Save size={16} />}
                      {saving ? "Guardando..." : "Guardar"}
                  </button>
                )}
                <div className={s.actionGroup}>
                    <button className={s.actionBtn} disabled={!id} onClick={() => window.open(`${API_URL}/accounting/documents/${id}/pdf`, '_blank')} title="Imprimir Factura">
                        <Printer size={18} />
                    </button>
                </div>
            </div>
        </div>

        {/* Alertas */}
        {!isReadOnly && initialSourceType === 'sales-order' && ovHasDeliveryNotes && (
            <div style={{ margin: '0 24px 16px', padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px', color: '#1e3a8a', fontSize: '14px', fontWeight: 500 }}>
                <span style={{ fontSize: '18px' }}>ℹ️</span>
                La factura también se vinculará automáticamente a los remitos asociados a esta orden de venta.
            </div>
        )}

        {/* Body: 2 Column Layout */}
        <div className={s.documentMainGrid}>
            
            {/* Columna Izquierda: Ítems y Productos */}
            <div className={s.leftDocumentArea}>
                {!isReadOnly && (
                    <div className={s.searchRibbon} style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                            <Autocomplete 
                                onSearch={searchProducts} 
                                onSelect={(p) => {
                                    const qtyPerContainer = p.quantity_per_container && p.quantity_per_container > 1 
                                        ? p.quantity_per_container 
                                        : null;
                                    const hasContainer = qtyPerContainer !== null;
                                    setItems([...items, { 
                                        id: Math.random(), 
                                        product_id: p.id, 
                                        description: p.name, 
                                        // Si el producto tiene envases, qty_packages=1 (bidón), qty=litros equivalentes
                                        qty_packages: hasContainer ? 1 : undefined,
                                        qty: hasContainer ? qtyPerContainer : 1, 
                                        _unit_content: qtyPerContainer,
                                        _unit_label: p.unit_of_measure || 'u',
                                        unit_price: p.cost_price || 0, 
                                        vat_rate: p.tax_type?.rate ?? 0.21, 
                                        discount_pct: 0,
                                        // Cuenta contable de venta del producto (puede ser null si no está configurada)
                                        accounting_account_id: p.sales_account_id || null,
                                        accountLocked: Boolean(p.sales_account_id),
                                    }]);
                                }}
                                placeholder="Escriba para buscar productos para añadir..."
                                variant="glass"
                                icon={<Search size={16} style={{ color: 'var(--primary)' }}/>}
                                minChars={0}
                                clearOnSelect={true}
                            />
                        </div>
                        <Button 
                            variant="primary" 
                            size="small" 
                            onClick={() => setItems([...items, { id: Math.random(), description: "", qty: 1, unit_price: 0, vat_rate: 0.21, discount_pct: 0 }])}
                            title="Agregar Concepto Libre"
                            style={{ padding: '0 12px' }}
                        >
                            <Plus size={20} strokeWidth={3} />
                        </Button>
                    </div>
                )}

                <div className={`${s.bentoContainer} ${s.itemsPanel}`} style={{ padding: 0, overflow: 'hidden' }}>
                    {items.length > 0 ? (
                        <>
                            {isReadOnly ? null : (
                                <div className={s.tableHeader} style={{ gridTemplateColumns: 'minmax(200px, 1.8fr) 70px 80px 60px 80px 70px 60px 90px 30px' }}>
                                    <div className={s.th}>PRODUCTO / CONCEPTO</div>
                                    <div className={s.th}>ENVASES</div>
                                    <div className={s.th}>CANTIDAD</div>
                                    <div className={s.th}>UNIDAD</div>
                                    <div className={s.th}>P. UNIT</div>
                                    <div className={s.th}>DTO%</div>
                                    <div className={s.th}>IVA%</div>
                                    <div className={s.th} style={{ textAlign: 'right' }}>SUBTOTAL</div>
                                    <div></div>
                                </div>
                            )}
                            <div className={`${s.itemsList} ${s.itemsTableScroll}`}>
                                {items.map(item => {
                                    if (isReadOnly) {
                                        const qtyPackages = item.qty_packages;
                                        const qty = item.qty || 0;
                                        const hasPackages = qtyPackages !== undefined && qtyPackages !== null;
                                        const subtotal = qty * (item.unit_price || 0) * (1 - (item.discount_pct || 0) / 100);
                                        const vatAmount = subtotal * (item.vat_rate || 0.21);
                                        const totalAmount = subtotal + vatAmount;
                                        
                                        return (
                                            <div key={item.id} style={{ display: 'flex', flexDirection: 'column', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', gap: 8 }}>
                                                <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b' }}>Producto: {item.description}</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 24px', fontSize: 12, color: '#475569' }}>
                                                    {hasPackages ? (
                                                        <>
                                                            <div><span style={{ fontWeight: 800 }}>Cantidad:</span> {qtyPackages} envases</div>
                                                            <div><span style={{ fontWeight: 800 }}>Equivalencia:</span> {qtyPackages} envases = {qty.toFixed(2)} {item._unit_label || 'u'}</div>
                                                        </>
                                                    ) : (
                                                        <div><span style={{ fontWeight: 800 }}>Cantidad:</span> {qty.toFixed(2)} {item._unit_label || 'u'}</div>
                                                    )}
                                                    <div><span style={{ fontWeight: 800 }}>Precio:</span> {fmtValue(item.unit_price)} / {item._unit_label || 'u'}</div>
                                                    <div><span style={{ fontWeight: 800 }}>Subtotal:</span> {fmtValue(subtotal)}</div>
                                                    <div><span style={{ fontWeight: 800 }}>IVA:</span> {fmtValue(vatAmount)}</div>
                                                    <div style={{ color: 'var(--primary)', fontWeight: 900 }}><span style={{ fontWeight: 800, color: '#1e293b' }}>Total:</span> {fmtValue(totalAmount)}</div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    
                                    const isLocked = isSourceLockedLine(item);
                                    
                                    return (
                                    <div key={item.id} className={s.tableRow} style={{ gridTemplateColumns: 'minmax(200px, 1.8fr) 70px 80px 60px 80px 70px 60px 90px 30px', alignItems: 'flex-start', height: 'auto', minHeight: 48, padding: '8px 12px', background: isLocked ? '#f8fafc' : 'transparent', cursor: isLocked ? 'not-allowed' : 'default' }}>
                                        <div style={{ padding: '4px 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            <input 
                                                type="text" 
                                                className={s.tableInput} 
                                                value={item.description || ''} 
                                                onChange={(e) => handleUpdateItem(item.id, 'description', e.target.value)} 
                                                placeholder="Ingrese concepto..."
                                                readOnly={isLocked}
                                                style={{ fontWeight: 900, width: '100%', textAlign: 'left', background: isLocked ? 'transparent' : 'transparent', color: isLocked ? '#334155' : 'inherit', cursor: isLocked ? 'not-allowed' : 'text', opacity: isLocked ? 0.9 : 1, textOverflow: 'ellipsis' }}
                                                title={isLocked ? 'Esta línea viene de una OV/Remito y no puede modificarse' : (item.description || '')}
                                            />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px 12px', flexWrap: 'wrap' }}>
                                                {item._unit_content && (
                                                    <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>
                                                        {item.qty_packages || '?'} env × {item._unit_content} = {((item.qty_packages || 0) * item._unit_content).toFixed(0)} {item._unit_label || 'u'}
                                                    </span>
                                                )}
                                                {isLocked && (
                                                    <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 800 }}>
                                                        &middot; {item.delivery_note_id || item.source_dn_line_id ? 'Desde Remito' : 'Desde OV'}
                                                    </span>
                                                )}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <span style={{ fontSize: 9, fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Cta:</span>
                                                    <div style={{ width: 110 }}>
                                                        <AccountSelector 
                                                            value={item.accounting_account_id ?? ''} 
                                                            onChange={(e) => handleUpdateItem(item.id, 'accounting_account_id', e.target.value)} 
                                                            placeholder="Sin asignar"
                                                            readOnly={item.accountLocked}
                                                            style={{ opacity: item.accountLocked ? 0.8 : 1, cursor: item.accountLocked ? 'not-allowed' : 'pointer', background: item.accountLocked ? '#f1f5f9' : undefined }}
                                                            title={item.accountLocked ? 'Cuenta configurada en el artículo' : ''}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        {/* ENVASES: el usuario ingresa cuántos bidones */}
                                        <input 
                                            type="number" 
                                            className={s.tableInput} 
                                            value={item.qty_packages !== undefined ? item.qty_packages : (item.qty || 0)} 
                                            onChange={(e) => handleUpdateItem(item.id, 'qty_packages', e.target.value)}
                                            readOnly={isLocked}
                                            style={{ background: isLocked ? '#e2e8f0' : (item._unit_content ? '#eff6ff' : '#fff'), border: item._unit_content ? '1.5px solid #93c5fd' : undefined, cursor: isLocked ? 'not-allowed' : 'text' }}
                                            title={isLocked ? 'Bloqueado por origen' : (item._unit_content ? `Cantidad de envases (cada uno contiene ${item._unit_content} ${item._unit_label || 'u'})` : 'Cantidad')}
                                        />
                                        {/* UNIDADES EQUIVALENTES: calculado automáticamente */}
                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                            <input 
                                                type="number" 
                                                className={s.tableInput} 
                                                value={item.qty || 0} 
                                                onChange={(e) => handleUpdateItem(item.id, 'qty', e.target.value)} 
                                                readOnly={isLocked || !!item._unit_content}
                                                style={{ background: (isLocked || !!item._unit_content) ? '#f1f5f9' : '#fff', color: (isLocked || !!item._unit_content) ? '#64748b' : 'inherit', cursor: (isLocked || !!item._unit_content) ? 'not-allowed' : 'text' }}
                                                title={isLocked ? 'Bloqueado por origen' : (item._unit_content ? 'Calculado automáticamente (envases × contenido)' : 'Cantidad')}
                                            />
                                        </div>
                                        <div style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', color: '#64748b' }}>{item._unit_label || 'u'}</div>
                                        <input type="number" className={s.tableInput} value={item.unit_price ?? 0} onChange={(e) => handleUpdateItem(item.id, 'unit_price', e.target.value)} />
                                        <input type="number" className={s.tableInput} value={item.discount_pct ?? 0} onChange={(e) => handleUpdateItem(item.id, 'discount_pct', e.target.value)} />
                                        <div style={{ fontSize: 11, fontWeight: 600, textAlign: 'center' }}>{((item.vat_rate || 0.21) * 100).toFixed(0)}%</div>
                                        <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--primary)', textAlign: 'right' }}>
                                            {fmtValue((item.qty * item.unit_price * (1 - (item.discount_pct||0)/100)) * (1 + (item.vat_rate||0.21)))}
                                        </div>
                                        {isLocked ? (
                                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }} title="Esta línea viene de un origen y no puede eliminarse.">
                                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#cbd5e1' }} />
                                            </div>
                                        ) : (
                                            <button style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }} onClick={() => setItems(items.filter(i => i.id !== item.id))}>
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 0', minHeight: 80 }}>
                            <Search size={24} style={{ marginBottom: 8, opacity: 0.3, color: 'var(--text-secondary)' }} />
                            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>Sin ítems a facturar</div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>Buscá un producto para agregarlo a la factura</div>
                        </div>
                    )}
                </div>
                {/* Flujo Documento */}
                {(() => {
                    const invoiceInfo = fullInvoiceData ? getInvoiceOriginInfo(fullInvoiceData, items) : { salesOrderId: sourceOrderId, salesOrderNumber: sourceNumber };
                    const dnInfo = fullInvoiceData ? getInvoiceDeliveryNoteInfo(fullInvoiceData, items) : { deliveryNoteId: sourceDeliveryNoteId, deliveryNoteNumber: null };
                    
                    let originStatus = "Directo";
                    let originDetail = "Sin origen";
                    let originColor = '#eab308';
                    
                    if (invoiceInfo.salesOrderId || invoiceInfo.salesOrderNumber) {
                        originStatus = "Vinculada";
                        originDetail = `OV ${invoiceInfo.salesOrderNumber || String(invoiceInfo.salesOrderId).slice(-8)}`;
                        originColor = '#10b981';
                    }
                    
                    let remitoStatus = "Pendiente";
                    let remitoDetail = "0 remitos";
                    let remitoColor = '#eab308';
                    
                    if (dnInfo.deliveryNoteId || dnInfo.deliveryNoteNumber) {
                        remitoStatus = "Vinculado";
                        remitoDetail = `RE ${dnInfo.deliveryNoteNumber || String(dnInfo.deliveryNoteId).slice(-8)}`;
                        remitoColor = '#10b981';
                    }

                    return (
                        <div className={s.flowPanel}>
                          <div className={s.relationsBar} style={{ minHeight: '100%', height: '100%', display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                              <div className={s.relationCard} style={{ opacity: (originStatus !== "Directo") ? 1 : 0.5 }}>
                                  <div className={s.nodeTitle} style={{ color: originColor }}>ORIGEN</div>
                                  <div className={s.nodeStatus} style={{ color: originColor }}>{originStatus}</div>
                                  <div className={s.nodeMetric} style={{ color: '#0f172a' }}>{originDetail}</div>
                              </div>

                          <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

                          {docType !== 'DEBIT_NOTE' && (
                              <>
                                  <div className={s.relationCard} style={{ opacity: (remitoStatus !== "Pendiente") ? 1 : 0.5 }}>
                                      <div className={s.nodeTitle} style={{ color: remitoColor }}>REMITO</div>
                                      <div className={s.nodeStatus} style={{ color: remitoColor }}>{remitoStatus}</div>
                                      <div className={s.nodeMetric} style={{ color: '#0f172a' }}>{remitoDetail}</div>
                                  </div>
                                  <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />
                              </>
                          )}

                  <div className={s.relationCard} style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe' }}>
                      <div className={s.nodeTitle} style={{ color: '#1d4ed8' }}>{docType === 'CREDIT_NOTE' ? 'NOTA DE CRÉDITO' : docType === 'DEBIT_NOTE' ? 'NOTA DE DÉBITO' : 'FACTURA'}</div>
                      <div className={s.nodeStatus} style={{ color: '#1d4ed8' }}>Activa</div>
                      <div className={s.nodeMetric} style={{ color: '#0f172a' }}>{fmt(totals.total)}</div>
                  </div>

                  <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

                  <div className={s.relationCard}>
                      <div className={s.nodeTitle} style={{ color: '#0b132b' }}>COBRO</div>
                      <div className={s.nodeStatus} style={{ color: '#eab308' }}>Pendiente</div>
                      <div className={s.nodeMetric} style={{ color: '#0f172a' }}>0%</div>
                  </div>

                  {(docType === 'DEBIT_NOTE' || docType === 'CREDIT_NOTE') && (
                      <>
                          <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />
                          <div className={s.relationCard}>
                              <div className={s.nodeTitle} style={{ color: '#0b132b' }}>CTA. CORRIENTE</div>
                              <div className={s.nodeStatus} style={{ color: '#eab308' }}>Actualizado</div>
                              <div className={s.nodeMetric} style={{ color: '#0f172a' }}>-</div>
                          </div>
                      </>
                  )}

                  <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

                      <div className={s.relationCard} style={{ maxWidth: '140px', background: 'transparent', border: 'none', paddingLeft: 8 }}>
                          <div className={s.nodeTitle} style={{ color: '#64748b' }}>ESTADO</div>
                          <div className={s.obsText} style={{ marginTop: 4, fontWeight: 800, color: '#1e293b' }}>{status}</div>
                      </div>
                    </div>
                  </div>
                    );
                })()}
            </div>

            {/* Columna Derecha: Panel Lateral Administrativo */}
            <div className={s.rightDocumentArea}>
                {/* Bloque Cliente */}
                <div className={s.clientPanel}>
                    <div className={s.panelTitle}><User size={12}/> CLIENTE</div>
                    <div className={s.clientPanelBody}>
                        <div className={s.clientField}>
                            <label>NOMBRE</label>
                            {isReadOnly ? (
                                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)', textAlign: 'left', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entity?.name || '-'}</div>
                            ) : (
                                <div className={s.clientNameControl}>
                                    <Autocomplete onSearch={searchEntities} onSelect={setEntity} initialValue={entity} placeholder="Buscar..." minChars={0} variant="glass" />
                                </div>
                            )}
                        </div>
                        <div className={s.clientField}>
                            <label>PTO. VENTA</label>
                            {isReadOnly ? <div className={s.clientInput} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>{pv}</div> : (
                                <select className={s.clientSelect} value={pv} onChange={(e) => setPv(e.target.value)}>
                                    {pointsOfSale.map(p => <option key={p.pv} value={p.pv}>{p.pv}</option>)}
                                </select>
                            )}
                        </div>
                        <div className={s.clientField}>
                            <label>NÚMERO</label>
                            <input 
                                type="text" 
                                className={s.clientInput} 
                                value={number} 
                                onChange={(e) => setNumber(e.target.value)}
                                placeholder="Autogenerado"
                                disabled={isReadOnly}
                            />
                        </div>
                    </div>
                </div>

                {/* Bloque Medio: Comercial / Ajuste-Origen */}
                <div className={`${s.sideBlock} ${s.middleRightPanel}`}>
                    {docType !== 'INVOICE' ? (
                        <div className={s.panelTabs}>
                            <button className={`${s.panelTab} ${activeContextTab === 'comercial' ? s.panelTabActive : ''}`} onClick={() => setActiveContextTab('comercial')}>Comercial</button>
                            <button className={`${s.panelTab} ${activeContextTab === 'ajuste' ? s.panelTabActive : ''}`} onClick={() => setActiveContextTab('ajuste')}>Ajuste / Origen</button>
                        </div>
                    ) : (
                        <div className={s.panelTitle} style={{ marginBottom: '8px' }}><ShoppingBag size={12}/> COMERCIAL</div>
                    )}
                    <div className={s.tabContent}>
                        {activeContextTab === 'comercial' && (
                            <>
                                <div className={s.commercialField}>
                                    <label>CONDICIÓN</label>
                                    <div className={s.commercialControl}>
                                        {isReadOnly ? <div className={s.commercialInput} style={{ display: 'flex', alignItems: 'center' }}>{saleConditions.find(c => c.id === selectedConditionId)?.description || '-'}</div> : (
                                            <select className={s.commercialSelect} value={selectedConditionId ?? ''} onChange={e => setSelectedConditionId(e.target.value)}>
                                                <option value="">Seleccione...</option>
                                                {saleConditions.map(sc => <option key={sc.id} value={sc.id}>{sc.description}</option>)}
                                            </select>
                                        )}
                                    </div>
                                </div>
                                <div className={s.commercialField}>
                                    <label>VENDEDOR</label>
                                    <div className={s.commercialControl}>
                                        {isReadOnly ? <div className={s.commercialInput} style={{ display: 'flex', alignItems: 'center' }}>{sellers.find(s => s.id === salespersonId)?.name || '-'}</div> : (
                                            <select className={s.commercialSelect} value={salespersonId ?? ''} onChange={e => setSalespersonId(e.target.value)}>
                                                <option value="">Ninguno</option>
                                                {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                            </select>
                                        )}
                                    </div>
                                </div>
                                <div className={s.commercialField}>
                                    <label>MONEDA</label>
                                    <div className={s.commercialControl}>
                                        {isReadOnly ? <div className={s.commercialInput} style={{ display: 'flex', alignItems: 'center' }}>{currency}</div> : (
                                            <select className={s.commercialSelect} value={currency} onChange={e => setCurrency(e.target.value)}>
                                                <option value="ARS">ARS</option>
                                                <option value="USD">USD</option>
                                            </select>
                                        )}
                                    </div>
                                </div>
                                <div className={s.commercialField}>
                                    <label>T. CAMBIO</label>
                                    <div className={s.commercialControl}>
                                        {isReadOnly ? <div className={s.commercialInput} style={{ display: 'flex', alignItems: 'center' }}>{exchangeRate}</div> : (
                                            <input type="number" className={s.commercialInput} value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} />
                                        )}
                                    </div>
                                </div>
                            </>
                        )}

                        {activeContextTab === 'ajuste' && docType !== 'INVOICE' && (
                            <>
                                <div className={s.commercialField}>
                                    <label>MOTIVO</label>
                                    <div className={s.commercialControl}>
                                        {isReadOnly ? <div className={s.commercialInput} style={{ display: 'flex', alignItems: 'center' }}>{reasonType || 'Otro'}</div> : (
                                            <select className={s.commercialSelect} value={reasonType} onChange={e => {
                                                setReasonType(e.target.value);
                                                if (e.target.value === 'EXCHANGE_DIFFERENCE' && items.length === 0) {
                                                    setItems([{ id: Math.random(), description: "Diferencia de cambio", qty: 1, unit_price: 0, discount_pct: 0, vat_rate: 0.21, accounting_account_id: "" }]);
                                                }
                                            }}>
                                                <option value="">Seleccione Motivo...</option>
                                                <option value="RETURN">Devolución</option>
                                                <option value="DISCOUNT">Bonificación</option>
                                                <option value="BILLING_ERROR">Error de facturación</option>
                                                <option value="COMMERCIAL_ADJUSTMENT">Ajuste comercial</option>
                                                <option value="INTEREST">Intereses</option>
                                                <option value="EXCHANGE_DIFFERENCE">Diferencia de cambio</option>
                                                <option value="SURCHARGE">Recargo financiero</option>
                                                <option value="ADMIN_EXPENSE">Gastos administrativos</option>
                                                <option value="OTHER">Otro</option>
                                            </select>
                                        )}
                                    </div>
                                </div>

                                {reasonType === 'RETURN' && docType === 'CREDIT_NOTE' && (
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0 8px 0', fontSize: '12px', color: '#1e293b', fontWeight: 500 }}>
                                        <input type="checkbox" checked={returnStock} onChange={(e) => setReturnStock(e.target.checked)} style={{ width: '14px', height: '14px', accentColor: '#10b981' }} />
                                        Reingresa stock
                                    </label>
                                )}

                                <div className={s.commercialField}>
                                    <label>ORIGEN {reasonType === 'EXCHANGE_DIFFERENCE' ? '*' : ''}</label>
                                    <div className={s.commercialControl}>
                                        {isReadOnly ? (
                                            <div className={s.commercialInput} style={{ display: 'flex', alignItems: 'center' }}>{sourceInvoices.find(i => i.id === sourceInvoiceId)?.number || 'Seleccionado'}</div>
                                        ) : (
                                            <select className={s.commercialSelect} value={sourceInvoiceId || ''} onChange={e => setSourceInvoiceId(e.target.value)}>
                                                <option value="">{reasonType === 'EXCHANGE_DIFFERENCE' ? 'Buscar factura...' : 'Opcional...'}</option>
                                                {sourceInvoices.map(inv => (
                                                    <option key={inv.id} value={inv.id}>{inv.doc_type.startsWith('INV') ? 'FA' : 'FC'} {inv.number}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                    {sourceInvoiceId && sourceInvoices.find(i => i.id === sourceInvoiceId) && (() => {
                                        const sel = sourceInvoices.find(i => i.id === sourceInvoiceId);
                                        return <div className={s.originMeta}>{sel.number} · TC {sel.exchange_rate} · {sel.currency}</div>;
                                    })()}
                                </div>
                            </>
                        )}

                    </div>
                </div>

                {/* Bloque Observaciones / ARCA */}
                <div className={`${s.sideBlock} ${s.bottomRightPanel}`} style={{ paddingBottom: 0 }}>
                    <div className={s.panelTabs}>
                        <button className={`${s.panelTab} ${activeBottomTab === 'observaciones' ? s.panelTabActive : ''}`} onClick={() => setActiveBottomTab('observaciones')}>Observaciones</button>
                        <button className={`${s.panelTab} ${activeBottomTab === 'arca' ? s.panelTabActive : ''}`} onClick={() => setActiveBottomTab('arca')}>ARCA</button>
                    </div>
                    <div className={s.tabContent} style={{ paddingTop: '4px', paddingBottom: '12px', display: 'flex', flexDirection: 'column' }}>
                        {activeBottomTab === 'observaciones' && (
                            <div className={s.observationsContent}>
                                {isReadOnly ? (
                                    <div style={{ fontSize: 11, color: '#475569', flex: 1, overflowY: 'auto' }}>{observations || 'Sin observaciones'}</div>
                                ) : (
                                    <textarea 
                                        className={s.observationsTextarea} 
                                        placeholder="Notas internas o comentarios..."
                                        value={observations ?? ''}
                                        onChange={e => setObservations(e.target.value)}
                                    />
                                )}
                            </div>
                        )}
                        {activeBottomTab === 'arca' && (
                            <div className={s.arcaContent}>
                                <div className={s.arcaGrid}>
                                    <div className={s.arcaItem}>
                                        <span className={s.arcaLabel}>Estado</span>
                                        <span className={s.arcaValue}>Pendiente</span>
                                    </div>
                                    <div className={s.arcaItem}>
                                        <span className={s.arcaLabel}>CAE</span>
                                        <span className={s.arcaValue}>-</span>
                                    </div>
                                    <div className={s.arcaItem}>
                                        <span className={s.arcaLabel}>Vto CAE</span>
                                        <span className={s.arcaValue}>-</span>
                                    </div>
                                    <div className={s.arcaItem}>
                                        <span className={s.arcaLabel}>Resultado</span>
                                        <span className={s.arcaValue}>-</span>
                                    </div>
                                </div>
                                <button className={s.arcaButton} disabled>Confirmar en ARCA</button>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>



        {/* Operational Summary */}
        <div className={s.balancePanel}>
            <div className={s.summaryPanel}>
            <div className={s.summaryItem}>
                <div className={s.summaryLabel}>CLIENTE</div>
                <div className={s.summaryValue} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>{entity?.name || '-'}</div>
            </div>
            <div className={s.summaryItem}>
                <div className={s.summaryLabel}>CONDICIÓN</div>
                <div className={s.summaryValue}>{saleConditions.find(c => c.id === selectedConditionId)?.description || '-'}</div>
            </div>
            <div className={s.summaryItem}>
                <div className={s.summaryLabel}>ITEMS</div>
                <div className={s.summaryValue}>{items.length}</div>
            </div>
            <div className={s.summaryItem}>
                <div className={s.summaryLabel}>ESTADO</div>
                <div className={s.summaryValue} style={{ color: '#10b981' }}>{status}</div>
            </div>
            <div className={s.summaryItem}>
                <div className={s.summaryLabel}>VENDEDOR</div>
                <div className={s.summaryValue}>{sellers.find(sl => sl.id === salespersonId)?.name || 'Ninguno'}</div>
            </div>
            <div className={s.summaryItem}>
                <div className={s.summaryLabel}>MODIFICACIÓN</div>
                <div className={s.summaryValue}>{new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</div>
            </div>
            <div className={s.summaryItem}>
                <div className={s.summaryLabel}>CAE / COE</div>
                <div className={s.summaryValue}>Pendiente</div>
            </div>
        </div>

        {/* Footer with Totals */}
        <div className={s.footerCompact}>
            <div className={s.footerCompactItem}>
                <span className={s.footerCompactLabel}>NETO GRAVADO</span>
                <span className={s.footerCompactValue}>{fmt(totals.net)}</span>
            </div>
            <div className={s.footerCompactItem}>
                <span className={s.footerCompactLabel}>IVA DETERMINADO</span>
                <span className={s.footerCompactValue}>{fmt(totals.vat)}</span>
            </div>
            <div className={s.footerCompactItem}>
                <span className={s.footerCompactLabel} style={{ color: 'var(--primary)' }}>TOTAL FACTURA</span>
                <span className={s.footerCompactTotal}>{fmt(totals.total)}</span>
            </div>
        </div>
        </div>
        
    </div>
  );
}
