import { useState, useEffect, useMemo } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import t from '../../components/ui/Table.module.css';
import s from '../../components/layout/DocumentListPage.module.css';
import { TableRowSkeleton } from '../../components/ui/TableSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import { useWindow } from '../../context/WindowContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import { Edit, Trash2, Search, ChevronUp, ChevronDown, X, Filter, Plus, Eye, Paperclip, TrendingUp, Clock, PackageOpen, CheckCircle } from 'lucide-react';

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
  
  const { openWindow } = useWindow(); 
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
        api.get('/entities/', { params: { type: 'provider' } }),
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
      openWindow('purchase-order', { mode: 'new' }, { 
          title: 'Nueva Orden de Compra', 
          width: 1100, 
          height: 700, 
          singletonKey: 'purchase-order-new' 
      });
  };

  const handleOpenDetail = (id, number) => {
      openWindow('purchase-order', { mode: 'edit', id }, { 
          title: `Orden de Compra ${number}`, 
          width: 1100, 
          height: 700, 
          singletonKey: `purchase-order-edit-${id}`
      });
  };

  const filtered = useMemo(() => {
    return orders.filter((o) => {
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
        minimumFractionDigits: 2 
    }).format(val || 0);
  };

  const totalPages = Math.ceil(filtered.length / pageSize);
  const hasActiveFilters = search.trim() || selectedEntityId || selectedStatus || selectedWarehouseId || dateFrom || dateTo;

  return (
    <div className={s.pageLayout}>
      <ContentHeader
        breadcrumbs={[{ label: 'Compras' }, { label: 'Órdenes de Compra' }]}
        title="Órdenes de Compra"
        actions={
            <Button variant="primary" className={s.primaryCta} onClick={handleOpenNew} style={{ height: 44, padding: '0 24px' }}>
                <Plus size={18} />
                Nueva Orden
            </Button>
        }
      />

      <div className={s.dashboard}>
          <div className={`${s.bentoCard} ${s.cardPrimary}`}>
              <div className={s.bentoHeader}>
                  <TrendingUp size={14} color="#3b82f6" />
                  <span>Compras del Mes</span>
              </div>
              <div className={s.bentoValue}>{fmt(stats.totalMonth, 'ARS')}</div>
              <div className={s.bentoSubtext}>{stats.countMonth} órdenes registradas</div>
          </div>
          <div className={`${s.bentoCard} ${s.cardWarning}`}>
              <div className={s.bentoHeader}>
                  <Clock size={14} color="#f59e0b" />
                  <span>A Confirmar</span>
              </div>
              <div className={s.bentoValue}>{stats.toConfirm}</div>
              <div className={s.bentoSubtext}>Pedidos en borrador</div>
          </div>
          <div className={`${s.bentoCard} ${s.cardInfo}`}>
              <div className={s.bentoHeader}>
                  <PackageOpen size={14} color="#6366f1" />
                  <span>Pdte. Recibir</span>
              </div>
              <div className={s.bentoValue}>{stats.pendingReceipt}</div>
              <div className={s.bentoSubtext}>Ingresos pendientes</div>
          </div>
          <div className={`${s.bentoCard} ${s.cardSuccess}`}>
              <div className={s.bentoHeader}>
                  <CheckCircle size={14} color="#10b981" />
                  <span>Completadas</span>
              </div>
              <div className={s.bentoValue}>{orders.filter(o => o.status === 'RECEIVED').length}</div>
              <div className={s.bentoSubtext}>Histórico de recepciones</div>
          </div>
          <div className={s.bentoCard}>
              <div className={s.bentoHeader}>
                  <Paperclip size={14} color="#64748b" />
                  <span>Total Histórico</span>
              </div>
              <div className={s.bentoValue}>{orders.length}</div>
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
              {search && <button className={s.inputClear} style={{ right: 10, top: '50%', transform: 'translateY(-50%)', position: 'absolute', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setSearch("")}><X size={14} /></button>}
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
                  <option value="DRAFT">Borrador</option>
                  <option value="CONFIRMED">Confirmada</option>
                  <option value="RECEIVED">Recibida</option>
                  <option value="CANCELLED">Anulada</option>
                </select>
              </div>

              <div className={s.filterGroup}>
                <span className={s.filterLabel}>Proveedor</span>
                <select value={selectedEntityId} onChange={(e) => setSelectedEntityId(e.target.value)} className={s.filterSelect}>
                  <option value="">Todos los proveedores</option>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>

              <div className={s.filterGroup}>
                <span className={s.filterLabel}>Depósito</span>
                <select value={selectedWarehouseId} onChange={(e) => setSelectedWarehouseId(e.target.value)} className={s.filterSelect}>
                  <option value="">Todos los depósitos</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
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
                     setSelectedEntityId("");
                     setSelectedStatus("");
                     setSelectedWarehouseId("");
                     setDateFrom("");
                     setDateTo("");
                     setSearch("");
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
                  Nro Orden {sortBy === 'number' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className={s.th} onClick={() => toggleSort('date')} style={{ cursor: 'pointer' }}>
                  Fecha {sortBy === 'date' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className={s.th} onClick={() => toggleSort('provider')} style={{ cursor: 'pointer' }}>
                  Proveedor {sortBy === 'provider' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className={s.th} style={{ textAlign: 'right' }} onClick={() => toggleSort('total')}>
                  Total {sortBy === 'total' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
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
                       <ErrorState message={error} onRetry={fetchAll} style={{ margin: 24 }} />
                   </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                   <td colSpan="6">
                      <EmptyState 
                          icon={Search} 
                          title={hasActiveFilters ? "Sin resultados" : "Sin órdenes registradas"}
                          description={hasActiveFilters ? "Ajustá los filtros para encontrar lo que buscás." : "Comenzá creando tu primera orden de compra."}
                          actionLabel={!hasActiveFilters ? "Nueva Orden" : null}
                          onAction={!hasActiveFilters ? handleOpenNew : null}
                      />
                   </td>
                </tr>
              ) : (
                paginatedData.map((o) => (
                  <tr key={o.id} className={s.row} onClick={() => handleOpenDetail(o.id, o.number)}>
                    <td className={`${s.td} ${s.numberCell}`}>{o.number}</td>
                    <td className={s.td} style={{ color: '#64748b' }}>
                      {new Date(o.date).toLocaleDateString('es-AR')}
                    </td>
                    <td className={s.td} style={{ fontWeight: 600 }}>{o.entity_name}</td>
                    <td className={`${s.td} ${s.totalCell}`}>
                      <span className={s.currencyLabel}>{o.currency}</span>
                      {o.total_amount?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className={s.td} style={{ textAlign: 'center' }}>
                      <Badge variant={o.status}>{o.status}</Badge>
                    </td>
                    <td className={s.td} onClick={(e) => e.stopPropagation()}>
                      <div className={s.actions}>
                        {o.attachment_url && (
                          <Button variant="ghost" size="sm" onClick={() => setPreviewUrl(o.attachment_url)} title="Ver Adjunto">
                            <Eye size={16} style={{ color: 'var(--primary)' }} />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleOpenDetail(o.id, o.number)} title="Ver / Editar">
                          <Edit size={16} />
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
            Mostrando <strong>{((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filtered.length)}</strong> de <strong>{filtered.length}</strong> órdenes
          </div>
          <div className={s.paginationControls}>
            <button 
              className={s.pageBtn} 
              disabled={currentPage === 1} 
              onClick={() => setCurrentPage(p => p - 1)}
            >
              Anterior
            </button>
            <div className={s.pageNumbers}>
              {[...Array(totalPages)].map((_, i) => (
                <button 
                  key={i + 1}
                  className={`${s.pageNum} ${currentPage === i + 1 ? s.active : ""}`}
                  onClick={() => setCurrentPage(i + 1)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button 
              className={s.pageBtn} 
              disabled={currentPage === totalPages} 
              onClick={() => setCurrentPage(p => p + 1)}
            >
              Siguiente
            </button>
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

