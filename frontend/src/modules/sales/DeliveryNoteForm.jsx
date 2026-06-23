import React, { useState, useEffect, useMemo } from "react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import Autocomplete from "../../components/ui/Autocomplete";
import Modal from "../../components/ui/Modal";
import Drawer from "../../components/ui/Drawer";
import Badge from "../../components/ui/Badge";
import Card from "../../components/ui/Card";
import { useWindow } from '../../context/WindowContext';
import { openEditOrdenVenta, openNuevaFactura } from '../../utils/openStandaloneWindow';
import { useToast } from '../../context/ToastContext';
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
  Printer,
  Mail,
  X,
  Search,
  Building,
  ClipboardList,
  MapPin,
  Calendar,
  User,
  ShoppingBag,
  MoreVertical,
  History,
  Info,
  Receipt,
  Link2,
  Link2Off,
  Package,
  ReceiptText,
  ShoppingCart,
  FileText,
  ArrowUpRight,
  Check,
  CheckCircle,
  CheckSquare,
  Square,
  AlertCircle,
  ArrowRight,
  Pencil
} from "lucide-react";
import { TraceabilityStatusBadge, TraceabilityProgress } from "../../components/ui/TraceabilityStatusBadge";

// Helper to compute display value for Remitir column (packages or quantity)
function formatQty(value) {
  const n = Number(value || 0);
  return Number.isInteger(n)
    ? String(n)
    : n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function getDisplayPackages(item) {
  const qty = Number(item.qty || 0);
  const factor = Number(item._unit_content || 1);
  if (factor > 1) {
    return `${formatQty(qty / factor)} env.`;
  }
  return `${formatQty(qty)} ${item._unit_label || 'u'}.`;
}
import s from "./SalesOrderForm.module.css";
import t from "../../components/ui/Table.module.css";
import LoadingScreen from "../../components/ui/LoadingScreen";
import ManualLinkInvoiceModal from "./ManualLinkInvoiceModal";

export default function DeliveryNoteForm(props) {
  const {
    mode: initialMode = "new",
    id: initialId = null,
    windowId,
    ov_id = null,
    autoOpenSelector = false,
    preselectedLines = null,
    initialData = null,
    isStandalone = false,
  } = props;
  const { closeWindow, openWindow } = useWindow();
  const { showToast } = useToast();
  const { costCenter } = useCostCenter();

  const [mode, setMode] = useState(initialMode);
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [id, setId] = useState(initialId);
  const [items, setItems ] = useState([]);
  const [activeTab, setActiveTab ] = useState("items");
  const [sourceId, setSourceId] = useState(props.initialSourceId || ov_id || '');
  const [sourceType, setSourceType] = useState(props.initialSourceType || (ov_id ? 'sales-order' : ''));
  const [sourceOrderId, setSourceOrderId] = useState(ov_id || '');
  const [ovHasInvoices, setOvHasInvoices] = useState(false);
  const [traceability, setTraceability] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [relatedDeliveryNotes, setRelatedDeliveryNotes] = useState([]);
  const [isReadOnly, setIsReadOnly] = useState(initialMode === "edit" || initialMode === "view");
  const [showItemSelector, setShowItemSelector] = useState(false);
  const [selectableItems, setSelectableItems] = useState([]);
  const [selectorLoading, setSelectorLoading] = useState(false);
  const [selectedSelectorItems, setSelectedSelectorItems] = useState([]);
  const [selectorQuantities, setSelectorQuantities] = useState({});
  const [linkingItemId, setLinkingItemId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showManualLinkModal, setShowManualLinkModal] = useState(false);
  const [dnTraceability, setDnTraceability] = useState(null);
  
  // Facturación
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceQtys, setInvoiceQtys] = useState({});

  // --- Header Data ---
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [ctroCosto, setCtroCosto] = useState(String(costCenter || 1));
  const [entity, setEntity] = useState(null);
  const [pv, setPv] = useState("0001");
  const [number, setNumber] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [observations, setObservations] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [dueDate, setDueDate] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [selectedConditionId, setSelectedConditionId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [drawerState, setDrawerState] = useState({ open: false, type: null });

  // Nuevos campos propios del remito
  const [vehicleDriver, setVehicleDriver] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [transporter, setTransporter] = useState("");

  // --- Lists ---
  const [warehouses, setWarehouses] = useState([]);
  const [pointsOfSale, setPointsOfSale] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [saleConditions, setSaleConditions] = useState([]);

  // --- Calculations ---
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
      { subtotal: 0, bonif: 0, net: 0, vat: 0, total: 0 }
    );
  }, [items]);

  const orderedLts = useMemo(() => items.reduce((acc, item) => acc + (parseFloat(item.qty) || 0), 0), [items]);

  useEffect(() => {
    if (ov_id) {
      console.log("ovId recibido en form:", ov_id);
    }
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (!initialData || mode !== 'new') return;
    const load = async () => {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      if (initialData.entity_id) {
        try {
          const res = await fetch(`${API_URL}/entities/${initialData.entity_id}`, { headers });
          if (res.ok) setEntity(await res.json());
        } catch (e) { console.error('AI: could not load entity', e); }
      }
      if (initialData.warehouse_id) setWarehouseId(initialData.warehouse_id);
      if (initialData.lines && initialData.lines.length > 0) {
        const mappedLines = initialData.lines
          .filter(l => l.product_id || l.description)
          .map(l => ({
            id: Math.random(),
            product_id: l.product_id || null,
            description: l.description || '',
            qty: parseFloat(l.qty || 1),
            unit_price: parseFloat(l.unit_price || 0),
            discount_pct: 0,
            vat_rate: 0.21,
            _account_code: 'S/C',
            _unit_content: 1,
            _container_name: 'Unidad',
            _unit_label: 'u',
          }));
        if (mappedLines.length > 0) setItems(mappedLines);
      }
    };
    load();
  }, [initialData]);

  useEffect(() => {
    if (id) {
       fetchDeliveryNoteTraceability();
    }
  }, [id]);

  useEffect(() => {
    if (mode === "edit" && id) {
        fetchDeliveryNote();
        fetchDeliveryNoteTraceability();
    }
    else if (mode === "new" && ov_id) {
        console.log("Cargando OV por ID:", ov_id);
        if (preselectedLines && preselectedLines.length > 0) {
            fetchHeaderFromSalesOrder();
            setItems(preselectedLines.map(l => ({
                id: Math.random(),
                product_id: l.product_id,
                description: l.product?.name || l.name || l.description || '',
                qty: parseFloat(l.qty_to_remit || l.qty || 1),
                qty_packages: parseFloat(l.qty_packages || 0) || undefined,
                unit_price: parseFloat(l.unit_price || 0),
                discount_pct: parseFloat(l.discount_pct || 0),
                vat_rate: parseFloat(l.vat_rate || 0.21),
                _account_code: l.sales_account_code || l._account_code || 'S/C',
                _unit_content: parseFloat(l._unit_content || 1),
                _container_name: l._container_name || 'Unidad',
                _unit_label: l._unit_label || 'u',
                source_sales_line_id: l.source_sales_line_id || l.id,
                _parent_number: l.parent_number || '',
            })));
        } else if (autoOpenSelector) {
            fetchHeaderFromSalesOrder();
        } else {
            fetchFromSalesOrder();
        }
    }
  }, [mode, id, ov_id, autoOpenSelector]);

  useEffect(() => {
    const handleDocumentMessage = (e) => {
        const payload = e.data;
        if (!payload || payload.type !== 'QUINTAL_DOCUMENT_SAVED') return;
        
        if (payload.documentType === 'invoice' && mode === 'edit' && id) {
            if (payload.deliveryNoteId === id || payload.salesOrderId === sourceOrderId) {
                fetchDeliveryNote();
                fetchDeliveryNoteTraceability();
            }
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

  useEffect(() => {
    if (sourceId && sourceType === 'sales-order') {
        const orderIdToTrace = sourceOrderId || sourceId;
        fetchTraceability(orderIdToTrace);
    }
  }, [sourceId, sourceType, sourceOrderId]);

  useEffect(() => {
    if (mode === "new" && !ov_id && pointsOfSale.length > 0) {
      const targetPvCode = ctroCosto === "1" ? "0001" : "0002";
      const initialPv = pointsOfSale.find(p => p.pv === targetPvCode)?.pv || pointsOfSale[0].pv;
      setPv(initialPv);
      fetchNextNumber(initialPv);
    }
  }, [ctroCosto, pointsOfSale, mode]);

  const fetchInitialData = async () => {
    const token = localStorage.getItem("token");
    const headers = { Authorization: `Bearer ${token}` };
    
    // Si estamos en standalone y creando un remito, no bloqueamos la interfaz cargando vendedores ni condiciones.
    const skipHeavyLists = mode === "new" && (ov_id || isStandalone);

    const queries = [
      fetch(`${API_URL}/inventory/warehouses/`, { headers }),
      fetch(`${API_URL}/config/pos`, { headers })
    ];

    if (!skipHeavyLists) {
      queries.push(fetch(`${API_URL}/entities/?is_salesperson=true`, { headers }));
      queries.push(fetch(`${API_URL}/sales/sale-conditions/`, { headers }));
    }

    const [whRes, posRes, spRes, scRes] = await Promise.all(queries);

    if (whRes?.ok) {
        const whs = await whRes.json();
        setWarehouses(whs);
        if (whs.length > 0 && mode === "new") setWarehouseId(whs[0].id);
    }
    
    if (spRes?.ok) setSellers(await spRes.json());
    if (scRes?.ok) setSaleConditions(await scRes.json());
    
    if (posRes?.ok) {
       const pvs = await posRes.json();
       const filteredPvs = pvs.filter(p => !p.document_configs || p.document_configs.length === 0 || p.document_configs.some(c => ['RE', 'RM', 'REMITO'].includes(c.document_type)));
       setPointsOfSale(filteredPvs);
        if (filteredPvs.length > 0 && mode === "new" && !number) {
            const targetPvCode = ctroCosto === "1" ? "0001" : "0002";
            const initialPv = filteredPvs.find(p => p.pv === targetPvCode)?.pv || filteredPvs[0].pv;
            setPv(initialPv);
            fetchNextNumber(initialPv);
        }
    }

    if (isStandalone && mode === 'new') {
        console.timeEnd("load-remito-data");
    }
  };

  const fetchNextNumber = async (v_pv) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/config/pos/next-number?pv=${v_pv}&doc_type=RE`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
        const data = await res.json();
        setNumber(data.full_number || data.number || `${v_pv}-${data.next_number}`);
    }
  };

  const fetchDeliveryNote = async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/sales/delivery-notes/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
        const data = await res.json();
        if (data.entity_id) {
            fetch(`${API_URL}/entities/${data.entity_id}`, { headers: { Authorization: `Bearer ${token}` }})
                .then(r => r.json())
                .then(setEntity);
        }
        setDate(data.date.split("T")[0]);
        setPv(data.number ? data.number.split("-")[0] : '0001');
        setNumber(data.number || '');
        setWarehouseId(data.warehouse_id || '');
        setStatus(data.status || 'DRAFT');
        setObservations(data.notes || '');
        setSourceId(data.sales_order_id ? data.origin_reference : (data.purchase_order_id ? data.origin_reference : ''));
        setSourceType(data.sales_order_id ? 'sales-order' : (data.purchase_order_id ? 'purchase-order' : ''));
        if (data.sales_order_id) {
            setSourceOrderId(data.sales_order_id);
            fetchTraceability(data.sales_order_id);
        }
        setVendedor(data.vendedor || '');
        setSalespersonId(data.salesperson_id || '');
        setSelectedConditionId(data.sale_condition_id || '');
        setDueDate(data.due_date ? data.due_date.split("T")[0] : '');
        setCurrency(data.currency || 'USD');
        setExchangeRate(data.exchange_rate || 1);
        setCtroCosto(String(data.cost_center || 1));
        setInvoices(data.invoices || []);
        setRelatedDeliveryNotes(data.related_delivery_notes || []);
        
        setVehicleDriver(data.vehicle_driver || '');
        setVehiclePlate(data.plate || '');
        setTransporter(data.transporter || '');

        let ovLinesMap = {};
        if (data.sales_order_id) {
            try {
                const ovRes = await fetch(`${API_URL}/sales/sales-orders/${data.sales_order_id}`, { headers: { Authorization: `Bearer ${token}` } });
                if (ovRes.ok) {
                    const ovData = await ovRes.json();
                    ovData.lines.forEach(l => { ovLinesMap[l.id] = l; });
                }
            } catch(e) {}
        }

        setItems(data.lines.map(l => {
            const ovL = ovLinesMap[l.source_sales_line_id] || {};
            return {
                ...l,
                id: l.id,
                product_id: l.product_id,
                description: l.description,
                qty_ordered: ovL.qty || 0,
                qty_delivered: ovL.qty_delivered || 0,
                qty_pending: Math.max(0, (ovL.qty || 0) - (ovL.qty_delivered || 0)),
                qty: l.qty,
                unit_price: l.unit_price,
                discount_pct: l.discount_pct,
                vat_rate: l.vat_rate,
                _account_code: l.product?.sales_account_code || 'S/C',
                _unit_content: l.product?.quantity_per_container || 1,
                _container_name: l.product?.container?.name || 'Unidad',
                _unit_label: l.product?.container?.unit?.short_name || 'u',
                source_sales_line_id: l.source_sales_line_id,
                source_purchase_line_id: l.source_purchase_line_id,
                qty_invoiced: l.qty_invoiced || 0
            };
        }));
    }
    setLoading(false);
  };

  const fetchHeaderFromSalesOrder = async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/sales/sales-orders/${ov_id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
        const data = await res.json();
        console.log("OV cargada:", data);
        if (data.entity_id) {
          const entityRes = await fetch(`${API_URL}/entities/${data.entity_id}`, { headers: { Authorization: `Bearer ${token}` }});
          if (entityRes.ok) {
            const entData = await entityRes.json();
            setEntity(entData);
            handleOpenItemSelector(null, data.id, entData.id);
          }
        }
        const costCenterStr = String(data.cost_center || 1);
        setCtroCosto(costCenterStr);
        setSourceId(data.number);
        setSourceType('sales-order');
        setSourceOrderId(data.id);
        const statusStr = data.status || "";
        if (statusStr.includes("INVOICED") || statusStr.includes("FACTURADO") || statusStr.includes("COMPLETED")) {
            setOvHasInvoices(true);
        }
        fetchTraceability(data.id);
        setVendedor(data.vendedor || '');
        setSalespersonId(data.salesperson_id || '');
        setSelectedConditionId(data.sale_condition_id || '');
        setDueDate(data.due_date ? data.due_date.split("T")[0] : '');
        setCurrency(data.currency || 'USD');
        setExchangeRate(data.exchange_rate || 1);
        setWarehouseId(data.warehouse_id || (warehouses.length > 0 ? warehouses[0].id : ''));
        const targetPvCode = costCenterStr === "1" ? "0001" : "0002";
        const pvCode = (pointsOfSale.find(p => p.pv === targetPvCode)?.pv || pointsOfSale[0]?.pv || targetPvCode);
        setPv(pvCode);
        fetchNextNumber(pvCode);
    }
    setLoading(false);
  };

  const fetchFromSalesOrder = async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/sales/sales-orders/${ov_id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
        const data = await res.json();
        console.log("OV cargada:", data);
        if (data.entity_id) {
          const entityRes = await fetch(`${API_URL}/entities/${data.entity_id}`, { headers: { Authorization: `Bearer ${token}` }});
          if (entityRes.ok) setEntity(await entityRes.json());
        }
        const costCenterStr = String(data.cost_center || 1);
        setCtroCosto(costCenterStr);
        setSourceId(data.number);
        setSourceType('sales-order');
        setSourceOrderId(data.id);
        const statusStr = data.status || "";
        if (statusStr.includes("INVOICED") || statusStr.includes("FACTURADO") || statusStr.includes("COMPLETED")) {
            setOvHasInvoices(true);
        }
        fetchTraceability(data.id);
        setVendedor(data.vendedor || '');
        setSalespersonId(data.salesperson_id || '');
        setSelectedConditionId(data.sale_condition_id || '');
        setDueDate(data.due_date ? data.due_date.split("T")[0] : '');
        setCurrency(data.currency || 'USD');
        setExchangeRate(data.exchange_rate || 1);
        setWarehouseId(data.warehouse_id || (warehouses.length > 0 ? warehouses[0].id : ''));

        const targetPvCode = costCenterStr === "1" ? "0001" : "0002";
        const pvCode = (pointsOfSale.find(p => p.pv === targetPvCode)?.pv || pointsOfSale[0]?.pv || targetPvCode);
        setPv(pvCode);
        fetchNextNumber(pvCode);

        const linesRes = await fetch(`${API_URL}/sales/pending-items/sales-orders?entity_id=${data.entity_id}`, {
           headers: { Authorization: `Bearer ${token}` }
        });
        if (linesRes.ok) {
           const pendingLines = await linesRes.json();
           const filteredLines = pendingLines.filter(l => String(l.parent_id) === String(ov_id));
           setItems(filteredLines.map(l => ({
              id: Math.random(),
              product_id: l.product_id,
              description: l.product_name,
              qty_ordered: l.qty,
              qty_delivered: l.qty_fulfilled,
              qty_pending: l.qty_pending,
              qty: l.qty_pending, // User requested total pendiente by default
              unit_price: l.unit_price,
              discount_pct: l.discount_pct,
              vat_rate: l.vat_rate,
              _account_code: l.sales_account_code || 'S/C',
              _unit_content: l.quantity_per_container || 1,
              _container_name: l.container_name || 'Unidad',
              _unit_label: l.unit_short_name || 'u',
              source_sales_line_id: l.id,
              _parent_number: l.parent_number
           })));
        }
    }
    setLoading(false);
  };

  const fetchTraceability = async (orderId) => {
    if (!orderId) return;
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/sales/sales-orders/${orderId}/traceability`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
        setTraceability(await res.json());
    }
  };

  const fetchDeliveryNoteTraceability = async () => {
    if (!id) return;
    try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_URL}/sales/delivery-notes/${id}/traceability`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
            setDnTraceability(await res.json());
        }
    } catch (error) {
        console.error("Error fetching DN traceability:", error);
    }
  };

  const searchEntities = async (q) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/entities/?q=${q}&type=client`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  };

  const searchProducts = async (q) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/inventory/products/?q=${q}`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  };

  const handleAddItem = (product) => {
    if (!product) return;
    setItems([...items, {
      id: Math.random(),
      product_id: product.id,
      description: product.name,
      qty: 1,
      unit_price: product.cost_price || 0,
      discount_pct: 0,
      vat_rate: product.tax_type?.rate || 0.21,
      _account_code: product.sales_account_code || 'S/C',
      _unit_content: product.quantity_per_container || 1,
      _container_name: product.container?.name || 'Unidad',
      _unit_label: product.container?.unit?.short_name || 'u',
    }]);
  };

  const handleOpenItemSelector = async (itemId = null, specificOvId = null, specificEntityId = null) => {
    const targetEntityId = specificEntityId || entity?.id;
    if (!targetEntityId) {
        showToast("Seleccione un cliente para ver pedidos pendientes", "warning");
        return;
    }
    setLinkingItemId(itemId);
    setShowItemSelector(true);
    setSelectorLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/sales/pending-items/sales-orders?entity_id=${targetEntityId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        let filteredData = data;
        if (specificOvId) {
             filteredData = data.filter(i => String(i.parent_id) === String(specificOvId));
        }
        setSelectableItems(filteredData);
        const qties = {};
        filteredData.forEach(i => {
             qties[i.id] = i.qty_pending;
        });
        setSelectorQuantities(qties);
        if (specificOvId) {
             setSelectedSelectorItems(filteredData);
        }
      }
    } finally {
      setSelectorLoading(false);
    }
  };

  const handleSelectItem = (itemOrItems) => {
    const itemsToProcess = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
    const newItems = itemsToProcess.map(item => {
      let finalUnitPrice = item.unit_price;
      if (!sourceId && item.parent_id) {
          setSourceOrderId(item.parent_id);
          setSourceId(item.parent_number);
          setSourceType('sales-order');
          fetchTraceability(item.parent_id);
      }
      if (item.currency === 'USD' && currency === 'ARS') {
        finalUnitPrice = item.unit_price * exchangeRate;
      } else if (item.currency === 'ARS' && currency === 'USD') {
        finalUnitPrice = exchangeRate > 0 ? item.unit_price / exchangeRate : item.unit_price;
      }
      const factor = item.quantity_per_container || 1;
      const qtyBase = selectorQuantities[item.id] !== undefined ? selectorQuantities[item.id] : (item.qty_pending || 0);
      
      return {
        id: Math.random(),
        product_id: item.product_id,
        description: item.product_name || item.description,
        qty: qtyBase,
        qty_packages: factor > 1 ? qtyBase / factor : undefined,
        unit_price: finalUnitPrice,
        discount_pct: item.discount_pct || 0,
        vat_rate: item.vat_rate || 0.21,
        _account_code: item.sales_account_code || 'S/C',
        _unit_content: item.quantity_per_container || 1,
        _container_name: item.container_name || 'Unidad',
        _unit_label: item.unit_short_name || item.unit_label || 'u',
        source_sales_line_id: item.id,
        _parent_number: item.parent_number,
        currency: item.currency
      };
    });

    if (linkingItemId) {
        const linkedItem = newItems[0];
        setItems(prev => prev.map(i => i.id === linkingItemId ? {
            ...linkedItem,
            id: linkingItemId,
            qty: i.qty || linkedItem.qty
        } : i));
        setLinkingItemId(null);
    } else {
        setItems(prev => [...prev, ...newItems]);
    }
    setShowItemSelector(false);
    setSelectedSelectorItems([]);
    showToast(`${newItems.length} ítem(s) procesados correctamente`, "success");
  };

  const handleLinkSelected = () => {
    if (selectedSelectorItems.length === 0) return;
    handleSelectItem(selectedSelectorItems);
  };

  const updateItem = (itemId, field, value) => {
    setItems(items.map((i) => {
        if (i.id !== itemId) return i;
        const newItem = { ...i, [field]: value };
        if (field === 'qty_packages') {
            newItem.qty_packages = Number(value);
            newItem.qty = Number(value) * (i._unit_content || 1);
        }
        if (field === 'qty') {
            newItem.qty = Number(value);
            const factor = i._unit_content || 1;
            if (factor > 1) {
                newItem.qty_packages = Number(value) / factor;
            }
        }
        if (field === 'equiv') {
            const factor = i._unit_content || 1;
            newItem.qty = Number(value) / factor;
        }
        return newItem;
    }));
  };

  const removeItem = (itemId) => {
    setItems(items.filter((i) => i.id !== itemId));
  };

  const handleUnlink = async () => {
    if (!window.confirm("¿Estás seguro de que quieres desvincular este remito de su orden de origen? El remito pasará a ser directo y los productos volverán a figurar como pendientes en la orden.")) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/sales/delivery-notes/${id}/unlink`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast("Desvinculado correctamente", "success");
        window.dispatchEvent(new CustomEvent("delivery-note-changed"));
        setSourceId(null);
        setSourceType(null);
        setSourceOrderId(null);
      } else {
        const err = await res.json();
        showToast(err.detail || "Error al desvincular", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!entity) return showToast("Falta cliente", "error");
    if (!warehouseId) return showToast("Falta depósito", "error");
    
    const validItems = items.filter(l => Number(l.qty) > 0);
    if (validItems.length === 0) return showToast("Agregue al menos un producto con cantidad a remitir mayor a cero", "error");

    if (mode === 'new') {
        const exceedingItems = validItems.filter(l => l.qty_pending !== undefined && Number(l.qty) > l.qty_pending);
        if (exceedingItems.length > 0) {
            return showToast("Existen productos donde la cantidad a remitir supera la cantidad pendiente", "error");
        }
    }

    setSaving(true);
    const token = localStorage.getItem("token");
    const payload = {
        entity_id: entity.id,
        warehouse_id: warehouseId,
        number: number,
        date: date,
        due_date: dueDate,
        currency: currency,
        exchange_rate: exchangeRate,
        vendedor: vendedor,
        salesperson_id: salespersonId,
        sale_condition_id: selectedConditionId,
        cost_center: parseInt(ctroCosto),
        notes: observations,
        vehicle_driver: vehicleDriver,
        plate: vehiclePlate,
        transporter: transporter,
        lines: validItems.map(l => ({
            product_id: l.product_id,
            description: l.description,
            qty: Number(l.qty),
            qty_packages: l.qty_packages,
            package_size: l._unit_content,
            unit_price: l.unit_price,
            discount_pct: l.discount_pct,
            vat_rate: l.vat_rate,
            source_sales_line_id: l.source_sales_line_id,
            source_purchase_line_id: l.source_purchase_line_id
        }))
    };

    try {
        const isEdit = mode === 'edit' && id;
        const method = isEdit ? "PUT" : "POST";
        let url = `${API_URL}/sales/delivery-notes/`;
        if (isEdit) {
            url = `${API_URL}/sales/delivery-notes/${id}`;
        } else if (sourceId) {
            const actualSourceId = sourceOrderId || sourceId;
            if (sourceType === 'sales-order') {
                url = `${API_URL}/sales/delivery-notes/from-ov/${actualSourceId}`;
            } else if (sourceType === 'purchase-order') {
                url = `${API_URL}/sales/delivery-notes/from-oc/${actualSourceId}`;
            }
        }
        
        const finalPayload = { 
            ...payload, 
            confirm_now: !isEdit 
        };

        const res = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(finalPayload)
        });
        
        if (res.ok) {
            const data = await res.json();
            const savedId = data.id || id;
            showToast("Remito guardado exitosamente", "success");
            window.dispatchEvent(new CustomEvent("delivery-note-changed"));
            
            // Emit QUINTAL_DOCUMENT_SAVED
            const eventPayload = {
                type: "QUINTAL_DOCUMENT_SAVED",
                documentType: "delivery-note",
                deliveryNoteId: savedId,
                salesOrderId: sourceOrderId,
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

            setMode("edit");
            setId(savedId);
            setIsReadOnly(true);
            // Fetch fresh saved note to load the updated view schema values and totals
            fetchDeliveryNote();
        } else {
            const err = await res.json();
            showToast(err.detail || "Error al guardar", "error");
        }
    } finally {
        setSaving(false);
    }
  };

  const handleOpenInvoiceModal = () => {
    const qtys = {};
    items.forEach(item => {
      const qtyInvoicedUnits = parseFloat(item.qty_invoiced || 0);
      const qtyOrderedUnits = parseFloat(item.qty || 0);
      const factor = parseFloat(item._unit_content || item.quantity_per_container || 1);
      const orderedPkgs = factor > 1 ? qtyOrderedUnits / factor : qtyOrderedUnits;
      const invoicedPkgs = factor > 1 ? qtyInvoicedUnits / factor : qtyInvoicedUnits;
      const pendingPkgs = Math.max(0, orderedPkgs - invoicedPkgs);
      qtys[item.id] = pendingPkgs;
    });
    setInvoiceQtys(qtys);
    setShowInvoiceModal(true);
  };

  const handleConfirmInvoice = () => {
    const selectedLines = items
      .filter(item => (parseFloat(invoiceQtys[item.id] || 0)) > 0)
      .map(item => {
        const qtyPkgs = parseFloat(invoiceQtys[item.id] || 0);
        const factor = parseFloat(item._unit_content || item.quantity_per_container || 1);
        const qtyUnits = factor > 1 ? qtyPkgs * factor : qtyPkgs;
        const lineName = item.product_name || item.product?.name || item.description || item.name || item.concept || item.item_name || '';
        
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
          unit: item.unit || item._unit_label || 'LT',
          unit_price: item.unit_price || item.price || 0,
          price: item.unit_price || item.price || 0,
          tax_rate: item.tax_rate ?? item.vat_rate ?? 21,
          delivery_note_id: id,
          source_sales_line_id: item.source_sales_line_id || null, // from DeliveryNote item.
          source_dn_line_id: item.id,
          accounting_account_id: item.product?.sales_account_id || item.sales_account_id || item.accounting_account_id || null
        };
      });

    if (selectedLines.length === 0) {
      showToast('Seleccioná al menos un ítem para facturar', 'warning');
      return;
    }

    setShowInvoiceModal(false);

    const draftId = `dn_${id}_${Date.now()}`;
    const draftData = {
      sourceType: 'delivery-note',
      deliveryNoteId: id,
      salesOrderId: sourceOrderId || null,
      customerName: entity?.name,
      currency: currency,
      exchangeRate: exchangeRate,
      pointOfSale: pv,
      paymentCondition: selectedConditionId,
      sellerId: salespersonId,
      costCenter: ctroCosto,
      lines: selectedLines
    };
    localStorage.setItem(`invoice_draft_${draftId}`, JSON.stringify(draftData));
    
    openNuevaFactura({ draft_id: draftId });
  };

  const handlePrint = () => {
    window.open(`${API_URL}/sales/delivery-notes/${id}/pdf`, '_blank');
  };
  const handlePrintPreprinted = () => {
    const token = localStorage.getItem("token");
    window.open(`${API_URL}/sales/delivery-notes/${id}/pdf?format=preprinted&token=${token}`, "_blank");
  };

  const fmtValue = (val) => {
    return Number(val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmt = (val) => {
    return `${currency === 'USD' ? 'US$' : '$'} ${fmtValue(val)}`;
  };

  if (loading && mode === "edit") return <LoadingScreen message="Cargando Remito..." />;

  const isLocked = status === 'INVOICED' || status === 'COMPLETED';
  const progressInvoiced = items.reduce((acc, i) => acc + (parseFloat(i.qty_invoiced) || 0), 0) / (items.reduce((acc, i) => acc + (parseFloat(i.qty) || 0), 0) || 1) * 100;
  const progressPaid = invoices.filter(i => i.status === 'PAID' || i.status === 'CLOSED').length > 0 ? 100 : 0;

  return (
    <>
      <div className={`${s.formCard} ${isStandalone ? s.formCardStandalone : ''}`} style={isLocked ? { pointerEvents: 'none' } : {}}>
          {isLocked && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'rgba(37, 99, 235, 0.05)', color: '#1d4ed8', padding: '8px 24px', fontSize: 10, fontWeight: 900, textAlign: 'center', borderBottom: '1px solid rgba(37, 99, 235, 0.1)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, backdropFilter: 'blur(4px)' }}>
                <Receipt size={14} /> DOCUMENTO BLOQUEADO POR FACTURACIÓN. NO SE PERMITEN MODIFICACIONES.
                <button style={{ pointerEvents: 'auto', background: 'none', border: 'none', color: '#1d4ed8', textDecoration: 'underline', cursor: 'pointer', marginLeft: 12, fontSize: 10, fontWeight: 950 }} onClick={() => closeWindow(windowId)}>SALIR</button>
            </div>
          )}
              {/* Header Section */}
          <div className={s.headerLine} style={{ paddingBottom: 12, borderBottom: '1px solid var(--border-color)', marginBottom: 12, paddingTop: isLocked ? 40 : 0 }}>
              <div className={s.compactHeaderTitle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <h1 style={{ fontSize: '15px', margin: 0, fontWeight: 900, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          {mode === 'new' ? 'Nuevo Remito de Venta' : `Remito de Venta`}
                          {isReadOnly && <span className={s.readOnlyBadge}>MODO VISTA</span>}
                      </h1>
                      <div className={s.headerMeta}>
                          <span>{mode === 'new' ? 'Nuevo Remito' : `RE ${joinFullNumber(pv, number)}`}</span>
                          <span>&middot;</span>
                          <span>{date ? (date.includes('T') ? new Date(date).toLocaleDateString('es-AR') : date.split('-').reverse().join('/')) : 'S/F'}</span>
                          <TraceabilityStatusBadge status={status} />
                      </div>
                  </div>
              </div>
              <div className={s.headerActions}>
                  {isReadOnly ? (
                    <button 
                      className={s.saveBtn} 
                      style={{ background: '#64748b', cursor: 'pointer' }} 
                      onClick={() => {
                        if (isLocked) {
                          showToast("Atención: este remito está bloqueado por facturación.", "warning");
                        } else {
                          setIsReadOnly(false);
                        }
                      }}
                      title="Activar modo edición"
                      disabled={isLocked}
                    >
                        <Pencil size={16} />
                        Editar
                    </button>
                  ) : (
                    <button className={s.saveBtn} onClick={handleSave} disabled={isLocked || saving} style={isLocked ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
                        {saving ? <div className={s.spinnerSmall} /> : <Save size={16} />}
                        {saving ? "Guardando..." : "Guardar"}
                    </button>
                  )}
                  <div className={s.actionGroup}>
                      <button className={s.actionBtn} disabled={!id || isLocked} onClick={async () => {
                          if (!window.confirm("¿Estás seguro de anular este remito? Esta acción no se puede deshacer.")) return;
                          try {
                              const token = localStorage.getItem("token");
                              const res = await fetch(`${API_URL}/sales/delivery-notes/${id}/cancel`, { 
                                  method: "POST", headers: { Authorization: `Bearer ${token}` } 
                              });
                              if (res.ok) {
                                  window.dispatchEvent(new CustomEvent("delivery-note-changed"));
                                  closeWindow(windowId);
                              }
                          } catch (e) {
                              console.error(e);
                          }
                      }} title="Anular Remito" style={{ color: '#ef4444' }}>
                          <Trash2 size={18} />
                      </button>
                      <button className={s.actionBtn} disabled={!id} onClick={handlePrintPreprinted} title="Imprimir Remito">
                          <Printer size={18} />
                      </button>
                      <button className={s.actionBtn} onClick={() => closeWindow(windowId)} title="Volver">
                          <X size={18} />
                      </button>
                  </div>
              </div>
          </div>
          {/* Alertas */}
          {!isReadOnly && sourceType === 'sales-order' && ovHasInvoices && (
              <div style={{ margin: '0 24px 16px', padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px', color: '#1e3a8a', fontSize: '14px', fontWeight: 500 }}>
                  <span style={{ fontSize: '18px' }}>ℹ️</span>
                  Esta orden de venta ya tiene una factura asociada. El remito se vinculará automáticamente a esa factura.
              </div>
          )}

          {/* Body: 2 Column Layout */}
          <div className={s.bodyTwoColumns} style={{ opacity: isLocked ? 0.8 : 1 }}>
              {/* Columna Izquierda: Ítems y Productos */}
              <div className={s.leftCol}>
                  <div className={s.bentoContainer} style={{ padding: 0, overflow: 'hidden', flex: 1, minHeight: 0 }}>
                      {items.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {isReadOnly ? null : (
                                <div className={s.tableHeader} style={{ gridTemplateColumns: isReadOnly ? 'minmax(360px, 1fr) 80px 90px 45px 90px 100px' : 'minmax(360px, 1fr) 80px 90px 45px 90px 100px 30px', width: '100%', boxSizing: 'border-box' }}>
                                    <div className={s.th}>Producto</div>
                                    <div className={s.th} style={{ textAlign: 'left' }}>Cant.</div>
                                    <div className={s.th} style={{ textAlign: 'right' }}>Remitir</div>
                                    <div className={s.th} style={{ textAlign: 'center' }}>Un.</div>
                                    <div className={s.th} style={{ textAlign: 'right' }}>P.Unit</div>
                                    <div className={s.th} style={{ textAlign: 'right' }}>Subtotal</div>
                                    <div></div>
                                </div>
                            )}
                            <div className={s.itemsList}>
                                {items.map(item => {
                                    if (isReadOnly) {
                                        const qtyOrdered = parseFloat(item.qty_ordered) || 0;
                                        const qtyDelivered = parseFloat(item.qty_delivered) || 0;
                                        const qtyPending = parseFloat(item.qty_pending) || 0;
                                        
                                        const qtyPackages = item.qty_packages;
                                        const qty = item.qty || 0;
                                        const hasPackages = qtyPackages !== undefined && qtyPackages !== null;
                                        
                                        const totalQty = qty;
                                        const subtotalNeto = totalQty * (item.unit_price || 0) * (1 - (item.discount_pct || 0)/100);
                                        const vatAmount = subtotalNeto * (item.vat_rate || 0.21);
                                        const totalAmount = subtotalNeto + vatAmount;
                                        
                                        return (
                                            <div key={item.id} style={{ display: 'flex', flexDirection: 'column', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', gap: 8 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div>
                                                        <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b' }}>Producto: {item.name || item.product?.name || item.description || ''}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 8, fontSize: 10, fontWeight: 800, background: '#f8fafc', padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                                                        <span style={{ color: '#64748b' }}>Ped: {qtyOrdered.toFixed(2)}</span>
                                                        <span style={{ color: '#059669' }}>Rem: {qtyDelivered.toFixed(2)}</span>
                                                        <span style={{ color: qtyPending > 0 ? '#d97706' : '#059669' }}>Pte: {qtyPending.toFixed(2)}</span>
                                                    </div>
                                                </div>
                                                
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 24px', fontSize: 12, color: '#475569', alignItems: 'center' }}>
                                                                                    <div><span style={{ fontWeight: 800 }}>Cantidad:</span> {totalQty.toFixed(2)} {item._unit_label || 'u'}</div>
                                                    {Number(item._unit_content || 1) > 1 && (
                                                        <div><span style={{ fontWeight: 800 }}>Equivalencia:</span> {getDisplayPackages(item)}</div>
                                                    )}
                                                    
                                                    <div><span style={{ fontWeight: 800 }}>Precio:</span> {fmt(item.unit_price)} / {item._unit_label || 'u'}</div>
                                                    <div><span style={{ fontWeight: 800 }}>Subtotal:</span> {fmt(subtotalNeto)}</div>
                                                    <div><span style={{ fontWeight: 800 }}>IVA:</span> {fmt(vatAmount)}</div>
                                                    <div style={{ color: 'var(--primary)', fontWeight: 900 }}><span style={{ fontWeight: 800, color: '#1e293b' }}>Total:</span> {fmt(totalAmount)}</div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    
                                  const isExceeding = mode === 'new' && item.qty > (item.qty_pending || 0);
                                  return (
                                    <div key={item.id} className={s.tableRow} style={{ gridTemplateColumns: isReadOnly ? 'minmax(360px, 1fr) 80px 90px 45px 90px 100px' : 'minmax(360px, 1fr) 80px 90px 45px 90px 100px 30px', background: isExceeding ? '#fef2f2' : 'transparent', width: '100%', boxSizing: 'border-box' }}>
                                        <div style={{ padding: '4px 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
                                            <div style={{ fontSize: 11, fontWeight: 900, color: '#1e293b', lineHeight: 1.1, whiteSpace: 'normal', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {item.name || item.product?.name || item.description}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', fontSize: 11, lineHeight: 1.15, height: '100%' }}>
                                            <div style={{ color: '#64748b' }}><span style={{ fontWeight: 800 }}>Ped:</span> {item.qty_ordered || 0}</div>
                                            <div style={{ color: 'var(--ok)' }}><span style={{ fontWeight: 800 }}>Rem:</span> {item.qty_delivered || 0}</div>
                                            <div style={{ color: (item.qty_pending || 0) > 0 ? 'var(--warning)' : 'var(--ok)' }}><span style={{ fontWeight: 800 }}>Pte:</span> {(item.qty_pending || 0).toFixed(2)}</div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                            <input type="number" step="0.01" min="0" max={item.qty_pending || 0} className={s.tableInput} value={
            item.qty_packages !== undefined ? item.qty_packages : (
              Number(item._unit_content) > 1 ? (Number(item.qty) || 0) / Number(item._unit_content) : (item.qty || 0)
            )
          } onChange={(e) => updateItem(item.id, 'qty_packages', e.target.value)} readOnly={isReadOnly || mode === 'edit'} style={{ background: (isReadOnly || mode === 'edit') ? 'transparent' : '#fff', textAlign: 'right', fontWeight: 800, color: isExceeding ? '#ef4444' : 'var(--primary)', width: 78, border: isExceeding ? '1px solid #ef4444' : '1px solid var(--border-color)', paddingRight: 8, borderRadius: 6, height: 30 }} />
                                            {item._unit_content > 1 && (
                                                <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>
                                                    = {(item.qty || 0).toFixed(2)} {item._unit_label || 'u'}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', fontSize: 10 }}>
                                            {item._unit_label || item.unit_short_name || 'u'}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', color: '#64748b', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, minWidth: 0 }}>
                                            {Number(item.unit_price || 0).toLocaleString('es-AR', { style: 'currency', currency: item.currency || currency || 'ARS' })}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', color: 'var(--text)', fontWeight: 800, whiteSpace: 'nowrap', fontSize: 11, minWidth: 0 }}>
                                            {(Number(item.qty || 0) * Number(item.unit_price || 0)).toLocaleString('es-AR', { style: 'currency', currency: item.currency || currency || 'ARS' })}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {!isReadOnly && mode === 'new' && (
                                                <button style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }} onClick={() => removeItem(item.id)}>
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                  );
                                })}
                            </div>
                        </div>
                      ) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', minHeight: 80 }}>
                            <Package size={24} style={{ marginBottom: 8, opacity: 0.3, color: 'var(--text-secondary)' }} />
                            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>Sin ítems cargados</div>
                        </div>
                      )}
                  </div>

                  {/* Observaciones (Mismo ancho que productos, altura fija y flex-shrink 0) */}
                  <div className={s.sideBlock} style={{ height: 80, display: 'flex', flexDirection: 'row', gap: 16, alignItems: 'center', padding: '8px 16px', flexShrink: 0 }}>
                      <div className={s.sideBlockTitle} style={{ margin: 0, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                          <ClipboardList size={14} /> OBSERVACIONES
                      </div>
                      <div style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'center' }}>
                          {isReadOnly ? (
                              <div style={{ fontSize: 12, color: observations ? 'var(--text)' : '#64748b', fontStyle: observations ? 'normal' : 'italic' }}>
                                  {observations || 'Sin observaciones'}
                              </div>
                          ) : (
                              <textarea
                                  style={{ width: '100%', height: '100%', minHeight: 'unset', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: '#fff', resize: 'none', fontSize: 12, boxSizing: 'border-box' }}
                                  value={observations}
                                  onChange={e => setObservations(e.target.value)}
                                  placeholder="Añadir observaciones logísticas o referencias..."
                              />
                          )}
                      </div>
                  </div>
              </div>

              {/* Columna Derecha: Panel Lateral Administrativo */}
              <div className={s.rightCol}>
                  {/* Bloque Cliente */}
                  <div className={s.sideBlock}>
                      <div className={s.sideBlockTitle}><User size={12}/> CLIENTE</div>
                      <div className={s.sideField}>
                          <label>NOMBRE</label>
                          {isReadOnly || sourceId ? (
                              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)', textAlign: 'right' }}>{entity?.name || '-'}</div>
                          ) : (
                              <div style={{ flex: 1 }}>
                                  <Autocomplete onSearch={searchEntities} onSelect={setEntity} initialValue={entity} placeholder="Buscar..." minChars={0} variant="glass" />
                              </div>
                          )}
                      </div>
                      <div className={s.sideField}>
                          <label>PTO. VENTA</label>
                          {isReadOnly || sourceId ? <div className={s.sideInput}>{pv}</div> : (
                              <select className={s.sideSelect} value={pv} onChange={(e) => { setPv(e.target.value); fetchNextNumber(e.target.value); }}>
                                  {pointsOfSale.map(p => <option key={p.pv} value={p.pv}>{p.pv}</option>)}
                              </select>
                          )}
                      </div>
                      <div className={s.sideField}>
                          <label>NÚMERO</label>
                          {isReadOnly ? <div className={s.sideInput}>{number}</div> : (
                              <input className={s.sideInput} value={number.includes("-") ? number.split("-")[1] : number} onChange={e => setNumber(`${pv}-${padNumber(e.target.value)}`)} />
                          )}
                      </div>
                      <div className={s.sideField}>
                          <label>FECHA</label>
                          {isReadOnly ? <div className={s.sideInput}>{date ? (date.includes('T') ? new Date(date).toLocaleDateString('es-AR') : date.split('-').reverse().join('/')) : '-'}</div> : (
                              <input type="date" className={s.sideInput} value={date} onChange={e => setDate(e.target.value)} />
                          )}
                      </div>
                      <div className={s.sideField}>
                          <label>DEPÓSITO</label>
                          {isReadOnly ? <div className={s.sideInput}>{warehouses.find(w => w.id === warehouseId)?.name || warehouseId}</div> : (
                              <select className={s.sideSelect} value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                                  <option value="">Seleccionar...</option>
                                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                              </select>
                          )}
                      </div>
                  </div>

                  {/* Bloque Operativo / Logística */}
                  <div className={s.sideBlock}>
                      <div className={s.sideBlockTitle}><Truck size={12}/> LOGÍSTICA Y TRANSPORTE</div>
                      <div className={s.sideField}>
                          <label>TRANSPORTE</label>
                          {isReadOnly ? <div className={s.sideInput}>{transporter || '-'}</div> : (
                              <input className={s.sideInput} value={transporter} onChange={e => setTransporter(e.target.value)} placeholder="Ej: Vía Cargo" />
                          )}
                      </div>
                      <div className={s.sideField}>
                          <label>CHOFER</label>
                          {isReadOnly ? <div className={s.sideInput}>{vehicleDriver || '-'}</div> : (
                              <input className={s.sideInput} value={vehicleDriver} onChange={e => setVehicleDriver(e.target.value)} placeholder="Ej: Juan Pérez" />
                          )}
                      </div>
                      <div className={s.sideField}>
                          <label>PATENTE</label>
                          {isReadOnly ? <div className={s.sideInput}>{vehiclePlate || '-'}</div> : (
                              <input className={s.sideInput} value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)} placeholder="Ej: AB123CD" />
                          )}
                      </div>
                  </div>
              </div>
          </div>


          {/* Relations Bar: OV → REMITO → FACTURA → STOCK */}
          <div className={s.relationsBar}>

            {/* ORDEN DE VENTA */}
            {sourceId ? (
              <div
                className={s.relationCard}
                onClick={() => { if (sourceOrderId) openEditOrdenVenta(sourceOrderId, { title: `Pedido ${sourceId}`, width: 1200 }); }}
              >
                <div className={s.nodeTitle} style={{ color: '#2563eb' }}>ORDEN DE VENTA</div>
                <div className={s.nodeBadge}>● Vinculada</div>
                <div className={s.nodeMetric} style={{ color: '#0f172a', marginTop: 'auto' }}>{sourceId}</div>
              </div>
            ) : (
              <div className={s.relationCard} style={{ cursor: 'default' }}>
                <div className={s.nodeTitle} style={{ color: '#94a3b8' }}>ORDEN DE VENTA</div>
                <div className={s.nodeBadge} style={{ color: '#94a3b8', background: '#f1f5f9' }}>Sin vinculación</div>
                <div className={s.nodeMetric} style={{ color: '#cbd5e1', marginTop: 'auto' }}>Remito directo</div>
              </div>
            )}

            <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

            {/* REMITO — documento actual */}
            <div className={s.relationCard} style={{ border: '1.5px solid #2563eb', background: '#eff6ff' }}>
              <div className={s.nodeTitle} style={{ color: '#2563eb' }}>REMITO</div>
              <div className={s.nodeBadge} style={{ color: '#2563eb', background: '#dbeafe' }}>● Documento Actual</div>
              <div className={s.nodeMetric} style={{ color: '#0f172a', marginTop: 'auto' }}>{number || '(nuevo)'}</div>
              <div className={s.nodeMetric}>{date ? date.split('-').reverse().join('/') : 'S/F'}</div>
            </div>

            <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

            {/* FACTURA */}
            {invoices.length > 0 ? (
              <div 
                className={s.relationCard} 
                onClick={() => invoices.length === 1 && openNuevaFactura({ id: invoices[0].id })}
                style={{ cursor: invoices.length === 1 ? 'pointer' : 'default', border: progressInvoiced >= 100 ? '1.5px solid #10b981' : '1.5px solid #f97316' }}
              >
                <div className={s.nodeTitle} style={{ color: progressInvoiced >= 100 ? '#10b981' : '#f97316' }}>FACTURA</div>
                <div className={s.nodeBadge} style={{ background: progressInvoiced >= 100 ? '#d1fae5' : '#ffedd5', color: progressInvoiced >= 100 ? '#059669' : '#c2410c' }}>
                  {progressInvoiced >= 100 ? '● Vinculada Total' : '● Vinculada Parcial'}
                </div>
                <div className={s.nodeMetric} style={{ color: '#0f172a', marginTop: 'auto' }}>
                  {invoices.length === 1 ? invoices[0].number || 'S/N' : `${invoices.length} facturas`}
                </div>
                {mode === 'edit' && progressInvoiced < 100 && (
                  <button className={s.relationAction} onClick={(e) => { e.stopPropagation(); handleOpenInvoiceModal(); }}>Generar Resto</button>
                )}
              </div>
            ) : (
              <div className={s.relationCard}>
                <div className={s.nodeTitle} style={{ color: '#0b132b' }}>FACTURA</div>
                <div className={s.nodeStatus} style={{ color: '#eab308' }}>Pendiente</div>
                <div className={s.nodeMetric} style={{ color: '#0f172a' }}>0 factura(s) · 0%</div>
                {mode === 'edit' && (
                  <button className={s.relationAction} onClick={(e) => { e.stopPropagation(); handleOpenInvoiceModal(); }}>Generar</button>
                )}
              </div>
            )}

            <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

            {/* STOCK */}
            <div className={s.relationCard}>
              <div className={s.nodeTitle} style={{ color: status === 'DISPATCHED' || status === 'INVOICED' ? '#10b981' : '#0b132b' }}>STOCK</div>
              <div className={s.nodeStatus} style={{ color: status === 'DISPATCHED' || status === 'INVOICED' ? '#10b981' : '#eab308' }}>
                {status === 'DISPATCHED' || status === 'INVOICED' ? 'Descontado' : mode === 'new' ? 'Se descontará al guardar' : 'Pendiente'}
              </div>
              <div className={s.nodeMetric} style={{ color: '#0f172a' }}>
                {items.reduce((acc, i) => acc + (parseFloat(i.qty) || 0), 0).toFixed(2)} u. · {warehouses.find(w => w.id === warehouseId)?.name || 'S/D'}
              </div>
            </div>
          </div>

          {/* Operational Summary Panel */}
          <div className={s.summaryPanel}>
            <div className={s.summaryItem}>
              <div className={s.summaryLabel}>CLIENTE</div>
              <div className={s.summaryValue} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>{entity?.name || '-'}</div>
            </div>
            <div className={s.summaryItem}>
              <div className={s.summaryLabel}>DEPÓSITO</div>
              <div className={s.summaryValue}>{warehouses.find(w => w.id === warehouseId)?.name || '-'}</div>
            </div>
            <div className={s.summaryItem}>
              <div className={s.summaryLabel}>ITEMS</div>
              <div className={s.summaryValue}>{items.length} ({orderedLts.toFixed(2)} u.)</div>
            </div>
            <div className={s.summaryItem}>
              <div className={s.summaryLabel}>ESTADO</div>
              <div className={s.summaryValue} style={{ color: mode === 'new' ? '#f97316' : (status === 'DISPATCHED' ? '#10b981' : '#94a3b8') }}>
                {mode === 'new' ? 'Pendiente de guardar' : status}
              </div>
            </div>
            <div className={s.summaryItem}>
              <div className={s.summaryLabel}>ORIGEN</div>
              <div className={s.summaryValue}>{sourceId ? `OV ${sourceId}` : 'Directo'}</div>
            </div>
            <div className={s.summaryItem}>
              <div className={s.summaryLabel}>TRANSPORTE</div>
              <div className={s.summaryValue}>{transporter || '-'}</div>
            </div>
            <div className={s.summaryItem}>
              <div className={s.summaryLabel}>MODIFICACIÓN</div>
              <div className={s.summaryValue}>{new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</div>
            </div>
          </div>

          {/* Footer Compact: Totales */}
          <div className={s.footerCompact}>
            <div className={s.footerCompactItem}>
              <span className={s.footerCompactLabel}>TOTAL UNIDADES</span>
              <span className={s.footerCompactValue}>{items.reduce((acc, l) => acc + (Number(l.qty) || 0), 0).toFixed(2)} u.</span>
            </div>
            <div className={s.footerCompactItem}>
              <span className={s.footerCompactLabel}>NETO GRAVADO</span>
              <span className={s.footerCompactValue}>{fmt(totals.net)}</span>
            </div>
            <div className={s.footerCompactItem}>
              <span className={s.footerCompactLabel} style={{ color: 'var(--primary)' }}>SUBTOTAL VALORIZADO</span>
              <span className={s.footerCompactTotal}>{fmt(totals.total)}</span>
            </div>
          </div>
      </div>

      {/* Invoicing Selection Modal */}
      <Modal open={showInvoiceModal} title="Seleccionar ítems a facturar" onClose={() => setShowInvoiceModal(false)} wide>
        <div style={{ padding: '0 24px 24px' }}>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, fontWeight: 600 }}>
            Seleccioná los productos y cantidades que querés incluir en esta factura.
            Lo que no factures quedará como <strong>pendiente</strong> en este remito.
          </p>

          <div style={{ borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '32px 2fr 110px 110px 110px 140px', gap: 12, padding: '10px 16px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontSize: 10, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', alignItems: 'center' }}>
              <div></div>
              <div>PRODUCTO</div>
              <div style={{ textAlign: 'center' }}>REMITIDO</div>
              <div style={{ textAlign: 'center' }}>YA FACT.</div>
              <div style={{ textAlign: 'center' }}>PENDIENTE</div>
              <div style={{ textAlign: 'center' }}>A FACTURAR AHORA</div>
            </div>
            {items.map(item => {
              const qtyInvoicedUnits = parseFloat(item.qty_invoiced || 0);
              const qtyOrderedUnits = parseFloat(item.qty || 0);
              const factor = parseFloat(item._unit_content || item.quantity_per_container || 1);
              const orderedPkgs = factor > 1 ? qtyOrderedUnits / factor : qtyOrderedUnits;
              const invoicedPkgs = factor > 1 ? qtyInvoicedUnits / factor : qtyInvoicedUnits;
              const pendingPkgs = Math.max(0, orderedPkgs - invoicedPkgs);
              const currentQty = invoiceQtys[item.id] !== undefined ? invoiceQtys[item.id] : pendingPkgs;
              const isSelected = currentQty > 0;
              const unitLabel = item._unit_label || 'u';

              return (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '32px 2fr 110px 110px 110px 140px', gap: 12, padding: '14px 16px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', background: isSelected ? '#f5f3ff' : '#fff', transition: 'background 0.15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    {pendingPkgs > 0 ? (
                      <button
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: isSelected ? '#7c3aed' : '#cbd5e1', padding: 0 }}
                        onClick={() => {
                          if (isSelected) {
                            setInvoiceQtys(prev => ({ ...prev, [item.id]: 0 }));
                          } else {
                            setInvoiceQtys(prev => ({ ...prev, [item.id]: pendingPkgs }));
                          }
                        }}
                      >
                        {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                      </button>
                    ) : (
                      <Check size={18} style={{ color: '#059669' }} title="Totalmente facturado" />
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>{item.product?.name || item.name || item.description || 'Sin nombre'}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>{item.product?.brand?.name || item.brand}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>{orderedPkgs} env.</div>
                    {factor > 1 && <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8' }}>{qtyOrderedUnits} {unitLabel}</div>}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>{invoicedPkgs} env.</div>
                    {factor > 1 && <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8' }}>{qtyInvoicedUnits} {unitLabel}</div>}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: pendingPkgs > 0 ? '#7c3aed' : '#059669' }}>{pendingPkgs.toFixed(2)} env.</div>
                    {factor > 1 && <div style={{ fontSize: 10, fontWeight: 600, color: pendingPkgs > 0 ? '#7c3aed' : '#059669' }}>{(pendingPkgs * factor).toFixed(1)} {unitLabel}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                    {pendingPkgs > 0 ? (
                      <>
                        <input
                          type="number"
                          min={0}
                          max={pendingPkgs}
                          step="any"
                          value={currentQty}
                          onChange={e => {
                            const val = Math.min(parseFloat(e.target.value) || 0, pendingPkgs);
                            setInvoiceQtys(prev => ({ ...prev, [item.id]: val }));
                          }}
                          style={{ width: 90, padding: '6px 10px', borderRadius: 10, border: `2px solid ${isSelected ? '#7c3aed' : '#e2e8f0'}`, textAlign: 'center', fontWeight: 800, fontSize: 14, color: '#1e293b', background: '#fff', outline: 'none' }}
                        />
                        {factor > 1 && <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>= {(currentQty * factor).toFixed(2)} {unitLabel}</div>}
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>
              {Object.values(invoiceQtys).filter(q => q > 0).length} ítems seleccionados para facturar
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowInvoiceModal(false)} style={{ padding: '10px 22px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button
                onClick={handleConfirmInvoice}
                style={{ padding: '10px 24px', borderRadius: 12, border: 'none', background: '#7c3aed', color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Receipt size={16} /> Ir a Facturar
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Item Selector Modal omitted for brevity if it's identical, wait I must include it because it was in the original */}
      {showItemSelector && (
          <Modal title="Vincular Ítems de Origen" onClose={() => setShowItemSelector(false)} width="1100px">
             <div style={{ padding: '0 24px 24px' }}>
                {selectorLoading ? (
                   <div style={{ padding: 60, textAlign: 'center', color: '#64748b', fontWeight: 600 }}>Sincronizando pedidos abiertos...</div>
                ) : (
                   <>
                      <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center' }}>
                         <div style={{ flex: 1, position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <Input 
                                placeholder="🔍 Filtrar por producto o pedido..." 
                                style={{ paddingLeft: 40 }}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)} 
                                variant="glass" 
                            />
                         </div>
                         <Button variant="primary" style={{ height: 40, background: '#2563eb' }} disabled={selectedSelectorItems.length === 0} onClick={handleLinkSelected}>
                            VINCULAR {selectedSelectorItems.length} SELECCIONADOS
                         </Button>
                      </div>

                      <div className={t.tableWrap} style={{ borderRadius: 24, border: '1px solid #e2e8f0', boxShadow: '0 15px 25px -5px rgba(0,0,0,0.08)' }}>
                        <table className={t.table}>
                           <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                              <tr style={{ background: '#f8fafc', fontSize: 10, letterSpacing: '0.02em', color: '#64748b' }}>
                                 <th rowSpan="2" style={{ width: 40, borderBottom: '2px solid #cbd5e1' }}>
                                    <input type="checkbox" onChange={(e) => {
                                       if (e.target.checked) setSelectedSelectorItems(selectableItems);
                                       else setSelectedSelectorItems([]);
                                    }} checked={selectedSelectorItems.length === selectableItems.length && selectableItems.length > 0} />
                                 </th>
                                 <th rowSpan="2" style={{ borderBottom: '2px solid #cbd5e1' }}>ORIGEN</th>
                                 <th rowSpan="2" style={{ borderBottom: '2px solid #cbd5e1', minWidth: 200 }}>PRODUCTO / ESPECIFICACIÓN</th>
                                 <th colSpan="3" style={{ textAlign: 'center', background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', padding: '12px 0' }}>UNIDAD DE MEDIDA ({selectableItems[0]?.unit_short_name || 'u'})</th>
                                 <th colSpan="3" style={{ textAlign: 'center', background: '#eff6ff', borderBottom: '1px solid #cbd5e1', padding: '12px 0' }}>CONTENEDORES ({selectableItems[0]?.container_name || 'u'})</th>
                              </tr>
                              <tr style={{ background: '#f8fafc', fontSize: 9 }}>
                                 <th style={{ textAlign: 'center', width: 75, background: '#f1f5f9', fontWeight: 800 }}>PEDIDO</th>
                                 <th style={{ textAlign: 'center', width: 75, background: '#f1f5f9', fontWeight: 800 }}>REMITIDO</th>
                                 <th style={{ textAlign: 'center', width: 75, background: '#f1f5f9', color: '#2563eb', fontWeight: 900 }}>DISP.</th>
                                 <th style={{ textAlign: 'center', width: 75, background: '#eff6ff', fontWeight: 800 }}>PEDIDO</th>
                                 <th style={{ textAlign: 'center', width: 75, background: '#eff6ff', fontWeight: 800 }}>REMITIDO</th>
                                 <th style={{ textAlign: 'center', width: 75, background: '#eff6ff', color: '#2563eb', fontWeight: 900 }}>DISP.</th>
                              </tr>
                           </thead>
                           <tbody style={{ fontSize: '0.9em' }}>
                              {selectableItems.filter(i => 
                                 i.product_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                 i.parent_number.toLowerCase().includes(searchTerm.toLowerCase())
                              ).length === 0 ? (
                                 <tr>
                                    <td colSpan="10" style={{ padding: 80, textAlign: 'center', color: '#94a3b8' }}>
                                       <ShoppingCart size={64} style={{ opacity: 0.1, marginBottom: 20 }} />
                                       <div style={{ fontSize: 16, fontWeight: 700 }}>No hay ítems pendientes</div>
                                       <div style={{ fontSize: 12 }}>Asegúrese de que el cliente tenga pedidos confirmados.</div>
                                    </td>
                                 </tr>
                              ) : (
                                 selectableItems.filter(i => 
                                     i.product_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                     i.parent_number.toLowerCase().includes(searchTerm.toLowerCase())
                                 ).map((item) => {
                                    const factor = item.quantity_per_container || 1;
                                    const c_total = item.qty / factor;
                                    const c_rem = item.qty_fulfilled / factor;
                                    const c_disp = item.qty_pending / factor;
                                    
                                    return (
                                       <tr key={item.id} style={{ height: 70, transition: 'all 0.2s', background: selectedSelectorItems.some(si => si.id === item.id) ? '#f0f9ff' : 'transparent' }}>
                                          <td style={{ textAlign: 'center' }}>
                                             <input type="checkbox" checked={selectedSelectorItems.some(si => si.id === item.id)} readOnly style={{ pointerEvents: 'none' }} />
                                          </td>
                                          <td onClick={() => {
                                             if (selectedSelectorItems.some(si => si.id === item.id)) {
                                                setSelectedSelectorItems(prev => prev.filter(si => si.id !== item.id));
                                             } else {
                                                setSelectedSelectorItems(prev => [...prev, item]);
                                             }
                                          }}>
                                             <Badge color="blue" variant="outline" style={{ fontWeight: 900 }}>{item.parent_number}</Badge>
                                             <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, fontWeight: 700 }}>{new Date(item.date).toLocaleDateString()}</div>
                                          </td>
                                          <td onClick={() => {
                                             if (selectedSelectorItems.some(si => si.id === item.id)) {
                                                setSelectedSelectorItems(prev => prev.filter(si => si.id !== item.id));
                                             } else {
                                                setSelectedSelectorItems(prev => [...prev, item]);
                                             }
                                          }}>
                                             <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b' }}>{item.product_name}</div>
                                             <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{item.description}</div>
                                          </td>
                                          <td style={{ textAlign: 'center', background: '#f8fafc', color: '#64748b', fontWeight: 800 }}>{item.qty.toLocaleString()}</td>
                                          <td style={{ textAlign: 'center', background: '#f8fafc', color: '#94a3b8', fontWeight: 800 }}>{item.qty_fulfilled.toLocaleString()}</td>
                                          <td style={{ textAlign: 'center', background: '#f1f5f9', color: '#2563eb', fontWeight: 950 }}>{item.qty_pending.toLocaleString()}</td>
                                          <td style={{ textAlign: 'center', background: '#fafbfc', color: '#64748b', fontWeight: 800 }}>{c_total.toLocaleString()}</td>
                                          <td style={{ textAlign: 'center', background: '#fafbfc', color: '#94a3b8', fontWeight: 800 }}>{c_rem.toLocaleString()}</td>
                                          <td style={{ textAlign: 'center', background: '#eff6ff', color: '#2563eb', fontWeight: 950 }}>{c_disp.toLocaleString()}</td>
                                       </tr>
                                    );
                                 })
                              )}
                           </tbody>
                        </table>
                      </div>
                   </>
                )}
             </div>
          </Modal>
        )}
    </>
  );
}
