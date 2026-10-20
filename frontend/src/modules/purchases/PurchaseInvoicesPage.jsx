import { useState, useEffect, useMemo } from 'react';
import { 
  Search, Filter, Plus, FileText, ChevronDown, ChevronUp, Eye, Trash2, X, Edit, Download,
  TrendingUp, Clock, CheckCircle, BadgeDollarSign, Activity, Calendar, XCircle, Mail, Send,
  RefreshCcw, LayoutGrid, PlusCircle, ArrowUpRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import DocumentListPage from '../../components/layout/DocumentListPage';
import { openNuevaFacturaCompra, openEditFacturaCompra } from '../../utils/openStandaloneWindow';
import StatusBadge from '../../components/ui/StatusBadge';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import { TableRowSkeleton } from '../../components/ui/TableSkeleton';
import s from "../../components/layout/DocumentListPage.module.css";

export default function PurchaseInvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [entities, setEntities] = useState([]);
  const [hideCancelled, setHideCancelled] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [selectedInvoices, setSelectedInvoices] = useState([]);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  
  const { showToast } = useToast();
  
  // Sorting
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    fetchInvoices();
    fetchEntities();

    const handleRefresh = () => fetchInvoices();
    window.addEventListener("purchase-invoice-changed", handleRefresh);
    window.addEventListener("cost-center-changed", handleRefresh);
    return () => {
      window.removeEventListener("purchase-invoice-changed", handleRefresh);
      window.removeEventListener("cost-center-changed", handleRefresh);
    };
  }, []);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get('/accounting/documents/');
      setInvoices(data.filter(d => ['PURCHASE_INVOICE', 'PURCHASE_DEBIT_NOTE', 'PURCHASE_CREDIT_NOTE'].includes(d.doc_type)));
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchEntities = async () => {
    try {
      const data = await api.get('/entities/');
      const relevant = (Array.isArray(data) ? data : []).filter(e => e.type === 'supplier');
      setEntities(relevant);
    } catch (err) {
      console.error(err);
      setEntities([]);
    }
  };

  const entityName = (id) => entities.find(e => e.id === id)?.name || `ID: ${id}`;

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (hideCancelled && inv.status === 'CANCELLED') return false;
      
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesSearch = 
          String(inv.number).toLowerCase().includes(q) || 
          entityName(inv.entity_id).toLowerCase().includes(q) ||
          (inv.notes && inv.notes.toLowerCase().includes(q));
        if (!matchesSearch) return false;
      }

      if (selectedEntityId && String(inv.entity_id) !== String(selectedEntityId)) return false;
      if (selectedStatus && inv.status !== selectedStatus) return false;
      if (filterCurrency && inv.currency !== filterCurrency) return false;

      if (dateFrom && inv.date < dateFrom) return false;
      if (dateTo && inv.date > dateTo) return false;

      return true;
    });
  }, [invoices, search, selectedEntityId, selectedStatus, filterCurrency, dateFrom, dateTo, hideCancelled, entities]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va = a[sortBy];
      let vb = b[sortBy];

      if (sortBy === "entity_id") {
        va = entityName(a.entity_id);
        vb = entityName(b.entity_id);
      }

      if (sortBy === "number") {
        va = parseInt(String(a.number).replace(/\D/g, "") || 0);
        vb = parseInt(String(b.number).replace(/\D/g, "") || 0);
        return sortDir === "asc" ? va - vb : vb - va;
      }

      if (sortBy === "date" || sortBy === "due_date") {
        va = new Date(va || 0).getTime();
        vb = new Date(vb || 0).getTime();
        return sortDir === "asc" ? va - vb : vb - va;
      }

      if (typeof va === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [filtered, sortBy, sortDir, entities]);

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthDocs = invoices.filter(inv => {
      const d = new Date(inv.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear && inv.status !== 'CANCELLED';
    });

    const pendingDocs = invoices.filter(inv => inv.status === 'OPEN' || inv.status === 'PARTIAL');

    return {
      monthTotal: monthDocs.reduce((acc, inv) => acc + Number(inv.total_amount || 0), 0),
      monthCount: monthDocs.length,
      pendingTotal: pendingDocs.reduce((acc, inv) => acc + Number(inv.total_amount || 0), 0),
      pendingCount: pendingDocs.length,
      totalCount: invoices.filter(inv => inv.status !== 'CANCELLED').length
    };
  }, [invoices]);

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortDir("desc");
    }
  };

  const hasActiveFilters = Boolean(
    search.trim() || selectedEntityId || selectedStatus || filterCurrency || dateFrom || dateTo
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [hasActiveFilters, search, selectedEntityId, selectedStatus, filterCurrency, dateFrom, dateTo, hideCancelled]);

  const clearFilters = () => {
    setSearch("");
    setSelectedEntityId("");
    setSelectedStatus("");
    setFilterCurrency("");
    setDateFrom("");
    setDateTo("");
  };

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginatedData = useMemo(() => {
    return sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [sorted, currentPage, pageSize]);

  const handleOpenNew = () => {
    openNuevaFacturaCompra();
  };

  const handleOpenDetail = (id, number) => {
    openEditFacturaCompra(id, { title: `Factura de Compra ${number}` });
  };

  const handleDelete = async (e, id, number) => {
    if (e) e.stopPropagation();
    if (!confirm(`¿Está seguro de que desea eliminar la factura de compra ${number}?`)) return;
    
    try {
      await api.delete(`/purchase-invoices/${id}`); // Assuming API endpoint
      showToast('Factura eliminada correctamente', 'success');
      fetchInvoices();
    } catch (err) {
      showToast(err.message || 'Error al eliminar factura', 'error');
    }
  };

  const fmt = (val, cur = 'ARS') => {
    return new Intl.NumberFormat('es-AR', { 
        style: 'currency', 
        currency: cur === 'USD' ? 'USD' : 'ARS',
        minimumFractionDigits: 2 
    }).format(val || 0);
  };

  const kpis = [
    {
      title: "Facturado Mes",
      value: fmt(stats.monthTotal),
      subtitle: `${stats.monthCount} comprobantes cargados`,
      icon: TrendingUp,
      type: "primary"
    },
    {
      title: "Pendiente Pago",
      value: fmt(stats.pendingTotal),
      subtitle: `${stats.pendingCount} facturas abiertas`,
      icon: Clock,
      type: "warning"
    },
    {
      title: "Pagadas",
      value: invoices.filter(i => i.status === 'PAID').length,
      subtitle: "Histórico de pagos",
      icon: CheckCircle,
      type: "success"
    },
    {
      title: "Total Documentos",
      value: stats.totalCount,
      subtitle: `Resultados activos: ${filtered.length}`,
      icon: LayoutGrid,
      type: "neutral"
    }
  ];

  const toolbar = {
    search: (
      <div className={s.searchWrap}>
        <Search className={s.searchIcon} size={20} />
        <input
          type="text"
          placeholder="Filtrar por número, proveedor o importe..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && <button className={s.inputClear} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }} onClick={() => setSearch("")}><X size={16} /></button>}
      </div>
    ),
    filtersToggle: (
      <button 
        type="button" 
        className={`${s.filterToggle} ${showFilters || hasActiveFilters ? s.active : ""}`}
        onClick={() => setShowFilters(!showFilters)}
      >
        <Filter size={18} />
        Filtros
        {hasActiveFilters && <span className={s.filterDot} />}
      </button>
    ),
    actions: (
      <>
        <button className={s.ghostBtn} title="Próximamente">Exportar</button>
        <button className={s.ghostBtn} title="Próximamente">Columnas</button>
        <button className={s.ghostBtn} style={{ color: '#ef4444' }} onClick={clearFilters} title="Limpiar Filtros">Limpiar</button>
        <button className={s.primaryCta} onClick={handleOpenNew}>
            <PlusCircle size={16} />
            Cargar Factura
        </button>
      </>
    ),
    filtersArea: showFilters && (
      <div className={s.compactFiltersRow}>
          <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className={s.filterSelect}>
            <option value="">Estado: Todos</option>
            <option value="OPEN">📌 Pendiente</option>
            <option value="PAID">✅ Pagada</option>
            <option value="CANCELLED">❌ Anulada</option>
          </select>
          <select value={selectedEntityId} onChange={(e) => setSelectedEntityId(e.target.value)} className={s.filterSelect}>
            <option value="">Proveedor: Todos</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <select value={filterCurrency} onChange={(e) => setFilterCurrency(e.target.value)} className={s.filterSelect}>
            <option value="">Moneda: Todas</option>
            <option value="USD">💵 Dólares (USD)</option>
            <option value="ARS">🇦🇷 Pesos (ARS)</option>
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
        <th className={s.th} style={{ width: 40, padding: '0 12px' }}>
          <input 
              type="checkbox" 
              onChange={(e) => setSelectedInvoices(e.target.checked ? paginatedData.map(i => i.id) : [])}
              checked={selectedInvoices.length > 0 && selectedInvoices.length === paginatedData.length}
              style={{ cursor: 'pointer', width: 18, height: 18, accentColor: 'var(--primary)' }}
          />
        </th>
        <th className={s.th} onClick={() => toggleSort('number')} style={{ cursor: 'pointer' }}>Nº COMPROBANTE</th>
        <th className={s.th} onClick={() => toggleSort('date')} style={{ cursor: 'pointer' }}>FECHA</th>
        <th className={s.th} onClick={() => toggleSort('entity_id')} style={{ cursor: 'pointer' }}>PROVEEDOR</th>
        <th className={s.th}>VENCIMIENTO</th>
        <th className={s.th} style={{ textAlign: 'right' }} onClick={() => toggleSort('total_amount')}>TOTAL</th>
        <th className={s.th} style={{ textAlign: 'center' }}>ESTADO</th>
        <th className={s.th} style={{ textAlign: 'right' }}>ACCIONES</th>
      </>
    ),
    body: loading ? (
        <TableRowSkeleton rows={8} cols={8} />
    ) : error ? (
        <tr><td colSpan="8"><ErrorState message={error} onRetry={fetchInvoices} /></td></tr>
    ) : sorted.length === 0 ? (
      <tr>
        <td colSpan="8">
          <EmptyState 
              icon={Search} 
              title={hasActiveFilters ? "Sin resultados" : "Sin facturas de compra"}
              description={hasActiveFilters ? "Ajustá los filtros para encontrar lo que buscás." : "Comenzá cargando una factura de proveedor."}
              actionLabel={!hasActiveFilters ? "Cargar Factura" : null}
              onAction={!hasActiveFilters ? handleOpenNew : null}
          />
        </td>
      </tr>
    ) : (
      paginatedData.map((inv) => (
        <tr key={inv.id} className={`${s.row} ${selectedInvoices.includes(inv.id) ? s.rowSelected : ""}`} onClick={() => handleOpenDetail(inv.id, inv.number)}>
          <td className={s.td} onClick={(e) => e.stopPropagation()} style={{ width: 40, padding: '0 12px' }}>
            <input 
                type="checkbox"
                checked={selectedInvoices.includes(inv.id)}
                onChange={(e) => {
                    setSelectedInvoices(prev => prev.includes(inv.id) ? prev.filter(x => x !== inv.id) : [...prev, inv.id]);
                }}
                style={{ cursor: 'pointer', width: 17, height: 17, accentColor: 'var(--primary)' }}
            />
          </td>
          <td className={`${s.td} ${s.numberCell}`}>{inv.number}</td>
          <td className={s.td} style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>
            {new Date(inv.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
          </td>
          <td className={s.td} style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{inv.entity_name || entityName(inv.entity_id)}</td>
          <td className={s.td} style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {inv.due_date ? new Date(inv.due_date).toLocaleDateString('es-AR') : '-'}
          </td>
          <td className={`${s.td} ${s.totalCell}`}>
            <span className={s.currencyLabel}>{inv.currency}</span>
            {Number(inv.total_amount)?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </td>
          <td className={s.td} style={{ textAlign: 'center', width: 200 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <StatusBadge status={
                    inv.status === "OPEN" ? "PENDIENTE" :
                    inv.status === "PAID" ? "PAGADA" :
                    inv.status === "CANCELLED" ? "ANULADA" :
                    inv.status
                } />
            </div>
          </td>
          <td className={s.td} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              {inv.attachment_url && (
                <button onClick={() => setPreviewUrl(inv.attachment_url)} style={{ all: 'unset', cursor: 'pointer', opacity: 0.4 }} title="Ver Adjunto">
                  <Eye size={18} />
                </button>
              )}
              {inv.status !== 'CANCELLED' && (
                <button onClick={(e) => handleDelete(e, inv.id, inv.number)} style={{ all: 'unset', cursor: 'pointer', color: '#ef4444', opacity: 0.7 }} title="Eliminar Factura">
                  <Trash2 size={18} />
                </button>
              )}
              <button onClick={() => handleOpenDetail(inv.id, inv.number)} style={{ all: 'unset', cursor: 'pointer', color: 'var(--accent-indigo)' }} title="Consultar Registro">
                <ArrowUpRight size={18} />
              </button>
            </div>
          </td>
        </tr>
      ))
    )
  };

  const pagination = {
    infoText: `REPORTE: ${filtered.length} FACTURAS LOCALIZADAS`,
    totalPages: totalPages,
    currentPage: currentPage,
    onPageChange: setCurrentPage
  };

  return (
    <>
      <DocumentListPage 
        title="Facturas de Compra"
        breadcrumbs={[{ label: 'Compras' }, { label: 'Facturas' }]}
        kpis={kpis}
        toolbar={toolbar}
        table={table}
        pagination={pagination}
      />
      
      {/* Document View Overlay */}
      {previewUrl && (
          <div className={s.previewOverlay} onClick={() => setPreviewUrl(null)}>
              <div className={s.previewContent} onClick={e => e.stopPropagation()}>
                  <div className={s.previewHeader}>
                      <h3>VISTA PREVIA DEL DOCUMENTO</h3>
                      <button className={s.closePreview} onClick={() => setPreviewUrl(null)}><X size={20} /></button>
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