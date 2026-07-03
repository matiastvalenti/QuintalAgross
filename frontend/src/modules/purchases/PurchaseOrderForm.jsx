import React, { useState, useEffect, useMemo } from "react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import Autocomplete from "../../components/ui/Autocomplete";
import Modal from "../../components/ui/Modal";
import Drawer from "../../components/ui/Drawer";
import Badge from "../../components/ui/Badge";
import Card from "../../components/ui/Card";
import { useWindow } from "../../context/WindowContext";
import { useToast } from "../../context/ToastContext";
import { useCostCenter } from "../../context/CostCenterContext";
import { API_URL } from "../../config";
import {
  padPV,
  padNumber,
  splitFullNumber,
  joinFullNumber,
} from "../../utils/formatters";
import {
  Save,
  Trash2,
  Plus,
  Truck,
  History,
  Info,
  Layers,
  Search,
  Printer,
  Mail,
  X,
  Building,
  ClipboardList,
  Receipt,
  FileText,
  CreditCard,
  MapPin,
  Calendar,
  User,
  ShoppingBag,
  MoreVertical,
  Link2,
  Link2Off,
  ShoppingBasket,
  FileDown,
  FileBarChart,
  Box,
  Pencil,
  Check,
  CheckSquare,
  Square,
  AlertCircle,
  ArrowUpRight,
  ArrowRight,
} from "lucide-react";
import s from "./PurchaseOrderForm.module.css";
import {
  TraceabilityStatusBadge,
  TraceabilityProgress,
} from "../../components/ui/TraceabilityStatusBadge";
import LoadingScreen from "../../components/ui/LoadingScreen";

import {
  openNuevoRemitoEntrada,
  openNuevaFacturaCompra,
} from "../../utils/openStandaloneWindow";


const getPurchaseLineName = (line) => {
  return (
    line.product_name ||
    line?.product?.name ||
    line.product_description ||
    line.description ||
    line.name ||
    ""
  );
};

export default function PurchaseOrderForm(props) {
  const {
    mode: initialMode = "new",
    id: initialId = null,
    windowId,
    initialData = null,
    initialLines = null,
    isStandalone = false,
  } = props;

  useEffect(() => {
    console.time("5. Montaje PurchaseOrderForm");
    return () => console.timeEnd("5. Montaje PurchaseOrderForm");
  }, []);

  const { closeWindow, openWindow, updateWindow, minimizeWindow } = useWindow();
  const { showToast } = useToast();
  const { costCenter } = useCostCenter();

  const [mode, setMode] = useState(initialMode);
  const [id, setId] = useState(initialId || null);
  const [loading, setLoading] = useState(initialMode === "edit");
  const [secondaryTab, setSecondaryTab] = useState("billing");
  const [saving, setSaving] = useState(false);
  // --- Header Data ---
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [ctroCosto, setCtroCosto] = useState(String(costCenter || 1));
  const [supplier, setSupplier] = useState(null);
  const [pv, setPv] = useState("0001");
  const [number, setNumber] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [observations, setObservations] = useState("");
  const [customerPo, setCustomerPo] = useState("");
  const [drawerState, setDrawerState] = useState({ open: false, type: null });
  const [buyerId, setBuyerId] = useState("");
  const [selectedConditionId, setSelectedConditionId] = useState("");
  const [status, setStatus] = useState("BORRADOR");

  const [isReadOnly, setIsReadOnly] = useState(initialMode === "edit");
  const [loadingLinkManager, setLoadingLinkManager] = useState(false);

  // --- Remito Selection Modal ---
  const [showRemitoModal, setShowRemitoModal] = useState(false);
  // remitoQtys: { [lineId]: qty_to_remit }
  const [remitoQtys, setRemitoQtys] = useState({});

  // --- Lists ---
  const [warehouses, setWarehouses] = useState([]);
  const [purchaseConditions, setPurchaseConditions] = useState([]);
  const [pointsOfSale, setPointsOfSale] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [items, setItems] = useState([]);
  const [deliveryNotes, setDeliveryNotes] = useState([]);
  const [invoices, setInvoices] = useState([]);

  // --- Link Manager Modal ---
  const [linkManagerDoc, setLinkManagerDoc] = useState(null); // { type: 'REMITO'|'INVOICE', id, number, lines: [] }
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceQtys, setInvoiceQtys] = useState({});
  const [isManualLinkModalOpen, setIsManualLinkModalOpen] = useState(false);
  const [isManualInvoiceLinkOpen, setIsManualInvoiceLinkOpen] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  // ── AI Assistant: Pre-fill from initialData/initialLines ──
  useEffect(() => {
    if (mode === "new") {
      if (initialData?.entity_id) {
        const token = localStorage.getItem("token");
        fetch(`${API_URL}/entities/${initialData.entity_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.json())
          .then(setSupplier)
          .catch((e) => console.error(e));
      }

      if (initialData?.sale_condition_id) {
        setSelectedConditionId(initialData.sale_condition_id);
      }
      if (initialData?.salesperson_id) {
        setBuyerId(initialData.salesperson_id);
      }

      const linesToUse = initialData?.lines || initialLines;
      if (linesToUse && linesToUse.length > 0) {
        const mappedLines = linesToUse.map((l) => ({
          id: Math.random(),
          product_id: l.product_id || null,
          name: l.name || l.description || "",
          qty: parseFloat(l.qty || 1) / parseFloat(l._unit_content || 1), // Calculate containers from total units
          unit_price: parseFloat(l.unit_price || 0),
          cost_price: 0,
          discount_pct: 0,
          vat_rate: 0.21,
          _unit_content: parseFloat(l._unit_content || 1),
          _unit_label: "u",
        }));
        if (mappedLines.length > 0) setItems(mappedLines);
      }
    }
  }, [initialData, initialLines, mode]);

  useEffect(() => {
    if (mode === "edit" && id) fetchPurchaseOrder(id);
    else if (mode === "new") {
      fetchExchangeRate();
      fetchNextNumber(pv);
    }
  }, [mode, id, pv]);

  useEffect(() => {
    const refreshOC = () => {
      if (mode === "edit" && id) fetchPurchaseOrder(id);
    };
    window.addEventListener("delivery-note-changed", refreshOC);

    // Escuchar eventos de la red de documentos
    const handleDocumentMessage = (e) => {
      const payload = e.data;
      if (!payload || payload.type !== "QUINTAL_DOCUMENT_SAVED") return;

      // Si el documento salvado está relacionado con esta OC, refrescar
      if (
        payload.salesOrderId === id ||
        payload.documentType === "sales-order"
      ) {
        refreshOC();
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
      window.removeEventListener("delivery-note-changed", refreshOC);
      window.removeEventListener("message", handleDocumentMessage);
      if (bc) bc.close();
    };
  }, [mode, id]);

  const totals = useMemo(() => {
    return items.reduce(
      (acc, i) => {
        const sub = (i.qty || 0) * (i.unit_price || 0);
        const bonif = sub * ((i.discount_pct || 0) / 100);
        const net = sub - bonif;
        const vat = net * (i.vat_rate || 0.21);
        acc.subtotal += sub;
        acc.bonif += bonif;
        acc.net += net;
        acc.vat += vat;
        acc.total += net + vat;
        return acc;
      },
      { subtotal: 0, bonif: 0, net: 0, vat: 0, total: 0 },
    );
  }, [items]);

  const progress = useMemo(() => {
    const totalQty = items.reduce(
      (acc, i) => acc + (parseFloat(i.qty) || 0),
      0,
    );
    if (totalQty === 0) return { delivered: 0, invoiced: 0, paid: 0 };
    const delivered = items.reduce(
      (acc, i) => acc + (parseFloat(i.qty_delivered) || 0),
      0,
    );
    const invoiced = items.reduce(
      (acc, i) => acc + (parseFloat(i.qty_invoiced) || 0),
      0,
    );

    // Calcular suma de cobros de facturas vinculadas
    const paidSum = invoices.reduce((acc, inv) => {
      // Usar total_amount si está cerrada, o sumatoria de cobros si no
      if (inv.status === "CLOSED" || inv.status === "PAID")
        return acc + (inv.total_amount || 0);
      return acc + (inv.total_amount_paid || 0);
    }, 0);

    const orderTotal = totals.total;
    // Si la orden no tiene total (borrador vacío), el progreso es 0
    let paidPct = orderTotal > 0 ? (paidSum / orderTotal) * 100 : 0;

    // Heurística: Si hay facturas y todas están cerradas, forzar 100%
    if (
      invoices.length > 0 &&
      invoices.every((inv) => inv.status === "CLOSED" || inv.status === "PAID")
    ) {
      paidPct = 100;
    }

    return {
      delivered: Math.min(100, (delivered / totalQty) * 100),
      invoiced: Math.min(100, (invoiced / totalQty) * 100),
      paid: Math.min(100, paidPct),
    };
  }, [items, invoices, totals.total]);

  const invoicedAmount = useMemo(
    () => invoices.reduce((acc, inv) => acc + (inv.total_amount || 0), 0),
    [invoices],
  );
  const deliveredLts = useMemo(
    () =>
      items.reduce(
        (acc, item) => acc + (parseFloat(item.qty_delivered) || 0),
        0,
      ),
    [items],
  );
  const orderedLts = useMemo(
    () => items.reduce((acc, item) => acc + (parseFloat(item.qty) || 0), 0),
    [items],
  );

  const nextLogicalAction = useMemo(() => {
    if (progress.delivered < 100) return "REMITO";
    if (progress.invoiced < 100) return "FACTURA";
    if (progress.paid < 100) return "PAGO";
    if (buyerId) return "COMISION";
    return null;
  }, [progress, buyerId]);

  const hasProgress = useMemo(() => {
    return items.some(
      (i) =>
        (parseFloat(i.qty_delivered) || 0) > 0 ||
        (parseFloat(i.qty_invoiced) || 0) > 0,
    );
  }, [items]);

  const projectedStatus = useMemo(() => {
    if (!linkManagerDoc) return status;
    const isDN = linkManagerDoc.type === "REMITO";
    let totalDelivered = 0,
      totalInvoiced = 0,
      totalOrdered = 0;

    items.forEach((item) => {
      const lineLink = linkManagerDoc.lines.find(
        (l) => l.source_purchase_line_id === item.id,
      );
      let simD = parseFloat(item.qty_delivered || 0);
      let simI = parseFloat(item.qty_invoiced || 0);
      if (lineLink) {
        if (isDN)
          simD =
            simD -
            parseFloat(lineLink.originalQty) +
            parseFloat(lineLink.newQty);
        else
          simI =
            simI -
            parseFloat(lineLink.originalQty) +
            parseFloat(lineLink.newQty);
      }
      totalOrdered += parseFloat(item.qty || 0);
      totalDelivered += Math.max(0, simD);
      totalInvoiced += Math.max(0, simI);
    });

    if (totalDelivered <= 0 && totalInvoiced <= 0) return "CONFIRMED";
    const dPct = totalDelivered / totalOrdered,
      iPct = totalInvoiced / totalOrdered;
    const isDT = dPct >= 0.999,
      isDP = dPct > 0.001 && !isDT;
    const isIT = iPct >= 0.999,
      isIP = iPct > 0.001 && !isIT;

    if (isDT && isIT) return "COMPLETED";
    if (isDT && isIP) return "REMITIDO_TOTAL_FACTURADO_PARCIAL";
    if (isDT) return "FULLY_DELIVERED";
    if (isDP && isIT) return "REMITIDO_PARCIAL_FACTURADO_TOTAL";
    if (isDP && isIP) return "REMITIDO_PARCIAL_FACTURADO_PARCIAL";
    if (isDP) return "PARTIALLY_DELIVERED";
    if (isIT) return "INVOICED";
    if (isIP) return "PARTIALLY_INVOICED";
    return "CONFIRMED";
  }, [items, linkManagerDoc, status]);

  const fetchInitialData = async () => {
    const token = localStorage.getItem("token");
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [whRes, scRes, posRes, spRes] = await Promise.all([
        fetch(`${API_URL}/inventory/warehouses/`, { headers }),
        fetch(`${API_URL}/sales/sale-conditions/`, { headers }),
        fetch(`${API_URL}/config/pos`, { headers }),
        fetch(`${API_URL}/entities/?is_buyer=true`, { headers }),
      ]);

      if (whRes.ok) {
        const whs = await whRes.json();
        setWarehouses(whs);
        if (whs.length > 0 && mode === "new") setWarehouseId(whs[0].id);
      }
      if (scRes.ok) {
        const scs = await scRes.json();
        setPurchaseConditions(scs);
        if (scs.length > 0 && mode === "new") setSelectedConditionId(scs[0].id);
      }
      if (spRes.ok) setSellers(await spRes.json());
      if (posRes.ok) {
        const pvs = await posRes.json();
        const filteredPv = pvs.filter(
          (p) =>
            !p.document_configs ||
            p.document_configs.some((c) => c.document_type === "OC"),
        );
        setPointsOfSale(filteredPv);
        if (filteredPv.length > 0 && mode === "new") setPv(filteredPv[0].pv);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchNextNumber = async (pvVal) => {
    const token = localStorage.getItem("token");
    const res = await fetch(
      `${API_URL}/config/pos/next-number?pv=${pvVal}&doc_type=OC`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (res.ok) {
      const data = await res.json();
      setNumber(data.next_number);
    }
  };

  const fetchPurchaseOrder = async (orderId, silent = false) => {
    const targetId = orderId || id;
    if (!targetId) return;
    if (!silent) setLoading(true);
    const token = localStorage.getItem("token");
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const res = await fetch(`${API_URL}/purchases/purchase-orders/${targetId}`, {
        headers,
      });
      const data = await res.json();
      applyDataToState(data);
    } catch (e) {
      showToast("Error al cargar orden", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchExchangeRate = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/accounting/fx/usd`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setExchangeRate(data.rate);
    }
  };

  const applyDataToState = (data) => {
    const { pv: loadedPv, num: loadedNum } = splitFullNumber(data.number);
    setPv(loadedPv);
    setNumber(loadedNum);
    setDate(data.date?.split("T")[0]);
    if (data.due_date) setDueDate(data.due_date?.split("T")[0]);
    setWarehouseId(data.warehouse_id || "");
    setCurrency(data.currency);
    setExchangeRate(data.exchange_rate);
    setObservations(data.notes || "");
    setStatus(data.status);
    setBuyerId(data.salesperson_id || "");
    setCtroCosto(String(data.cost_center || 1));
    setSelectedConditionId(data.sale_condition_id || "");

    const hasP = (data.lines || []).some(
      (l) =>
        (parseFloat(l.qty_delivered) || 0) > 0 ||
        (parseFloat(l.qty_invoiced) || 0) > 0,
    );
    if (hasP) {
      setIsReadOnly(true);
    }

    if (data.entity_id) {
      const token = localStorage.getItem("token");
      fetch(`${API_URL}/entities/${data.entity_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then(setSupplier);
    }

    if (data.lines) {
      setItems(
        data.lines.map((l) => {
          const lineName = getPurchaseLineName(l);
          return {
            ...l,
            id: l.id || Math.random(),
            product_id: l.product_id || l.product?.id || null,
            name: lineName,
            description: lineName,
            product_name: lineName,
            _unit_content: l.product?.quantity_per_container || 1,
            _unit_label: l.product?.container?.unit?.short_name || "",
          };
        }),
      );
    }
    if (data.delivery_notes) {
      setDeliveryNotes(data.delivery_notes);
    }
    if (data.invoices) {
      setInvoices(data.invoices);
    }
  };

  const handleSave = async () => {
    if (!supplier) return showToast("Seleccione un proveedor", "warning");
    if (items.length === 0) return showToast("Agregue productos", "warning");

    setSaving(true);
    const payload = {
      entity_id: supplier.id,
      number: joinFullNumber(pv, number),
      date,
      due_date: dueDate,
      warehouse_id: warehouseId,
      currency,
      exchange_rate: Number(exchangeRate),
      salesperson_id: buyerId || null,
      sale_condition_id: selectedConditionId || null,
      notes: observations,
      cost_center: parseInt(ctroCosto),
      lines: items.map((item, idx) => {
        const { _unit_content, _unit_label, id: _localId, ...rest } = item;
        const linePayload = {
          ...rest,
          line_order: idx,
          unit_cost: item.cost_price || item.unit_cost || 0,
        };
        // Preserve DB IDs, discard frontend-generated random numbers
        if (_localId && !String(_localId).startsWith("0.")) {
          linePayload.id = String(_localId);
        }
        return linePayload;
      }),
    };

    try {
      const token = localStorage.getItem("token");
      const url =
        mode === "new"
          ? `${API_URL}/purchases/purchase-orders/`
          : `${API_URL}/purchases/purchase-orders/${id}`;
      const method = mode === "new" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        const savedId = data.id || id;
        showToast("Orden de Compra guardada", "success");
        window.dispatchEvent(new CustomEvent("purchase-order-changed"));
        if (window.opener)
          window.opener.dispatchEvent(
            new CustomEvent("purchase-order-changed"),
          );
        setMode("edit");
        setId(savedId);
        setIsReadOnly(true); // Switch to read-only after save
        fetchPurchaseOrder(savedId, true);
      } else {
        const err = await res.json();
        showToast(err.detail || "Error al guardar", "error");
      }
    } catch (e) {
      showToast("Error de conexión", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenLinkManager = async (docId, type, docNumber) => {
    setLoadingLinkManager(true);
    try {
      const token = localStorage.getItem("token");
      const url =
        type === "REMITO"
          ? `${API_URL}/purchases/purchase-delivery-notes/${docId}`
          : `${API_URL}/accounting/documents/${docId}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error loading doc");

      const data = await res.json();
      // Filter lines that belong to THIS Sales Order
      const linkedLines = (data.lines || []).filter((l) => {
        const matches =
          l.source_purchase_line_id &&
          items.some((item) => item.id === l.source_purchase_line_id);
        return matches;
      });

      if (linkedLines.length === 0) {
        showToast(
          "No se encontraron vínculos directos con este pedido en este documento",
          "info",
        );
      }

      setLinkManagerDoc({
        type,
        id: data.id,
        number: data.number || docNumber,
        lines: linkedLines.map((l) => {
          const ovLine = items.find(
            (item) => item.id === l.source_purchase_line_id,
          );
          return {
            ...l,
            name: l.name || l.description || l.product?.name || "Producto",
            originalQty: l.qty,
            newQty: l.qty,
            // Attach OC context
            ovQty: ovLine ? parseFloat(ovLine.qty || 0) : 0,
            ovDelivered: ovLine ? parseFloat(ovLine.qty_delivered || 0) : 0,
            unitLabel: ovLine ? ovLine._unit_label : "",
            unitFactor: ovLine ? parseFloat(ovLine._unit_content || 1) : 1,
          };
        }),
      });
    } catch (e) {
      console.error("[PurchaseOrderForm] Error opening link manager:", e);
      showToast("Error al abrir gestor de vínculos", "error");
    } finally {
      setLoadingLinkManager(false);
    }
  };

  const handleUpdateLinkQty = async () => {
    if (!linkManagerDoc) return;

    // Check if anything changed
    const changes = linkManagerDoc.lines.filter(
      (l) => l.newQty !== l.originalQty,
    );
    if (changes.length === 0) {
      setLinkManagerDoc(null);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      // For each change, we could call an update-link endpoint
      // To simplify for the user requirement: "If I modify to 0 should unlink it"
      // and "If I modify from 10 to 5, only keep 5 linked"

      // We'll process them sequentially for now (ideally a bulk endpoint)
      for (const change of changes) {
        const endpoint =
          linkManagerDoc.type === "REMITO"
            ? `${API_URL}/purchases/purchase-delivery-notes/adjust-link`
            : `${API_URL}/accounting/documents/adjust-link`;

        await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            line_id: change.id,
            new_qty: change.newQty,
            source_purchase_line_id: change.source_purchase_line_id,
          }),
        });
      }

      showToast("Vínculos actualizados correctamente", "success");
      setLinkManagerDoc(null);
      fetchPurchaseOrder(); // Refresh to see updated qty_delivered
    } catch (e) {
      showToast("Error al actualizar vínculos", "error");
    }
  };

  const handleUnlinkAll = async () => {
    if (!id) return;
    if (
      !window.confirm(
        "¿Está seguro de que desea desvincular TODOS los documentos de esta orden? Esto restaurará el estado pendiente de los ítems.",
      )
    )
      return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_URL}/purchases/purchase-delivery-notes/unlink-all/ov/${id}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.ok) {
        showToast("Se han desvinculado todos los remitos", "success");
        fetchPurchaseOrder();
      }
    } catch (e) {
      showToast("Error al desvincular", "error");
    }
  };

  // Open remito selection modal — show all order lines with pending qty
  const handleOpenRemitoModal = () => {
    if (!id) return showToast("Guarde la orden antes de remitir", "warning");
    // Build initial qty map: qty_pending for each line
    const initial = {};
    items.forEach((item) => {
      const realId = item.id;
      const qtyDelivered = parseFloat(item.qty_delivered || 0);
      const qtyOrdered = parseFloat(item.qty || 0);
      const factor = parseFloat(
        item.product?.quantity_per_container ||
          item.quantity_per_container ||
          item._unit_content ||
          1,
      );
      const pendingBase = Math.max(0, qtyOrdered - qtyDelivered);
      if (pendingBase > 0) {
        initial[realId] = Number((pendingBase / factor).toFixed(2));
      }
    });
    setRemitoQtys(initial);
    setShowRemitoModal(true);
  };

  // Confirm and open the DeliveryNote with the selected lines
  const handleConfirmRemito = () => {
    const selectedLines = items
      .filter((item) => {
        const qty = parseFloat(remitoQtys[item.id] || 0);
        return qty > 0;
      })
      .map((item) => {
        const qtyPackages = parseFloat(remitoQtys[item.id] || 0);
        const factor = parseFloat(
          item.product?.quantity_per_container ||
            item.quantity_per_container ||
            item._unit_content ||
            1,
        );
        const qtyUnits = Number((qtyPackages * factor).toFixed(2));
        return {
          ...item,
          qty_packages: qtyPackages, // envases seleccionados
          qty_to_remit: qtyUnits, // unidades totales (lo que espera DeliveryNoteForm como qty)
        };
      });

    if (selectedLines.length === 0) {
      return showToast("Seleccioná al menos un ítem para remitir", "warning");
    }

    // Guardar líneas en localStorage para que la ventana standalone las lea
    const draftKey = `remito_draft_ov_${id}`;
    localStorage.setItem(draftKey, JSON.stringify(selectedLines));

    setShowRemitoModal(false);

    // Abrir ventana standalone del remito con ov_id + draft_key
    openNuevoRemitoEntrada(id, { draft_key: draftKey });

    // Intentar cerrar esta ventana (puede fallar por restricciones del navegador)
    try {
      window.close();
    } catch (e) {
      /* ignorar */
    }
  };

  const handleOpenInvoiceModal = () => {
    if (!id) return showToast("Guarde la orden antes de facturar", "warning");

    // Si la orden ya está totalmente facturada (o el usuario quiere vincular algo ya existente)
    // abrimos directamente el selector de vínculos manuales para Facturas/Pagos.
    const totalPending = items.reduce(
      (acc, item) =>
        acc + (parseFloat(item.qty || 0) - parseFloat(item.qty_invoiced || 0)),
      0,
    );

    if (totalPending <= 0 && invoices.length > 0) {
      setIsManualInvoiceLinkOpen(true);
      return;
    }

    const initial = {};
    items.forEach((item) => {
      const factor = parseFloat(item._unit_content || 1);
      const pendingUnits =
        parseFloat(item.qty || 0) - parseFloat(item.qty_invoiced || 0);
      const pendingPkgs = factor > 1 ? pendingUnits / factor : pendingUnits;
      if (pendingPkgs > 0) initial[item.id] = pendingPkgs;
    });

    if (Object.keys(initial).length === 0) {
      setIsManualInvoiceLinkOpen(true);
    } else {
      setInvoiceQtys(initial);
      setShowInvoiceModal(true);
    }
  };

  const handleConfirmInvoice = () => {
    const selectedLines = items
      .filter((item) => parseFloat(invoiceQtys[item.id] || 0) > 0)
      .map((item) => {
        const qtyPkgs = parseFloat(invoiceQtys[item.id] || 0);
        const factor = parseFloat(
          item._unit_content || item.quantity_per_container || 1,
        );
        const qtyUnits = factor > 1 ? qtyPkgs * factor : qtyPkgs;
        const lineName =
          item.product_name ||
          item.product?.name ||
          item.description ||
          item.name ||
          item.concept ||
          item.item_name ||
          "";

        return {
          ...item,
          product_id: item.product_id || item.product?.id,
          product_name: lineName,
          description: lineName,
          concept: lineName,
          name: lineName,
          qty: qtyUnits,
          quantity: qtyUnits,
          qty_packages: qtyPkgs,
          qty_to_invoice: qtyUnits,
          unit: item.unit || item._unit_label || "LT",
          unit_price: item.unit_price || item.price || 0,
          price: item.unit_price || item.price || 0,
          tax_rate: item.tax_rate ?? item.vat_rate ?? 21,
          purchase_order_id: id,
          source_purchase_line_id: item.id,
          accounting_account_id:
            item.product?.sales_account_id ||
            item.sales_account_id ||
            item.accounting_account_id ||
            null,
        };
      });

    if (selectedLines.length === 0) {
      showToast("Seleccioná al menos un ítem para facturar", "warning");
      return;
    }

    setShowInvoiceModal(false);

    const draftId = `ov_${id}_${Date.now()}`;
    const draftData = {
      sourceType: "sales-order",
      salesOrderId: id,
      salesOrderNumber: number,
      customerName: supplier?.name,
      currency: currency,
      exchangeRate: exchangeRate,
      pointOfSale: pv,
      paymentCondition: selectedConditionId,
      sellerId: buyerId,
      costCenter: ctroCosto,
      lines: selectedLines,
    };
    localStorage.setItem(`invoice_draft_${draftId}`, JSON.stringify(draftData));

    openNuevaFacturaCompra({ draft_id: draftId });
  };

  const handleAddItem = (p) => {
    if (!p) return;
    const factor = p.quantity_per_container || 1;
    const newItem = {
      id: Math.random(),
      product_id: p.id,
      name: p.name,
      description: p.name,
      brand: p.brand?.name || p.brand_name || "",
      qty: factor,
      qty_packages: factor > 1 ? 1 : null,
      cost_price: p.cost_price || 0,
      unit_price: p.cost_price || p.base_price || 0,
      discount_pct: 0,
      vat_rate: p.tax_type?.rate ?? 0.21,
      _unit_content: factor,
      _unit_label: p.container?.unit?.short_name || "",
    };
    setItems([...items, newItem]);
  };

  const clearZeroOnFocus = (e) => {
    const value = String(e.target.value ?? "").trim();
    if (value === "0" || value === "0.00" || value === "0,00") {
      e.target.value = "";
    }
  };

  const restoreZeroOnBlur = (e, itemId, field) => {
    const value = String(e.target.value ?? "").trim();
    if (value === "") {
      handleUpdateItem(itemId, field, 0);
    }
  };
  const handleUpdateItem = (itemId, field, value) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== itemId) return i;
        const newItem = { ...i, [field]: value };

        // Handle numeric conversion for core fields
        if (field === "qty_packages") {
          newItem.qty_packages = Number(value);
          newItem.qty = Number(value) * (i._unit_content || 1);
        }
        if (field === "qty") {
          newItem.qty = Number(value);
          const factor = i._unit_content || 1;
          if (factor > 1) {
            newItem.qty_packages = Number(value) / factor;
          }
        }
        if (field === "unit_price") newItem.unit_price = Number(value);
        if (field === "cost_price") {
          const val = Number(value);
          newItem.cost_price = val;
          newItem.unit_cost = val; // Sync both fields
        }
        if (field === "discount_pct") newItem.discount_pct = Number(value);

        return newItem;
      }),
    );
  };

  const searchEntities = async (q) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/entities/?type=supplier&q=${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  };

  const searchProducts = async (q) => {
    const token = localStorage.getItem("token");
    const res = await fetch(
      `${API_URL}/inventory/products/?q=${q}&active=true`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return res.json();
  };

  const fmtValue = (val) => {
    return Number(val || 0).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const fmt = (val) => {
    return `${fmtValue(val)} ${currency}`;
  };

  if (loading) return <LoadingScreen message="Cargando Orden de Compra..." />;

  // Pending items aggregate
  const pendingCount = items.filter(
    (i) => parseFloat(i.qty || 0) - parseFloat(i.qty_delivered || 0) > 0,
  ).length;
  const pendingInvoicedCount = items.filter(
    (i) => parseFloat(i.qty || 0) - parseFloat(i.qty_invoiced || 0) > 0,
  ).length;

  return (
    <>
      {loadingLinkManager && (
        <LoadingScreen message="Cargando Gestor de Vínculos..." />
      )}
      <div
        className={`${s.formCard} ${isStandalone ? s.formCardStandalone : ""}`}
      >
        {/* Header Section */}
        <div
          className={s.headerLine}
          style={{
            paddingBottom: 12,
            borderBottom: "1px solid var(--border-color)",
            marginBottom: 12,
          }}
        >
          <div className={s.compactHeaderTitle}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h1
                style={{
                  fontSize: "15px",
                  margin: 0,
                  fontWeight: 900,
                  color: "var(--text)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {mode === "new" ? "Nueva Orden de Compra" : `Orden de Compra`}
                {isReadOnly && (
                  <span className={s.readOnlyBadge}>MODO VISTA</span>
                )}
              </h1>
              <div className={s.headerMeta}>
                <span>
                  {mode === "new"
                    ? "Nueva Orden"
                    : `OC ${joinFullNumber(pv, number)}`}
                </span>
                <span>&middot;</span>
                <span>
                  {date
                    ? date.includes("T")
                      ? new Date(date).toLocaleDateString("es-AR")
                      : date.split("-").reverse().join("/")
                    : "S/F"}
                </span>
                <span>&middot;</span>
                <span>{currency}</span>
                <span>&middot;</span>
                <span>
                  TC{" "}
                  {Number(exchangeRate || 1).toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <TraceabilityStatusBadge status={status} />
              </div>
            </div>
          </div>
          <div className={s.headerActions}>
            {isReadOnly ? (
              <button
                className={s.saveBtn}
                style={{ background: "#64748b", cursor: "pointer" }}
                onClick={() => {
                  if (hasProgress) {
                    showToast(
                      "Atención: esta orden tiene remitos o facturas vinculadas. Edite con cuidado.",
                      "warning",
                    );
                  }
                  setIsReadOnly(false);
                }}
                title="Activar modo edición"
              >
                <Pencil size={16} />
                {hasProgress ? "Bloqueado" : "Editar"}
              </button>
            ) : (
              <button
                className={s.saveBtn}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <div className={s.spinnerSmall} />
                ) : (
                  <Save size={16} />
                )}
                {saving ? "Guardando..." : "Guardar"}
              </button>
            )}
            <div className={s.actionGroup}>
              <button
                className={s.actionBtn}
                disabled={!id || pendingCount === 0}
                onClick={handleOpenRemitoModal}
                title={
                  !id
                    ? "Guarde la orden para remitir"
                    : pendingCount === 0
                      ? "No hay ítems pendientes de remitir"
                      : `Remitir Pedido — ${pendingCount} ítem(s) pendiente(s)`
                }
                style={
                  pendingCount > 0 && id
                    ? {
                        background: "#eff6ff",
                        color: "#1d4ed8",
                        border: "1.5px solid #bfdbfe",
                      }
                    : {}
                }
              >
                <Truck size={18} />
              </button>
              <button
                className={s.actionBtn}
                disabled={!id}
                onClick={handleOpenInvoiceModal}
                title={
                  !id
                    ? "Guarde la orden para facturar"
                    : pendingInvoicedCount === 0
                      ? "No hay ítems pendientes de facturar"
                      : `Facturar Pedido — ${pendingInvoicedCount} ítem(s) pendiente(s)`
                }
                style={
                  pendingInvoicedCount > 0 && id
                    ? {
                        background: "#f5f3ff",
                        color: "#7c3aed",
                        border: "1.5px solid #ddd6fe",
                      }
                    : {}
                }
              >
                <Receipt size={18} />
              </button>
              <button
                className={s.actionBtn}
                disabled={!id}
                onClick={() =>
                  window.open(
                    `${API_URL}/purchases/purchase-orders/${id}/pdf`,
                    "_blank",
                  )
                }
                title={
                  !id ? "Guarde para imprimir" : "Imprimir Orden de Compra"
                }
              >
                <Printer size={18} />
              </button>
              <button
                className={s.actionBtn}
                disabled={!id}
                onClick={() =>
                  showToast(
                    "Funcionalidad de envío por correo en desarrollo",
                    "info",
                  )
                }
                title="Enviar por Email"
              >
                <Mail size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Body: 2 Column Layout */}
        <div className={s.bodyTwoColumns}>
          {/* Columna Izquierda: Ítems y Productos */}
          <div className={s.leftCol}>
            {!isReadOnly && (
              <div className={s.searchRibbon}>
                <Autocomplete
                  onSearch={searchProducts}
                  onSelect={(p) => {
                    handleAddItem(p);
                  }}
                  renderItem={(item) => (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        width: "100%",
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: 12,
                            color: "#1e293b",
                          }}
                        >
                          {item.name}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#64748b",
                          }}
                        >
                          {item.sku || "N/A"} ·{" "}
                          {item.brand || item.subcategory?.name}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 900,
                            color:
                              item.total_available > 0.1
                                ? "#059669"
                                : "#dc2626",
                            background:
                              item.total_available > 0.1
                                ? "#ecfdf5"
                                : "#fef2f2",
                            padding: "2px 8px",
                            borderRadius: 6,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.total_available} Disp.
                        </div>
                        {item.total_reserved > 0 && (
                          <div
                            style={{
                              fontSize: 8,
                              fontWeight: 700,
                              color: "#94a3b8",
                              marginTop: 2,
                            }}
                          >
                            {item.total_reserved} Reserv.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  placeholder="Escriba para buscar productos para añadir..."
                  variant="glass"
                  icon={
                    <Search size={16} style={{ color: "var(--primary)" }} />
                  }
                  minChars={0}
                  clearOnSelect={true}
                />
              </div>
            )}

            <div
              className={s.bentoContainer}
              style={{ padding: 0, overflow: "hidden", flex: 1, minHeight: 0 }}
            >
              {items.length > 0 ? (
                <>
                  {isReadOnly ? null : (
                    <div className={s.tableHeader}>
                      <div className={s.th}>PRODUCTO</div>
                      <div className={s.th}>ENVASES</div>
                      <div className={s.th}>UNIDADES</div>

                      <div className={s.th}>PRECIO U.</div>
                      <div className={s.th}>DTO%</div>
                      <div className={s.th}>IVA%</div>

                      <div className={s.th} style={{ textAlign: "right" }}>
                        SUBTOTAL
                      </div>
                      <div></div>
                    </div>
                  )}
                  <div className={s.itemsList}>
                    {items.map((item) => {
                      if (isReadOnly) {
                        const qtyDelivered =
                          parseFloat(item.qty_delivered) || 0;
                        const qtyOrdered = parseFloat(item.qty) || 0;
                        const qtyPackages = item.qty_packages;
                        const hasPackages =
                          qtyPackages !== undefined && qtyPackages !== null;

                        const totalQty = qtyOrdered;
                        const subtotalNeto =
                          totalQty *
                          (item.unit_price || 0) *
                          (1 - (item.discount_pct || 0) / 100);
                        const vatAmount =
                          subtotalNeto * (item.vat_rate || 0.21);
                        const totalAmount = subtotalNeto + vatAmount;
                        const utilidad =
                          item.cost_price > 0 && item.unit_price > 0
                            ? (item.unit_price *
                                (1 - (item.discount_pct || 0) / 100) -
                                item.cost_price) *
                              totalQty
                            : 0;

                        return (
                          <div
                            key={item.id}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              padding: "12px 16px",
                              borderBottom: "1px solid var(--border-color)",
                              gap: 8,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 900,
                                    color: "#1e293b",
                                  }}
                                >
                                  Producto: {getPurchaseLineName(item)}
                                </div>
                              </div>
                              {qtyDelivered > 0 && (
                                <div
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 800,
                                    color:
                                      qtyDelivered >= qtyOrdered
                                        ? "#059669"
                                        : "#d97706",
                                    background:
                                      qtyDelivered >= qtyOrdered
                                        ? "#d1fae5"
                                        : "#fef3c7",
                                    padding: "4px 8px",
                                    borderRadius: 4,
                                  }}
                                >
                                  Remitido: {qtyDelivered} / {qtyOrdered} · Pte:{" "}
                                  {(qtyOrdered - qtyDelivered).toFixed(2)}
                                </div>
                              )}
                            </div>

                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "16px 24px",
                                fontSize: 12,
                                color: "#475569",
                                alignItems: "center",
                              }}
                            >
                              {hasPackages ? (
                                <>
                                  <div>
                                    <span style={{ fontWeight: 800 }}>
                                      Cantidad:
                                    </span>{" "}
                                    {qtyPackages} envases
                                  </div>
                                  <div>
                                    <span style={{ fontWeight: 800 }}>
                                      Equivalencia:
                                    </span>{" "}
                                    {totalQty.toFixed(2)}{" "}
                                    {item._unit_label || "u"}
                                  </div>
                                </>
                              ) : (
                                <div>
                                  <span style={{ fontWeight: 800 }}>
                                    Cantidad:
                                  </span>{" "}
                                  {totalQty.toFixed(2)}{" "}
                                  {item._unit_label || "u"}
                                </div>
                              )}


                              <div>
                                <span style={{ fontWeight: 800 }}>Precio:</span>{" "}
                                {fmtValue(item.unit_price)} /{" "}
                                {item._unit_label || "u"}
                              </div>


                              <div>
                                <span style={{ fontWeight: 800 }}>
                                  Subtotal:
                                </span>{" "}
                                {fmtValue(subtotalNeto)}
                              </div>
                              <div>
                                <span style={{ fontWeight: 800 }}>IVA:</span>{" "}
                                {fmtValue(vatAmount)}
                              </div>
                              <div
                                style={{
                                  color: "var(--primary)",
                                  fontWeight: 900,
                                }}
                              >
                                <span
                                  style={{ fontWeight: 800, color: "#1e293b" }}
                                >
                                  Total:
                                </span>{" "}
                                {fmtValue(totalAmount)}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      const qtyDelivered = parseFloat(item.qty_delivered) || 0;
                      const qtyOrdered = parseFloat(item.qty) || 0;
                      const isPending = qtyOrdered - qtyDelivered > 0;
                      return (
                        <div
                          key={item.id}
                          className={s.tableRow}
                          style={
                            isPending && isReadOnly
                              ? { borderLeft: "3px solid #f59e0b" }
                              : {}
                          }
                        >
                          <div style={{ padding: "4px 0", overflow: "hidden" }}>
                            <input
                              type="text"
                              className={s.tableInput}
                              value={item.description ?? getPurchaseLineName(item)}
                              onChange={(e) =>
                                handleUpdateItem(
                                  item.id,
                                  "description",
                                  e.target.value,
                                )
                              }
                              placeholder="Ingrese concepto..."
                              style={{
                                fontWeight: 900,
                                width: "100%",
                                textAlign: "left",
                                background: "transparent",
                              }}
                            />
                            <div
                              style={{
                                fontSize: 9,
                                fontWeight: 700,
                                color: "#64748b",
                              }}
                            >
                              {item.brand || item.product?.brand?.name}
                            </div>
                          </div>
                          <input
                            type="number"
                            className={s.tableInput}
                            value={
                              item.qty_packages !== undefined
                                ? item.qty_packages
                                : item.qty || 0
                            }
                            onChange={(e) =>
                              handleUpdateItem(
                                item.id,
                                "qty_packages",
                                e.target.value,
                              )
                            }
                            onFocus={clearZeroOnFocus}
                            onBlur={(e) =>
                              restoreZeroOnBlur(e, item.id, "qty_packages")
                            }
                            readOnly={hasProgress || isReadOnly}
                            style={{
                              background:
                                hasProgress || isReadOnly ? "#f8fafc" : "#fff",
                            }}
                          />
                          <div
                            style={{
                              display: "flex",
                              gap: 4,
                              alignItems: "center",
                            }}
                          >
                            <input
                              type="number"
                              className={s.tableInput}
                              value={item.qty || 0}
                              onChange={(e) =>
                                handleUpdateItem(item.id, "qty", e.target.value)
                              }
                              onFocus={clearZeroOnFocus}
                              onBlur={(e) =>
                                restoreZeroOnBlur(e, item.id, "qty")
                              }
                            />
                            <span style={{ fontSize: 9, fontWeight: 800 }}>
                              {item._unit_label}
                            </span>
                          </div>

                          <input
                            type="number"
                            className={s.tableInput}
                            value={item.unit_price || 0}
                            onChange={(e) =>
                              handleUpdateItem(
                                item.id,
                                "unit_price",
                                e.target.value,
                              )
                            }
                            onFocus={clearZeroOnFocus}
                            onBlur={(e) =>
                              restoreZeroOnBlur(e, item.id, "unit_price")
                            }
                            readOnly={hasProgress || isReadOnly}
                            style={{
                              background:
                                hasProgress || isReadOnly ? "#f8fafc" : "#fff",
                            }}
                          />
                          <input
                            type="number"
                            className={s.tableInput}
                            value={item.discount_pct || 0}
                            onChange={(e) =>
                              handleUpdateItem(
                                item.id,
                                "discount_pct",
                                e.target.value,
                              )
                            }
                            onFocus={clearZeroOnFocus}
                            onBlur={(e) =>
                              restoreZeroOnBlur(e, item.id, "discount_pct")
                            }
                            readOnly={hasProgress || isReadOnly}
                            style={{
                              background:
                                hasProgress || isReadOnly ? "#f8fafc" : "#fff",
                            }}
                          />
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              textAlign: "center",
                            }}
                          >
                            {((item.vat_rate || 0.21) * 100).toFixed(0)}%
                          </div>

                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 900,
                              color: "var(--primary)",
                              textAlign: "right",
                            }}
                          >
                            {fmtValue(
                              (item.qty || 0) *
                                item.unit_price *
                                (1 - (item.discount_pct || 0) / 100) *
                                (1 + (item.vat_rate || 0.21)),
                            )}
                          </div>
                          <button
                            style={{
                              border: "none",
                              background: "none",
                              color: "#ef4444",
                              cursor: "pointer",
                            }}
                            onClick={() =>
                              setItems(items.filter((i) => i.id !== item.id))
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "16px 0",
                    minHeight: 80,
                  }}
                >
                  <Search
                    size={24}
                    style={{
                      marginBottom: 8,
                      opacity: 0.3,
                      color: "var(--text-secondary)",
                    }}
                  />
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: "var(--text)",
                      marginBottom: 2,
                    }}
                  >
                    Sin ítems cargados
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                    }}
                  >
                    Buscá un producto para agregarlo a la orden
                  </div>
                </div>
              )}
            </div>

            {/* OBSERVACIONES (Debajo de productos, misma columna) */}
            <div
              className={s.sideBlock}
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "12px 16px",
                gap: 6,
                height: 80,
                flexShrink: 0,
              }}
            >
              <div
                className={s.sideBlockTitle}
                style={{ margin: 0, padding: 0 }}
              >
                <FileText size={12} /> OBSERVACIONES
              </div>
              {isReadOnly ? (
                <div
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    fontSize: 11,
                    color: "#475569",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.4,
                    padding: "2px 4px",
                  }}
                >
                  {observations || "Sin observaciones"}
                </div>
              ) : (
                <textarea
                  className={s.sideInput}
                  style={{
                    flex: 1,
                    resize: "none",
                    width: "100%",
                    padding: "6px 8px",
                    textAlign: "left",
                    lineHeight: 1.4,
                    background: "#fff",
                    border: "1px solid #cbd5e1",
                  }}
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Añadir observaciones..."
                />
              )}
            </div>
          </div>

          {/* Columna Derecha: Panel Lateral Administrativo */}
          <div className={s.rightCol}>
            {/* Bloque Proveedor */}
            <div className={s.sideBlock}>
              <div className={s.sideBlockTitle}>
                <User size={12} /> PROVEEDOR
              </div>
              <div className={s.sideField}>
                <label>NOMBRE</label>
                {isReadOnly ? (
                  <div className={s.sideInput}>{supplier?.name || "-"}</div>
                ) : (
                  <div style={{ width: "100%", flex: 1 }}>
                    <Autocomplete
                      onSearch={searchEntities}
                      onSelect={setSupplier}
                      initialValue={supplier}
                      placeholder="Buscar..."
                      minChars={0}
                      variant="side"
                    />
                  </div>
                )}
              </div>

              <div className={s.sideField}>
                <label>NÚMERO</label>
                {isReadOnly ? (
                  <div className={s.sideInput}>{number}</div>
                ) : (
                  <input
                    className={s.sideInput}
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    onBlur={() => setNumber(padNumber(number))}
                  />
                )}
              </div>
              <div className={s.sideField}>
                <label>FECHA</label>
                {isReadOnly ? (
                  <div className={s.sideInput}>
                    {date
                      ? date.includes("T")
                        ? new Date(date).toLocaleDateString("es-AR")
                        : date.split("-").reverse().join("/")
                      : "-"}
                  </div>
                ) : (
                  <input
                    type="date"
                    className={s.sideInput}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                )}
              </div>
            </div>

            {/* Bloque Comercial */}
            <div className={s.sideBlock}>
              <div className={s.sideBlockTitle}>
                <ShoppingBag size={12} /> COMERCIAL
              </div>

              <div className={s.sideField}>
                <label>DEPÓSITO</label>
                {isReadOnly ? (
                  <div className={s.sideInput}>
                    {warehouses.find((w) => w.id === warehouseId)?.name ||
                      warehouseId}
                  </div>
                ) : (
                  <select
                    className={s.sideSelect}
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                  >
                    <option value="">Seleccionar...</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className={s.sideField}>
                <label>C. COSTO</label>
                {isReadOnly ? (
                  <div className={s.sideInput}>
                    {ctroCosto === "1" ? "CC1" : "CC2"}
                  </div>
                ) : (
                  <select
                    className={s.sideSelect}
                    value={ctroCosto}
                    onChange={(e) => setCtroCosto(e.target.value)}
                  >
                    <option value="1">CC1</option>
                    <option value="2">CC2</option>
                  </select>
                )}
              </div>
              <div className={s.sideField}>
                <label>CONDICIÓN DE COMPRA</label>
                {isReadOnly ? (
                  <div className={s.sideInput}>
                    {purchaseConditions.find(
                      (c) => c.id === selectedConditionId,
                    )?.description || "-"}
                  </div>
                ) : (
                  <select
                    className={s.sideSelect}
                    value={selectedConditionId}
                    onChange={(e) => setSelectedConditionId(e.target.value)}
                  >
                    {purchaseConditions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.description}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className={s.sideField}>
                <label>MONEDA</label>
                {isReadOnly ? (
                  <div className={s.sideInput}>
                    {currency}
                  </div>
                ) : (
                  <select
                    className={s.sideSelect}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="USD">USD</option>
                    <option value="ARS">ARS</option>
                  </select>
                )}
              </div>
              <div className={s.sideField}>
                <label>T. CAMBIO</label>
                {isReadOnly ? (
                  <div className={s.sideInput}>
                    {Number(exchangeRate || 1).toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                ) : (
                  <input
                    type="number"
                    className={s.sideInput}
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Secondary Bottom Tray - Relaciones y Estado */}
        <div className={s.relationsBar}>
          {/* OC */}
          <div
            className={s.relationCard}
            onClick={() => setDrawerState({ open: true, type: "OC" })}
          >
            <div className={s.nodeTitle} style={{ color: "#2563eb" }}>
              ORDEN DE COMPRA
            </div>
            <div className={s.nodeBadge}>● Documento Actual</div>
            <div
              className={s.nodeMetric}
              style={{ color: "#0f172a", marginTop: "auto" }}
            >
              {pv}-{number}
            </div>
            <div className={s.nodeMetric}>
              {new Date(date + "T00:00:00").toLocaleDateString()}
            </div>
          </div>

          <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

          {/* REMITO */}
          <div
            className={s.relationCard}
            onClick={() => setDrawerState({ open: true, type: "REMITO" })}
          >
            <div
              className={s.nodeTitle}
              style={{ color: progress.delivered > 0 ? "#0ea5e9" : "#0b132b" }}
            >
              REMITO
            </div>
            <div
              className={s.nodeStatus}
              style={{
                color:
                  progress.delivered >= 100
                    ? "#10b981"
                    : progress.delivered > 0
                      ? "#f97316"
                      : "#eab308",
              }}
            >
              {progress.delivered >= 100
                ? "Completado"
                : progress.delivered > 0
                  ? "Parcial"
                  : "Pendiente"}
            </div>
            <div className={s.nodeMetric} style={{ color: "#0f172a" }}>
              {deliveryNotes.length} remitos &middot;{" "}
              {Math.round(progress.delivered)}%
            </div>
            {nextLogicalAction === "REMITO" && (
              <button
                className={s.relationAction}
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenRemitoModal();
                }}
              >
                Generar
              </button>
            )}
          </div>

          <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

          {/* FACTURA */}
          <div
            className={s.relationCard}
            onClick={() => setDrawerState({ open: true, type: "FACTURA" })}
          >
            <div
              className={s.nodeTitle}
              style={{ color: progress.invoiced > 0 ? "#f97316" : "#0b132b" }}
            >
              FACTURA
            </div>
            <div
              className={s.nodeStatus}
              style={{
                color:
                  progress.invoiced >= 100
                    ? "#10b981"
                    : progress.invoiced > 0
                      ? "#f97316"
                      : "#eab308",
              }}
            >
              {progress.invoiced >= 100
                ? "Completado"
                : progress.invoiced > 0
                  ? "Parcial"
                  : "Pendiente"}
            </div>
            <div className={s.nodeMetric} style={{ color: "#0f172a" }}>
              {invoices.length} facturas &middot;{" "}
              {Math.round(progress.invoiced)}%
            </div>
            {nextLogicalAction === "FACTURA" && (
              <button
                className={s.relationAction}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowInvoiceModal(true);
                }}
              >
                Generar
              </button>
            )}
          </div>

          <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

          {/* PAGO */}
          <div
            className={s.relationCard}
            onClick={() => setDrawerState({ open: true, type: "PAGO" })}
          >
            <div
              className={s.nodeTitle}
              style={{ color: progress.paid > 0 ? "#10b981" : "#0b132b" }}
            >
              PAGO
            </div>
            <div
              className={s.nodeStatus}
              style={{
                color:
                  progress.paid >= 100
                    ? "#10b981"
                    : progress.paid > 0
                      ? "#f97316"
                      : "#eab308",
              }}
            >
              {progress.paid >= 100
                ? "Completado"
                : progress.paid > 0
                  ? "Parcial"
                  : "Pendiente"}
            </div>
            <div className={s.nodeMetric} style={{ color: "#0f172a" }}>
              {
                invoices.filter(
                  (i) => i.status === "PAID" || i.status === "CLOSED",
                ).length
              }{" "}
              pagos &middot; {Math.round(progress.paid)}%
            </div>
            {nextLogicalAction === "PAGO" && (
              <button
                className={s.relationAction}
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenInvoiceModal();
                }}
              >
                Registrar
              </button>
            )}
          </div>


        </div>
        {/* Operational Summary */}
        <div className={s.summaryPanel}>
          <div className={s.summaryItem}>
            <div className={s.summaryLabel}>PROVEEDOR</div>
            <div className={s.summaryValue}>
              {supplier?.name || "-"}
            </div>
          </div>
          <div className={s.summaryItem}>
            <div className={s.summaryLabel}>CONDICIÓN DE COMPRA</div>
            <div className={s.summaryValue}>
              {purchaseConditions.find((c) => c.id === selectedConditionId)
                ?.description || "-"}
            </div>
          </div>
          <div className={s.summaryItem}>
            <div className={s.summaryLabel}>ITEMS</div>
            <div className={s.summaryValue}>
              {items.length} ({orderedLts.toFixed(1)} u.)
            </div>
          </div>
          <div className={s.summaryItem}>
            <div className={s.summaryLabel}>ESTADO</div>
            <div
              className={s.summaryValue}
              style={{ color: nextLogicalAction ? "#f97316" : "#10b981" }}
            >
              {nextLogicalAction
                ? "Pend. " +
                  nextLogicalAction.charAt(0) +
                  nextLogicalAction.slice(1).toLowerCase()
                : "Completado"}
            </div>
          </div>

          <div className={s.summaryItem}>
            <div className={s.summaryLabel}>MODIFICACIÓN</div>
            <div className={s.summaryValue}>
              {new Date().toLocaleString("es-AR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </div>
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
            <span
              className={s.footerCompactLabel}
              style={{ color: "var(--primary)" }}
            >
              TOTAL COMPRA
            </span>
            <span className={s.footerCompactTotal}>{fmt(totals.total)}</span>
          </div>
        </div>
      </div>

      {/* Dynamic Drawer for Document Viewing */}
      <Drawer
        open={drawerState.open}
        onClose={() => setDrawerState({ open: false, type: null })}
        title={
          drawerState.type === "REMITO"
            ? "Remitos Relacionados"
            : drawerState.type === "FACTURA"
              ? "Facturas Relacionadas"
              : drawerState.type === "PAGO"
                ? "Pagos Registrados"
                : "Documentos"
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(drawerState.type === "REMITO" && deliveryNotes.length === 0) ||
          (drawerState.type === "FACTURA" && invoices.length === 0) ||
          (drawerState.type === "PAGO" &&
            invoices.filter((i) => i.status === "PAID" || i.status === "CLOSED")
              .length === 0) ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "#64748b",
                fontSize: 13,
                background: "#f8fafc",
                borderRadius: 12,
              }}
            >
              No hay documentos relacionados en esta etapa.
            </div>
          ) : null}

          {drawerState.type === "REMITO" &&
            deliveryNotes.map((dn) => (
              <div
                key={dn.id}
                style={{
                  padding: 16,
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  background: "#fff",
                }}
              >
                <div
                  style={{ fontWeight: 800, fontSize: 13, color: "#1e293b" }}
                >
                  {dn.pv}-{dn.number}
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                  Fecha: {new Date(dn.created_at).toLocaleDateString()}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  Estado: {dn.status}
                </div>
                <button
                  style={{
                    marginTop: 12,
                    background: "#f1f5f9",
                    color: "#0f172a",
                    border: "none",
                    padding: "6px 12px",
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  VER DETALLE
                </button>
              </div>
            ))}
          {drawerState.type === "FACTURA" &&
            invoices.map((inv) => (
              <div
                key={inv.id}
                style={{
                  padding: 16,
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  background: "#fff",
                }}
              >
                <div
                  style={{ fontWeight: 800, fontSize: 13, color: "#1e293b" }}
                >
                  {inv.pv}-{inv.number}
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                  Monto: {inv.currency} {inv.total_amount}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  Estado: {inv.status}
                </div>
                <button
                  style={{
                    marginTop: 12,
                    background: "#f1f5f9",
                    color: "#0f172a",
                    border: "none",
                    padding: "6px 12px",
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  VER DETALLE
                </button>
              </div>
            ))}
          {drawerState.type === "PAGO" &&
            invoices
              .filter((i) => i.status === "PAID" || i.status === "CLOSED")
              .map((inv) => (
                <div
                  key={inv.id}
                  style={{
                    padding: 16,
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    background: "#fff",
                  }}
                >
                  <div
                    style={{ fontWeight: 800, fontSize: 13, color: "#1e293b" }}
                  >
                    Pago a Fac. {inv.pv}-{inv.number}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                    Monto: {inv.currency} {inv.total_amount}
                  </div>
                  <button
                    style={{
                      marginTop: 12,
                      background: "#f1f5f9",
                      color: "#0f172a",
                      border: "none",
                      padding: "6px 12px",
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    VER DETALLE
                  </button>
                </div>
              ))}
        </div>
      </Drawer>

      {/* Remito Selection Modal */}
      <Modal
        open={showRemitoModal}
        title="Seleccionar ítems a remitir"
        onClose={() => setShowRemitoModal(false)}
        wide
      >
        <div style={{ padding: "0 20px 20px" }}>
          <p
            style={{
              fontSize: 12,
              color: "#64748b",
              marginBottom: 16,
              marginTop: 0,
            }}
          >
            Seleccioná los productos y cantidades a incluir en este remito. Lo
            restante quedará como pendiente.
          </p>

          {/* Item list */}
          <div
            style={{
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              overflow: "hidden",
              marginBottom: 16,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "32px 2.5fr 100px 100px 100px 120px",
                gap: 8,
                padding: "8px 12px",
                background: "#f8fafc",
                borderBottom: "1px solid #e2e8f0",
                fontSize: 10,
                fontWeight: 800,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                alignItems: "center",
              }}
            >
              <div></div>
              <div>PRODUCTO</div>
              <div style={{ textAlign: "center" }}>PEDIDO</div>
              <div style={{ textAlign: "center" }}>YA REMIT.</div>
              <div style={{ textAlign: "center" }}>PENDIENTE</div>
              <div style={{ textAlign: "center" }}>A REMITIR</div>
            </div>
            {items.map((item) => {
              const factor = parseFloat(
                item.product?.quantity_per_container ||
                  item.quantity_per_container ||
                  item._unit_content ||
                  1,
              );
              const unitLabel =
                item._unit_label || item.unit_of_measure || "LT";

              const orderedBaseQty = parseFloat(item.qty || 0);
              const deliveredBaseQty = parseFloat(item.qty_delivered || 0);
              const pendingBaseQty = Math.max(
                0,
                orderedBaseQty - deliveredBaseQty,
              );

              const orderedPackages = Number(
                (orderedBaseQty / factor).toFixed(2),
              );
              const deliveredPackages = Number(
                (deliveredBaseQty / factor).toFixed(2),
              );
              const pendingPackages = Number(
                (pendingBaseQty / factor).toFixed(2),
              );

              const currentQty =
                remitoQtys[item.id] !== undefined
                  ? remitoQtys[item.id]
                  : pendingPackages;
              const isSelected = currentQty > 0;

              return (
                <div
                  key={item.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "32px 2.5fr 100px 100px 100px 120px",
                    gap: 8,
                    padding: "10px 12px",
                    borderBottom: "1px solid #f1f5f9",
                    alignItems: "center",
                    background: isSelected ? "#f8fafc" : "#fff",
                    borderLeft: isSelected
                      ? "3px solid #3b82f6"
                      : "3px solid transparent",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    {pendingBaseQty > 0 ? (
                      <button
                        style={{
                          border: "none",
                          background: "none",
                          cursor: "pointer",
                          color: isSelected ? "#2563eb" : "#cbd5e1",
                          padding: 0,
                        }}
                        onClick={() => {
                          if (isSelected) {
                            setRemitoQtys((prev) => ({
                              ...prev,
                              [item.id]: 0,
                            }));
                          } else {
                            setRemitoQtys((prev) => ({
                              ...prev,
                              [item.id]: pendingPackages,
                            }));
                          }
                        }}
                      >
                        {isSelected ? (
                          <CheckSquare size={20} />
                        ) : (
                          <Square size={20} />
                        )}
                      </button>
                    ) : (
                      <AlertCircle
                        size={18}
                        style={{ color: "#059669" }}
                        title="Totalmente remitido"
                      />
                    )}
                  </div>
                  <div
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#1e293b",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.product?.name ||
                        item.name ||
                        item.description ||
                        "Sin nombre"}
                      {(item.product?.brand?.name || item.brand) && (
                        <span style={{ color: "#94a3b8", fontWeight: 600 }}>
                          {" "}
                          {item.product?.brand?.name || item.brand}
                        </span>
                      )}
                    </div>
                    {pendingBaseQty <= 0 && (
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#059669",
                          marginTop: 2,
                        }}
                      >
                        ✓ Totalmente remitido
                      </div>
                    )}
                  </div>
                  {/* PEDIDO */}
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#475569",
                      }}
                    >
                      {factor > 1
                        ? `${orderedPackages.toString().replace(/\.00$/, "")} env.`
                        : `${orderedBaseQty} und.`}
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>
                      {orderedBaseQty.toFixed(1).replace(/\.0$/, "")}{" "}
                      {unitLabel}
                    </div>
                  </div>
                  {/* YA REMIT. */}
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#94a3b8",
                      }}
                    >
                      {factor > 1
                        ? `${deliveredPackages.toString().replace(/\.00$/, "")} env.`
                        : `${deliveredBaseQty} und.`}
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>
                      {deliveredBaseQty.toFixed(1).replace(/\.0$/, "")}{" "}
                      {unitLabel}
                    </div>
                  </div>
                  {/* PENDIENTE */}
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: pendingBaseQty > 0 ? "#1e293b" : "#059669",
                      }}
                    >
                      {factor > 1
                        ? `${pendingPackages.toString().replace(/\.00$/, "")} env.`
                        : `${pendingBaseQty} und.`}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: pendingBaseQty > 0 ? "#64748b" : "#059669",
                      }}
                    >
                      {pendingBaseQty.toFixed(1).replace(/\.0$/, "")}{" "}
                      {unitLabel}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      alignItems: "center",
                    }}
                  >
                    {pendingBaseQty > 0 ? (
                      <>
                        <input
                          type="number"
                          min={0}
                          max={pendingPackages}
                          step="any"
                          value={currentQty}
                          onChange={(e) => {
                            const val = Math.min(
                              parseFloat(e.target.value) || 0,
                              pendingPackages,
                            );
                            setRemitoQtys((prev) => ({
                              ...prev,
                              [item.id]: val,
                            }));
                          }}
                          style={{
                            width: 80,
                            height: 32,
                            padding: "0 8px",
                            borderRadius: 6,
                            border: `1px solid ${isSelected ? "#3b82f6" : "#cbd5e1"}`,
                            textAlign: "center",
                            fontWeight: 700,
                            fontSize: 12,
                            color: "#1e293b",
                            background: "#fff",
                            outline: "none",
                          }}
                        />
                        <div style={{ fontSize: 9, color: "#64748b" }}>
                          ={" "}
                          {(currentQty * factor)
                            .toFixed(2)
                            .replace(/\.00$/, "")}{" "}
                          {unitLabel}
                        </div>
                      </>
                    ) : (
                      <span
                        style={{
                          fontSize: 11,
                          color: "#94a3b8",
                          fontWeight: 600,
                        }}
                      >
                        —
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer actions */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 16,
            }}
          >
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
              {Object.values(remitoQtys).filter((q) => q > 0).length} de{" "}
              {
                items.filter(
                  (i) =>
                    parseFloat(i.qty || 0) - parseFloat(i.qty_delivered || 0) >
                    0,
                ).length
              }{" "}
              ítems seleccionados
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setShowRemitoModal(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmRemito}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "#2563eb",
                  color: "white",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Truck size={14} /> Generar Remito
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Invoicing Selection Modal */}
      <Modal
        open={showInvoiceModal}
        title="Seleccionar ítems a facturar"
        onClose={() => setShowInvoiceModal(false)}
        wide
      >
        <div style={{ padding: "0 24px 24px" }}>
          <p
            style={{
              fontSize: 13,
              color: "#64748b",
              marginBottom: 20,
              fontWeight: 600,
            }}
          >
            Seleccioná los productos y cantidades que querés incluir en esta
            factura. Lo que no factures quedará como <strong>pendiente</strong>{" "}
            en la orden.
          </p>

          <div
            style={{
              borderRadius: 16,
              border: "1px solid #e2e8f0",
              overflow: "hidden",
              marginBottom: 24,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "32px 2fr 110px 110px 110px 140px",
                gap: 12,
                padding: "10px 16px",
                background: "#f8fafc",
                borderBottom: "2px solid #e2e8f0",
                fontSize: 10,
                fontWeight: 900,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                alignItems: "center",
              }}
            >
              <div></div>
              <div>PRODUCTO</div>
              <div style={{ textAlign: "center" }}>PEDIDO</div>
              <div style={{ textAlign: "center" }}>YA FACT.</div>
              <div style={{ textAlign: "center" }}>PENDIENTE</div>
              <div style={{ textAlign: "center" }}>A FACTURAR AHORA</div>
            </div>
            {items.map((item) => {
              const qtyInvoicedUnits = parseFloat(item.qty_invoiced || 0);
              const qtyOrderedUnits = parseFloat(item.qty || 0);
              const factor = parseFloat(item._unit_content || 1);
              const orderedPkgs =
                factor > 1 ? qtyOrderedUnits / factor : qtyOrderedUnits;
              const invoicedPkgs =
                factor > 1 ? qtyInvoicedUnits / factor : qtyInvoicedUnits;
              const pendingPkgs = Math.max(0, orderedPkgs - invoicedPkgs);
              const currentQty =
                invoiceQtys[item.id] !== undefined
                  ? invoiceQtys[item.id]
                  : pendingPkgs;
              const isSelected = currentQty > 0;
              const unitLabel = item._unit_label || "u";

              return (
                <div
                  key={item.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "32px 2fr 110px 110px 110px 140px",
                    gap: 12,
                    padding: "14px 16px",
                    borderBottom: "1px solid #f1f5f9",
                    alignItems: "center",
                    background: isSelected ? "#f5f3ff" : "#fff",
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    {pendingPkgs > 0 ? (
                      <button
                        style={{
                          border: "none",
                          background: "none",
                          cursor: "pointer",
                          color: isSelected ? "#7c3aed" : "#cbd5e1",
                          padding: 0,
                        }}
                        onClick={() => {
                          if (isSelected) {
                            setInvoiceQtys((prev) => ({
                              ...prev,
                              [item.id]: 0,
                            }));
                          } else {
                            setInvoiceQtys((prev) => ({
                              ...prev,
                              [item.id]: pendingPkgs,
                            }));
                          }
                        }}
                      >
                        {isSelected ? (
                          <CheckSquare size={20} />
                        ) : (
                          <Square size={20} />
                        )}
                      </button>
                    ) : (
                      <Check
                        size={18}
                        style={{ color: "#059669" }}
                        title="Totalmente facturado"
                      />
                    )}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: "#1e293b",
                      }}
                    >
                      {item.product?.name ||
                        item.name ||
                        item.description ||
                        "Sin nombre"}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#94a3b8",
                      }}
                    >
                      {item.product?.brand?.name || item.brand}
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#475569",
                      }}
                    >
                      {orderedPkgs} env.
                    </div>
                    {factor > 1 && (
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#94a3b8",
                        }}
                      >
                        {qtyOrderedUnits} {unitLabel}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#94a3b8",
                      }}
                    >
                      {invoicedPkgs} env.
                    </div>
                    {factor > 1 && (
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#94a3b8",
                        }}
                      >
                        {qtyInvoicedUnits} {unitLabel}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 900,
                        color: pendingPkgs > 0 ? "#7c3aed" : "#059669",
                      }}
                    >
                      {pendingPkgs.toFixed(2)} env.
                    </div>
                    {factor > 1 && (
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: pendingPkgs > 0 ? "#7c3aed" : "#059669",
                        }}
                      >
                        {(pendingPkgs * factor).toFixed(1)} {unitLabel}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      alignItems: "center",
                    }}
                  >
                    {pendingPkgs > 0 ? (
                      <>
                        <input
                          type="number"
                          min={0}
                          max={pendingPkgs}
                          step="any"
                          value={currentQty}
                          onChange={(e) => {
                            const val = Math.min(
                              parseFloat(e.target.value) || 0,
                              pendingPkgs,
                            );
                            setInvoiceQtys((prev) => ({
                              ...prev,
                              [item.id]: val,
                            }));
                          }}
                          style={{
                            width: 90,
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: `2px solid ${isSelected ? "#7c3aed" : "#e2e8f0"}`,
                            textAlign: "center",
                            fontWeight: 800,
                            fontSize: 14,
                            color: "#1e293b",
                            background: "#fff",
                            outline: "none",
                          }}
                        />
                        {factor > 1 && (
                          <div
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: "#64748b",
                            }}
                          >
                            = {(currentQty * factor).toFixed(2)} {unitLabel}
                          </div>
                        )}
                      </>
                    ) : (
                      <span
                        style={{
                          fontSize: 11,
                          color: "#94a3b8",
                          fontWeight: 600,
                        }}
                      >
                        —
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>
              {Object.values(invoiceQtys).filter((q) => q > 0).length} ítems
              seleccionados para facturar
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setShowInvoiceModal(false)}
                style={{
                  padding: "10px 22px",
                  borderRadius: 12,
                  border: "1.5px solid #e2e8f0",
                  background: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmInvoice}
                style={{
                  padding: "10px 24px",
                  borderRadius: 12,
                  border: "none",
                  background: "#7c3aed",
                  color: "white",
                  fontWeight: 800,
                  cursor: "pointer",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Receipt size={16} /> Ir a Facturar
              </button>
            </div>
          </div>
        </div>
      </Modal>
      {/* Link Manager Modal */}
      {linkManagerDoc && (
        <Modal
          open={!!linkManagerDoc}
          title={`Gestión de Vínculo: ${linkManagerDoc.type === "REMITO" ? "Remito" : "Factura"} #${linkManagerDoc.number}`}
          onClose={() => setLinkManagerDoc(null)}
          wide
        >
          <div style={{ padding: "0 24px 24px" }}>
            <div style={{ display: "flex", gap: 24, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    fontSize: 13,
                    color: "#64748b",
                    marginBottom: 12,
                    fontWeight: 600,
                  }}
                >
                  Ajustá las cantidades vinculadas a este pedido. Si reducís la
                  cantidad a 0, el ítem se <strong>desvinculará</strong>.
                </p>
              </div>
              <div
                style={{
                  background: "#f8fafc",
                  padding: "12px 20px",
                  borderRadius: 16,
                  border: "1px solid #e2e8f0",
                  minWidth: 280,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 900,
                    color: "#94a3b8",
                    marginBottom: 8,
                    letterSpacing: "0.05em",
                  }}
                >
                  PROYECCIÓN DE ESTADO
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <TraceabilityStatusBadge status={status} />
                  <ArrowUpRight size={14} color="#94a3b8" />
                  <TraceabilityStatusBadge status={projectedStatus} />
                </div>
              </div>
            </div>

            <div
              style={{
                borderRadius: 16,
                border: "1px solid #e2e8f0",
                overflow: "hidden",
                marginBottom: 24,
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 110px 110px 110px 140px",
                  gap: 12,
                  padding: "10px 16px",
                  background: "#f8fafc",
                  borderBottom: "2px solid #e2e8f0",
                  fontSize: 10,
                  fontWeight: 900,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  alignItems: "center",
                }}
              >
                <div>PRODUCTO</div>
                <div style={{ textAlign: "center" }}>PEDIDO OC</div>
                <div style={{ textAlign: "center" }}>VINCULADO</div>
                <div style={{ textAlign: "center" }}>ESTADO OC</div>
                <div style={{ textAlign: "center" }}>AJUSTAR AHORA</div>
              </div>

              {linkManagerDoc.lines.map((l, idx) => {
                const isRemoving = l.newQty <= 0;
                return (
                  <div
                    key={l.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 110px 110px 110px 140px",
                      gap: 12,
                      padding: "14px 16px",
                      borderBottom: "1px solid #f1f5f9",
                      alignItems: "center",
                      background: isRemoving ? "#fff1f2" : "#fff",
                      transition: "background 0.15s",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#1e293b",
                        }}
                      >
                        {l.name}
                      </div>
                      <div
                        style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}
                      >
                        {l.description}
                      </div>
                    </div>

                    {/* PEDIDO OC */}
                    <div style={{ textAlign: "center", color: "#64748b" }}>
                      <div style={{ fontSize: 12, fontWeight: 800 }}>
                        {l.ovQty.toFixed(2)} env.
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600 }}>
                        {(l.ovQty * l.unitFactor).toFixed(1)} {l.unitLabel}
                      </div>
                    </div>

                    {/* VINCULADO (Current) */}
                    <div style={{ textAlign: "center", color: "#24389c" }}>
                      <div style={{ fontSize: 13, fontWeight: 900 }}>
                        {parseFloat(l.originalQty).toFixed(2)} env.
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600 }}>
                        {(l.originalQty * l.unitFactor).toFixed(1)}{" "}
                        {l.unitLabel}
                      </div>
                    </div>

                    {/* ESTADO OC (After removal/adjustment?) For now simple current status */}
                    <div style={{ textAlign: "center" }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 900,
                          color: "#059669",
                        }}
                      >
                        {l.ovDelivered.toFixed(2)} env.
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#059669",
                        }}
                      >
                        {(l.ovDelivered * l.unitFactor).toFixed(1)}{" "}
                        {l.unitLabel}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="number"
                        value={l.newQty}
                        min={0}
                        max={l.originalQty}
                        onChange={(e) => {
                          const val = Math.min(
                            parseFloat(l.originalQty),
                            Math.max(0, parseFloat(e.target.value) || 0),
                          );
                          const newLines = [...linkManagerDoc.lines];
                          newLines[idx].newQty = val;
                          setLinkManagerDoc({
                            ...linkManagerDoc,
                            lines: newLines,
                          });
                        }}
                        style={{
                          width: 90,
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "2px solid #e2e8f0",
                          textAlign: "center",
                          fontWeight: 800,
                          fontSize: 14,
                          color: isRemoving ? "#ef4444" : "#1e293b",
                          background: "#fff",
                          outline: "none",
                        }}
                      />
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: "#64748b",
                        }}
                      >
                        = {(l.newQty * l.unitFactor).toFixed(2)} {l.unitLabel}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                marginTop: 16,
              }}
            >
              <button
                onClick={() => setLinkManagerDoc(null)}
                style={{
                  padding: "10px 22px",
                  borderRadius: 12,
                  border: "1.5px solid #e2e8f0",
                  background: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleUpdateLinkQty}
                style={{
                  padding: "10px 24px",
                  borderRadius: 12,
                  border: "none",
                  background: "#24389c",
                  color: "white",
                  fontWeight: 800,
                  cursor: "pointer",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Save size={16} /> Confirmar Ajustes
              </button>
            </div>
          </div>
        </Modal>
      )}

    </>
  );
}
