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
import { openEditPurchaseOrder } from '../../utils/openStandaloneWindow';
import { useToast } from '../../context/ToastContext';
import { useCostCenter } from "../../context/CostCenterContext";
import { API_URL } from "../../config";
import { TraceabilityStatusBadge } from "../../components/ui/TraceabilityStatusBadge";
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
  ArrowRight
} from "lucide-react";
import s from "../sales/SalesOrderForm.module.css"; // Using SalesOrderForm.module.css for consistent styling
import t from "../../components/ui/Table.module.css";
import LoadingScreen from "../../components/ui/LoadingScreen";
import ManualLinkInvoiceModal from "../sales/ManualLinkInvoiceModal"; // Needs to be adapted or removed for purchases

export default function PurchaseDeliveryNoteForm(props) {
  const {
    mode: initialMode = "new",
    id: initialId = null,
    windowId,
    oc_id = null, // Changed from ov_id to oc_id
    autoOpenSelector = false,
    preselectedLines = null,
    initialData = null,
    isStandalone = false,
  } = props;
  const { closeWindow, openWindow } = useWindow(); // Keep for now, might be removed if standalone
  const { showToast } = useToast();
  const { costCenter } = useCostCenter();

  const [mode, setMode] = useState(initialMode);
  const [id, setId] = useState(initialId);
  const [loading, setLoading] = useState(mode === "edit");
  const [items, setItems ] = useState([]);
  const [activeTab, setActiveTab ] = useState("items"); // Remove later
  const [sourceId, setSourceId] = useState(props.initialSourceId || oc_id || ''); // Changed from ov_id
  const [sourceType, setSourceType] = useState(props.initialSourceType || (oc_id ? 'purchase-order' : '')); // Changed from sales-order
  const [sourceOrderId, setSourceOrderId] = useState(oc_id || ''); // Changed from ov_id
    const [invoices, setInvoices] = useState([]);
  const [relatedDeliveryNotes, setRelatedDeliveryNotes] = useState([]);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [showItemSelector, setShowItemSelector] = useState(false);
  const [selectableItems, setSelectableItems] = useState([]);
  const [selectorLoading, setSelectorLoading] = useState(false);
  const [selectedSelectorItems, setSelectedSelectorItems] = useState([]);
  const [selectorQuantities, setSelectorQuantities] = useState({});
  const [linkingItemId, setLinkingItemId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showManualLinkModal, setShowManualLinkModal] = useState(false);
  
  // --- Header Data ---
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [ctroCosto, setCtroCosto] = useState(String(costCenter || 1));
  const [entity, setEntity] = useState(null); // This will be supplier
  const [pv, setPv] = useState("0001");
  const [number, setNumber] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [observations, setObservations] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [dueDate, setDueDate] = useState("");
  const [buyer, setBuyer] = useState(""); // Changed from vendedor
  const [buyerId, setBuyerId] = useState(""); // Changed from salespersonId
  const [selectedConditionId, setSelectedConditionId] = useState(""); // This will be purchase condition
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
  const [buyers, setBuyers] = useState([]); // Changed from sellers
  const [purchaseConditions, setPurchaseConditions] = useState([]); // Changed from saleConditions

  // --- Calculations ---
  const totals = useMemo(() => {
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

  const orderedLts = useMemo(() => items.reduce((acc, item) => acc + ((parseFloat(item.qty) || 0) * (parseFloat(item._unit_content) || 1)), 0), [items]);

    useEffect(() => {
    if (oc_id) {
      console.log("oc_id recibido en form:", oc_id);
    }
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (!initialData || mode !== 'new') return;
    const load = async () => {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
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
           }
  }, [id]);

  useEffect(() => {
    if (mode === "edit" && id) {
        fetchDeliveryNote();
            }
    else if (mode === "new" && oc_id) { // Changed from ov_id
        console.log("[Remito Compra] oc_id:", oc_id, "preselectedLines:", preselectedLines?.length ?? 'null');
        if (preselectedLines && preselectedLines.length > 0) {
            fetchHeaderFromPurchaseOrder(true); // Changed from SalesOrder
            const normalizedItems = preselectedLines.map((line) => {
                const qtyToReceive = Number(
                  line.qty_to_receive ??
                  line.qty_to_remit ??
                  line.qty_packages ??
                  line.qty ??
                  0
                );
                const qtyPending = Number(
                  line.qty_pending ??
                  line.pending_qty ??
                  line.qty_ordered ??
                  line.qty ??
                  0
                );
                return {
                    id: crypto.randomUUID?.() || `${line.id}-${Date.now()}`,
                    purchase_order_id: line.purchase_order_id || sourceId,
                    source_purchase_line_id: line.source_purchase_line_id || line.id,
                    product_id: line.product_id,
                    product_name: line.product_name || line.description,
                    description: line.description || line.product_name,
                    qty: qtyToReceive,
                    qty_packages: qtyToReceive,
                    qty_to_receive: qtyToReceive,
                    qty_pending: qtyPending,
                    qty_received: Number(line.qty_received ?? 0),
                    unit_price: Number(line.unit_price ?? 0),
                    discount_pct: Number(line.discount_pct ?? 0),
                    vat_rate: Number(line.vat_rate ?? 21),
                    warehouse_id: line.warehouse_id || warehouseId,
                    _account_code: line.purchase_account_code || line._account_code || 'S/C',
                    _unit_content: parseFloat(line._unit_content || 1),
                    _container_name: line._container_name || 'Unidad',
                    _unit_label: line._unit_label || 'u',
                    _parent_number: line.parent_number || '',
                };
            });
            console.log("[Modal Remito Compra] normalized items to form:", normalizedItems);
            setItems(normalizedItems);
        } else if (autoOpenSelector) {
            fetchHeaderFromPurchaseOrder(false); // Changed from SalesOrder
        } else {
            fetchFromPurchaseOrder(); // Changed from SalesOrder
        }
    }
  }, [mode, id, oc_id, autoOpenSelector]);

  useEffect(() => {
    if (sourceId && sourceType === 'purchase-order') { // Changed from sales-order
        const orderIdToTrace = sourceOrderId || sourceId;
            }
  }, [sourceId, sourceType, sourceOrderId]);

  useEffect(() => {
    if (mode === "new" && !oc_id && pointsOfSale.length > 0) { // Changed from ov_id
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
    const skipHeavyLists = mode === "new" && (oc_id || isStandalone); // Changed from ov_id

    const queries = [
      fetch(`${API_URL}/inventory/warehouses/`, { headers }),
      fetch(`${API_URL}/config/pos`, { headers })
    ];

    if (!skipHeavyLists) {
      queries.push(fetch(`${API_URL}/entities/?is_buyer=true`, { headers })); // Changed from is_salesperson
      queries.push(fetch(`${API_URL}/purchases/purchase-conditions/`, { headers })); // Changed from sales/sale-conditions
    }

    const [whRes, posRes, buyRes, condRes] = await Promise.all(queries); // Changed from spRes, scRes

    if (whRes?.ok) {
        const whs = await whRes.json();
        setWarehouses(whs);
        if (whs.length > 0 && mode === "new") setWarehouseId(whs[0].id);
    }
    
    if (buyRes?.ok) setBuyers(await buyRes.json()); // Changed from setSellers
    if (condRes?.ok) setPurchaseConditions(await condRes.json()); // Changed from setSaleConditions
    
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
        
    }
  };

  const fetchNextNumber = async (v_pv) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/config/pos/next-number?pv=${v_pv}&doc_type=PE`, { headers: { Authorization: `Bearer ${token}` } }); // Changed doc_type to PE
    if (res.ok) {
        const data = await res.json();
        setNumber(data.full_number || data.number || `${v_pv}-${data.next_number}`);
    }
  };

  const fetchDeliveryNote = async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/purchases/delivery-notes/${id}`, { headers: { Authorization: `Bearer ${token}` } }); // Changed sales to purchases
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
        setSourceId(data.purchase_order_id ? data.origin_reference : ''); // Changed from sales_order_id
        setSourceType(data.purchase_order_id ? 'purchase-order' : ''); // Changed from sales-order_id
        if (data.purchase_order_id) { // Changed from sales_order_id
            setSourceOrderId(data.purchase_order_id); // Changed from sales_order_id
             // Changed from sales_order_id
        }
        setBuyer(data.buyer || ''); // Changed from vendedor
        setBuyerId(data.buyer_id || ''); // Changed from salesperson_id
        setSelectedConditionId(data.purchase_condition_id || ''); // Changed from sale_condition_id
        setDueDate(data.due_date ? data.due_date.split("T")[0] : '');
        setCurrency(data.currency || 'USD');
        setExchangeRate(data.exchange_rate || 1);
        setCtroCosto(String(data.cost_center || 1));
        setInvoices(data.invoices || []);
        setRelatedDeliveryNotes(data.related_delivery_notes || []);
        
        setVehicleDriver(data.vehicle_driver || '');
        setVehiclePlate(data.plate || '');
        setTransporter(data.transporter || '');

        let ocLinesMap = {}; // Changed from ovLinesMap
        if (data.purchase_order_id) { // Changed from sales_order_id
            try {
                const ocRes = await fetch(`${API_URL}/purchases/purchase-orders/${data.purchase_order_id}`, { headers: { Authorization: `Bearer ${token}` } }); // Changed sales to purchases
                if (ocRes.ok) {
                    const ocData = await ocRes.json();
                    ocData.lines.forEach(l => { ocLinesMap[l.id] = l; });
                }
            } catch(e) {}
        }

        setItems(data.lines.map(l => {
            const ocL = ocLinesMap[l.source_purchase_line_id] || {}; // Changed from ovL and source_purchase_line_id
            return {
                ...l,
                id: l.id,
                product_id: l.product_id,
                description: l.description,
                qty_ordered: ocL.qty || 0, // This is qty_ordered from purchase order
                qty_received: ocL.qty_received || 0, // Changed from qty_delivered
                qty_pending: Math.max(0, (ocL.qty || 0) - (ocL.qty_received || 0)), // Changed from qty_delivered
                qty: l.qty,
                unit_price: l.unit_price, // This is COST
                discount_pct: l.discount_pct,
                vat_rate: l.vat_rate,
                _account_code: l.product?.purchase_account_code || 'S/C', // Changed from sales_account_code
                _unit_content: l.product?.quantity_per_container || 1,
                _container_name: l.product?.container?.name || 'Unidad',
                _unit_label: l.product?.container?.unit?.short_name || 'u',
                source_purchase_line_id: l.source_purchase_line_id,
                qty_invoiced: l.qty_invoiced || 0
            };
        }));
    }
    setLoading(false);
  };

  const fetchHeaderFromPurchaseOrder = async (skipSelector = false) => { // Changed from SalesOrder
    setLoading(true);
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/purchases/purchase-orders/${oc_id}`, { headers: { Authorization: `Bearer ${token}` } }); // Changed sales to purchases
    if (res.ok) {
        const data = await res.json();
        console.log("OC cargada:", data); // Changed from OV
        if (data.entity_id) {
          const entityRes = await fetch(`${API_URL}/entities/${data.entity_id}`, { headers: { Authorization: `Bearer ${token}` }});
          if (entityRes.ok) {
            const entData = await entityRes.json();
            setEntity(entData); // This is supplier
            if (!skipSelector) {
              handleOpenItemSelector(null, data.id, entData.id);
            }
          }
        }
        const costCenterStr = String(data.cost_center || 1);
        setCtroCosto(costCenterStr);
        setSourceId(data.number);
        setSourceType('purchase-order'); // Changed from sales-order
        setSourceOrderId(data.id);
                setBuyer(data.buyer || ''); // Changed from vendedor
        setBuyerId(data.buyer_id || ''); // Changed from salesperson_id
        setSelectedConditionId(data.purchase_condition_id || ''); // Changed from sale_condition_id
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

  const fetchFromPurchaseOrder = async () => { // Changed from SalesOrder
    setLoading(true);
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/purchases/purchase-orders/${oc_id}`, { headers: { Authorization: `Bearer ${token}` } }); // Changed sales to purchases
    if (res.ok) {
        const data = await res.json();
        console.log("OC cargada:", data); // Changed from OV
        if (data.entity_id) {
          const entityRes = await fetch(`${API_URL}/entities/${data.entity_id}`, { headers: { Authorization: `Bearer ${token}` }});
          if (entityRes.ok) setEntity(await entityRes.json()); // This is supplier
        }
        const costCenterStr = String(data.cost_center || 1);
        setCtroCosto(costCenterStr);
        setSourceId(data.number);
        setSourceType('purchase-order'); // Changed from sales-order
        setSourceOrderId(data.id);
                setBuyer(data.buyer || ''); // Changed from vendedor
        setBuyerId(data.buyer_id || ''); // Changed from salesperson_id
        setSelectedConditionId(data.purchase_condition_id || ''); // Changed from sale_condition_id
        setDueDate(data.due_date ? data.due_date.split("T")[0] : '');
        setCurrency(data.currency || 'USD');
        setExchangeRate(data.exchange_rate || 1);
        setWarehouseId(data.warehouse_id || (warehouses.length > 0 ? warehouses[0].id : ''));

        const targetPvCode = costCenterStr === "1" ? "0001" : "0002";
        const pvCode = (pointsOfSale.find(p => p.pv === targetPvCode)?.pv || pointsOfSale[0]?.pv || targetPvCode);
        setPv(pvCode);
        fetchNextNumber(pvCode);

        const pendingUrl = `${API_URL}/purchases/pending-items/purchase-orders?purchase_order_id=${oc_id}`;
        console.log("[Remito Compra] pending URL:", pendingUrl);
        const linesRes = await fetch(pendingUrl, {
           headers: { Authorization: `Bearer ${token}` }
        });
        if (linesRes.ok) {
           const pendingLines = await linesRes.json();
           console.log("[Remito Compra] pending response:", pendingLines);
           const filteredLines = pendingLines; // Already filtered by purchase_order_id in backend
           setItems(filteredLines.map(l => {
              const uc = l.quantity_per_container || 1;
              return {
                 id: Math.random(),
                 product_id: l.product_id,
                 description: l.product_name,
                 qty_ordered: l.qty,
                 qty_received: l.qty_fulfilled, // Changed from qty_fulfilled
                 qty_pending: l.qty_pending,
                 qty: l.qty_pending, // User requested total pendiente by default
                 qty_packages: uc > 1 ? l.qty_pending / uc : l.qty_pending,
                 unit_price: l.unit_price, // This is COST
                 discount_pct: l.discount_pct,
                 vat_rate: l.vat_rate,
                 _account_code: l.purchase_account_code || 'S/C', // Changed from sales_account_code
                 _unit_content: uc,
                 _container_name: l.container_name || 'Unidad',
                 _unit_label: l.unit_short_name || 'u',
                 source_purchase_line_id: l.id, // Changed from source_purchase_line_id
                 _parent_number: l.parent_number
              };
           }));
        }
    }
    setLoading(false);
  };

  
  
  const searchEntities = async (q) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/entities/?q=${q}&type=supplier`, { headers: { Authorization: `Bearer ${token}` } }); // Changed type to supplier
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
      qty: 1 * (product.quantity_per_container || 1), // Apply purchase order fix
      qty_packages: 1, // Apply purchase order fix
      unit_price: product.cost_price || 0, // Use cost_price for purchases
      discount_pct: 0,
      vat_rate: product.tax_type?.rate || 0.21,
      _account_code: product.purchase_account_code || 'S/C', // Changed from sales_account_code
      _unit_content: product.quantity_per_container || 1,
      _container_name: product.container?.name || 'Unidad',
      _unit_label: product.container?.unit?.short_name || 'u',
    }]);
  };

  const handleOpenItemSelector = async (itemId = null, specificOcId = null, specificEntityId = null) => { // Changed specificOvId to specificOcId
    const targetEntityId = specificEntityId || entity?.id;
    if (!targetEntityId) {
        showToast("Seleccione un proveedor para ver órdenes de compra pendientes", "warning"); // Changed cliente to proveedor
        return;
    }
    setLinkingItemId(itemId);
    setShowItemSelector(true);
    setSelectorLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/purchases/pending-items/purchase-orders?entity_id=${targetEntityId}`, { // Changed sales to purchases
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        let filteredData = data;
        if (specificOcId) { // Changed specificOvId
             filteredData = data.filter(i => String(i.parent_id) === String(specificOcId)); // Changed specificOvId
        }
        setSelectableItems(filteredData);
        const qties = {};
        filteredData.forEach(i => {
             qties[i.id] = i.qty_pending;
        });
        setSelectorQuantities(qties);
        if (specificOcId) { // Changed specificOvId
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
          setSourceType('purchase-order'); // Changed from sales-order
                }
      if (item.currency === 'USD' && currency === 'ARS') {
        finalUnitPrice = item.unit_price * exchangeRate;
      } else if (item.currency === 'ARS' && currency === 'USD') {
        finalUnitPrice = exchangeRate > 0 ? item.unit_price / exchangeRate : item.unit_price;
      }
      return {
        id: Math.random(),
        product_id: item.product_id,
        description: item.product_name || item.description,
        qty: selectorQuantities[item.id] !== undefined ? selectorQuantities[item.id] : (item.qty_pending || 0),
        unit_price: finalUnitPrice, // This is COST
        discount_pct: item.discount_pct || 0,
        vat_rate: item.vat_rate || 0.21,
        _account_code: item.purchase_account_code || 'S/C', // Changed from sales_account_code
        _unit_content: item.quantity_per_container || 1,
        _container_name: item.container_name || 'Unidad',
        _unit_label: item.unit_short_name || item.unit_label || 'u',
        source_purchase_line_id: item.id, // Changed from source_purchase_line_id
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
    setItems(prev => prev.map((i) => {
        if (i.id !== itemId) return i;
        const newItem = { ...i, [field]: value === "" ? "" : Number(value) };
        if (field === 'qty') {
            newItem.qty = value === "" ? "" : Number(value);
        }
        if (field === 'qty_packages') {
            newItem.qty_packages = value === "" ? "" : Number(value);
            newItem.qty = (value === "" ? 0 : Number(value)) * (i._unit_content || 1);
        }
        if (field === 'equiv') {
            const factor = i._unit_content || 1;
            newItem.qty = (value === "" ? 0 : Number(value)) / factor;
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
      const res = await fetch(`${API_URL}/purchases/delivery-notes/${id}/unlink`, { // Changed sales to purchases
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast("Desvinculado correctamente", "success");
        window.dispatchEvent(new CustomEvent("purchase-delivery-note-changed")); // Changed event name
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
    if (!entity) return showToast("Falta proveedor", "error"); // Changed cliente
    if (!warehouseId) return showToast("Falta depósito", "error");
    
    const validItems = items.filter(l => Number(l.qty) > 0);
    if (validItems.length === 0) return showToast("Agregue al menos un producto con cantidad a recibir mayor a cero", "error"); // Changed remitir

    if (mode === 'new') {
        const exceedingItems = validItems.filter(l => l.qty_pending !== undefined && Number(l.qty) > l.qty_pending);
        if (exceedingItems.length > 0) {
            return showToast("Existen productos donde la cantidad a recibir supera la cantidad pendiente", "error"); // Changed remitir
        }
    }

    setLoading(true);
    const token = localStorage.getItem("token");
    const payload = {
        entity_id: entity.id,
        warehouse_id: warehouseId,
        number: number,
        date: date,
        due_date: dueDate,
        currency: currency,
        exchange_rate: exchangeRate,
        buyer: buyer,
        buyer_id: buyerId,
        purchase_condition_id: selectedConditionId,
        cost_center: parseInt(ctroCosto),
        notes: observations,
        vehicle_driver: vehicleDriver,
        plate: vehiclePlate,
        transporter: transporter,
        lines: validItems.map(l => ({
            product_id: l.product_id,
            description: l.description,
            qty: Number(l.qty),
            qty_packages: l.qty_packages !== undefined ? l.qty_packages : Number(l.qty) / (l._unit_content || 1),
            package_size: l._unit_content,
            unit_price: l.unit_price,
            discount_pct: l.discount_pct,
            vat_rate: l.vat_rate,
            source_purchase_line_id: l.source_purchase_line_id || l.id,
            purchase_order_id: l.purchase_order_id
        }))
    };

    try {
        const isEdit = mode === 'edit' && id;
        const method = isEdit ? "PUT" : "POST";
        let url = `${API_URL}/purchases/delivery-notes/`;
        if (isEdit) {
            url = `${API_URL}/purchases/delivery-notes/${id}`; // Changed sales to purchases
        } else if (sourceId) {
            const actualSourceId = sourceOrderId || sourceId;
            if (sourceType === 'purchase-order') { // Changed sales-order
                url = `${API_URL}/purchases/delivery-notes/from-oc/${actualSourceId}`; // Changed sales to purchases, from-ov to from-oc
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
            showToast("Remito de Entrada guardado exitosamente", "success"); // Changed Remito
            window.dispatchEvent(new CustomEvent("purchase-delivery-note-changed")); // Changed event name
            setMode("edit");
            setId(savedId);
        } else {
            const err = await res.json();
            showToast(err.detail || "Error al guardar", "error");
        }
    } finally {
        setLoading(false);
    }
  };

  const handlePrint = () => {
    window.open(`${API_URL}/purchases/delivery-notes/${id}/pdf`, '_blank'); // Changed sales to purchases
  };
  const handlePrintPreprinted = () => {
    const token = localStorage.getItem("token");
    window.open(`${API_URL}/purchases/delivery-notes/${id}/pdf?format=preprinted&token=${token}`, "_blank"); // Changed sales to purchases
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
      <div className={`${s.formCard}`} style={isLocked ? { pointerEvents: 'none' } : {}}>
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
                          {mode === 'new' ? 'Nuevo Remito de Entrada' : `Remito de Entrada`}
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
                  <button className={s.saveBtn} onClick={handleSave} disabled={isLocked} style={isLocked ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
                      <Save size={16} />
                      Guardar
                  </button>
                  <div className={s.actionGroup}>
                      <button className={s.actionBtn} disabled={!id || isLocked} onClick={async () => {
                          if (!window.confirm("¿Estás seguro de anular este remito? Esta acción no se puede deshacer.")) return;
                          try {
                              const token = localStorage.getItem("token");
                              const res = await fetch(`${API_URL}/purchases/delivery-notes/${id}/cancel`, { // Changed sales to purchases
                                  method: "POST", headers: { Authorization: `Bearer ${token}` } 
                              });
                              if (res.ok) {
                                  window.dispatchEvent(new CustomEvent("purchase-delivery-note-changed")); // Changed event name
                                  closeWindow(windowId);
                              }
                          } catch (e) {
                              console.error(e);
                          }
                      }} title="Anular Remito" style={{ color: '#ef4444' }}>
                          <Trash2 size={18} /> Anular
                      </button>
                      <button className={s.actionBtn} disabled={!id} onClick={handlePrintPreprinted} title="Imprimir Remito">
                          <Printer size={18} /> Imprimir
                      </button>
                      <button className={s.actionBtn} onClick={() => closeWindow(windowId)} title="Volver">
                          <X size={18} /> Volver
                      </button>
                  </div>
              </div>
          </div>

          {/* Body: 2 Column Layout */}
          <div className={s.bodyTwoColumns} style={{ opacity: isLocked ? 0.8 : 1 }}>
              {/* Columna Izquierda: Ítems y Productos */}
              <div className={s.leftCol}>
                  <div className={s.bentoContainer} style={{ padding: 0, overflow: 'hidden' }}>
                      {items.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {isReadOnly ? null : (
                                <div className={s.tableHeader} style={{ gridTemplateColumns: isReadOnly ? 'minmax(360px, 1fr) 80px 90px 45px 90px 100px' : 'minmax(360px, 1fr) 80px 90px 45px 90px 100px 30px', width: '100%', boxSizing: 'border-box' }}>
                                    <div className={s.th}>Producto</div>
                                    <div className={s.th} style={{ textAlign: 'left' }}>Cant.</div>
                                    <div className={s.th} style={{ textAlign: 'right' }}>Recibir</div> {/* Changed from Remitir */}
                                    <div className={s.th} style={{ textAlign: 'center' }}>Un.</div>
                                    <div className={s.th} style={{ textAlign: 'right' }}>Costo U.</div> {/* Changed from P.Unit */}
                                    <div className={s.th} style={{ textAlign: 'right' }}>Subtotal</div>
                                    <div></div>
                                </div>
                            )}
                            <div className={s.itemsList} style={{ overflowX: 'hidden' }}>
                                {items.map(item => {
                                    if (isReadOnly) {
                                        const qtyOrdered = parseFloat(item.qty_ordered) || 0;
                                        const qtyReceived = parseFloat(item.qty_received) || 0; // Changed from qtyDelivered
                                        const qtyPending = parseFloat(item.qty_pending) || 0;
                                        
                                        const qtyPackages = item.qty_packages;
                                        const qty = item.qty || 0;
                                        const hasPackages = qtyPackages !== undefined && qtyPackages !== null;
                                        const subtotal = qty * (item.unit_price || 0);
                                        
                                        return (
                                            <div key={item.id} style={{ display: 'flex', flexDirection: 'column', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', gap: 8 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b' }}>Producto: {item.name || item.product?.name || item.description}</div>
                                                    <div style={{ display: 'flex', gap: 12, fontSize: 11, background: '#f8fafc', padding: '4px 12px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                                        <div style={{ color: '#64748b' }}><span style={{ fontWeight: 800 }}>Ped:</span> {qtyOrdered.toFixed(2)}</div>
                                                        <div style={{ color: 'var(--ok)' }}><span style={{ fontWeight: 800 }}>Rec:</span> {qtyReceived.toFixed(2)}</div> {/* Changed from Rem */}
                                                        <div style={{ color: qtyPending > 0 ? 'var(--warning)' : 'var(--ok)' }}><span style={{ fontWeight: 800 }}>Pte:</span> {qtyPending.toFixed(2)}</div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 24px', fontSize: 12, color: '#475569' }}>
                                                    {hasPackages ? (
                                                        <>
                                                            <div><span style={{ fontWeight: 800 }}>Cantidad:</span> {qtyPackages} envases</div>
                                                            <div><span style={{ fontWeight: 800 }}>Equivalencia:</span> {qtyPackages} envases = {qty.toFixed(2)} {item._unit_label || 'u'}</div>
                                                        </>
                                                    ) : (
                                                        <div><span style={{ fontWeight: 800 }}>Cantidad:</span> {qty.toFixed(2)} {item._unit_label || 'u'}</div>
                                                    )}
                                                    <div><span style={{ fontWeight: 800 }}>Costo:</span> {Number(item.unit_price || 0).toLocaleString('es-AR', { style: 'currency', currency: item.currency || currency || 'ARS' })} / {item._unit_label || 'u'}</div> {/* Changed from Precio */}
                                                    <div style={{ color: 'var(--primary)', fontWeight: 900 }}><span style={{ fontWeight: 800, color: '#1e293b' }}>Subtotal:</span> {Number(subtotal).toLocaleString('es-AR', { style: 'currency', currency: item.currency || currency || 'ARS' })}</div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    
                                  const isExceeding = mode === 'new' && item.qty > (item.qty_pending || 0);
                                  return (
                                    <div key={item.id} className={s.tableRow} style={{ gridTemplateColumns: isReadOnly ? 'minmax(360px, 1fr) 80px 90px 45px 90px 100px' : 'minmax(360px, 1fr) 80px 90px 45px 90px 100px 30px', background: isExceeding ? '#fef2f2' : 'transparent', width: '100%', boxSizing: 'border_box' }}>
                                        <div style={{ padding: '4px 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
                                            <div style={{ fontSize: 11, fontWeight: 900, color: '#1e293b', lineHeight: 1.1, whiteSpace: 'normal', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {item.name || item.product?.name || item.description}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', fontSize: 11, lineHeight: 1.15, height: '100%' }}>
                                            <div style={{ color: '#64748b' }}><span style={{ fontWeight: 800 }}>Ped:</span> {item.qty_ordered || 0}</div>
                                            <div style={{ color: 'var(--ok)' }}><span style={{ fontWeight: 800 }}>Rec:</span> {item.qty_received || 0}</div> {/* Changed from Rem */}
                                            <div style={{ color: (item.qty_pending || 0) > 0 ? 'var(--warning)' : 'var(--ok)' }}><span style={{ fontWeight: 800 }}>Pte:</span> {(item.qty_pending || 0).toFixed(2)}</div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                            <input type="number" step="0.01" min="0" max={item.qty_pending ?? undefined} className={s.tableInput} value={item.qty ?? ""} onChange={(e) => updateItem(item.id, 'qty', e.target.value)} readOnly={isReadOnly || mode === 'edit'} style={{ background: (isReadOnly || mode === 'edit') ? 'transparent' : '#fff', textAlign: 'right', fontWeight: 800, color: isExceeding ? '#ef4444' : 'var(--primary)', width: 78, border: isExceeding ? '1px solid #ef4444' : '1px solid var(--border-color)', paddingRight: 8, borderRadius: 6, height: 30 }} />
                                            {item._unit_content > 1 && (
                                                <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>
                                                    = {(Number(item.qty || 0) / (item._unit_content || 1)).toFixed(2)} {item._container_name || 'Envases'}
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
              </div>

              {/* Columna Derecha: Panel Lateral Administrativo */}
              {/* Columna Derecha: Panel Lateral Administrativo */}
              <div className={s.rightCol}>
                  {/* Bloque Proveedor */}
                  <div className={s.sideBlock}>
                      <div className={s.sideBlockTitle}><User size={12}/> PROVEEDOR</div> {/* Changed from CLIENTE */}
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
                          <label>PTO. EMISIÓN</label> {/* Changed from PTO. VENTA */}
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
                  <div className={s.sideBlock} style={{ height: '100%' }}>
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12, flex: 1 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>OBSERVACIONES</label>
                          <textarea 
                             style={{ flex: 1, minHeight: 80, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: isReadOnly ? 'var(--bg-secondary)' : '#fff', resize: 'none', fontSize: 12 }} 
                             value={observations} 
                             onChange={e => setObservations(e.target.value)} 
                             placeholder="Añadir observaciones logísticas o referencias..."
                             readOnly={isReadOnly}
                          />
                      </div>
                  </div>
              </div>
          </div>


          {/* Relations Bar: OC → REMITO ENTRADA → FACTURA COMPRA → PAGO → STOCK → OBSERVACIONES */}
          <div className={s.relationsBar}>

            {/* ORDEN DE COMPRA */}
            {sourceId ? (
              <div
                className={s.relationCard}
                onClick={() => { if (sourceOrderId) openEditPurchaseOrder(sourceOrderId, { title: `Orden de Compra ${sourceId}`, width: 1200 }); }}
              >
                <div className={s.nodeTitle} style={{ color: '#2563eb' }}>ORDEN DE COMPRA</div>
                <div className={s.nodeBadge}>● Vinculada</div>
                <div className={s.nodeMetric} style={{ color: '#0f172a', marginTop: 'auto' }}>{sourceId}</div>
              </div>
            ) : (
              <div className={s.relationCard} style={{ cursor: 'default' }}>
                <div className={s.nodeTitle} style={{ color: '#94a3b8' }}>ORDEN DE COMPRA</div>
                <div className={s.nodeBadge} style={{ color: '#94a3b8', background: '#f1f5f9' }}>Sin vinculación</div>
                <div className={s.nodeMetric} style={{ color: '#cbd5e1', marginTop: 'auto' }}>Remito directo</div>
              </div>
            )}

            <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

            {/* REMITO ENTRADA — documento actual */}
            <div className={s.relationCard} style={{ border: '1.5px solid #2563eb', background: '#eff6ff' }}>
              <div className={s.nodeTitle} style={{ color: '#2563eb' }}>REMITO ENTRADA</div>
              <div className={s.nodeBadge} style={{ color: '#2563eb', background: '#dbeafe' }}>● Documento Actual</div>
              <div className={s.nodeMetric} style={{ color: '#0f172a', marginTop: 'auto' }}>{number || '(nuevo)'}</div>
              <div className={s.nodeMetric}>{date ? date.split('-').reverse().join('/') : 'S/F'}</div>
            </div>

            <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

            {/* FACTURA COMPRA */}
            <div className={s.relationCard}>
              <div className={s.nodeTitle} style={{ color: invoices.length > 0 ? '#f97316' : '#0b132b' }}>FACTURA COMPRA</div>
              <div className={s.nodeStatus} style={{ color: progressInvoiced >= 100 ? '#10b981' : progressInvoiced > 0 ? '#f97316' : '#eab308' }}>
                {progressInvoiced >= 100 ? 'Completa' : progressInvoiced > 0 ? 'Parcial' : 'Pendiente'}
              </div>
              <div className={s.nodeMetric} style={{ color: '#0f172a' }}>{invoices.length} factura(s) · {Math.round(progressInvoiced)}%</div>
            </div>

            <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

            {/* PAGO */}
            <div className={s.relationCard}>
              <div className={s.nodeTitle} style={{ color: progressPaid >= 100 ? '#10b981' : '#0b132b' }}>PAGO</div>
              <div className={s.nodeStatus} style={{ color: progressPaid >= 100 ? '#10b981' : '#eab308' }}>
                {progressPaid >= 100 ? 'Pagado' : 'Pendiente'}
              </div>
              <div className={s.nodeMetric} style={{ color: '#0f172a' }}>0 pagos</div> {/* Needs actual payment logic */}
            </div>

            <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

            {/* STOCK */}
            <div className={s.relationCard}>
              <div className={s.nodeTitle} style={{ color: status === 'DISPATCHED' || status === 'INVOICED' ? '#10b981' : '#0b132b' }}>STOCK</div>
              <div className={s.nodeStatus} style={{ color: status === 'DISPATCHED' || status === 'INVOICED' ? '#10b981' : '#eab308' }}>
                {status === 'DISPATCHED' || status === 'INVOICED' ? 'Actualizado' : mode === 'new' ? 'Se actualizará al guardar' : 'Pendiente'}
              </div>
              <div className={s.nodeMetric} style={{ color: '#0f172a' }}>
                {items.reduce((acc, i) => acc + (parseFloat(i.qty) || 0), 0).toFixed(2)} u. · {warehouses.find(w => w.id === warehouseId)?.name || 'S/D'}
              </div>
            </div>

            {/* OBSERVACIONES */}
            <div className={s.relationCard} style={{ maxWidth: '140px', background: 'transparent', border: 'none', paddingLeft: 8, cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
              <div className={s.nodeTitle} style={{ color: '#64748b' }}>OBSERVACIONES</div>
              <div className={s.obsText} style={{ marginTop: 4 }}>{observations || 'Sin observaciones'}</div>
            </div>
          </div>

          {/* Operational Summary Panel */}
          <div className={s.summaryPanel}>
            <div className={s.summaryItem}>
              <div className={s.summaryLabel}>PROVEEDOR</div> {/* Changed from CLIENTE */}
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
              <div className={s.summaryValue}>{sourceId ? `OC ${sourceId}` : 'Directo'}</div> {/* Changed from OV */}
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
              <span className={s.footerCompactLabel} style={{ color: 'var(--primary)' }}>TOTAL REMITO</span> {/* Changed from SUBTOTAL VALORIZADO */}
              <span className={s.footerCompactTotal}>{fmt(totals.total)}</span>
            </div>
          </div>
      </div>


      {/* Item Selector Modal */}
      {showItemSelector && (
          <Modal title="Vincular Ítems de Origen" onClose={() => setShowItemSelector(false)} width="1100px">
             <div style={{ padding: '0 24px 24px' }}>
                {selectorLoading ? (
                   <div style={{ padding: 60, textAlign: 'center', color: '#64748b', fontWeight: 600 }}>Sincronizando órdenes de compra abiertas...</div>
                ) : (
                   <>
                      <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center' }}>
                         <div style={{ flex: 1, position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <Input 
                                placeholder="🔍 Filtrar por producto u orden..."
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

                      <div className={t.tableWrap} style={{ maxHeight: '60vh', overflowY: 'auto', borderRadius: 24, border: '1px solid #e2e8f0', boxShadow: '0 15px 25px -5px rgba(0,0,0,0.08)' }}>
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
                                 <th style={{ textAlign: 'center', width: 75, background: '#f1f5f9', fontWeight: 800 }}>RECIBIDO</th> {/* Changed from REMITIDO */}
                                 <th style={{ textAlign: 'center', width: 75, background: '#f1f5f9', color: '#2563eb', fontWeight: 900 }}>DISP.</th>
                                 <th style={{ textAlign: 'center', width: 75, background: '#eff6ff', fontWeight: 800 }}>PEDIDO</th>
                                 <th style={{ textAlign: 'center', width: 75, background: '#eff6ff', fontWeight: 800 }}>RECIBIDO</th> {/* Changed from REMITIDO */}
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
                                       <div style={{ fontSize: 12 }}>Asegúrese de que el proveedor tenga órdenes de compra confirmadas.</div> {/* Changed cliente/pedidos */}
                                    </td>
                                 </tr>
                              ) : (
                                 selectableItems.filter(i => 
                                     i.product_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                     i.parent_number.toLowerCase().includes(searchTerm.toLowerCase())
                                 ).map((item) => {
                                    const factor = item.quantity_per_container || 1;
                                    const c_total = item.qty / factor;
                                    const c_rec = item.qty_fulfilled / factor; // Changed c_rem
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
                                          <td style={{ textAlign: 'center', background: '#fafbfc', color: '#94a3b8', fontWeight: 800 }}>{c_rem.toLocaleString()}</td> {/* Changed c_rec */}
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
