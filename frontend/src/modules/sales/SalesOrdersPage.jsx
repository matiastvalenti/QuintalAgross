import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { openNuevaOrdenVenta, openEditOrdenVenta, openNuevoRemito } from '../../utils/openStandaloneWindow';
import ContentHeader from '../../components/layout/ContentHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import t from '../../components/ui/Table.module.css';
import s from '../../components/layout/DocumentListPage.module.css';
import DocumentListPage from '../../components/layout/DocumentListPage';
import Skeleton from '../../components/ui/Skeleton';
import { useWindow } from '../../context/WindowContext';
import { useToast } from '../../context/ToastContext';
import { TraceabilityProgress } from '../../components/ui/TraceabilityStatusBadge';
import StatusBadge from '../../components/ui/StatusBadge';
import api from '../../services/api';
import TableSkeleton, { TableRowSkeleton } from '../../components/ui/TableSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import SalesOrderQuickPreview from './SalesOrderQuickPreview';
import { 
  Plus, 
  PlusCircle,
  TrendingUp, 
  Clock, 
  Package, 
  CheckCircle2, 
  ShoppingCart, 
  Search, 
  X, 
  Filter, 
  FileText, 
  Edit, 
  Trash2,
  Calendar,
  Layers,
  Zap,
  LayoutGrid,
  ArrowUpRight
} from 'lucide-react';

export default function SalesOrdersPage({ isWindow }) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [entities, setEntities] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  
  const { openWindow } = useWindow(); 
  const { showToast } = useToast();
  
  // Modal States
  const [detail, setDetail] = useState(null);
  const [showRemito, setShowRemito] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Vista Rápida Expandible
  const [quickViewId, setQuickViewId] = useState(null);
  const [quickViewDetail, setQuickViewDetail] = useState(null);
  const [quickViewLoading, setQuickViewLoading] = useState(false);
  const [quickViewError, setQuickViewError] = useState(null);

  const loadQuickView = async (id) => {
    if (quickViewId === id) return; 
    setQuickViewId(id);
    setQuickViewLoading(true);
    setQuickViewError(null);
    try {
      const data = await api.get(`/sales/sales-orders/${id}`);
      setQuickViewDetail(data);
    } catch (e) {
      setQuickViewError(e.message || "Error al cargar");
    } finally {
      setQuickViewLoading(false);
    }
  };

  const handleRowClick = (id) => {
    if (quickViewId === id) setQuickViewId(null);
    else loadQuickView(id);
  };

  useEffect(() => {
    fetchAll();
    
    const handleRefresh = () => fetchAll();
    window.addEventListener('sales-order-changed', handleRefresh);
    window.addEventListener('delivery-note-changed', handleRefresh);
    window.addEventListener('cost-center-changed', handleRefresh);
    
    return () => {
      window.removeEventListener('sales-order-changed', handleRefresh);
      window.removeEventListener('delivery-note-changed', handleRefresh);
      window.removeEventListener('cost-center-changed', handleRefresh);
    };
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [orderData, entityData, warehouseData, productData] = await Promise.all([
        api.get('/sales/sales-orders/'),
        api.get('/entities/'),
        api.get('/inventory/warehouses/'),
        api.get('/inventory/products/'),
      ]);
      
      setOrders(Array.isArray(orderData) ? orderData : []);
      setEntities(Array.isArray(entityData) ? entityData : []);
      setWarehouses(Array.isArray(warehouseData) ? warehouseData : []);
      setProducts(Array.isArray(productData) ? productData : []);
    } catch (e) {
      console.error(e);
      setError(e.message);
    }
    finally { setLoading(false); }
  };

  const entityName = (id) => entities.find(e => e.id === id)?.name || id?.slice(0, 8);
  const warehouseName = (id) => warehouses.find(w => String(w.id) === String(id))?.name || "-";
  
  const handleOpenNew = () => {
      openNuevaOrdenVenta();
  };

  const handleOpenDetail = (id, number) => {
      openEditOrdenVenta(id);
  };

  const confirmOV = async (id) => {
    try {
      await api.post(`/sales/sales-orders/${id}/confirm`);
      showToast("Orden de Venta confirmada", "success");
      fetchAll(); 
      setDetail(null); 
    } catch (e) { 
      console.error(e); 
      showToast(e.message || "Error al confirmar", "error");
    }
  };

  const handleDelete = async (id, number) => {
    if (!window.confirm(`¿Está seguro de que desea eliminar la Orden de Venta ${number}?`)) {
      return;
    }

    try {
      await api.delete(`/sales/sales-orders/${id}`);
      showToast("Orden de Venta eliminada correctamente", "success");
      fetchAll();
    } catch (e) {
      console.error(e);
      showToast(e.message || 'Error al eliminar', "error");
    }
  };

  const handlePreviewPdf = async (id) => {
    try {
      showToast("Generando comprobante...", "info");
      const fullOrder = await api.get(`/sales/sales-orders/${id}`);
      openWindow('pdf-viewer', { 
        order: {
          ...fullOrder,
          warehouse_name: warehouses.find(w => String(w.id) === String(fullOrder.warehouse_id))?.name,
          payment_condition: (fullOrder.payment_condition_id || fullOrder.condition_id) ? "Ver Detalle" : "-"
        }, 
        entities, 
        products 
      }, { title: `Vista Previa OV ${fullOrder.number}`, width: 1000, height: 750 });
    } catch (e) {
      console.error(e);
      showToast("Error al generar PDF", "error");
    }
  };

  const openRemitoModal = (ov) => {
    openNuevoRemito(ov.id);
  };

  // Filters setup
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [hideCancelled, setHideCancelled] = useState(true); 

  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    return (orders || []).filter((o) => {
      if (hideCancelled && o.status === "CANCELLED") return false;
      if (selectedEntityId && String(o.entity_id) !== String(selectedEntityId)) return false;
      if (selectedStatus && String(o.status) !== String(selectedStatus)) return false;
      if (filterCurrency && (o.currency || "").toUpperCase() !== filterCurrency) return false;
      if (selectedWarehouseId && String(o.warehouse_id) !== String(selectedWarehouseId)) return false;

      const total = Number(o.total_amount) || 0;
      if (minAmount && total < Number(minAmount)) return false;
      if (maxAmount && total > Number(maxAmount)) return false;

      const oDate = o.date ? new Date(o.date).getTime() : 0;
      if (dateFrom && oDate < new Date(dateFrom).setHours(0, 0, 0, 0)) return false;
      if (dateTo && oDate > new Date(dateTo).setHours(23, 59, 59, 999)) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const okNumber = String(o.number).toLowerCase().includes(q);
        const okClient = (entityName(o.entity_id) || "").toLowerCase().includes(q);
        if (!okNumber && !okClient) return false;
      }

      if (productSearch.trim()) {
        const q = productSearch.toLowerCase();
        const hasProduct = o.lines?.some(l => 
          (l.description || "").toLowerCase().includes(q) || 
          (l.product_id || "").toLowerCase().includes(q)
        );
        if (!hasProduct) return false;
      }

      return true;
    });
  }, [orders, selectedEntityId, selectedStatus, search, productSearch, filterCurrency, dateFrom, dateTo, hideCancelled, entities, selectedWarehouseId, minAmount, maxAmount]);

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

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthOrders = orders.filter(o => {
      if (o.status === 'CANCELLED') return false;
      const d = new Date(o.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const totalMonth = monthOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const pendingDelivery = orders.filter(o => ['CONFIRMED', 'PARTIALLY_DELIVERED'].includes(o.status)).length;
    const toConfirm = orders.filter(o => o.status === 'DRAFT').length;
    const countMonth = monthOrders.length;
    
    return { totalMonth, pendingDelivery, toConfirm, countMonth };
  }, [orders]);

  const handlePurge = async () => {
    if (!window.confirm("¿Desea eliminar todas las órdenes de venta que no tienen remitos asociados? Esta acción no se puede deshacer.")) {
        return;
    }
    try {
        const res = await api.post('/sales/sales-orders/purge-unlinked');
        showToast(res.message || "Limpieza completada", "success");
        fetchAll();
    } catch (e) {
        showToast(e.message || "Error al purgar", "error");
    }
  };

  const paginatedData = useMemo(() => {
    return sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [sorted, currentPage, pageSize]);

  const fmt = (val, cur = 'ARS') => {
    return new Intl.NumberFormat('es-AR', { 
        style: 'currency', 
        currency: cur === 'USD' ? 'USD' : 'ARS',
        minimumFractionDigits: 0 
    }).format(val || 0);
  };

  const kpis = [
    { label: "Ventas del Mes", value: fmt(stats.totalMonth, 'ARS'), sub: `${stats.countMonth} comprobantes`, type: "Primary" },
    { label: "A Confirmar", value: stats.toConfirm, sub: "Órdenes pendientes", type: "Warning" },
    { label: "Pdte. Logística", value: stats.pendingDelivery, sub: "Para despacho", type: "Info" },
    { label: "Efectividad", value: `${orders.length > 0 ? Math.round((orders.filter(o => o.status === 'FULLY_DELIVERED').length / orders.length) * 100) : 0}%`, sub: "Ratio cumplimiento", type: "Success" },
    { label: "Total Histórico", value: orders.length, sub: "Registros totales", type: "Default" }
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
        className={`${s.filterToggle} ${showFilters || (search && !orders.length) ? s.active : ""}`}
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
        <button className={s.ghostBtn} style={{ color: '#ef4444' }} onClick={handlePurge} title="Purgar base de datos">Limpiar</button>
        <button className={s.primaryCta} onClick={handleOpenNew}>
            <PlusCircle size={16} />
            Nueva Orden
        </button>
      </>
    ),
    filtersArea: showFilters && (
      <div className={s.compactFiltersRow}>
          <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className={s.filterSelect}>
            <option value="">Estado: Todos</option>
            <option value="DRAFT">Borrador</option>
            <option value="CONFIRMED">Confirmada</option>
            <option value="PARTIALLY_DELIVERED">Parcial (Remitido)</option>
            <option value="FULLY_DELIVERED">Remitido Total</option>
            <option value="PARTIALLY_INVOICED">Facturado Parcial</option>
            <option value="INVOICED">Facturado Total</option>
            <option value="COMPLETED">Completada</option>
            <option value="CANCELLED">Anulada</option>
          </select>
          <select value={selectedEntityId} onChange={(e) => setSelectedEntityId(e.target.value)} className={s.filterSelect}>
            <option value="">Cliente: Todos</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <select value={selectedWarehouseId} onChange={(e) => setSelectedWarehouseId(e.target.value)} className={s.filterSelect}>
            <option value="">Base: Todas</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>Desde</span>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={s.dateInput} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>Hasta</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={s.dateInput} />
          </div>
          <label className={s.toggleLabel} style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
              <div className={`${s.switch} ${!hideCancelled ? s.active : ""}`}>
                  <input type="checkbox" checked={!hideCancelled} onChange={() => setHideCancelled(!hideCancelled)} />
                  <div className={s.slider} />
              </div>
              <span className={s.toggleText} style={{ fontSize: '10px' }}>Incluir Anuladas</span>
          </label>
      </div>
    )
  };

  const table = {
    columns: (
      <>
        <th className={s.th} onClick={() => toggleSort('number')} style={{ cursor: 'pointer' }}>NUMERAL</th>
        <th className={s.th} onClick={() => toggleSort('date')} style={{ cursor: 'pointer' }}>REGISTRO</th>
        <th className={s.th} onClick={() => toggleSort('client')} style={{ cursor: 'pointer' }}>TITULAR DE CUENTA</th>
        <th className={s.th} style={{ textAlign: 'right' }} onClick={() => toggleSort('total')}>IMPORTE NETO</th>
        <th className={s.th}>BASE</th>
        <th className={s.th} style={{ textAlign: 'center' }}>ESTADO</th>
        <th className={s.th} style={{ textAlign: 'center' }}>USUARIO</th>
        <th className={s.th} style={{ textAlign: 'right' }}>DILIGENCIAS</th>
      </>
    ),
    body: loading ? (
        <TableRowSkeleton rows={10} cols={8} />
    ) : error ? (
        <tr><td colSpan="8"><ErrorState message={error} onRetry={fetchAll} /></td></tr>
    ) : sorted.length === 0 ? (
      <tr>
        <td colSpan="8">
          <EmptyState 
              icon={Layers} 
              title="Sin órdenes coincidentes"
              description="Ajustá los filtros o registrá una nueva orden."
              actionLabel="Nueva Orden"
              onAction={handleOpenNew}
          />
        </td>
      </tr>
    ) : (
      paginatedData.map((o) => (
        <Fragment key={o.id}>
        <tr className={`${s.row} ${quickViewId === o.id ? s.selectedRow : ''}`} onClick={() => handleRowClick(o.id)} onDoubleClick={() => handleOpenDetail(o.id, o.number)}>
          <td className={`${s.td} ${s.numberCell}`}>{o.number}</td>
          <td className={s.td} style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>
            {new Date(o.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
          </td>
          <td className={s.td} style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{o.entity_name || entityName(o.entity_id)}</td>
          <td className={`${s.td} ${s.totalCell}`}>
            <span className={s.currencyLabel}>{o.currency}</span>
            {Number(o.total_amount)?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </td>
          <td className={s.td} style={{ fontSize: 13, color: '#64748b' }}>{warehouseName(o.warehouse_id)}</td>
          <td className={s.td} style={{ textAlign: 'center', width: 220 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <StatusBadge status={o.status} />
              {o.status !== 'DRAFT' && o.status !== 'CANCELLED' && (
                <div style={{ width: '100%', padding: '0 4px', marginTop: 4 }}>
                  <TraceabilityProgress 
                      delivered={o.delivery_progress || 0} 
                      invoiced={o.invoice_progress || 0} 
                      paid={o.paid_progress || 0}
                  />
                </div>
              )}
            </div>
          </td>
          <td className={s.td} style={{ verticalAlign: 'middle' }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div className={s.userBadge}>
                      {(o.created_by || 'AD').substring(0, 2).toUpperCase()}
                  </div>
              </div>
          </td>
          <td className={s.td} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              {['DRAFT', 'CONFIRMED'].includes(o.status) && (
                <button onClick={(e) => { e.stopPropagation(); handleDelete(o.id, o.number); }} style={{ all: 'unset', cursor: 'pointer', color: '#ef4444', opacity: 0.7 }} title="Eliminar Orden">
                  <Trash2 size={18} />
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); handlePreviewPdf(o.id); }} style={{ all: 'unset', cursor: 'pointer', opacity: 0.4 }} title="Documento Oficial">
                <FileText size={18} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleOpenDetail(o.id, o.number); }} style={{ all: 'unset', cursor: 'pointer', color: 'var(--accent-indigo)' }} title="Consultar Registro">
                <ArrowUpRight size={18} />
              </button>
            </div>
          </td>
        </tr>
        
        {/* Fila expandible */}
        {quickViewId === o.id && (
          <tr className="animate-slide-down">
            <td colSpan={8} style={{ padding: 0, borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ padding: '16px 32px', background: '#f8fafc', borderTop: '1px dashed var(--border-color)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                {quickViewLoading ? <Skeleton width="100%" height={150} /> : quickViewError ? <ErrorState title="Error" message={quickViewError} /> : (
                  <SalesOrderQuickPreview detail={quickViewDetail} entities={entities} warehouses={warehouses} onOpenFull={handleOpenDetail} onPrint={handlePreviewPdf} />
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
    infoText: `REPORTE: ${filtered.length} ÓRDENES LOCALIZADAS`,
    totalPages: Math.ceil(filtered.length / pageSize),
    currentPage: currentPage,
    onPageChange: setCurrentPage
  };

  return (
    <DocumentListPage 
      title="Libro de Órdenes"
      breadcrumbs={[{ label: 'Suite Comercial' }, { label: 'Órdenes de Venta' }]}
      kpis={kpis}
      toolbar={toolbar}
      table={table}
      pagination={pagination}
    />
  );
}
