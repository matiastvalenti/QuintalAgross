import React, { useState, useEffect, useMemo } from "react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import Autocomplete from "../../components/ui/Autocomplete";
import Modal from "../../components/ui/Modal";
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
  Receipt,
  FileText,
  Printer,
  Mail,
  X,
  Search,
  Building,
  CreditCard,
  MapPin,
  Calendar,
  User,
  ShoppingBag,
  MoreVertical,
  History,
  Info,
  Link2,
  Link2Off,
  ClipboardList,
  Truck,
  ShoppingCart,
  ReceiptText,
  Check,
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowUpRight,
  Pencil,
  Activity,
  Landmark,
  BadgeDollarSign
} from "lucide-react";
import s from "./InvoiceForm.module.css";
import t from "../../components/ui/Table.module.css";
import LoadingScreen from "../../components/ui/LoadingScreen";
import { TraceabilityStatusBadge, TraceabilityProgress } from "../../components/ui/TraceabilityStatusBadge";

export default function InvoiceForm(props) {
  const {
    mode: initialMode = "new",
    id: initialId = null,
    windowId,
    initialSourceType = null,
    initialSourceId = null,
    initialEntityId = null,
    initialDocType = null,
    autoOpenSelector = false,
    preselectedLines = null,
    initialEntity = null,
    initialLines = null,
  } = props;
  const { closeWindow, openWindow } = useWindow();
  const { showToast } = useToast();
  const { costCenter } = useCostCenter();

  const [mode, setMode] = useState(initialMode);
  const [id, setId] = useState(initialId);
  const [loading, setLoading] = useState(mode === "edit");
  const [activeTab, setActiveTab] = useState("items"); // items | linking | timeline | details
  const [timeline, setTimeline] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [sourceId, setSourceId] = useState(initialSourceId || "");
  const [sourceType, setSourceType] = useState(initialSourceType || "");

  // --- Header Data ---
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);
  const [ctroCosto, setCtroCosto] = useState(String(costCenter || 1));
  const [entity, setEntity] = useState(initialEntity);
  const [pv, setPv] = useState("0001");
  const [number, setNumber] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [observations, setObservations] = useState("");
  const [selectedConditionId, setSelectedConditionId] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [docType, setDocType] = useState(initialDocType || "INVOICE"); // INVOICE=Factura, ND=Debito, NC=Credito
  const [letter, setLetter] = useState("A");
  const [isReadOnly, setIsReadOnly] = useState(mode === "edit");

  // --- Lists ---
  const [warehouses, setWarehouses] = useState([]);
  const [saleConditions, setSaleConditions] = useState([]);
  const [pointsOfSale, setPointsOfSale] = useState([]);
  const [progress, setProgress] = useState({ delivered: 0, invoiced: 0, paid: 0 });

  const [items, setItems] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [salespersonId, setSalespersonId] = useState("");
  const [salesOrders, setSalesOrders] = useState([]);
  const [deliveryNotes, setDeliveryNotes] = useState([]);

  // --- Modal Selector State ---
  const [showItemSelector, setShowItemSelector] = useState(false);
  const [selectableItems, setSelectableItems] = useState([]);
  const [selectorLoading, setSelectorLoading] = useState(false);
  const [selectorType, setSelectorType] = useState("RE"); // RE=Remito, OV=Pedido
  const [selectedSelectorItems, setSelectedSelectorItems] = useState([]);
  const [selectorQuantities, setSelectorQuantities] = useState({}); // { itemId: qty }
  const [searchTerm, setSearchTerm] = useState("");

  // --- Payment State ---
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payExchangeRate, setPayExchangeRate] = useState(1);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [balance, setBalance] = useState(0);
  const [isFxAdjustment, setIsFxAdjustment] = useState(false);

  // --- Calculations ---
  const totals = useMemo(() => {
    // Si es ajuste solo IVA por dif de cambio, y tiene líneas, el neto se ignora en el cálculo de deuda USD (backend),
    // pero aquí calculamos los totales visuales del documento.
    return items.reduce(
      (acc, i) => {
        const factor = i._unit_content || 1;
        const sub = (i.qty || 0) * factor * (i.unit_price || 0);
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

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
      if (mode === "new" && initialLines && initialLines.length > 0) {
          const mappedLines = initialLines
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
  }, [initialLines, mode]);

  useEffect(() => {
    if (mode === "edit" && id && !String(id).startsWith(":") && id !== "-1" && id !== -1) fetchInvoice();
    else if (mode === "new") {
        fetchExchangeRate();
         if (initialSourceType && initialSourceId) {
             if (preselectedLines) {
                 handleLoadPreselectedLines(preselectedLines);
             } else if (autoOpenSelector) {
                 // If autoOpenSelector is true, we fetch header info first
                 fetchHeaderFromSource();
             } else {
                 fetchFromSource();
             }
         }
        else if (initialEntityId) fetchClient(initialEntityId);
    }
  }, [mode, id, initialSourceId, initialSourceType, preselectedLines]);

  useEffect(() => {
    if (mode === "new" && pv && pointsOfSale.length > 0) {
      fetchNextNumber(pv);
    }
  }, [pv, docType, letter, pointsOfSale, mode]);

  useEffect(() => {
    if (mode === "new" && pointsOfSale.length > 0) {
      const targetPv = ctroCosto === "1" ? "0001" : "0002";
      const found = pointsOfSale.find(p => p.pv === targetPv);
      if (found) {
        setPv(found.pv);
      }
    }
  }, [ctroCosto, pointsOfSale, mode]);

  const fetchInitialData = async () => {
    const token = localStorage.getItem("token");
    const headers = { Authorization: `Bearer ${token}` };
    const [whRes, scRes, posRes, spRes] = await Promise.all([
      fetch(`${API_URL}/inventory/warehouses/`, { headers }),
      fetch(`${API_URL}/sales/sale-conditions/`, { headers }),
      fetch(`${API_URL}/config/pos`, { headers }),
      fetch(`${API_URL}/entities/?is_salesperson=true`, { headers }),
    ]);

    if (whRes.ok) {
        const data = await whRes.json();
        setWarehouses(data);
        if (data.length > 0 && mode === "new") setWarehouseId(data[0].id);
    }
    if (scRes.ok) setSaleConditions(await scRes.json());
    if (spRes.ok) {
        setSellers(await spRes.json());
    }
    if (posRes.ok) {
       const pvs = await posRes.json();
       const filteredPvs = pvs.filter(p => 
          !p.document_configs || 
          p.document_configs.length === 0 || 
          p.document_configs.some(c => ['FC', 'ND', 'NC', 'FAC', 'FACTURA'].includes(c.document_type))
       );
       setPointsOfSale(filteredPvs);
       if (filteredPvs.length > 0 && mode === "new" && !number) {
           const targetPv = ctroCosto === "1" ? "0001" : "0002";
           const initialPv = filteredPvs.find(p => p.pv === targetPv)?.pv || filteredPvs[0].pv;
           setPv(initialPv);
           fetchNextNumber(initialPv);
       }
    }
  };

  const fetchNextNumber = async (v_pv) => {
    const token = localStorage.getItem("token");
    
    // Map internal docType + letter to backend numbering code
    let dCode = 'FC';
    if (docType === 'INVOICE') dCode = `F${letter}`;
    else if (docType === 'ND') dCode = `ND${letter}`;
    else if (docType === 'NC') dCode = `NC${letter}`;
    else if (docType === 'RECEIPT') dCode = 'RECIBO';
    else if (docType === 'FCE_MIPYME') dCode = `FCE${letter}`;
    
    const res = await fetch(`${API_URL}/config/pos/next-number?pv=${v_pv}&doc_type=${dCode}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
        const data = await res.json();
        setNumber(`${v_pv}-${data.next_number}`);
    } else {
        showToast(`No se encontró configuración para el PV ${v_pv} y tipo ${dCode}`, "error");
    }
  };

  const fetchExchangeRate = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/accounting/fx/usd`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
        const data = await res.json();
        setExchangeRate(data.rate || 1);
    }
  };

  const fmt = (val) => {
    if (val === undefined || val === null || isNaN(val)) return `0,00 ${currency}`;
    return `${val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  };

  const fetchInvoice = async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/accounting/documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
        const data = await res.json();
        setEntity(data.entity_id ? {
            id: data.entity_id,
            name: data.entity_name,
            code: data.entity_code,
            tax_id: data.entity_tax_id
        } : null);
        setDate(data.date.split("T")[0]);
        setDueDate((data.due_date || data.date).split("T")[0]);
        setPv(data.number.split("-")[0]);
        setNumber(data.number);
        setCurrency(data.currency || "ARS");
        setExchangeRate(data.exchange_rate || 1);
        setLetter(data.line || "A");
        setStatus(data.status || "DRAFT");
        setObservations(data.notes || "");
        setSelectedConditionId(data.sale_condition_id || "");
        setCtroCosto(String(data.cost_center || 1));
        setSalespersonId(data.salesperson_id || "");
        setSalesOrders(data.sales_orders || []);
        setDeliveryNotes(data.delivery_notes || []);
        
        setItems(data.lines.map(l => ({
            id: l.id,
            product_id: l.product_id,
            description: l.description,
            qty: l.qty,
            unit_price: l.unit_price,
            discount_pct: l.discount_pct,
            vat_rate: l.vat_rate,
            _account_code: l.product?.sales_account_code || 'S/C',
            _unit_content: l.product?.quantity_per_container || 1,
            _container_name: l.product?.container?.name || 'Unidad',
            _unit_label: l.product?.container?.unit?.short_name || 'u',
            source_dn_line_id: l.source_dn_line_id,
            source_sales_line_id: l.source_sales_line_id
        })));

        setBalance(Number(data.balance || data.remaining || 0) || (Number(data.total_amount || 0) * (1 - (Number(data.paid_pct || 0) / 100))));
        
        // En modo edición siempre empieza bloqueado (requiere presionar "Editar")
        setIsReadOnly(true);

        // Calculate Progress using backend-computed percentages (most accurate)
        setProgress({
          delivered: typeof data.delivered_pct === 'number' ? data.delivered_pct : 0,
          invoiced: typeof data.invoiced_pct === 'number' ? data.invoiced_pct : 100,
          paid: typeof data.paid_pct === 'number' ? data.paid_pct : 0,
        });
    }
    setLoading(false);
  };

  const fetchClient = async (cid) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/entities/${cid}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setEntity(await res.json());
  };

  const fetchHeaderFromSource = async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    const headers = { Authorization: `Bearer ${token}` };
    const sourcePath = initialSourceType === 'delivery-note' ? 'delivery-notes' : 'sales-orders';
    const res = await fetch(`${API_URL}/sales/${sourcePath}/${initialSourceId}`, { headers });
    if (res.ok) {
        const data = await res.json();
        // Cargar entidad
         if (data.entity_id) {
             const entityRes = await fetch(`${API_URL}/entities/${data.entity_id}`, { headers });
             if (entityRes.ok) {
                 const entData = await entityRes.json();
                 setEntity(entData);
                 // Only open the selector if we don't already have preselected lines
                 if (!preselectedLines && autoOpenSelector) {
                     handleOpenItemSelector(initialSourceType === 'delivery-note' ? 'RE' : 'OV', data.id, entData.id);
                 }
             }
         }
         
         setCtroCosto(String(data.cost_center || 1));
         setSalespersonId(data.salesperson_id || "");
         setSourceId(data.number);
        setSourceType(initialSourceType);
        setSelectedConditionId(data.sale_condition_id || "");
        setCurrency(data.currency || 'USD');
        setExchangeRate(data.exchange_rate || 1);
        setDueDate(data.due_date ? data.due_date.split("T")[0] : date);
    }
    setLoading(false);
  };
  
   const handleLoadPreselectedLines = async (lines) => {
     // Fetch header info from source (OV/DN)
     fetchHeaderFromSource();

     setItems(lines.map(l => ({
       id: Math.random(),
       product_id: l.product_id,
       description: (l.product?.name || l.name || l.description || 'Producto/Servicio'),
       qty: l.qty_to_invoice || 0,
       unit_price: l.unit_price || 0,
       discount_pct: l.discount_pct || 0,
       vat_rate: l.vat_rate || 0.21,
       _account_code: l._account_code || (l.product?.sales_account_code || 'S/C'),
       _unit_content: l._unit_content || (l.product?.quantity_per_container || 1),
       _container_name: l._container_name || (l.product?.container?.name || 'Unidad'),
       _unit_label: l._unit_label || (l.product?.container?.unit?.short_name || 'u'),
       source_sales_line_id: initialSourceType === 'sales-order' ? l.id : null,
       source_dn_line_id: initialSourceType === 'delivery-note' ? l.id : null
     })));
   };
   
  const fetchFromSource = async () => {
     // Original direct link implementation - normally fetches ALL items
     setLoading(true);
     // ... logic to fetch all items if needed ...
     setLoading(false);
  };

  const searchEntities = async (q) => {
    const token = localStorage.getItem("token");
    const eType = props.context === 'purchases' ? 'provider' : 'client';
    const res = await fetch(`${API_URL}/entities/?q=${q}&type=${eType}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  };

  const searchProducts = async (q) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/inventory/products/?q=${q}&active=true`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  };

  const handleAddItem = (product) => {
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

  const handleOpenItemSelector = async (type, specificSourceId = null, specificEntityId = null) => {
    const targetEntityId = specificEntityId || entity?.id;
    if (!targetEntityId) {
        showToast("Seleccione un cliente para ver pendientes", "warning");
        return;
    }
    setSelectorType(type);
    setShowItemSelector(true);
    setSelectorLoading(true);
    try {
      const endpoint = type === "OV" ? "sales-orders" : "delivery-notes";
      const token = localStorage.getItem("token");
      const url = `${API_URL}/sales/pending-items/${endpoint}?entity_id=${targetEntityId}${selectedConditionId ? `&sale_condition_id=${selectedConditionId}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const existingDirectSoLineIds = items.filter(it => !it.source_dn_line_id).map(it => String(it.source_sales_line_id));
        const existingDnLineIds = items.map(it => it.source_dn_line_id ? String(it.source_dn_line_id) : null).filter(Boolean);

        let filteredData = data.filter(i => {
            // Case 1: The exact mismo item (RE line or SO line) is already in the invoice
            if (i.source_dn_line_id && existingDnLineIds.includes(String(i.source_dn_line_id))) return false;
            
            // Case 2: We are looking at a SO line, but it's already in the invoice (either directly or via a Remito)
            const existingSoLineIds = items.map(it => String(it.source_sales_line_id)).filter(Boolean);
            if (!i.source_dn_line_id && existingSoLineIds.includes(String(i.source_sales_line_id))) return false;

            // Case 3: We are looking at a RE line, but the parent SO line was already added DIRECTLY (total)
            if (i.source_dn_line_id && i.source_sales_line_id && existingDirectSoLineIds.includes(String(i.source_sales_line_id))) return false;
            
            return true;
        });

        if (specificSourceId) {
             filteredData = filteredData.filter(i => String(i.parent_id) === String(specificSourceId));
        }
        setSelectableItems(filteredData);
        
        // Initialize quantities
        const qties = {};
        filteredData.forEach(i => {
             qties[i.id] = i.qty_pending;
        });
        setSelectorQuantities(qties);
        
        // Auto-select if specific source
        if (specificSourceId) {
             setSelectedSelectorItems(filteredData);
        }
      }
    } finally {
      setSelectorLoading(false);
    }
  };

  const handleLinkSelected = () => {
     const newItems = selectedSelectorItems.map(item => {
        let finalUnitPrice = item.unit_price;
        if (item.currency === 'USD' && currency === 'ARS') {
            finalUnitPrice = item.unit_price * exchangeRate;
        } else if (item.currency === 'ARS' && currency === 'USD') {
            finalUnitPrice = exchangeRate > 0 ? item.unit_price / exchangeRate : item.unit_price;
        }

        return {
            id: Math.random(),
            product_id: item.product_id,
            description: item.description || item.product_name,
            qty: selectorQuantities[item.id] !== undefined ? selectorQuantities[item.id] : (item.qty_pending || 0),
            unit_price: finalUnitPrice,
            discount_pct: item.discount_pct || 0,
            vat_rate: item.vat_rate || 0.21,
            _account_code: item.sales_account_code || 'S/C',
            _unit_content: item.quantity_per_container || 1,
            _container_name: item.container_name || 'Unidad',
            _unit_label: item.unit_short_name || 'u',
            source_sales_line_id: item.source_sales_line_id,
            source_dn_line_id: item.source_dn_line_id,
            _parent_number: item.parent_number,
            currency: item.currency
        };
     });

     setItems([...items, ...newItems]);
     setShowItemSelector(false);
     setSelectedSelectorItems([]);
     showToast(`${newItems.length} ítems vinculados correctamente`, "success");
  };

  const updateItem = (itemId, field, value) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== itemId) return i;
        const newItem = { ...i, [field]: value };
        
        // Handle numeric conversion for core fields
        if (field === 'qty') newItem.qty = Number(value);
        if (field === 'unit_price') newItem.unit_price = Number(value);
        if (field === 'discount_pct') newItem.discount_pct = Number(value);
        if (field === 'vat_rate') newItem.vat_rate = Number(value);
        
        if (field === 'cost_price' || field === 'unit_cost') {
          const val = Number(value);
          newItem.cost_price = val;
          newItem.unit_cost = val;
        }

        return newItem;
      })
    );
  };
  const removeItem = (itemId) => {
    setItems(items.filter((i) => i.id !== itemId));
  };

  const fetchTimeline = async () => {
    if (!id || mode === "new") return;
    setLoadingTimeline(true);
    try {
      const data = await api.get(`/accounting/documents/${id}/timeline`);
      setTimeline(data);
    } catch (err) {
      console.error("Error fetching timeline:", err);
    } finally {
      setLoadingTimeline(false);
    }
  };

  useEffect(() => {
    if (activeTab === "timeline") {
      fetchTimeline();
    }
  }, [activeTab]);

  const TimelineTab = () => {
    if (loadingTimeline) return <div style={{ padding: 40, textAlign: 'center' }}><Activity className="animate-spin" size={24} color="var(--accent-indigo)" /></div>;
    if (!timeline.length) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No hay registros para este documento</div>;

    return (
      <div style={{ padding: '24px 16px', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ position: 'relative' }}>
          {/* Vertical Line */}
          <div style={{ position: 'absolute', left: 20, top: 0, bottom: 0, width: 2, background: '#e2e8f0', zIndex: 0 }} />
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {timeline.map((event, idx) => {
              const iconMap = {
                AUDIT: event.action === 'CREACION' ? <Plus size={14} /> : (event.action === 'ANULACION' ? <X size={14} /> : <Activity size={14} />),
                LINK_ORIGIN: <ShoppingBag size={14} />,
                LINK_LOGISTICS: <Truck size={14} />,
                LINK_FINANCE: <Landmark size={14} />,
                LINK_APPLICATION: <CheckCircle size={14} />
              };

              const colorMap = {
                AUDIT: event.action === 'CREACION' ? '#3b82f6' : (event.action === 'ANULACION' ? '#ef4444' : '#64748b'),
                LINK_ORIGIN: '#10b981',
                LINK_LOGISTICS: '#f59e0b',
                LINK_FINANCE: '#8b5cf6',
                LINK_APPLICATION: '#06b6d4'
              };

              return (
                <div key={idx} style={{ position: 'relative', display: 'flex', gap: 24, zIndex: 1 }}>
                  <div style={{ 
                    width: 42, height: 42, borderRadius: 14, background: 'white', border: `2px solid ${colorMap[event.type] || '#e2e8f0'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: colorMap[event.type], flexShrink: 0,
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                  }}>
                    {iconMap[event.type] || <Activity size={14} />}
                  </div>
                  
                  <div style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', border: '1px solid #f1f5f9', padding: 20, borderRadius: 20, flex: 1, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                       <span style={{ fontSize: 11, fontWeight: 900, color: colorMap[event.type], textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {event.type === 'AUDIT' ? event.action : (event.doc_type || event.type)}
                       </span>
                       <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>
                          {new Date(event.date).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                       </span>
                    </div>

                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                        {event.number ? `${event.doc_type} #${event.number}` : event.details}
                    </div>

                    {event.user && (
                        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                             <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#f1f5f9', fontSize: 8, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', textTransform: 'uppercase' }}>
                                 {event.user.charAt(0)}
                             </div>
                             <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b' }}>Acción de {event.user}</span>
                        </div>
                    )}

                    {(event.amount || event.amount_applied) && (
                         <div style={{ marginTop: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                             <BadgeDollarSign size={12} color="#1e293b" />
                             <span style={{ fontSize: 12, fontWeight: 900, color: '#1e293b' }}>
                                {event.currency} {(event.amount || event.amount_applied).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                             </span>
                         </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const handleSave = async () => {
    if (!entity) return showToast("Falta Cliente", "error");
    if (items.length === 0) return showToast("Agregue al menos un producto", "error");

    setLoading(true);
    const token = localStorage.getItem("token");
    const salespersonName = sellers.find(s => s.id === salespersonId)?.name || "";
    const payload = {
        doc_type: docType,
        line: letter,
        number: number,
        date: date,
        due_date: dueDate,
        currency: currency,
        exchange_rate: exchangeRate,
        entity_id: entity.id,
        sale_condition_id: selectedConditionId,
        notes: observations,
        cost_center: parseInt(ctroCosto),
        salesperson_id: salespersonId,
        vendedor: salespersonName,
        total_amount: totals.total,
        is_fx_adjustment: isFxAdjustment,
        lines: items.map(l => ({
            product_id: l.product_id,
            description: l.description,
            qty: l.qty,
            unit_price: l.unit_price,
            discount_pct: l.discount_pct,
            vat_rate: l.vat_rate,
            unit_cost: l.unit_cost || l.cost_price || 0,
            source_dn_line_id: l.source_dn_line_id,
            source_sales_line_id: l.source_sales_line_id
        }))
    };

    try {
        const url = mode === "edit" ? `${API_URL}/accounting/documents/${id}` : `${API_URL}/accounting/documents/`;
        const res = await fetch(url, {
            method: mode === "edit" ? "PUT" : "POST",
            headers: { 
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            showToast("Factura generada exitosamente", "success");
            window.dispatchEvent(new Event('sales-order-changed'));
            window.dispatchEvent(new Event('delivery-note-changed'));
            window.dispatchEvent(new Event('document-changed'));
            closeWindow(windowId);
        } else {
            const err = await res.json();
            let msg = "Error al guardar";
            if (Array.isArray(err.detail)) {
                msg = err.detail.map(e => `${e.loc.join('.')}: ${e.msg}`).join(', ');
            } else if (err.detail) {
                msg = err.detail;
            }
            showToast(msg, "error");
        }
    } finally {
        setLoading(false);
    }
  };

  const handleConfirmPayment = () => {
    setShowPaymentModal(false);
    
    // Prepare initial applications for ReceiptForm
    const application = {
        to_document_id: id,
        number: number,
        date: date,
        remaining: balance,
        currency: currency,
        amount_applied: payAmount, // Amount in invoice currency
    };

    openWindow('receipt-form', {
        initialEntity: entity,
        initialApplications: [application],
        initialCurrency: 'ARS', // Receipts are usually ARS in this business
        initialExchangeRate: payExchangeRate,
    }, {
        title: `Nuevo Recibo - ${entity?.name}`,
        width: 1000,
        height: 800
    });
  };

  if (loading && mode === "edit") return <LoadingScreen message="Cargando Factura..." />;

  return (
    <>
      <div className={s.formCard}>
        {/* ── Header ── */}
        <div className={s.headerLine} style={{ marginBottom: 20 }}>
          <div className={s.titleGroup} style={{ flex: 1 }}>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: '#eff3ff', color: '#24389c', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(36, 56, 156, 0.1)' }}>
                <Receipt size={24} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 24, fontWeight: 900, color: '#1e293b' }}>
                    {mode === 'new' ? 'Nueva Factura' : `Factura ${number}`}
                  </span>
                  {(status && String(status).toUpperCase() !== 'DRAFT') && <TraceabilityStatusBadge status={status} />}
                </div>
                <span className={s.subtitle}>
                  {mode === 'new' ? 'Documento de venta directa' : `Registrada el ${new Date(date).toLocaleDateString()}`}
                </span>
              </div>
            </h1>
          </div>

          <div className={s.headerActions} style={{ alignSelf: 'flex-start' }}>
            <div className={s.actionGroup}>
              {mode === 'edit' ? (
                <>
                  {isReadOnly ? (
                    <button 
                      className={s.actionBtn} 
                      style={{ color: '#64748b', cursor: 'pointer' }} 
                      onClick={() => {
                        if (status !== 'DRAFT' && status !== 'OPEN') {
                          showToast("Atención: factura ya autorizada o cerrada. Edite con cuidado.", "warning");
                        }
                        setIsReadOnly(false);
                      }}
                      title="Activar modo edición"
                    >
                      <Pencil size={18} />
                    </button>
                  ) : (
                    <button className={s.actionBtn} onClick={handleSave} style={{ color: '#059669' }} title="Guardar">
                      <Save size={18} />
                    </button>
                  )}

                  {(status === 'OPEN' || status === 'PARTIAL') && balance > 0 && (
                    <button 
                      className={s.actionBtn} 
                      style={{ color: '#24389c' }}
                       onClick={() => {
                        setPayExchangeRate(exchangeRate);
                        setPayAmount(balance * exchangeRate); // Default to full balance in pesos
                        setPayDate(new Date().toISOString().split('T')[0]);
                        setShowPaymentModal(true);
                      }}
                      title="Generar Recibo"
                    >
                      <ReceiptText size={18} />
                    </button>
                  )}

                  <div style={{ width: 1, height: 24, background: '#e2e8f0', margin: '0 4px' }} />
                  
                  <button className={s.actionBtn} onClick={() => window.open(`${API_URL}/accounting/documents/${id}/pdf`, '_blank')} title="Imprimir Factura">
                    <Printer size={18} />
                  </button>
                  <button className={s.actionBtn} onClick={() => showToast("Envío por email en desarrollo", "info")} title="Enviar por Email">
                    <Mail size={18} />
                  </button>
                </>
              ) : (
                <button 
                  className={s.actionBtn} 
                  onClick={handleSave}
                  style={{ color: '#24389c', fontWeight: 800, fontSize: 11, gap: 8, padding: '0 16px' }}
                >
                  <Save size={16} /> Generar Factura
                </button>
              )}
              <button className={s.actionBtn} onClick={() => closeWindow(windowId)} title="Cerrar">
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Fields Grid ── */}
        <div className={s.fieldsGrid} style={{ gridTemplateColumns: 'repeat(12, 1fr)', gap: '10px 12px' }}>
               <div className={s.field} style={{ gridColumn: 'span 6' }}>
             <label>CLIENTE / RAZÓN SOCIAL</label>
             {isReadOnly ? (
               <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', minHeight: 40 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#eff3ff', color: '#24389c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <User size={10}/>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: '#1e293b' }}>{entity?.name || 'Cliente no seleccionado'}</span>
               </div>
             ) : (
               <Autocomplete
                 placeholder="Buscar cliente..."
                 onSearch={searchEntities}
                 onSelect={setEntity}
                 initialValue={entity}
                 variant="glass"
                 icon={<Search size={14} />}
                 minChars={0}
               />
             )}
           </div>
                        <div className={s.field} style={{ gridColumn: 'span 2' }}>
             <label>FECHA</label>
             <Input type="date" value={date} onChange={e => setDate(e.target.value)} variant="glass" readOnly={isReadOnly} style={{ fontSize: 11.5, background: isReadOnly ? '#f8fafc' : '#fff', color: isReadOnly ? '#64748b' : 'inherit' }} />
           </div>
           <div className={s.field} style={{ gridColumn: 'span 2' }}>
             <label>MONEDA</label>
             <Select value={currency} onChange={e => setCurrency(e.target.value)} variant="glass" readOnly={isReadOnly} style={{ fontSize: 11.5, background: isReadOnly ? '#f8fafc' : '#fff', color: isReadOnly ? '#64748b' : 'inherit' }}>
               <option value="ARS">ARS</option>
               <option value="USD">USD</option>
             </Select>
           </div>
           <div className={s.field} style={{ gridColumn: 'span 2' }}>
             <label>T. CAMBIO</label>
             <Input type="number" value={exchangeRate} onChange={e => setExchangeRate(parseFloat(e.target.value))} variant="glass" readOnly={isReadOnly} style={{ fontSize: 11.5, background: isReadOnly ? '#f8fafc' : '#fff', color: isReadOnly ? '#64748b' : 'inherit' }} />
           </div>
           
           {/* Row 2 */}
            <div className={s.field} style={{ gridColumn: 'span 3' }}>
              <label>COMPROBANTE</label>
              <Select value={docType} onChange={e => {
                  setDocType(e.target.value);
                  // Auto-reset FX adjustment if not ND/NC
                  if (!['ND', 'NC', 'PURCHASE_DEBIT_NOTE', 'PURCHASE_CREDIT_NOTE'].includes(e.target.value)) {
                      setIsFxAdjustment(false);
                  }
              }} variant="glass" readOnly={isReadOnly} style={{ fontSize: 11.5, background: isReadOnly ? '#f8fafc' : '#fff' }}>
                {props.context === 'purchases' ? (
                  <optgroup label="Compra">
                    <option value="PURCHASE_INVOICE">Factura de Compra</option>
                    <option value="PURCHASE_CREDIT_NOTE">Nota de Crédito Compra</option>
                    <option value="PURCHASE_DEBIT_NOTE">Nota de Débito Compra</option>
                  </optgroup>
                ) : (
                  <optgroup label="Venta">
                    <option value="INVOICE">Factura de Venta</option>
                    <option value="NC">Nota de Crédito</option>
                    <option value="ND">Nota de Débito</option>
                  </optgroup>
                )}
                <optgroup label="Especiales">
                  <option value="LPG_PRIMARY">LPG Primaria</option>
                  <option value="LPG_SECONDARY">LPG Secundaria</option>
                </optgroup>
              </Select>
            </div>

            {/* WOW FACTOR CHECKSOCK FOR FX ADJ */}
            {['ND', 'NC', 'PURCHASE_DEBIT_NOTE', 'PURCHASE_CREDIT_NOTE'].includes(docType) && (
                <div className={s.field} style={{ gridColumn: 'span 3', display: 'flex', alignItems: 'center', paddingTop: 18 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: isFxAdjustment ? '#24389c' : '#64748b' }}>
                        <input 
                            type="checkbox" 
                            checked={isFxAdjustment} 
                            onChange={e => setIsFxAdjustment(e.target.checked)} 
                            disabled={isReadOnly}
                            style={{ width: 16, height: 16, accentColor: '#24389c' }}
                        />
                        <TrendingUp size={14} /> Diferencia de Cambio (Solo IVA en USD)
                    </label>
                </div>
            )}
           <div className={s.field} style={{ gridColumn: 'span 1' }}>
             <label>LETRA</label>
             <Select value={letter} onChange={e => setLetter(e.target.value)} variant="glass" readOnly={isReadOnly} style={{ fontSize: 11.5, background: isReadOnly ? '#f8fafc' : '#fff', color: isReadOnly ? '#64748b' : 'inherit' }}>
               <option value="A">A</option>
               <option value="B">B</option>
               <option value="C">C</option>
               <option value="M">M</option>
             </Select>
           </div>
           <div className={s.field} style={{ gridColumn: 'span 2' }}>
             <label>NRO / PV</label>
             <div style={{ display: 'flex', gap: 4 }}>
               <Select 
                 value={pv} 
                 onChange={e => { setPv(e.target.value); fetchNextNumber(e.target.value); }} 
                 variant="glass"
                 readOnly={isReadOnly} 
                 style={{ fontSize: 11.5, width: 80, background: isReadOnly ? '#f8fafc' : '#fff' }}
               >
                 {pointsOfSale.map(p => <option key={p.id} value={p.pv}>{p.pv}</option>)}
               </Select>
               <Input 
                 style={{ fontSize: 11.5, flex: 1 }} 
                 value={number.split('-')[1] || ''} 
                 variant="glass" 
                 readOnly 
               />
             </div>
           </div>
           <div className={s.field} style={{ gridColumn: 'span 3' }}>
             <label>VENDEDOR</label>
             <Select value={salespersonId} onChange={e => setSalespersonId(e.target.value)} variant="glass" readOnly={isReadOnly} style={{ fontSize: 11.5, background: isReadOnly ? '#f8fafc' : '#fff' }}>
               <option value="">Ninguno</option>
               {sellers.map(sl => <option key={sl.id} value={sl.id}>{sl.name}</option>)}
             </Select>
           </div>
           <div className={s.field} style={{ gridColumn: 'span 2' }}>
             <label>CONDICIÓN</label>
             <Select value={selectedConditionId} onChange={e => setSelectedConditionId(e.target.value)} variant="glass" readOnly={isReadOnly} style={{ fontSize: 11.5, background: isReadOnly ? '#f8fafc' : '#fff' }}>
               <option value="">Seleccione...</option>
               {saleConditions.map(sc => <option key={sc.id} value={sc.id}>{sc.description}</option>)}
             </Select>
           </div>
           <div className={s.field} style={{ gridColumn: 'span 1' }}>
             <label>C/C</label>
             <Select value={ctroCosto} onChange={e => setCtroCosto(e.target.value)} variant="glass" readOnly={isReadOnly} style={{ fontSize: 11.5, background: isReadOnly ? '#f8fafc' : '#fff' }}>
               <option value="1">1</option>
               <option value="2">2</option>
             </Select>
           </div>
        </div>

        {/* ── Tabs ── */}
        <div className={s.tabsBar} style={{ marginTop: 4, marginBottom: 8 }}>
          <div className={`${s.tab} ${activeTab === 'items' ? s.tabActive : ''}`} onClick={() => setActiveTab('items')}>Ítems</div>
          <div className={`${s.tab} ${activeTab === 'linking' ? s.tabActive : ''}`} onClick={() => setActiveTab('linking')}>Vinculación</div>
          <div className={`${s.tab} ${activeTab === 'timeline' ? s.tabActive : ''}`} onClick={() => setActiveTab('timeline')}>Historial</div>
          <div className={`${s.tab} ${activeTab === 'details' ? s.tabActive : ''}`} onClick={() => setActiveTab('details')}>Otros Datos</div>
        </div>

        {/* ── Content ── */}
        <div className={s.contentArea} style={{ padding: '0 4px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* ITEMS TAB */}
          {activeTab === 'items' && (
            <>
              {/* Action ribbon - Always show to allow manual additions */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <Autocomplete
                    placeholder="Buscar y agregar productos..."
                    onSearch={searchProducts}
                    onSelect={handleAddItem}
                    renderItem={(item) => (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 12 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 800, fontSize: 12, color: '#1e293b' }}>{item.name}</div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{item.sku || 'N/A'} · {item.brand || item.subcategory?.name}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ 
                                    fontSize: 10, 
                                    fontWeight: 900, 
                                    color: (item.total_available > 0.1) ? '#059669' : '#dc2626',
                                    background: (item.total_available > 0.1) ? '#ecfdf5' : '#fef2f2',
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    whiteSpace: 'nowrap'
                                }}>
                                    {item.total_available} Disp.
                                </div>
                                {item.total_reserved > 0 && (
                                    <div style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8', marginTop: 2 }}>{item.total_reserved} Reserv.</div>
                                )}
                            </div>
                        </div>
                    )}
                    clearOnSelect
                    variant="glass"
                    icon={<Search size={14} style={{ color: '#24389c' }} />}
                    minChars={0}
                    readOnly={isReadOnly}
                  />
                </div>
                <button
                  onClick={() => handleOpenItemSelector("OV")}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 16px', borderRadius: 10, border: '1.5px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', fontWeight: 800, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  disabled={isReadOnly}
                >
                  <ShoppingBag size={14} /> + ÍTEM PEDIDO
                </button>
                <button
                  onClick={() => handleOpenItemSelector("RE")}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 16px', borderRadius: 10, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontWeight: 800, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  disabled={isReadOnly}
                >
                  <Truck size={14} /> + ÍTEM REMITO
                </button>
              </div>
              <div className={s.bentoContainer} style={{ padding: 0, overflow: 'visible' }}>
                {items.length > 0 ? (
                  <>
                    <div className={s.tableHeader} style={{ gridTemplateColumns: 'minmax(220px, 2fr) 90px 75px 85px 95px 100px 70px 100px 70px 115px 36px', padding: '12px 16px', background: '#eff3ff', borderRadius: '14px 14px 0 0', borderBottom: '1.5px solid #dce4f7' }}>
                      <div className={s.th}>PRODUCTO / DESCRIPCIÓN</div>
                      <div className={s.th} style={{ textAlign: 'center' }}>CUENTA</div>
                      <div className={s.th} style={{ textAlign: 'right' }}>CANT.</div>
                      <div className={s.th} style={{ textAlign: 'right' }}>P. COSTO</div>
                      <div className={s.th} style={{ textAlign: 'right' }}>EQUIV. (Kg/L)</div>
                      <div className={s.th} style={{ textAlign: 'right' }}>PRECIO UNIT.</div>
                      <div className={s.th} style={{ textAlign: 'right' }}>DTO %</div>
                      <div className={s.th} style={{ textAlign: 'right' }}>NETO</div>
                      <div className={s.th} style={{ textAlign: 'center' }}>IVA</div>
                      <div className={s.th} style={{ textAlign: 'right' }}>SUBTOTAL</div>
                      <div></div>
                    </div>
                    <div className={s.itemsList} style={{ flex: 1, overflowY: 'auto' }}>
                      {items.map((item) => {
                        const isLocked = status !== 'DRAFT' && status !== 'OPEN';
                        const factor = item._unit_content || 1;
                        const sub = (item.qty || 0) * factor * (item.unit_price || 0);
                        const bonif = sub * ((item.discount_pct || 0) / 100);
                        const net = sub - bonif;
                        const vat = net * (item.vat_rate || 0.21);
                        const isLinked = !!(item.source_dn_line_id || item.source_sales_line_id);

                        return (
                          <div key={item.id} className={s.tableRow} style={{ gridTemplateColumns: 'minmax(220px, 2fr) 90px 75px 85px 95px 100px 70px 100px 70px 115px 36px', padding: '10px 16px', borderBottom: '1px solid #f1f5f9', alignItems: 'center' }}>
                            <div style={{ padding: '2px 0', overflow: 'hidden' }}>
                              <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b', lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 6 }}>
                                {item.description || '—'}
                                {isLinked && (
                                  <span title="Vinculado" style={{ color: '#16a34a', display: 'inline-flex' }}><Link2 size={12} /></span>
                                )}
                              </div>
                              <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginTop: 2 }}>{item._container_name || 'Sin envase'}</div>
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textAlign: 'center' }}>{item._account_code || '—'}</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                              <input 
                                className={s.tableInput} 
                                type="number" 
                                value={item.qty} 
                                onChange={e => updateItem(item.id, 'qty', parseFloat(e.target.value) || 0)} 
                                readOnly={isLinked || isReadOnly || isLocked}
                                style={{ textAlign: 'right', fontWeight: 800, background: (isLinked || isReadOnly || isLocked) ? '#f8fafc' : '#ffffff', color: (isLinked || isReadOnly || isLocked) ? '#64748b' : '#1e293b', borderRadius: 8, height: 32 }} 
                              />
                            </div>
                            {/* NEW: P. COSTO Column */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', position: 'relative' }}>
                                <input
                                  type="number"
                                  className={s.tableInput}
                                  value={item.unit_cost || 0}
                                  onChange={(e) => updateItem(item.id, 'unit_cost', parseFloat(e.target.value) || 0)}
                                  onBlur={async () => {
                                    if (!id || String(id).startsWith(':')) return; 
                                    const token = localStorage.getItem("token");
                                    await fetch(`${API_URL}/accounting/documents/${id}/lines/${item.id}`, {
                                      method: 'PATCH',
                                      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ unit_cost: item.unit_cost })
                                    });
                                  }}
                                  style={{ textAlign: 'right', fontWeight: 800, background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 8, color: '#92400e', height: 32 }}
                                  title="Precio costo - Se guarda automáticamente"
                                />
                                {((item.unit_price * (1 - (item.discount_pct || 0) / 100)) - (item.unit_cost || 0)) > 0 && (
                                    <span style={{ position: 'absolute', top: -5, right: -5, background: '#10b981', width: 6, height: 6, borderRadius: '50%' }}></span>
                                )}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 900, color: '#24389c', textAlign: 'right', background: '#eff3ff', borderRadius: 8, padding: '6px 8px', minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                              {((item.qty || 0) * factor).toLocaleString('es-AR', { minimumFractionDigits: 2 })} 
                              <span style={{ fontSize: 9, opacity: 0.7, fontWeight: 900 }}>{item._unit_label}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                               <input 
                                 className={s.tableInput} 
                                 type="number" 
                                 value={item.unit_price} 
                                 onChange={e => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)} 
                                 readOnly={isReadOnly || isLocked}
                                 style={{ textAlign: 'right', fontWeight: 700, background: (isReadOnly || isLocked) ? '#f8fafc' : '#ffffff', borderRadius: 8, height: 32 }} 
                               />
                             </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                               <input 
                                 className={s.tableInput} 
                                 type="number" 
                                 value={item.discount_pct} 
                                 onChange={e => updateItem(item.id, 'discount_pct', parseFloat(e.target.value) || 0)} 
                                 readOnly={isReadOnly || isLocked}
                                 style={{ textAlign: 'right', fontWeight: 700, background: (isReadOnly || isLocked) ? '#f8fafc' : '#ffffff', color: item.discount_pct > 0 ? '#ef4444' : 'inherit', borderRadius: 8, height: 32 }} 
                               />
                             </div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#059669', textAlign: 'right' }}>{net.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <select 
                                className={s.tableInput} 
                                value={item.vat_rate} 
                                onChange={e => updateItem(item.id, 'vat_rate', parseFloat(e.target.value))} 
                                style={{ textAlign: 'right', background: (isReadOnly || isLocked) ? '#f8fafc' : '#ffffff', fontWeight: 700, borderRadius: 8, height: 32, padding: '0 4px' }}
                                disabled={isReadOnly || isLocked}
                              >
                                <option value={0.21}>21%</option>
                                <option value={0.105}>10.5%</option>
                                <option value={0}>0%</option>
                              </select>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 900, color: '#24389c', textAlign: 'right' }}>{(net + vat).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {!isLinked && !isReadOnly && (
                                <button style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: 8, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} onClick={() => removeItem(item.id)} className={s.removeBtn}>
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '48px 24px', textAlign: 'center', color: '#94a3b8' }}>
                    <ReceiptText size={40} style={{ opacity: 0.2, display: 'block', margin: '0 auto 12px' }} />
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Sin ítems aún</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>Buscá un producto o vinculá desde un pedido o remito.</div>
                  </div>
                )}

              </div>
            </>
          )}

          {/* LINKING TAB */}
          {activeTab === 'linking' && (
            <div style={{ padding: '16px 4px', height: '100%', overflowY: 'auto' }}>
                <div style={{ display: 'flex', gap: 24, overflowX: 'auto', padding: '8px 0', alignItems: 'start', scrollbarWidth: 'none' }}>
                    
                    {/* DOC. ACTUAL CARD */}
                    <div style={{ background: '#f8fafc', padding: 24, borderRadius: 24, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 320 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 12, background: '#f1f5f9', color: '#24389c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileText size={20} />
                            </div>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b' }}>DOC. ACTUAL</div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{new Date(date).toLocaleDateString()}</div>
                            </div>
                        </div>
                        <div style={{ padding: 20, background: '#ffffff', borderRadius: 20, border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <span style={{ fontSize: 15, fontWeight: 900, color: '#24389c' }}>#{number || 'Borrador'}</span>
                                <Badge color={status === 'DRAFT' ? 'gray' : (status === 'VOIDED' ? 'red' : 'green')} size="xs">{status === 'DRAFT' ? 'BORRADOR' : status}</Badge>
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ fontSize: 10, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Progreso del Flujo</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Truck size={12} color="#f59e0b" />
                                    <div style={{ flex: 1, height: 4, background: '#f1f5f9', borderRadius: 2 }}>
                                        <div style={{ height: '100%', background: '#f59e0b', width: `${progress.delivered}%`, borderRadius: 2 }}></div>
                                    </div>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#475569' }}>{Math.round(progress.delivered)}%</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <ReceiptText size={12} color="#06b6d4" />
                                    <div style={{ flex: 1, height: 4, background: '#f1f5f9', borderRadius: 2 }}>
                                        <div style={{ height: '100%', background: '#06b6d4', width: '100%', borderRadius: 2 }}></div>
                                    </div>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#475569' }}>100%</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Check size={12} color="#10b981" />
                                    <div style={{ flex: 1, height: 4, background: '#f1f5f9', borderRadius: 2 }}>
                                        <div style={{ height: '100%', background: '#10b981', width: `${progress.paid}%`, borderRadius: 2 }}></div>
                                    </div>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#475569' }}>{Math.round(progress.paid)}%</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* PEDIDOS VINCULADOS */}
                    <div style={{ background: '#f8fafc', padding: 24, borderRadius: 24, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 320 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 12, background: '#f0fdf4', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ShoppingBag size={20} />
                            </div>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b' }}>PEDIDOS VINCULADOS</div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{salesOrders.length} orden(es) en el flujo</div>
                            </div>
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
                            {salesOrders.length > 0 ? salesOrders.map(so => (
                                <div key={so.id} style={{ padding: 16, background: '#ffffff', borderRadius: 20, border: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => openWindow('sales-order', { id: so.id, mode: 'edit' }, { title: `Pedido ${so.number}`, width: 1200 })}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b' }}>#{so.number}</div>
                                            <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8' }}>{so.date ? new Date(so.date).toLocaleDateString() : '-'}</div>
                                        </div>
                                        <TraceabilityStatusBadge status={so.status} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Truck size={10} color="#f59e0b" />
                                            <div style={{ flex: 1, height: 3, background: '#f1f5f9', borderRadius: 2 }}>
                                                <div style={{ height: '100%', background: '#f59e0b', width: `${so.delivered_pct || 0}%`, borderRadius: 2 }}></div>
                                            </div>
                                            <span style={{ fontSize: 9, fontWeight: 800, color: '#475569' }}>{Math.round(so.delivered_pct || 0)}%</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <ReceiptText size={10} color="#06b6d4" />
                                            <div style={{ flex: 1, height: 3, background: '#f1f5f9', borderRadius: 2 }}>
                                                <div style={{ height: '100%', background: '#06b6d4', width: `100%`, borderRadius: 2 }}></div>
                                            </div>
                                            <span style={{ fontSize: 9, fontWeight: 800, color: '#475569' }}>100%</span>
                                        </div>
                                    </div>
                                </div>
                            )) : (
                                <div style={{ padding: '30px', border: '2px dashed #e2e8f0', borderRadius: 20, textAlign: 'center', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>
                                    Venta Directa
                                </div>
                            )}
                        </div>
                    </div>

                    {/* REMITOS ASOCIADOS */}
                    <div style={{ background: '#f8fafc', padding: 24, borderRadius: 24, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 320 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 12, background: '#fff7ed', color: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Truck size={20} />
                            </div>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b' }}>REMITOS ASOCIADOS</div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{deliveryNotes.length} remito(s) vinculados</div>
                            </div>
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
                            {deliveryNotes.length > 0 ? deliveryNotes.map(dn => (
                                <div key={dn.id} style={{ padding: 16, background: '#ffffff', borderRadius: 20, border: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => openWindow('delivery-note', { id: dn.id, mode: 'edit' }, { title: `Remito ${dn.number}`, width: 1200 })}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fff7ed', color: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Truck size={14} />
                                            </div>
                                            <span style={{ fontSize: 12, fontWeight: 900, color: '#1e293b' }}>#{dn.number}</span>
                                        </div>
                                        <TraceabilityStatusBadge status={dn.status} />
                                    </div>
                                    <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8' }}>{dn.date ? new Date(dn.date).toLocaleDateString() : '-'}</div>
                                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ flex: 1, height: 3, background: '#f1f5f9', borderRadius: 2 }}>
                                            <div style={{ height: '100%', background: '#f59e0b', width: '100%', borderRadius: 2 }}></div>
                                        </div>
                                        <span style={{ fontSize: 9, fontWeight: 800, color: '#475569' }}>100%</span>
                                    </div>
                                </div>
                            )) : (
                                <div style={{ padding: '30px', border: '2px dashed #e2e8f0', borderRadius: 20, textAlign: 'center', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>
                                    Sin remitos asociados
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Add manual linking actions if draft */}
                    {status === 'DRAFT' && !sourceId && (
                        <div style={{ background: '#f0fdf4', padding: 24, borderRadius: 24, border: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 280, justifyContent: 'center' }}>
                             <div style={{ fontSize: 11, fontWeight: 900, color: '#15803d', textTransform: 'uppercase' }}>Acciones de Vínculo</div>
                             <Button variant="primary" style={{ background: '#24389c' }} size="sm" onClick={() => handleOpenItemSelector("OV")}>VINCULAR PEDIDO</Button>
                             <Button variant="primary" style={{ background: '#16a34a' }} size="sm" onClick={() => handleOpenItemSelector("RE")}>VINCULAR REMITO</Button>
                        </div>
                    )}
                </div>
            </div>
          )}

          {/* TIMELINE TAB */}
          {activeTab === 'timeline' && <TimelineTab />}

          {/* DETAILS TAB */}
          {activeTab === 'details' && (
            <div style={{ padding: '8px 0' }}>
              <div className={s.fieldsGrid} style={{ marginTop: 0 }}>
                <div className={s.field}>
                  <label>CONDICIÓN DE VENTA</label>
                  <Select value={selectedConditionId} onChange={e => setSelectedConditionId(e.target.value)} variant="glass">
                    <option value="">Seleccione...</option>
                    {saleConditions.map(sc => <option key={sc.id} value={sc.id}>{sc.description}</option>)}
                  </Select>
                </div>
                <div className={s.field}>
                  <label>VENCIMIENTO</label>
                  <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} variant="glass" />
                </div>
                <div className={s.field}>
                  <label>MONEDA</label>
                  <Select value={currency} onChange={e => setCurrency(e.target.value)} variant="glass">
                    <option value="ARS">Pesos (ARS)</option>
                    <option value="USD">Dólares (USD)</option>
                  </Select>
                </div>
                <div className={s.field}>
                  <label>T.C. BILLETE</label>
                  <Input type="number" value={exchangeRate} onChange={e => setExchangeRate(parseFloat(e.target.value))} variant="glass" />
                </div>
              </div>
              <div className={s.field} style={{ marginTop: 16 }}>
                <label>OBSERVACIONES / NOTAS</label>
                <textarea
                  value={observations}
                  onChange={e => setObservations(e.target.value)}
                  placeholder="Observaciones del comprobante..."
                  style={{ width: '100%', minHeight: 80, padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'inherit', resize: 'vertical', outline: 'none', background: '#f8fafc' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className={s.footerSection}>
          <div className={s.footerItem}>
            <span className={s.footerLabel}>NETO GRAVADO</span>
            <span className={s.footerValue}>{fmt(totals.net)}</span>
          </div>
          <div className={s.footerItem}>
            <span className={s.footerLabel}>IVA DETERMINADO</span>
            <span className={`${s.footerValue} ${s.ivaValue}`}>{fmt(totals.vat)}</span>
          </div>
          <div className={s.footerItem}>
            <span className={s.footerLabel} style={{ color: '#24389c' }}>TOTAL CARTERA</span>
            <span className={`${s.footerValue} ${s.totalValue}`}>{fmt(totals.total)}</span>
          </div>
        </div>
      </div>

      {/* --- Payment Modal (Synagro Style) --- */}
      {showPaymentModal && (
        <Modal 
          open={showPaymentModal}
          title="Selección de Comprobantes a Pagar" 
          onClose={() => setShowPaymentModal(false)}
          style={{ maxWidth: 1150, width: '95%' }}
        >
          <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header section - Glass Bento Style */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: '16px', background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)', borderRadius: 20, border: '1px solid #e2e8f0' }}>
               <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>FECHA DEL RECIBO</label>
                  <Input 
                    type="date" 
                    value={payDate} 
                    onChange={e => setPayDate(e.target.value)}
                    variant="glass" 
                    style={{ height: 38, fontSize: 12, fontWeight: 700 }}
                  />
               </div>
               <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MONEDA DE PAGO</label>
                  <div style={{ height: 38, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 12, fontWeight: 700, color: '#24389c' }}>
                    Pesos (ARS)
                  </div>
               </div>
               <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 9, fontWeight: 900, color: '#24389c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>COTIZACIÓN PAGO</label>
                  <Input 
                     type="number" 
                     value={payExchangeRate} 
                     onChange={e => {
                        const newTc = parseFloat(e.target.value) || 0;
                        setPayExchangeRate(newTc);
                        setPayAmount(balance * newTc); 
                     }} 
                     variant="glass" 
                     style={{ height: 38, textAlign: 'right', fontWeight: 900, fontSize: 14, border: '1.5px solid #24389c' }} 
                  />
               </div>
               <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>VENDEDOR</label>
                  <div style={{ height: 38, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 11, fontWeight: 700, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sellers.find(s => s.id === salespersonId)?.name || 'Sin asignar'}
                  </div>
               </div>
            </div>

            {/* Table Container - Premium Design */}
            <div style={{ background: '#fff', borderRadius: 24, border: '1.5px solid #eff3ff', boxShadow: '0 10px 30px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
               <table style={{ width: '100%', borderCollapse: 'collapse', borderSpacing: 0 }}>
                  <thead>
                     <tr style={{ background: '#eff3ff', borderBottom: '1.5px solid #dce4f7' }}>
                        <th style={{ width: 60, padding: '16px 20px' }}></th>
                        <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>COMPROBANTE</th>
                        <th style={{ padding: '16px 20px', textAlign: 'center', fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>FECHA</th>
                        <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>COTIZ. ORIG.</th>
                        <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>SALDO ({currency})</th>
                        <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: 9, fontWeight: 950, color: '#24389c', textTransform: 'uppercase', background: 'rgba(36, 56, 156, 0.04)' }}>SALDO PESOS</th>
                        <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: 9, fontWeight: 950, color: '#15803d', textTransform: 'uppercase' }}>IMPORTE A PAGAR (ARS)</th>
                        <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: 9, fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>APLICACIÓN ({currency})</th>
                     </tr>
                  </thead>
                  <tbody>
                     <tr style={{ borderBottom: '1.5px solid #f1f5f9' }}>
                        <td style={{ textAlign: 'center', padding: '20px' }}>
                           <div style={{ width: 28, height: 28, borderRadius: 8, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                             <Check size={16} strokeWidth={3} />
                           </div>
                        </td>
                        <td style={{ padding: '20px' }}>
                          <div style={{ fontWeight: 800, color: '#1e293b', fontSize: 13 }}>{number}</div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', marginTop: 4 }}>U.N. {ctroCosto} / {currency === 'USD' ? 'DÓLAR' : 'PESO'}</div>
                        </td>
                        <td style={{ padding: '20px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#475569' }}>{new Date(date).toLocaleDateString()}</td>
                        <td style={{ padding: '20px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#475569' }}>{exchangeRate.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '20px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '20px', textAlign: 'right', background: 'rgba(36, 56, 156, 0.02)', fontSize: 14, fontWeight: 900, color: '#24389c' }}>
                           {(balance * payExchangeRate).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '20px', textAlign: 'right', width: 180 }}>
                           <input 
                              type="number" 
                              style={{ width: '100%', height: 42, border: '2px solid #bbf7d0', textAlign: 'right', padding: '0 16px', fontWeight: 950, borderRadius: 12, outline: 'none', background: '#f0fdf4', color: '#15803d', fontSize: 15 }}
                              value={payAmount} 
                              onChange={e => setPayAmount(parseFloat(e.target.value) || 0)} 
                              max={balance * payExchangeRate}
                           />
                        </td>
                        <td style={{ padding: '20px', textAlign: 'right', fontSize: 14, fontWeight: 800, color: '#64748b' }}>
                           {currency === 'USD' 
                             ? (payExchangeRate > 0 ? (payAmount / payExchangeRate) : 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })
                             : payAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })
                           }
                        </td>
                     </tr>
                  </tbody>
               </table>
            </div>

            {/* Footer Section */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 32, marginTop: 12 }}>
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>TOTAL A PAGAR</span>
                  <span style={{ fontSize: 32, fontWeight: 950, color: '#24389c', letterSpacing: '-0.02em' }}>
                    {payAmount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                  </span>
               </div>
               
               <button 
                  onClick={() => {
                     const amountInInvoiceCurrency = payExchangeRate > 0 ? payAmount / payExchangeRate : 0;
                     setShowPaymentModal(false);
                     openWindow('receipt-form', {
                        initialEntity: entity,
                        initialDate: payDate,
                        initialApplications: [{
                           to_document_id: id,
                           number: number,
                           date: date, // Keep invoice date for reference in the application
                           remaining: balance,
                           currency: currency,
                           amount_applied: amountInInvoiceCurrency, 
                        }],
                        initialCurrency: 'ARS',
                        initialExchangeRate: payExchangeRate,
                     }, {
                        title: `Nuevo Recibo - ${entity?.name}`,
                        width: 1100,
                        height: 850
                     });
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, height: 56, padding: '0 32px', borderRadius: 16, background: '#24389c', color: '#fff', border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 10px 25px rgba(36, 56, 156, 0.25)', transition: 'transform 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
               >
                  <ArrowUpRight size={20} />
                  TRANSFERIR AL RECIBO
               </button>
            </div>
          </div>
        </Modal>
      )}

      {showItemSelector && (
         <Modal 
            open={showItemSelector}
            title={`Vincular Ítems Pendientes (${selectorType === 'OV' ? 'Pedidos' : 'Remitos'})`} 
            onClose={() => setShowItemSelector(false)} 
            style={{ maxWidth: 1150 }}
          >
            <div style={{ padding: '0 24px 24px' }}>
               {selectorLoading ? (
                  <div style={{ padding: 60, textAlign: 'center', color: '#64748b', fontWeight: 600 }}>Sincronizando pendientes...</div>
               ) : (
                  <>
                     <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center' }}>
                         <div style={{ flex: 1, position: 'relative' }}>
                             <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                             <Input 
                                placeholder="🔍 Filtrar por producto o origen..." 
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

                     <div className={t.tableWrap} style={{ maxHeight: '60vh', overflowY: 'auto', borderRadius: 24, border: '1px solid #e2e8f0', boxShadow: '0 15px 35px -5px rgba(0,0,0,0.1)' }}>
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
                                 <th colSpan="3" style={{ textAlign: 'center', background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', padding: '12px 0' }}>U. MEDIDA ({selectableItems[0]?.unit_short_name || 'u'})</th>
                                 <th colSpan="3" style={{ textAlign: 'center', background: '#eff6ff', borderBottom: '1px solid #cbd5e1', padding: '12px 0' }}>CONTENEDORES ({selectableItems[0]?.container_name || 'u'})</th>
                                 <th rowSpan="2" style={{ textAlign: 'right', width: 120, borderBottom: '2px solid #cbd5e1', background: '#f8fafc' }}>APLICAR (CONT.)</th>
                              </tr>
                              <tr style={{ background: '#f8fafc', fontSize: 9 }}>
                                 <th style={{ textAlign: 'center', width: 80, background: '#f1f5f9', fontWeight: 800 }}>PENDIENTE</th>
                                 <th style={{ textAlign: 'center', width: 80, background: '#f1f5f9', fontWeight: 800 }}>FACTURADO</th>
                                 <th style={{ textAlign: 'center', width: 80, background: '#f1f5f9', color: '#2563eb', fontWeight: 950 }}>DISP.</th>
                                 <th style={{ textAlign: 'center', width: 80, background: '#eff6ff', fontWeight: 800 }}>PENDIENTE</th>
                                 <th style={{ textAlign: 'center', width: 80, background: '#eff6ff', fontWeight: 800 }}>FACTURADO</th>
                                 <th style={{ textAlign: 'center', width: 80, background: '#eff6ff', color: '#2563eb', fontWeight: 950 }}>DISP.</th>
                              </tr>
                           </thead>
                           <tbody style={{ fontSize: '0.9em' }}>
                              {selectableItems.filter(i => 
                                 i.product_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                 i.parent_number.toLowerCase().includes(searchTerm.toLowerCase())
                              ).length === 0 ? (
                                 <tr>
                                    <td colSpan="10" style={{ padding: 80, textAlign: 'center', color: '#94a3b8' }}>
                                       <ShoppingCart size={48} style={{ opacity: 0.1, marginBottom: 16 }} />
                                       <p style={{ fontWeight: 800 }}>No hay ítems pendientes de facturación</p>
                                    </td>
                                 </tr>
                              ) : (
                                 selectableItems.filter(i => 
                                     i.product_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                     i.parent_number.toLowerCase().includes(searchTerm.toLowerCase())
                                 ).map((item) => {
                                    const factor = item.quantity_per_container || 1;
                                    // Backwards compatibility or mapping: qty is usually total, qty_pending is what's left
                                    // qty_fulfilled in the context of Invoice means qty_invoiced
                                    const c_total = (item.qty || 0) / factor;
                                    const c_rem = (item.qty_fulfilled || 0) / factor;
                                    const c_disp = (item.qty_pending || 0) / factor;
                                    
                                    const currentUnitVal = selectorQuantities[item.id] !== undefined ? selectorQuantities[item.id] : item.qty_pending;
                                    const currentContVal = currentUnitVal / factor;

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
                                             <Badge color={selectorType === 'OV' ? 'green' : 'blue'} variant="outline" style={{ fontWeight: 900 }}>{item.parent_number}</Badge>
                                             <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 3, fontWeight: 700 }}>{new Date(item.date).toLocaleDateString()}</div>
                                          </td>
                                          <td onClick={() => {
                                             if (selectedSelectorItems.some(si => si.id === item.id)) {
                                                setSelectedSelectorItems(prev => prev.filter(si => si.id !== item.id));
                                             } else {
                                                setSelectedSelectorItems(prev => [...prev, item]);
                                             }
                                          }}>
                                             <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b', lineHeight: 1 }}>{item.product_name}</div>
                                             <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginTop: 4 }}>{item.description}</div>
                                          </td>
                                          {/* Unidad de Medida */}
                                          <td style={{ textAlign: 'center', background: '#f8fafc', color: '#64748b', fontWeight: 800 }}>{(item.qty || 0).toLocaleString()}</td>
                                          <td style={{ textAlign: 'center', background: '#f8fafc', color: '#94a3b8', fontWeight: 800 }}>{(item.qty_fulfilled || 0).toLocaleString()}</td>
                                          <td style={{ textAlign: 'center', background: '#f1f5f9', color: '#2563eb', fontWeight: 950 }}>{(item.qty_pending || 0).toLocaleString()}</td>
                                          
                                          {/* Contenedores */}
                                          <td style={{ textAlign: 'center', background: '#fafbfc', color: '#64748b', fontWeight: 800 }}>{c_total.toLocaleString()}</td>
                                          <td style={{ textAlign: 'center', background: '#fafbfc', color: '#94a3b8', fontWeight: 800 }}>{c_rem.toLocaleString()}</td>
                                          <td style={{ textAlign: 'center', background: '#eff6ff', color: '#2563eb', fontWeight: 950 }}>{c_disp.toLocaleString()}</td>

                                          <td style={{ textAlign: 'right', paddingRight: 12 }}>
                                             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                                                 <input 
                                                     type="number" 
                                                     style={{ width: 95, padding: '8px 12px', borderRadius: 12, border: '2px solid #cbd5e1', textAlign: 'right', fontWeight: 950, fontSize: 14, color: '#1e293b', background: '#fff' }} 
                                                     value={currentContVal}
                                                     max={c_disp}
                                                     min={0}
                                                     step="any"
                                                     onChange={(e) => {
                                                         const cVal = parseFloat(e.target.value) || 0;
                                                         const uVal = cVal * factor;
                                                         setSelectorQuantities(prev => ({ ...prev, [item.id]: uVal }));
                                                         if (cVal > 0 && !selectedSelectorItems.some(si => si.id === item.id)) {
                                                             setSelectedSelectorItems(prev => [...prev, item]);
                                                         } else if (cVal <= 0) {
                                                             setSelectedSelectorItems(prev => prev.filter(si => si.id !== item.id));
                                                         }
                                                     }}
                                                     onClick={(e) => e.stopPropagation()}
                                                 />
                                                 <div style={{ fontSize: 9, fontWeight: 900, color: '#2563eb' }}>{currentUnitVal.toLocaleString()} {item.unit_short_name}</div>
                                             </div>
                                          </td>
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
