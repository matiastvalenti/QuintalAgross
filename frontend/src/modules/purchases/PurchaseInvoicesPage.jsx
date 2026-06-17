import { useState, useEffect, useMemo } from 'react';
import { 
  Search, Filter, Plus, FileText, ChevronDown, ChevronUp, 
  Eye, Trash2, X, Download, TrendingDown, Clock, AlertCircle,
  Receipt, TrendingUp, CheckCircle, Activity, Edit
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { navigateToError } from '../../utils/errorNavigation';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useWindow } from '../../context/WindowContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import s from "../../components/layout/DocumentListPage.module.css";
import t from '../../components/ui/Table.module.css';
import { TableRowSkeleton } from '../../components/ui/TableSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';

export default function PurchaseInvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [entities, setEntities] = useState([]);
  const [hideCancelled, setHideCancelled] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;
  
  const { openWindow } = useWindow(); 
  const { showToast } = useToast();
  const navigate = useNavigate();
  
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
      const relevant = (Array.isArray(data) ? data : []).filter(e => e.type === 'provider' || e.type === 'employee' || e.type === 'mixed');
      setEntities(relevant);
    } catch (err) {
      console.error(err);
      setEntities([]);
    }
  };

  const providerIds = useMemo(() => new Set(entities.map(e => e.id)), [entities]);

  const entityName = (id) => entities.find(e => e.id === id)?.name || `ID: ${id}`;

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      // Filter by provider
      if (entities.length > 0 && !providerIds.has(inv.entity_id)) return false;

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
  }, [invoices, search, selectedEntityId, selectedStatus, filterCurrency, dateFrom, dateTo, hideCancelled, entities, providerIds]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va = a[sortBy];
      let vb = b[sortBy];

      if (sortBy === 'entity_id') {
        va = entityName(a.entity_id);
        vb = entityName(b.entity_id);
      }

      if (sortBy === 'number') {
        const na = String(a.number).replace(/[^0-9]/g, "");
        const nb = String(b.number).replace(/[^0-9]/g, "");
        return sortDir === "asc" ? (parseInt(na) || 0) - (parseInt(nb) || 0) : (parseInt(nb) || 0) - (parseInt(na) || 0);
      }

      if (typeof va === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [filtered, sortBy, sortDir, entities]);


  const toggleSort = (field) => {
    if (sortBy === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(field); setSortDir("desc"); }
  };

  const currentInvoices = sorted.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const hasActiveFilters = search.trim() || selectedEntityId || selectedStatus || filterCurrency || dateFrom || dateTo;
  
  const handleOpenNew = () => {
    openWindow('purchase-invoice-form', { mode: 'new', context: 'purchases' }, { 
      title: 'Nueva Factura de Compra', 
      width: 1050, 
      height: 600,
      singletonKey: 'purchase-invoice-new'
    });
  };

  const handleOpenDetail = (id, number) => {
    openWindow('purchase-invoice-form', { id, mode: 'edit', context: 'purchases' }, { 
      title: `Factura de Compra ${number}`, 
      width: 1200, 
      height: 650,
      singletonKey: `invoice-${id}`
    });
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Está seguro de que desea eliminar esta factura de compra?')) return;
    
    try {
      await api.delete(`/purchase-invoices/${id}`);
      showToast('Factura eliminada correctamente', 'success');
      fetchInvoices();
    } catch (err) {
      showToast(err.message || 'Error al eliminar factura', 'error');
    }
  };

  const formatCurrency = (val, curr) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: curr || "ARS",
    }).format(val || 0);
  };

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthInvoices = invoices.filter(inv => {
      if (inv.status === 'CANCELLED') return false;
      const d = new Date(inv.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const totalMonth = monthInvoices.reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0);
    const pendingCount = invoices.filter(inv => inv.status === 'OPEN').length;
    const pendingTotal = invoices.filter(inv => inv.status === 'OPEN').reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0);
    const countMonth = monthInvoices.length;
    
    return { totalMonth, pendingCount, pendingTotal, countMonth, total: invoices.length };
  }, [invoices]);

  const totalPages = Math.ceil(filtered.length / pageSize);

  return (
    <div className={s.pageLayout}>
      <ContentHeader
        breadcrumbs={[{ label: 'Compras' }, { label: 'Facturas' }]}
        title="Facturas de Compra"
        actions={
            <Button variant="primary" className={s.primaryCta} onClick={handleOpenNew} style={{ height: 44, padding: '0 24px' }}>
                <Plus size={18} />
                Cargar Factura
            </Button>
        }
      />

      <div className={s.dashboard}>
          <div className={`${s.bentoCard} ${s.cardPrimary}`}>
              <div className={s.bentoHeader}>
                  <TrendingUp size={14} color="#3b82f6" />
                  <span>Facturado Mes</span>
              </div>
              <div className={s.bentoValue}>{formatCurrency(stats.totalMonth)}</div>
              <div className={s.bentoSubtext}>{stats.countMonth} comprobantes cargados</div>
          </div>
          <div className={`${s.bentoCard} ${s.cardWarning}`}>
              <div className={s.bentoHeader}>
                  <Clock size={14} color="#f59e0b" />
                  <span>Pendiente Pago</span>
              </div>
              <div className={s.bentoValue}>{formatCurrency(stats.pendingTotal)}</div>
              <div className={s.bentoSubtext}>{stats.pendingCount} facturas abiertas</div>
          </div>
          <div className={`${s.bentoCard} ${s.cardSuccess}`}>
              <div className={s.bentoHeader}>
                  <CheckCircle size={14} color="#10b981" />
                  <span>Pagadas</span>
              </div>
              <div className={s.bentoValue}>{invoices.filter(i => i.status === 'PAID').length}</div>
              <div className={s.bentoSubtext}>Histórico de pagos</div>
          </div>
          <div className={s.bentoCard}>
              <div className={s.bentoHeader}>
                  <FileText size={14} color="#64748b" />
                  <span>Total Documentos</span>
              </div>
              <div className={s.bentoValue}>{stats.total}</div>
              <div className={s.bentoSubtext}>Filtros activos: {filtered.length}</div>
          </div>
      </div>

      <div className={s.toolbar}>
        <div className={s.toolbarRow}>
          <div className={s.toolbarMain}>
            <div className={s.searchWrap}>
              <Search className={s.searchIcon} size={18} />
              <input
                type="text"
                placeholder="Buscar por número o proveedor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && <button className={s.inputClear} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setSearch("")}><X size={14} /></button>}
            </div>
            
            <button 
              type="button" 
              className={`${s.filterToggle} ${showFilters || hasActiveFilters ? s.active : ""}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={16} />
              Filtros Avanzados
              {hasActiveFilters && <span className={s.filterDot} style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, background: '#ef4444', borderRadius: '50%', border: '2px solid white' }} />}
            </button>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
                <label className={s.verCanceladosLabel} style={{ fontSize: 12, fontWeight: 600 }}>
                    <input
                        type="checkbox"
                        checked={hideCancelled}
                        onChange={(e) => setHideCancelled(e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: '#3b82f6' }}
                    />
                    Ocultar Anuladas
                </label>
            </div>
          </div>
        </div>

        {showFilters && (
          <div className={s.expandedFilters}>
              <div className={s.filterGroup}>
                <span className={s.filterLabel}>Estado</span>
                <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className={s.filterSelect}>
                  <option value="">Todos los estados</option>
                  <option value="OPEN">Pendiente</option>
                  <option value="PAID">Pagada</option>
                  <option value="CANCELLED">Anulada</option>
                </select>
              </div>

              <div className={s.filterGroup}>
                <span className={s.filterLabel}>Proveedor</span>
                <select value={selectedEntityId} onChange={(e) => setSelectedEntityId(e.target.value)} className={s.filterSelect}>
                  <option value="">Todos los proveedores</option>
                  {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>

              <div className={s.filterGroup}>
                <span className={s.filterLabel}>Moneda</span>
                <select value={filterCurrency} onChange={(e) => setFilterCurrency(e.target.value)} className={s.filterSelect}>
                  <option value="">Todas</option>
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </div>

              <div className={s.filterGroup}>
                <span className={s.filterLabel}>Desde</span>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={s.dateInput} />
              </div>

              <div className={s.filterGroup}>
                <span className={s.filterLabel}>Hasta</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={s.dateInput} />
              </div>
              
              <div className={s.filterGroup} style={{ justifyContent: 'flex-end', gridColumn: 'span 2' }}>
                  <Button variant="ghost" size="sm" onClick={() => {
                        setSearch("");
                        setSelectedEntityId("");
                        setSelectedStatus("");
                        setFilterCurrency("");
                        setDateFrom("");
                        setDateTo("");
                    }} style={{ color: '#ef4444', fontWeight: 700 }}>
                      Limpiar Filtros
                  </Button>
              </div>
          </div>
        )}
      </div>

      <div className={s.cardTable}>
        <div className={s.tableWrap}>
          <table className={t.table}>
            <thead>
              <tr>
                <th className={s.th} onClick={() => toggleSort('number')} style={{ cursor: 'pointer' }}>
                  Nro Factura {sortBy === 'number' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className={s.th} onClick={() => toggleSort('date')} style={{ cursor: 'pointer' }}>
                  Fecha {sortBy === 'date' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className={s.th} onClick={() => toggleSort('entity_id')} style={{ cursor: 'pointer' }}>
                  Proveedor {sortBy === 'entity_id' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className={s.th} style={{ textAlign: 'right' }}>Total</th>
                <th className={s.th} style={{ textAlign: 'center' }}>Estado</th>
                <th className={s.th} style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                 <TableRowSkeleton rows={8} cols={6} />
              ) : error ? (
                <tr>
                   <td colSpan="6">
                       <ErrorState message={error} onRetry={fetchInvoices} style={{ margin: 24 }} />
                   </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="6">
                    <EmptyState 
                        icon={Search} 
                        title={hasActiveFilters ? "Sin resultados" : "Sin facturas"}
                        description={hasActiveFilters ? "Ajustá los filtros para encontrar lo que buscás." : "Comenzá cargando tu primera factura de compra."}
                        actionLabel={!hasActiveFilters ? "Cargar Factura" : null}
                        onAction={!hasActiveFilters ? handleOpenNew : null}
                    />
                  </td>
                </tr>
              ) : (
                currentInvoices.map((inv) => (
                  <tr key={inv.id} className={s.row} onClick={() => handleOpenDetail(inv.id, inv.number)}>
                    <td className={`${s.td} ${s.numberCell}`}>{inv.number}</td>
                    <td className={s.td} style={{ color: '#64748b' }}>{new Date(inv.date).toLocaleDateString('es-AR')}</td>
                    <td className={s.td} style={{ fontWeight: 600 }}>{inv.entity_name || entityName(inv.entity_id)}</td>
                    <td className={`${s.td} ${s.totalCell}`}>
                      <span className={s.currencyLabel}>{inv.currency}</span>
                      {inv.total_amount?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className={s.td} style={{ textAlign: 'center' }}>
                      <Badge variant={inv.status}>
                        {inv.status === 'OPEN' ? 'Pendiente' : inv.status === 'PAID' ? 'Pagada' : 'Anulada'}
                      </Badge>
                    </td>
                    <td className={s.td} onClick={e => e.stopPropagation()}>
                      <div className={s.actions}>
                        {inv.attachment_url && (
                          <Button variant="ghost" size="sm" onClick={() => setPreviewUrl(inv.attachment_url)} title="Ver Comprobante">
                            <Eye size={16} color="#64748b" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleOpenDetail(inv.id, inv.number)} title="Ver Detalles">
                          <Edit size={16} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(inv.id)} title="Eliminar">
                          <Trash2 size={16} style={{ color: '#ef4444' }} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className={s.paginationBar}>
          <div className={s.paginationInfo}>
            Mostrando <strong>{((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filtered.length)}</strong> de <strong>{filtered.length}</strong> facturas
          </div>
          <div className={s.paginationControls}>
            <button className={s.pageBtn} disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)}>Anterior</button>
            <div className={s.pageNumbers}>
              {[...Array(totalPages)].map((_, i) => (
                <button key={i + 1} className={`${s.pageNum} ${currentPage === i + 1 ? s.active : ""}`} onClick={() => setCurrentPage(i + 1)}>{i + 1}</button>
              ))}
            </div>
            <button className={s.pageBtn} disabled={currentPage === totalPages} onClick={() => setCurrentPage(currentPage + 1)}>Siguiente</button>
          </div>
        </div>
      )}

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
    </div>
  );
}
