import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ContentHeader from '../../components/layout/ContentHeader';
import DocumentListPage from '../../components/layout/DocumentListPage';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import t from '../../components/ui/Table.module.css';
import s from '../../components/layout/DocumentListPage.module.css';
import { openNuevaOrdenCompra, openEditOrdenCompra } from '../../utils/openStandaloneWindow';
import { useToast } from '../../context/ToastContext';
import { TraceabilityProgress } from '../../components/ui/TraceabilityStatusBadge';
import StatusBadge from '../../components/ui/StatusBadge';
import api from '../../services/api';
import { TableRowSkeleton } from '../../components/ui/TableSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import { 
  Edit, 
  Trash2, 
  Search, 
  ChevronUp, 
  ChevronDown, 
  X, 
  Filter, 
  Plus, 
  PlusCircle,
  Eye, 
  Paperclip, 
  TrendingUp, 
  Clock, 
  PackageOpen, 
  CheckCircle,
  FileText,
  ArrowUpRight,
  Layers
} from 'lucide-react';

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [entities, setEntities] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  
  // States for filters
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hideCancelled, setHideCancelled] = useState(true);

  // Sorting
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [previewUrl, setPreviewUrl] = useState(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;
  
  const { showToast } = useToast();

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    const handleRefresh = () => fetchAll();
    window.addEventListener('purchase-order-changed', handleRefresh);
    window.addEventListener('cost-center-changed', handleRefresh);
    return () => {
      window.removeEventListener('purchase-order-changed', handleRefresh);
      window.removeEventListener('cost-center-changed', handleRefresh);
    };
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [orderData, entityData, warehouseData] = await Promise.all([
        api.get('/purchases/purchase-orders/'),
        api.get('/entities/', { params: { type: 'supplier' } }),
        api.get('/inventory/warehouses/'),
      ]);
      
      setOrders(orderData);
      setEntities(entityData);
      setWarehouses(warehouseData);
    } catch (e) { 
        console.error(e); 
        setError(e.message);
    } finally { 
        setLoading(false); 
    }
  };

  const handleOpenNew = () => {
    openNuevaOrdenCompra();
  };

  const handleOpenDetail = (id) => {
    openEditOrdenCompra(id);
  };

  const handleDelete = async (id, number) => {
    if (!window.confirm(`¿Está seguro de que desea eliminar la Orden de Compra ${number}?`)) {
      return;
    }

    try {
      await api.delete(`/purchases/purchase-orders/${id}`);
      showToast("Orden de Compra eliminada correctamente", "success");
      fetchAll();
    } catch (e) {
      console.error(e);
      showToast(e.message || 'Error al eliminar', "error");
    }
  };

  const filtered = useMemo(() => {
    return (orders || []).filter((o) => {
      if (hideCancelled && o.status === "CANCELLED") return false;
      if (selectedEntityId && String(o.entity_id) !== String(selectedEntityId)) return false;
      if (selectedStatus && String(o.status) !== String(selectedStatus)) return false;
      if (selectedWarehouseId && String(o.warehouse_id) !== String(selectedWarehouseId)) return false;

      const oDate = o.date ? new Date(o.date).getTime() : 0;
      if (dateFrom && oDate < new Date(dateFrom).setHours(0, 0, 0, 0)) return false;
      if (dateTo && oDate > new Date(dateTo).setHours(23, 59, 59, 999)) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const okNumber = String(o.number).toLowerCase().includes(q);
        const okProvider = (o.entity_name || "").toLowerCase().includes(q);
        if (!okNumber && !okProvider) return false;
      }

      return true;
    });
  }, [orders, selectedEntityId, selectedStatus, selectedWarehouseId, dateFrom, dateTo, hideCancelled, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const cmp = (a, b) => {
      let va, vb;
      switch (sortBy) {
        case "number": 
          va = parseInt(a.number?.replace(/\D/g, '') || 0); 
          vb = parseInt(b.number?.replace(/\D/g, '') || 0);
          return va - vb || (a.number || "").localeCompare(b.number || "");
        case "date": 
          va = new Date(a.date).getTime(); 
          vb = new Date(b.date).getTime(); 
          return va - vb;
        case "provider": 
          va = a.entity_name || ""; 
          vb = b.entity_name || ""; 
          return va.localeCompare(vb);
        case "total": 
          va = Number(a.total_amount) || 0; 
          vb = Number(b.total_amount) || 0; 
          return va - vb;
        case "status": 
          va = (a.status || ""); 
          vb = (b.status || ""); 
          return va.localeCompare(vb);
        default: return 0;
      }
    };
    list.sort((a, b) => (sortDir === "asc" ? 1 : -1) * cmp(a, b));
    return list;
  }, [filtered, sortBy, sortDir]);

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(field); setSortDir("desc"); }
  };

  const paginatedData = useMemo(() => {
    return sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [sorted, currentPage, pageSize]);

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
    const pendingReceipt = orders.filter(o => ['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(o.status)).length;
    const toConfirm = orders.filter(o => o.status === 'DRAFT').length;
    const countMonth = monthOrders.length;
    
    return { totalMonth, pendingReceipt, toConfirm, countMonth };
  }, [orders]);

  const fmt = (val, cur = 'ARS') => {
    return new Intl.NumberFormat('es-AR', { 
        style: 'currency', 
        currency: cur === 'USD' ? 'USD' : 'ARS',
        minimumFractionDigits: 0 
    }).format(val || 0);
  };

  const entityName = (id) => entities.find(e => e.id === id)?.name || id?.slice(0, 8);
  const warehouseName = (id) => warehouses.find(w => String(w.id) === String(id))?.name || "-";

  const kpis = [
    { label: "Compras del Mes", value: fmt(stats.totalMonth, 'ARS'), sub: `${stats.countMonth} comprobantes`, type: "Primary" },
    { label: "A Confirmar", value: stats.toConfirm, sub: "Órdenes en borrador", type: "Warning" },
    { label: "Pdte. Recibir", value: stats.pendingReceipt, sub: "Ingresos pendientes", type: "Info" },
    { label: "Completadas", value: orders.filter(o => o.status === 'RECEIVED').length, sub: "Histórico recepciones", type: "Success" },
    { label: "Total Histórico", value: orders.length, sub: "Registros totales", type: "Default" }
  ];

  const toolbar = {
    searchWrap: (
      <div className={s.searchWrap}>
        <Search className={s.searchIcon} size={20} />
        <input
          type="text"
          placeholder="Filtrar por número, proveedor o descripción..."
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
        <button className={s.ghostBtn} style={{ color: '#ef4444' }} title="Próximamente">Limpiar</button>
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
            <option value="PARTIALLY_RECEIVED">Recibida Parcial</option>
            <option value="RECEIVED">Recibida Total</option>
            <option value="CANCELLED">Anulada</option>
          </select>
          <select value={selectedEntityId} onChange={(e) => setSelectedEntityId(e.target.value)} className={s.filterSelect}>
            <option value="">Proveedor: Todos</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <select value={selectedWarehouseId} onChange={(e) => setSelectedWarehouseId(e.target.value)} className={s.filterSelect}>
            <option value="">Depósito: Todos</option>
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
        <th className={s.th} onClick={() => toggleSort('provider')} style={{ cursor: 'pointer' }}>TITULAR DE CUENTA</th>
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
              title="Sin Registros Coincidentes"
              description="Ajustá los parámetros del ledger o registrá una nueva operación de compra."
              actionLabel="Nueva Orden"
              onAction={handleOpenNew}
          />
        </td>
      </tr>
    ) : (
      paginatedData.map((o) => (
        <tr key={o.id} className={s.row} onClick={() => handleOpenDetail(o.id, o.number)}>
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
                <button onClick={() => handleDelete(o.id, o.number)} style={{ all: 'unset', cursor: 'pointer', color: '#ef4444', opacity: 0.7 }} title="Eliminar Orden">
                  <Trash2 size={18} />
                </button>
              )}
              {o.attachment_url && (
                <button onClick={() => setPreviewUrl(o.attachment_url)} style={{ all: 'unset', cursor: 'pointer', opacity: 0.4 }} title="Ver Adjunto">
                  <Paperclip size={18} />
                </button>
              )}
              <button onClick={() => handleOpenDetail(o.id, o.number)} style={{ all: 'unset', cursor: 'pointer', color: 'var(--accent-indigo)' }} title="Consultar Registro">
                <ArrowUpRight size={18} />
              </button>
            </div>
          </td>
        </tr>
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
    <>
      <DocumentListPage 
        title="Libro de Compras"
        breadcrumbs={[{ label: 'Suite de Compras' }, { label: 'Órdenes de Compra' }]}
        kpis={kpis}
        toolbar={toolbar}
        table={table}
        pagination={pagination}
      />
      {previewUrl && (
          <div className={s.previewOverlay} onClick={() => setPreviewUrl(null)}>
              <div className={s.previewContent} onClick={e => e.stopPropagation()}>
                  <div className={s.previewHeader}>
                      <h3>VISTA PREVIA DEL COMPROBANTE</h3>
                      <button className={s.closePreview} onClick={() => setPreviewUrl(null)}><X size={24} /></button>
                  </div>
                  <div className={s.previewBody}>
                      {previewUrl.toLowerCase().endsWith('.pdf') ? (
                          <iframe src={previewUrl} className={s.previewFrame} title="Documento PDF" />
                      ) : (
                          <img src={previewUrl} alt="Comprobante" className={s.previewImage} />
                      )}
                  </div>
              </div>
          </div>
      )}
    </>
  );
}
