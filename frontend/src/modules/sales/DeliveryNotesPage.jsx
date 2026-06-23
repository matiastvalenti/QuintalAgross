import { useState, useEffect, useMemo, Fragment } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { openNuevoRemito, openEditRemito, openNuevaFactura } from '../../utils/openStandaloneWindow';
import ContentHeader from '../../components/layout/ContentHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import Input from '../../components/ui/Input';
import t from '../../components/ui/Table.module.css';
import localS from './DeliveryNotesPage.module.css';
import s from '../../components/layout/DocumentListPage.module.css';
import DocumentListPage from '../../components/layout/DocumentListPage';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import TableSkeleton, { TableRowSkeleton } from '../../components/ui/TableSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import { Eye, Edit, Trash2, Search, Plus, PlusCircle, Filter, PackageOpen, Link2Off, ChevronUp, ChevronDown, X, FileText, Printer, TrendingUp, Clock, CheckCircle, Activity, Calendar, Truck, Package, LayoutGrid, ArrowUpRight, Layers, ArrowRight, CheckSquare, Square, AlertCircle } from 'lucide-react';
import { generateDeliveryNotePdfBlob } from '../../services/SalesOrderPdf';
import api from '../../services/api';
import { useWindow } from '../../context/WindowContext';
import { TraceabilityProgress } from '../../components/ui/TraceabilityStatusBadge';
import StatusBadge from '../../components/ui/StatusBadge';
import DeliveryNoteQuickPreview from './DeliveryNoteQuickPreview';

export default function DeliveryNotesPage({ ov_id: prop_ov_id }) {
  const navigate = useNavigate();
  
  const location = useLocation();
  const { showToast } = useToast();
  const { openWindow } = useWindow();
  
  const searchParams = new URLSearchParams(location.search);
  const ov_id = prop_ov_id || searchParams.get('ov_id');

  const [notes, setNotes] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterEntityId, setFilterEntityId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterWithOV, setFilterWithOV] = useState(''); 
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [hideCancelled, setHideCancelled] = useState(true);
  const [hideInvoiced, setHideInvoiced] = useState(false);

  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  const [preview, setPreview] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  // Vista Rápida Expandible
  const [quickViewId, setQuickViewId] = useState(null);
  const [quickViewDetail, setQuickViewDetail] = useState(null);
  const [quickViewLoading, setQuickViewLoading] = useState(false);
  const [quickViewError, setQuickViewError] = useState(null);

  const loadQuickView = async (id) => {
    if (quickViewId === id) {
       setQuickViewId(null);
       return;
    }
    setQuickViewId(id);
    setQuickViewLoading(true);
    setQuickViewError(null);
    try {
      const data = await api.get(`/sales/delivery-notes/${id}`);
      setQuickViewDetail(data);
    } catch (e) {
      setQuickViewError(e.message || "Error al cargar");
    } finally {
      setQuickViewLoading(false);
    }
  };

  // Creation State
  const [showCreateType, setShowCreateType] = useState(false);
  const [modalStep, setModalStep] = useState(1);
  const [modalOrders, setModalOrders] = useState([]);
  const [loadingModalOrders, setLoadingModalOrders] = useState(false);
  const [modalSearch, setModalSearch] = useState('');

  const [showDirectForm, setShowDirectForm] = useState(false);
  const [showCrossForm, setShowCrossForm] = useState(false);
  const [remitoQtys, setRemitoQtys] = useState({});
  const [crossOV, setCrossOV] = useState(null);
  
  // Direct Form Data
  const [directForm, setDirectForm] = useState({ 
    entity_id: '', warehouse_id: '', number: '', notes: '', date: new Date().toISOString().split('T')[0] 
  });
  const [directLines, setDirectLines] = useState([{ product_id: '', description: '', qty: 1, unit_price: 0, vat_rate: 0.21 }]);

  const [crossForm, setCrossForm] = useState({ 
    warehouse_id: '', pv: '', number: '', notes: '', date: new Date().toISOString().split('T')[0] 
  });
  const [crossLines, setCrossLines] = useState([]);

  const [pvOptions, setPvOptions] = useState([]);
  const [isLoadingNumber, setIsLoadingNumber] = useState(false);

  const fetchAll = async (signal) => {
    try {
      setLoading(true);
      setError(null);
      const timestamp = new Date().getTime();
      const [dnData, entData, prodData, whData, pvData] = await Promise.all([
        api.get(`/sales/delivery-notes/?_cb=${timestamp}`, { signal }),
        api.get('/entities/', { signal }),
        api.get('/inventory/products/', { signal }),
        api.get('/inventory/warehouses/', { signal }),
        api.get('/config/pos', { signal }),
      ]);
      
      setNotes(dnData);
      setEntities(entData);
      setProducts(prodData);
      setWarehouses(whData);
      setPvOptions(pvData);
      
      // Default values
      if (whData.length > 0) {
        setDirectForm(prev => ({ ...prev, warehouse_id: whData[0].id }));
        setCrossForm(prev => ({ ...prev, warehouse_id: whData[0].id }));
      }
      if (pvData.length > 0) {
        setDirectForm(prev => ({ ...prev, pv: pvData[0].pv }));
        setCrossForm(prev => ({ ...prev, pv: pvData[0].pv }));
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error(e);
      setError(e.message || "Error al cargar los datos del servidor");
      if (e.message?.includes('401')) {
          showToast("Sesión expirada o inválida. Por favor, vuelva a iniciar sesión.", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    const controller = new AbortController();
    fetchAll(controller.signal); 
    if (ov_id) {
       loadOVForCrossing(ov_id);
    }
    return () => controller.abort();
  }, [ov_id]);

  const fetchNextNumber = async (currentPv, formType) => {
    if (!currentPv) return;
    setIsLoadingNumber(true);
    try {
      const data = await api.get(`/config/pos/next-number`, {
        params: { pv: currentPv, doc_type: 'RE' }
      });
      if (formType === 'direct') setDirectForm(p => ({ ...p, number: data.full_number }));
      else setCrossForm(p => ({ ...p, number: data.full_number }));
    } catch (err) {
      console.error("Error fetching next number:", err);
    } finally {
      setIsLoadingNumber(false);
    }
  };

  useEffect(() => {
    if (showDirectForm && directForm.pv) {
      fetchNextNumber(directForm.pv, 'direct');
    }
  }, [showDirectForm, directForm.pv]);

  useEffect(() => {
    if (showCrossForm && crossForm.pv) {
      fetchNextNumber(crossForm.pv, 'cross');
    }
  }, [showCrossForm, crossForm.pv]);

  const loadOVForCrossing = async (id, skipFormOpen = false) => {
    try {
      const ov = await api.get(`/sales/sales-orders/${id}`);
      setCrossOV(ov);
      
      const lines = ov.lines || [];
      const validLines = lines
        .filter(l => (parseFloat(l.qty || 0) - parseFloat(l.qty_delivered || 0)) > 0)
        .map(l => ({
           ...l,
           id: l.id,
           sku: l.product?.sku || '',
           name: l.product?.name || l.description,
           unit_content: l.product?.quantity_per_container || l.quantity_per_container || 1,
           unit_short_name: l.product?.container?.unit?.short_name || l.unit_short_name || 'u',
           qty_ordered: l.qty,
           qty_delivered: l.qty_delivered || 0,
           qty_to_deliver: l.qty - (l.qty_delivered || 0),
           selected: true
        }));
      
      setCrossLines(validLines);
      
      const initialQtys = {};
      lines.forEach(l => {
          const pending = Math.max(0, parseFloat(l.qty || 0) - parseFloat(l.qty_delivered || 0));
          initialQtys[l.id] = pending;
      });
      setRemitoQtys(initialQtys);

      if (!skipFormOpen) {
          setShowCrossForm(true);
      }

      // Fetch next Remito number (if logic existed, for now manual or placeholder)
      setCrossForm(prev => ({ ...prev, number: '' })); 

    } catch (e) {
      console.error(e);
      showToast("Error al cargar OV", "error");
    }
  };

  const entityName = (id) => entities.find(e => e.id === id)?.name || id?.slice(0, 8);

  useEffect(() => {
    if (showCreateType) {
      setLoadingModalOrders(true);
      api.get('/sales/sales-orders/')
        .then(data => {
            const validOrders = data.filter(ov => ov.status === 'CONFIRMED' || ov.status === 'PARTIAL');
            setModalOrders(validOrders);
        })
        .catch(err => console.error("Error fetching OV for modal", err))
        .finally(() => setLoadingModalOrders(false));
    } else {
      setModalSearch('');
    }
  }, [showCreateType]);

  const filteredModalOrders = useMemo(() => {
      if (!modalSearch) return modalOrders;
      const lower = modalSearch.toLowerCase();
      return modalOrders.filter(ov => 
         (ov.number && ov.number.toLowerCase().includes(lower)) ||
         (entityName(ov.entity_id).toLowerCase().includes(lower)) ||
         (ov.lines && ov.lines.some(l => l.description && l.description.toLowerCase().includes(lower)))
      );
  }, [modalOrders, modalSearch, entities]);

  const handlePreviewPdf = async (id) => {
    try {
      showToast("Generando comprobante...", "info");
      const fullNote = await api.get(`/sales/delivery-notes/${id}`);
      
      openWindow('pdf-viewer', {
        order: {
            ...fullNote,
            warehouse_name: warehouses.find(w => String(w.id) === String(fullNote.warehouse_id))?.name,
        },
        entities,
        products,
        docType: 'delivery-note' 
      }, { title: `Vista Previa Remito ${fullNote.number}`, width: 1000, height: 750 });
    } catch (e) {
      console.error(e);
      showToast("Error al generar PDF", "error");
    }
  };
  const handlePrintPreprinted = (id) => {
    const token = localStorage.getItem('token');
    window.open(`${API_URL}/sales/delivery-notes/${id}/pdf?format=preprinted&token=${token}`, '_blank');
  };

  const openDetail = async (id) => {
    const data = await api.get(`/sales/delivery-notes/${id}`);
    setDetail(data);
  };

  const handleSeleccionarOrden = async (orden) => {
    loadOVForCrossing(orden.id);
    setShowCreateType(false);
  };

  const handleCreateWithoutOrder = () => {
    openNuevoRemito();
    setShowCreateType(false);
  };

  const startConfirm = async (id) => {
    const data = await api.get(`/sales/delivery-notes/${id}/confirm-preview`);
    setPreview(data);
    setConfirmingId(id);
  };

  const executeConfirm = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`${API_URL}/sales/delivery-notes/${confirmingId}/confirm`, { 
        method: 'POST',
        headers
      });
      if (res.ok) { 
        showToast("Remito confirmado correctamente", "success");
        setPreview(null); 
        setConfirmingId(null); 
        setDetail(null); 
        fetchAll(); 
      }
      else { 
        const err = await res.json(); 
        showToast(err.detail || "Error al confirmar", "error"); 
      }
    } catch (e) { console.error(e); }
  };

  const cancelDN = async (id) => {
    if (!window.confirm('¿Anular este remito? Se revertirán los movimientos de stock.')) return;
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`${API_URL}/sales/delivery-notes/${id}/cancel`, { 
        method: 'POST',
        headers
      });
      if (res.ok) { 
        showToast("Remito anulado", "success");
        setDetail(null); 
        fetchAll(); 
      }
      else { 
        const err = await res.json(); 
        showToast(err.detail || "Error al anular", "error"); 
      }
    } catch (e) { console.error(e); }
  };

  const deleteDN = async (id) => {
    if (!window.confirm('¿Está seguro de ELIMINAR este remito? Esta acción es permanente y solo válida para borradores.')) return;
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`${API_URL}/sales/delivery-notes/${id}`, { 
        method: 'DELETE',
        headers
      });
      if (res.ok) {
        showToast("Remito eliminado", "success");
        setDetail(null);
        fetchAll();
      } else {
        const err = await res.json();
        showToast(err.detail || "Error al eliminar", "error");
      }
    } catch (e) { console.error(e); }
  };

  const unlinkDN = async (id) => {
    if (!window.confirm('¿Desvincular este remito de su orden de origen? Pasará a ser un remito directo.')) return;
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`${API_URL}/sales/delivery-notes/${id}/unlink`, { 
        method: 'POST',
        headers
      });
      if (res.ok) {
        showToast("Remito desvinculado", "success");
        setDetail(null);
        fetchAll();
      } else {
        const err = await res.json();
        showToast(err.detail || "Error al desvincular", "error");
      }
    } catch (e) { console.error(e); }
  };

  const handleEdit = (dn) => {
    openEditRemito(dn.id);
  };

  const handleBulkInvoice = () => {
    const selectedNotes = notes.filter(n => selectedIds.includes(n.id));
    if (selectedNotes.length === 0) return;

    const firstEntityId = selectedNotes[0].entity_id;
    const sameEntity = selectedNotes.every(n => n.entity_id === firstEntityId);
    
    if (!sameEntity) {
      showToast("Todos los remitos deben ser del mismo cliente", "error");
      return;
    }
    
    const validState = selectedNotes.every(n => n.status === "DISPATCHED" || n.status === "PARTIAL");
    if (!validState) {
       showToast("Solo se pueden facturar remitos despachados o parciales", "error");
       return;
    }

    const draftId = crypto.randomUUID();
    localStorage.setItem(`invoice_draft_${draftId}`, JSON.stringify({
        initialDnIds: selectedIds
    }));

    openNuevaFactura({ draft_id: draftId }, { 
        title: 'Facturar Remitos', 
        width: 1100, 
        height: 650
    });
  };

  const toggleSelectAll = (e) => {
    if (e.target.checked) {
      const ids = paginatedData.filter(n => n.status === "DISPATCHED" || n.status === "PARTIAL").map(n => n.id);
      setSelectedIds(ids);
    } else {
      setSelectedIds([]);
    }
  };

  const filtered = useMemo(() => {
    return notes.filter(n => {
      if (hideCancelled && n.status === 'CANCELLED') return false;
      if (hideInvoiced && n.status === 'INVOICED') return false;
      if (filterStatus && n.status !== filterStatus) return false;
      if (filterType && n.delivery_type !== filterType) return false;
      if (filterEntityId && String(n.entity_id) !== String(filterEntityId)) return false;
      if (selectedWarehouseId && String(n.warehouse_id) !== String(selectedWarehouseId)) return false;
      if (filterWithOV === 'yes' && (!n.origin_reference || String(n.origin_reference).toUpperCase() === 'DIRECTO')) return false;
      if (filterWithOV === 'no' && n.origin_reference && String(n.origin_reference).toUpperCase() !== 'DIRECTO') return false;
      
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchNumber = String(n.number).toLowerCase().includes(q);
        const matchClient = (entityName(n.entity_id) || '').toLowerCase().includes(q);
        if (!matchNumber && !matchClient) return false;
      }

      if (productSearch.trim()) {
        const q = productSearch.toLowerCase();
        const hasProduct = n.lines?.some(l => 
          (l.description || "").toLowerCase().includes(q) || 
          (l.product_id || "").toLowerCase().includes(q)
        );
        if (!hasProduct) return false;
      }

      const nDate = n.date ? new Date(n.date).getTime() : 0;
      if (dateFrom && nDate < new Date(dateFrom).setHours(0, 0, 0, 0)) return false;
      if (dateTo && nDate > new Date(dateTo).setHours(23, 59, 59, 999)) return false;
      return true;
    });
  }, [notes, filterStatus, filterType, filterEntityId, filterWithOV, search, productSearch, dateFrom, dateTo, hideCancelled, hideInvoiced, entities, selectedWarehouseId]);

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthNotes = notes.filter(n => {
      if (n.status === 'CANCELLED') return false;
      const d = new Date(n.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const countMonth = monthNotes.length;
    const pendingInvoice = notes.filter(n => n.status === 'DISPATCHED' || n.status === 'PARTIAL').length;
    const dispatched = notes.filter(n => n.status === 'DISPATCHED').length;
    const invoiced = notes.filter(n => n.status === 'INVOICED').length;
    
    return {
      countMonth,
      pendingInvoice,
      dispatched,
      invoiced,
      totalCount: notes.length,
      effectiveness: notes.length > 0 ? Math.round((invoiced / (notes.length - notes.filter(n => n.status === 'CANCELLED').length)) * 100) || 0 : 0
    };
  }, [notes]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      // 1. Strict Creation Timestamp (Newest First)
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (dateB !== dateA) return dateB - dateA;

      // 2. Business Date (Newest First)
      const busA = a.date ? new Date(a.date).getTime() : 0;
      const busB = b.date ? new Date(b.date).getTime() : 0;
      if (busB !== busA) return busB - busA;

      // 3. Document Number (Descending - e.g. 12 before 1)
      return (String(b.number || "")).localeCompare(String(a.number || ""), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [filtered]);

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(field); setSortDir('desc'); }
  };

  const hasActiveFilters = search.trim() || productSearch.trim() || filterStatus || filterType || filterEntityId || filterWithOV || dateFrom || dateTo || selectedWarehouseId;
  
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds([]);
  }, [hasActiveFilters, search, productSearch, filterStatus, filterType, filterEntityId, filterWithOV, dateFrom, dateTo, selectedWarehouseId, hideCancelled, hideInvoiced]);

  const clearFilters = () => {
    setSearch('');
    setProductSearch('');
    setFilterStatus('');
    setFilterType('');
    setFilterEntityId('');
    setFilterWithOV('');
    setDateFrom('');
    setDateTo('');
    setSelectedWarehouseId('');
  };

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginatedData = useMemo(() => {
    return sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [sorted, currentPage, pageSize]);

  const handleOptionDirect = () => {
    setShowCreateType(false);
    setShowDirectForm(true);
    setDirectForm({ entity_id: '', warehouse_id: '', number: '', notes: '', date: new Date().toISOString().split('T')[0] });
    setDirectLines([{ product_id: '', description: '', qty: 1, unit_price: 0, vat_rate: 0.21 }]);
  };

  const updateDirectLine = (i, field, value) => {
    const copy = [...directLines];
    copy[i] = { ...copy[i], [field]: value };
    if (field === 'product_id' && value) {
      const p = products.find(proud => proud.id === value);
      if (p) {
        copy[i].description = p.name;
        copy[i].unit_price = p.price || 0;
      }
    }
    setDirectLines(copy);
  };

  const addDirectLine = () => setDirectLines([...directLines, { product_id: '', description: '', qty: 1, unit_price: 0, vat_rate: 0.21 }]);
  const removeDirectLine = (i) => setDirectLines(directLines.filter((_, idx) => idx !== i));

  const submitDirectRemito = async (e) => {
    e.preventDefault();
    if (!directForm.entity_id || !directForm.warehouse_id || !directForm.number) return showToast("Faltan datos obligatorios", "error");
    const validLines = directLines.filter(l => l.qty > 0 && l.description);
    if (validLines.length === 0) return showToast("Debe haber al menos una línea válida", "error");
    try {
      await api.post(`/sales/delivery-notes/`, { ...directForm, lines: validLines, confirm_now: true });
      showToast("Remito creado y confirmado", "success");
      setShowDirectForm(false);
      fetchAll();
    } catch (error) { 
      console.error(error); 
      showToast(error.message || "Error al crear remito", "error"); 
    }
  };

  const handleConfirmCrossRemito = () => {
    const items = crossOV?.lines || [];
    const selectedLines = items
      .filter(item => {
        const qty = parseFloat(remitoQtys[item.id] || 0);
        return qty > 0;
      })
      .map(item => {
        const qtyPackages = parseFloat(remitoQtys[item.id] || 0);
        const factor = parseFloat(item.product?.quantity_per_container || item.quantity_per_container || 1);
        const qtyUnits = qtyPackages * factor;
        return {
          ...item,
          source_sales_line_id: item.id,
          qty_packages: qtyPackages,       // envases seleccionados
          qty_to_remit: qtyUnits,          // unidades totales (lo que espera DeliveryNoteForm como qty)
          product: item.product,
          description: item.product?.name || item.description,
          _unit_content: factor,
          _unit_label: item.product?.container?.unit?.short_name || item.unit_short_name || 'u',
        };
      });

    if (selectedLines.length === 0) {
      return showToast("Seleccioná al menos un ítem para remitir", "warning");
    }

    const draftKey = `remito_draft_ov_${crossOV.id}`;
    localStorage.setItem(draftKey, JSON.stringify(selectedLines));

    setShowCrossForm(false);
    openNuevoRemito(crossOV.id, { draft_key: draftKey });
  };

  const kpis = [
    { label: "Remitos del Mes", value: stats.countMonth, sub: "Comprobantes", type: "Primary" },
    { label: "A Facturar", value: stats.pendingInvoice, sub: "Pendientes", type: "Warning" },
    { label: "Despachados", value: stats.dispatched, sub: "En logística", type: "Info" },
    { label: "Efectividad", value: `${stats.effectiveness}%`, sub: "Ratio facturación", type: "Success" },
    { label: "Total Histórico", value: stats.totalCount, sub: "Registros totales", type: "Default" }
  ];

  const toolbar = {
    searchWrap: (
      <div className={s.searchWrap}>
        <Search className={s.searchIcon} size={20} />
        <input
          type="text"
          placeholder="Filtrar por número, cliente o descripción..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && <button className={s.inputClear} style={{ right: 16, top: '50%', transform: 'translateY(-50%)', position: 'absolute', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }} onClick={() => setSearch("")}><X size={16} /></button>}
      </div>
    ),
    filtersToggle: (
      <button 
        type="button" 
        className={`${s.filterToggle} ${showFilters || (search && !notes.length) ? s.active : ""}`}
        onClick={() => setShowFilters(!showFilters)}
      >
        <Filter size={18} />
        Filtros
      </button>
    ),
    actions: (
      <>
        <button className={s.ghostBtn} title="Próximamente">Exportar</button>
        <button className={s.ghostBtn} title="Próximamente">Columnas</button>
        <button className={s.ghostBtn} style={{ color: '#ef4444' }} onClick={clearFilters} title="Limpiar filtros">Limpiar</button>
        <button className={s.primaryCta} onClick={() => setShowCreateType(true)}>
            <PlusCircle size={16} />
            Nuevo Remito
        </button>
      </>
    ),
    massActions: selectedIds.length > 0 && (
      <button className={s.primaryCta} onClick={handleBulkInvoice}>
        FACTURAR ({selectedIds.length})
      </button>
    ),
    filtersArea: showFilters && (
      <div className={s.compactFiltersRow}>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={s.filterSelect}>
            <option value="">Estado: Todos</option>
            <option value="DRAFT">Borrador</option>
            <option value="DISPATCHED">Despachado</option>
            <option value="INVOICED">Facturado</option>
            <option value="CANCELLED">Anulado</option>
          </select>

          <select value={filterEntityId} onChange={e => setFilterEntityId(e.target.value)} className={s.filterSelect}>
            <option value="">Cliente: Todos</option>
            {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>

          <select value={selectedWarehouseId} onChange={e => setSelectedWarehouseId(e.target.value)} className={s.filterSelect}>
            <option value="">Depósito: Todos</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>Desde</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={s.dateInput} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>Hasta</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={s.dateInput} />
          </div>

          <label className={s.toggleLabel} style={{ marginLeft: 'auto' }}>
              <div className={`${s.switch} ${!hideInvoiced ? s.active : ""}`}>
                  <input type="checkbox" checked={!hideInvoiced} onChange={() => setHideInvoiced(!hideInvoiced)} />
                  <div className={s.slider} />
              </div>
              <span className={s.toggleText} style={{ fontSize: '10px' }}>Incluir Facturados</span>
          </label>

          <label className={s.toggleLabel}>
              <div className={`${s.switch} ${!hideCancelled ? s.active : ""}`}>
                  <input type="checkbox" checked={!hideCancelled} onChange={() => setHideCancelled(!hideCancelled)} />
                  <div className={s.slider} />
              </div>
              <span className={s.toggleText} style={{ fontSize: '10px' }}>Incluir Anulados</span>
          </label>
      </div>
    )
  };

  const table = {
    columns: (
      <>
        <th style={{ width: 48, textAlign: 'center' }} className={s.th}>
          <input 
            type="checkbox" 
            onChange={toggleSelectAll} 
            checked={paginatedData.length > 0 && selectedIds.length === paginatedData.filter(n => n.status === "DISPATCHED" || n.status === "PARTIAL").length}
            style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--primary)' }}
          />
        </th>
        <th className={s.th} onClick={() => toggleSort('number')} style={{ cursor: 'pointer' }}>NUMERAL</th>
        <th className={s.th} onClick={() => toggleSort('date')} style={{ cursor: 'pointer' }}>REGISTRO</th>
        <th className={s.th} onClick={() => toggleSort('client')} style={{ cursor: 'pointer' }}>TITULAR DE CUENTA</th>
        <th className={s.th}>OV ORIGEN</th>
        <th className={s.th}>BASE</th>
        <th className={s.th} style={{ textAlign: 'center' }}>ESTADO</th>
        <th className={s.th} style={{ textAlign: 'center' }}>USUARIO</th>
        <th className={s.th} style={{ textAlign: 'right' }}>DILIGENCIAS</th>
      </>
    ),
    body: loading ? (
        <TableRowSkeleton rows={10} cols={9} />
    ) : error ? (
        <tr><td colSpan="9"><ErrorState message={error} onRetry={fetchAll} /></td></tr>
    ) : filtered.length === 0 ? (
      <tr>
        <td colSpan="9">
          <EmptyState 
              icon={Layers} 
              title="Sin remitos coincidentes"
              description="Ajustá los filtros o registrá un nuevo remito."
              actionLabel="Nuevo Remito"
              onAction={() => setShowCreateType(true)}
          />
        </td>
      </tr>
    ) : (
       paginatedData.map((n) => (
        <Fragment key={n.id}>
        <tr 
          className={`${s.row} ${quickViewId === n.id ? s.selectedRow : ''} ${selectedIds.includes(n.id) ? s.rowSelected : ''}`} 
          onClick={() => loadQuickView(n.id)}
          onDoubleClick={() => openEditRemito(n.id)}
        >
          <td className={s.td} style={{ textAlign: 'center', width: 48 }} onClick={(e) => e.stopPropagation()}>
            <input 
              type="checkbox" 
              checked={selectedIds.includes(n.id)}
              onChange={(e) => {
                if (e.target.checked) setSelectedIds([...selectedIds, n.id]);
                else setSelectedIds(selectedIds.filter(id => id !== n.id));
              }}
              disabled={n.status !== "DISPATCHED" && n.status !== "PARTIAL"}
              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--primary)' }}
            />
          </td>
          <td className={`${s.td} ${s.numberCell}`}>{n.number}</td>
          <td className={s.td} style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>
            {new Date(n.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
          </td>
          <td className={s.td} style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{entityName(n.entity_id)}</td>
          <td className={s.td} style={{ fontSize: 13, color: '#64748b' }}>
            {n.origin_reference || 'DIRECTO'}
          </td>
          <td className={s.td} style={{ fontSize: 13, color: '#64748b' }}>
            {warehouses.find(w => w.id === n.warehouse_id)?.name || '-'}
          </td>
          <td className={s.td} style={{ textAlign: 'center', width: 220 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <StatusBadge status={n.status} />
              {n.status !== 'DRAFT' && n.status !== 'CANCELLED' && (
                <div style={{ width: '100%', padding: '0 4px', marginTop: 4 }}>
                  <TraceabilityProgress 
                      delivered={100} 
                      invoiced={n.invoice_progress || 0} 
                      paid={n.paid_progress || 0}
                  />
                </div>
              )}
            </div>
          </td>
          <td className={s.td} style={{ verticalAlign: 'middle' }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div className={s.userBadge}>
                      {(n.created_by || 'AD').substring(0, 2).toUpperCase()}
                  </div>
              </div>
          </td>
          <td className={s.td} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              {n.status === 'DRAFT' && (
                <button onClick={() => deleteDN(n.id)} style={{ all: 'unset', cursor: 'pointer', color: '#ef4444', opacity: 0.7 }} title="Eliminar">
                  <Trash2 size={18} />
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); handlePreviewPdf(n.id); }} style={{ all: 'unset', cursor: 'pointer', opacity: 0.4 }} title="Documento Oficial">
                <FileText size={18} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); openEditRemito(n.id); }} style={{ all: 'unset', cursor: 'pointer', color: 'var(--primary)' }} title="Consultar Registro">
                <ArrowUpRight size={18} />
              </button>
            </div>
          </td>
        </tr>
        {/* Fila expandible */}
        {quickViewId === n.id && (
          <tr className="animate-slide-down">
            <td colSpan={10} style={{ padding: 0, borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ padding: '16px 32px', background: '#f8fafc', borderTop: '1px dashed var(--border-color)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                {quickViewLoading ? <Skeleton width="100%" height={150} /> : quickViewError ? <ErrorState title="Error" message={quickViewError} /> : (
                  <DeliveryNoteQuickPreview detail={quickViewDetail} entities={entities} warehouses={warehouses} onOpenFull={openEditRemito} onPrint={handlePreviewPdf} />
                )}
              </div>
            </td>
          </tr>
        )}
        </Fragment>
      ))
    )
  };

  const pagination = {
    infoText: `REPORTE: ${filtered.length} REMITOS LOCALIZADOS`,
    totalPages: totalPages,
    currentPage: currentPage,
    onPageChange: setCurrentPage
  };

  return (
    <>
      <DocumentListPage 
        title="Libro de Remitos"
        breadcrumbs={[{ label: 'Suite Comercial' }, { label: 'Remitos' }]}
        kpis={!loading && !error ? kpis : []}
        toolbar={toolbar}
        table={table}
        pagination={pagination}
      />

      {/* Crear remito solo desde OV */}
      <Modal open={showCreateType} onClose={() => { setShowCreateType(false); }} title={"Crear Remito desde Orden de Venta"} wide>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Seleccioná una Orden de Venta pendiente o parcialmente remitida para generar el remito.
          </p>

          <div className={s.searchWrap} style={{ maxWidth: '100%' }}>
            <Search className={s.searchIcon} size={18} />
            <input
              type="text"
              placeholder="Buscar orden, cliente o producto..."
              value={modalSearch}
              onChange={(e) => setModalSearch(e.target.value)}
              style={{ height: 44, borderRadius: 12, paddingLeft: 40 }}
            />
            {modalSearch && <button className={s.inputClear} style={{ right: 12, top: '50%', transform: 'translateY(-50%)', position: 'absolute', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }} onClick={() => setModalSearch("")}><X size={14} /></button>}
          </div>

          <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 12 }}>
            {loadingModalOrders ? (
                <div style={{ padding: 40, textAlign: 'center' }}>
                   <Skeleton width="100%" height="40px" />
                   <Skeleton width="100%" height="40px" style={{ marginTop: 8 }} />
                   <Skeleton width="100%" height="40px" style={{ marginTop: 8 }} />
                </div>
            ) : filteredModalOrders.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>No hay órdenes pendientes de remitir.</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>Todas las órdenes vigentes ya fueron remitidas o no coinciden con la búsqueda.</div>
                    <Button variant="ghost" onClick={() => { setShowCreateType(false); navigate('/ventas/orden-venta'); }}>Ver Órdenes de Venta</Button>
                </div>
            ) : (
                <table className={t.table} style={{ margin: 0 }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc' }}>
                        <tr>
                            <th>NÚMERO OV</th>
                            <th>CLIENTE</th>
                            <th>FECHA</th>
                            <th style={{ textAlign: 'center' }}>ESTADO</th>
                            <th>PENDIENTES</th>
                            <th style={{ textAlign: 'right' }}>TOTAL</th>
                            <th style={{ textAlign: 'center', width: 140 }}>ACCIÓN</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredModalOrders.map(ov => (
                            <tr key={ov.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ fontWeight: 800, color: 'var(--primary)' }}>{ov.number}</td>
                                <td style={{ fontWeight: 600 }}>{entityName(ov.entity_id)}</td>
                                <td style={{ color: '#64748b', fontSize: 13 }}>{new Date(ov.date).toLocaleDateString()}</td>
                                <td style={{ textAlign: 'center' }}><StatusBadge status={ov.status} /></td>
                                <td style={{ color: '#64748b', fontSize: 12 }}>
                                    {ov.lines ? (() => {
                                        const pendingLines = ov.lines.filter(l => l.qty > (l.qty_delivered || 0));
                                        const pendingQty = pendingLines.reduce((sum, l) => sum + (l.qty - (l.qty_delivered || 0)), 0);
                                        return `${pendingLines.length} prod. pendientes · ${pendingQty} cant.`;
                                    })() : '-'}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{ov.total_amount?.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td>
                                <td style={{ textAlign: 'center' }}>
                                    <button 
                                        onClick={() => handleSeleccionarOrden(ov)}
                                        style={{ background: '#f8fafc', color: 'var(--primary)', padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 800, border: '1px solid var(--border-color)', cursor: 'pointer' }}
                                    >
                                        Seleccionar
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
          </div>
        </div>
      </Modal>


      {/* Direct Form Modal */}
      <Modal open={showDirectForm} onClose={() => setShowDirectForm(false)} title="Nuevo Remito Directo" wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDirectForm(false)}>Cancelar</Button>
            <Button type="submit" form="direct-remito-form">Guardar (Borrador)</Button>
          </>
        }
      >
        <form id="direct-remito-form" onSubmit={submitDirectRemito} className={localS.formContainer}>
          <Card noPad style={{ padding: 16, border: '1px solid var(--border-color)', boxShadow: 'none' }}>
            <div className={localS.fieldGrid} style={{ gridTemplateColumns: 'minmax(120px, 1fr) 2fr 1fr' }}>
              <Select label="PV" value={directForm.pv} onChange={e => setDirectForm({...directForm, pv: e.target.value})}>
                {pvOptions.map(p => <option key={p.pv} value={p.pv}>{p.pv} - {p.name}</option>)}
              </Select>
              <Input label="Número Remito" required value={directForm.number} onChange={e => setDirectForm({...directForm, number: e.target.value})} />
              <Input type="date" label="Fecha" required value={directForm.date} onChange={e => setDirectForm({...directForm, date: e.target.value})} />
            </div>
            <div className={localS.fieldGrid}>
              <Select label="Cliente" required value={directForm.entity_id} onChange={e => setDirectForm({...directForm, entity_id: e.target.value})}>
                <option value="">Seleccionar...</option>
                {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
              <Select label="Depósito" required value={directForm.warehouse_id} onChange={e => setDirectForm({...directForm, warehouse_id: e.target.value})}>
                <option value="">Seleccionar...</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <Input label="Notas" value={directForm.notes} onChange={e => setDirectForm({...directForm, notes: e.target.value})} />
            </div>
          </Card>

          <Card title="Ítems" noPad style={{ border: '1px solid var(--border-color)', boxShadow: 'none' }}>
            <table className={t.table}>
              <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio (Ref)</th><th></th></tr></thead>
              <tbody>
                {directLines.map((l, i) => (
                  <tr key={i}>
                     <td>
                       <select value={l.product_id} onChange={e => updateDirectLine(i, 'product_id', e.target.value)} 
                         style={{ width: '100%', padding: '6px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border-color)' }}>
                         <option value="">Seleccionar...</option>
                         {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                       </select>
                     </td>
                     <td style={{ width: 100 }}><input type="number" step="0.01" value={l.qty} onChange={e => updateDirectLine(i, 'qty', parseFloat(e.target.value))} className={localS.inlineInput} /></td>
                     <td style={{ width: 120 }}><input type="number" step="0.01" value={l.unit_price} onChange={e => updateDirectLine(i, 'unit_price', parseFloat(e.target.value))} className={localS.inlineInput} /></td>
                     <td style={{ width: 50 }}><Button variant="ghost" size="sm" type="button" onClick={() => removeDirectLine(i)} style={{ color: 'var(--bad)' }}>✕</Button></td>
                  </tr>
                ))}
                <tr>
                    <td colSpan={4}>
                        <Button variant="ghost" size="sm" type="button" onClick={addDirectLine} style={{ color: 'var(--primary)', fontWeight: 500 }}>+ Agregar Ítem</Button>
                    </td>
                </tr>
              </tbody>
            </table>
          </Card>
        </form>
      </Modal>

      {/* Confirm Preview Modal */}
      <Modal open={!!preview} onClose={() => { setPreview(null); setConfirmingId(null); }}
        title="Confirmar Remito — Impacto de Stock"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setPreview(null); setConfirmingId(null); }}>Cancelar</Button>
            <Button variant={preview?.has_negative_stock ? 'danger' : 'success'} onClick={executeConfirm}>
              {preview?.has_negative_stock ? 'Confirmar de todos modos' : 'Confirmar'}
            </Button>
          </>
        }
      >
        {preview && (
          <>
            {preview.has_negative_stock && (
              <div className={localS.warningBanner}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div>
                    <strong>Stock insuficente</strong>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Uno o más productos quedarán con saldo negativo.</div>
                </div>
              </div>
            )}
            <table className={t.table}>
              <thead>
                <tr><th>Producto</th><th style={{ textAlign: 'right' }}>Stock Actual</th><th style={{ textAlign: 'right' }}>Movimiento</th><th style={{ textAlign: 'right' }}>Resultante</th></tr>
              </thead>
              <tbody>
                {preview.impacts?.map((imp, i) => (
                  <tr key={i}>
                    <td>{imp.product_name}</td>
                    <td style={{ textAlign: 'right' }}>{imp.current_qty}</td>
                    <td style={{ textAlign: 'right', color: 'var(--bad)' }}>{imp.movement_qty}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: imp.will_be_negative ? 'var(--bad)' : 'var(--ok)' }}>
                      {imp.resulting_qty}
                      {imp.will_be_negative && <Badge variant="bad" style={{ marginLeft: 8 }}>NEGATIVO</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Modal>
      
      {/* Crossing Form Modal */}
      <Modal open={showCrossForm} onClose={() => setShowCrossForm(false)} title={`Seleccionar ítems a remitir de OV ${crossOV?.number || ''}`} wide>
          <div style={{ padding: '0 24px 24px' }}>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, fontWeight: 600 }}>
              Seleccioná los productos y cantidades que querés incluir en este remito.
              Lo que no remitas quedará como <strong>pendiente</strong> en la orden.
            </p>

            <div style={{ borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '32px 2fr 110px 110px 110px 140px', gap: 12, padding: '10px 16px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontSize: 10, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', alignItems: 'center' }}>
                <div></div>
                <div>PRODUCTO</div>
                <div style={{ textAlign: 'center' }}>PEDIDO</div>
                <div style={{ textAlign: 'center' }}>YA REMIT.</div>
                <div style={{ textAlign: 'center' }}>PENDIENTE</div>
                <div style={{ textAlign: 'center' }}>A REMITIR AHORA</div>
              </div>
              {(crossOV?.lines || []).map(item => {
                const qtyDelivered = parseFloat(item.qty_delivered || 0);
                const qtyOrdered = parseFloat(item.qty || 0);
                const pending = Math.max(0, qtyOrdered - qtyDelivered);
                const currentQty = remitoQtys[item.id] !== undefined ? remitoQtys[item.id] : pending;
                const isSelected = currentQty > 0;
                const factor = parseFloat(item.product?.quantity_per_container || item.quantity_per_container || 1);
                const unitLabel = item.product?.container?.unit?.short_name || item.unit_short_name || 'u';

                return (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '32px 2fr 110px 110px 110px 140px', gap: 12, padding: '14px 16px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', background: isSelected ? '#eff6ff' : '#fff', transition: 'background 0.15s' }}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      {pending > 0 ? (
                        <button
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: isSelected ? '#2563eb' : '#cbd5e1', padding: 0 }}
                          onClick={() => {
                            if (isSelected) {
                              setRemitoQtys(prev => ({ ...prev, [item.id]: 0 }));
                            } else {
                              setRemitoQtys(prev => ({ ...prev, [item.id]: pending }));
                            }
                          }}
                        >
                          {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                        </button>
                      ) : (
                        <AlertCircle size={18} style={{ color: '#059669' }} title="Totalmente remitido" />
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>{item.product?.name || item.name || item.description || 'Sin nombre'}</div>
                      {(item.product?.brand?.name || item.brand) && <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>{item.product?.brand?.name || item.brand}</div>}
                      {pending <= 0 && <div style={{ fontSize: 10, fontWeight: 700, color: '#059669' }}>✓ Totalmente remitido</div>}
                    </div>
                    {/* PEDIDO */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>{qtyOrdered} env.</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8' }}>{(qtyOrdered * factor).toFixed(1)} {unitLabel}</div>
                    </div>
                    {/* YA REMIT. */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>{qtyDelivered} env.</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8' }}>{(qtyDelivered * factor).toFixed(1)} {unitLabel}</div>
                    </div>
                    {/* PENDIENTE */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: pending > 0 ? '#d97706' : '#059669' }}>{pending.toFixed(2)} env.</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: pending > 0 ? '#d97706' : '#059669' }}>{(pending * factor).toFixed(1)} {unitLabel}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                      {pending > 0 ? (
                        <>
                          <input
                            type="number"
                            min={0}
                            max={pending}
                            step="any"
                            value={currentQty}
                            onChange={e => {
                              const val = Math.min(parseFloat(e.target.value) || 0, pending);
                              setRemitoQtys(prev => ({ ...prev, [item.id]: val }));
                            }}
                            style={{ width: 90, padding: '6px 10px', borderRadius: 10, border: `2px solid ${isSelected ? '#3b82f6' : '#e2e8f0'}`, textAlign: 'center', fontWeight: 800, fontSize: 14, color: '#1e293b', background: '#fff', outline: 'none' }}
                          />
                          <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>= {(currentQty * factor).toFixed(2)} {unitLabel}</div>
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
                {Object.values(remitoQtys).filter(q => q > 0).length} de {(crossOV?.lines || []).filter(i => parseFloat(i.qty || 0) - parseFloat(i.qty_delivered || 0) > 0).length} ítems pendientes seleccionados
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setShowCrossForm(false)} style={{ padding: '10px 22px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
                <button
                  onClick={handleConfirmCrossRemito}
                  style={{ padding: '10px 24px', borderRadius: 12, border: 'none', background: '#1d4ed8', color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <Truck size={16} /> Generar Remito
                </button>
              </div>
            </div>
          </div>
      </Modal>

      {/* Detail View Modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Vista Rápida: Remito ${detail.number}` : ''} wide
         footer={detail && (
             <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%', padding: '0 8px' }}>
                 <Button variant="primary" onClick={() => openEditRemito(detail)} style={{ background: 'var(--primary)', color: 'white', borderRadius: 8, padding: '0 20px' }}>
                    <Edit size={16} style={{ marginRight: 6 }} /> Editar Remito
                 </Button>
                 {detail.sales_order_id && (
                     <Button variant="secondary" onClick={() => unlinkDN(detail.id)} title="Convertir a directo" style={{ borderRadius: 8 }}>
                        <Link2Off size={16} style={{ marginRight: 6 }} /> Desvincular de OV
                     </Button>
                 )}
                 {detail.status === 'DRAFT' && (
                     <>
                        <Button variant="danger" onClick={() => cancelDN(detail.id)} style={{ borderRadius: 8 }}>Anular</Button>
                        <Button variant="success" onClick={() => startConfirm(detail.id)} style={{ borderRadius: 8 }}>Confirmar</Button>
                     </>
                 )}
                 {(detail.status === 'DISPATCHED') && (
                     <Button variant="danger" onClick={() => cancelDN(detail.id)} style={{ borderRadius: 8 }}>Anular</Button>
                 )}
             </div>
         )}
      >
          {detail && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '8px 0' }}>
                  
                  {/* Premium Header Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 200px 200px', gap: 16 }}>
                      <div style={{ background: '#f8fafc', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                           <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Cliente / Entidad</div>
                           <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entityName(detail.entity_id)}</div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                           <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>OV Origen</div>
                           <div style={{ fontWeight: 800, color: '#6366f1', fontSize: 16 }}>{detail.origin_reference || 'Directo'}</div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end' }}>
                           <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Estado Global</div>
                           <Badge variant={detail.status}>{detail.status}</Badge>
                           <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, fontWeight: 600 }}>{new Date(detail.date).toLocaleDateString()}</div>
                      </div>
                  </div>
                  
                  {/* Clean Table */}
                  <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 12px -2px rgba(0,0,0,0.05)' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Truck size={18} color="#64748b" /> Productos Despachados
                    </div>
                    <table className={t.table} style={{ margin: 0, width: '100%' }}>
                        <thead>
                           <tr>
                              <th style={{ paddingLeft: 20 }}>Descripción Téc.</th>
                              <th style={{ textAlign: 'center', width: 100 }}>Cant.</th>
                              <th style={{ textAlign: 'right', width: 140 }}>Precio Ref.</th>
                              <th style={{ textAlign: 'right', width: 140, paddingRight: 20 }}>Subtotal Ref.</th>
                           </tr>
                        </thead>
                        <tbody>
                            {detail.lines?.length === 0 && (
                                <tr><td colSpan="4" style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>No hay ítems en este remito</td></tr>
                            )}
                            {detail.lines?.map(l => (
                                <tr key={l.id} style={{ transition: 'all 0.2s' }}>
                                    <td style={{ paddingLeft: 20, fontWeight: 500 }}>{l.description}</td>
                                    <td style={{ textAlign: 'center', fontWeight: 800, color: '#3b82f6', background: '#eff6ff' }}>{l.qty}</td>
                                    <td style={{ textAlign: 'right', color: '#64748b' }}>{l.unit_price?.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 800, paddingRight: 20 }}>{l.total_amount?.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                  </div>
              </div>
          )}
      </Modal>

      {/* Receipt Preview Overlay */}
      {previewUrl && (
          <div className={localS.previewOverlay} onClick={() => setPreviewUrl(null)}>
              <div className={localS.previewContent} onClick={e => e.stopPropagation()}>
                  <div className={localS.previewHeader}>
                      <h3>VISTA PREVIA DEL COMPROBANTE</h3>
                      <button className={localS.closePreview} onClick={() => setPreviewUrl(null)}><X size={24} /></button>
                  </div>
                  <div className={localS.previewBody}>
                      {previewUrl.toLowerCase().endsWith('.pdf') ? (
                          <iframe src={previewUrl} className={localS.previewFrame} title="Documento PDF" />
                      ) : (
                          <img src={previewUrl} alt="Comprobante" className={localS.previewImage} />
                      )}
                  </div>
              </div>
          </div>
      )}
      {error && (
          <div style={{ padding: 40, textAlign: 'center', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, margin: '20px 24px' }}>
              <Activity size={32} color="#ef4444" style={{ marginBottom: 16 }} />
              <div style={{ fontSize: 16, fontWeight: 800, color: '#991b1b', marginBottom: 8 }}>Error de Conexión</div>
              <div style={{ fontSize: 13, color: '#b91c1c', marginBottom: 16 }}>{error}</div>
              <Button onClick={() => fetchAll()} variant="primary" style={{ background: '#ef4444', border: 'none' }}>Reintentar</Button>
          </div>
      )}
    </>
  );
}
