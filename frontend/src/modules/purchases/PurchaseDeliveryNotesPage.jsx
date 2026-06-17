import { useState, useEffect, useMemo } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import t from '../../components/ui/Table.module.css';
import s from '../sales/DeliveryNotesPage.module.css';
import { useToast } from '../../context/ToastContext';
import { Eye, Edit, Search, Filter, ChevronUp, ChevronDown, X, Receipt, Clock, TrendingUp, CheckCircle, Activity } from 'lucide-react';
import { useWindow } from '../../context/WindowContext';
import Skeleton from '../../components/ui/Skeleton';
import { API_URL } from '../../config';
import api from '../../services/api';

export default function PurchaseDeliveryNotesPage() {
  const { showToast } = useToast();
  const { openWindow } = useWindow();
  
  const [notes, setNotes] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [warehouses, setWarehouses] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [hideCancelled, setHideCancelled] = useState(true);

  // Multiselect
  const [selectedIds, setSelectedIds] = useState([]);

  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => { 
    fetchAll(); 
  }, []);

  useEffect(() => {
    const onChanged = () => fetchAll();
    window.addEventListener('delivery-note-changed', onChanged);
    window.addEventListener('invoice-changed', onChanged);
    return () => {
      window.removeEventListener('delivery-note-changed', onChanged);
      window.removeEventListener('invoice-changed', onChanged);
    };
  }, []);

  // Reset selection when filters change
  useEffect(() => {
    setSelectedIds([]);
  }, [search, selectedEntityId, selectedStatus, hideCancelled]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [dnRes, entRes, whRes] = await Promise.all([
        api.get('/sales/delivery-notes/', { params: { note_type: 'PURCHASE' } }), 
        api.get('/entities/', { params: { type: 'provider' } }),
        api.get('/inventory/warehouses/'),
      ]);
      setNotes(dnRes);
      setEntities(entRes);
      setWarehouses(whRes);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const entityName = (id) => entities.find(e => e.id === id)?.name || id?.slice(0, 8);

  const filtered = useMemo(() => {
    return notes.filter(n => {
      if (hideCancelled && n.status === 'CANCELLED') return false;
      if (selectedStatus && n.status !== selectedStatus) return false;
      if (selectedEntityId && String(n.entity_id) !== String(selectedEntityId)) return false;
      
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchNumber = String(n.number).toLowerCase().includes(q);
        const matchProvider = (entityName(n.entity_id) || '').toLowerCase().includes(q);
        if (!matchNumber && !matchProvider) return false;
      }
      return true;
    });
  }, [notes, selectedStatus, selectedEntityId, search, hideCancelled, entities]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va = a[sortBy];
      let vb = b[sortBy];
      if (sortBy === 'date') { va = new Date(a.date).getTime(); vb = new Date(b.date).getTime(); }
      const res = va < vb ? -1 : (va > vb ? 1 : 0);
      return sortDir === 'asc' ? res : -res;
    });
  }, [filtered, sortBy, sortDir]);

  const handleOpenDetail = (dn) => {
    openWindow(
      'delivery-note',
      { id: dn.id, mode: 'edit' },
      { title: `Remito de Compra ${dn.number}`, width: 1200, height: 650, singletonKey: `delivery-note-${dn.id}` }
    );
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    const eligibleIds = sorted
      .filter(n => (n.status === 'DISPATCHED' || n.status === 'PARTIAL'))
      .map(n => n.id);
    
    if (selectedIds.length === eligibleIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(eligibleIds);
    }
  };

  const handleBulkInvoice = () => {
    if (selectedIds.length === 0) return;
    
    const selectedNotes = notes.filter(n => selectedIds.includes(n.id));
    
    // Validate same supplier
    const entityId = selectedNotes[0].entity_id;
    if (selectedNotes.some(n => n.entity_id !== entityId)) {
      showToast("Todos los remitos deben ser del mismo proveedor para facturar en lote", "warning");
      return;
    }

    // Validate status
    if (selectedNotes.some(n => n.status !== 'DISPATCHED' && n.status !== 'PARTIAL')) {
       showToast("Algunos remitos seleccionados no son aptos para facturar (deben estar 'DISPATCHED')", "warning");
       return;
    }

    openWindow(
      'purchase-invoice-form',
      { mode: 'new', initialDnIds: selectedIds },
      { title: 'Nueva Factura de Compra (Lote)', width: 1100, height: 700 }
    );
  };

  const stats = useMemo(() => {
    return {
      draftCount: notes.filter(n => n.status === 'DRAFT').length,
      receivedCount: notes.filter(n => n.status === 'DISPATCHED' || n.status === 'PARTIAL').length,
      invoicedCount: notes.filter(n => n.status === 'INVOICED').length,
      totalCount: notes.filter(n => n.status !== 'CANCELLED').length
    };
  }, [notes]);

  const hasActiveFilters = search.trim() || selectedStatus || selectedEntityId;

  return (
    <div className={s.pageLayout}>
      <ContentHeader
        breadcrumbs={[{ label: 'Compras' }, { label: 'Recepción' }]}
        title="Remitos de Entrada"
      />

      <div className={s.dashboard}>
          <div className={`${s.bentoCard} ${s.cardWarning}`}>
              <div className={s.bentoHeader}>
                  <Clock size={14} color="#f59e0b" />
                  <span>Pendientes</span>
              </div>
              <div className={s.bentoValue}>{stats.draftCount}</div>
              <div className={s.bentoSubtext}>Ingresos en borrador</div>
          </div>
          <div className={`${s.bentoCard} ${s.cardPrimary}`}>
              <div className={s.bentoHeader}>
                  <TrendingUp size={14} color="#3b82f6" />
                  <span>Recibidos</span>
              </div>
              <div className={s.bentoValue}>{stats.receivedCount}</div>
              <div className={s.bentoSubtext}>Listos para facturar</div>
          </div>
          <div className={`${s.bentoCard} ${s.cardSuccess}`}>
              <div className={s.bentoHeader}>
                  <CheckCircle size={14} color="#10b981" />
                  <span>Facturados</span>
              </div>
              <div className={s.bentoValue}>{stats.invoicedCount}</div>
              <div className={s.bentoSubtext}>Cargados al Libro IVA</div>
          </div>
          <div className={s.bentoCard}>
              <div className={s.bentoHeader}>
                  <Activity size={14} color="#64748b" />
                  <span>Total Vigentes</span>
              </div>
              <div className={s.bentoValue}>{stats.totalCount}</div>
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
                onChange={e => setSearch(e.target.value)}
              />
              {search && <button className={s.inputClear} onClick={() => setSearch("")} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}><X size={14} /></button>}
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

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
                <label className={s.verCanceladosLabel} style={{ fontSize: 12, fontWeight: 600 }}>
                    <input
                        type="checkbox"
                        checked={hideCancelled}
                        onChange={e => setHideCancelled(e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: '#3b82f6' }}
                    />
                    Ocultar Anulados
                </label>
            </div>
          </div>
          {selectedIds.length > 0 && (
             <Button variant="primary" onClick={handleBulkInvoice} style={{ height: 44 }}>
               <Receipt size={16} style={{ marginRight: 8 }} />
               Facturar Seleccionados ({selectedIds.length})
             </Button>
          )}
        </div>

        {showFilters && (
          <div className={s.expandedFilters}>
              <div className={s.filterGroup}>
                <span className={s.filterLabel}>Estado</span>
                <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} className={s.filterSelect}>
                  <option value="">Todos</option>
                  <option value="DRAFT">Borrador</option>
                  <option value="DISPATCHED">Recibido (OK)</option>
                  <option value="INVOICED">Facturado</option>
                  <option value="CANCELLED">Anulado</option>
                </select>
              </div>

              <div className={s.filterGroup}>
                <span className={s.filterLabel}>Proveedor</span>
                <select value={selectedEntityId} onChange={e => setSelectedEntityId(e.target.value)} className={s.filterSelect}>
                  <option value="">Todos</option>
                  {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>

              <div className={s.filterGroup} style={{ justifyContent: 'flex-end', gridColumn: 'span 2' }}>
                  <Button variant="ghost" onClick={() => {
                        setSearch('');
                        setSelectedStatus('');
                        setSelectedEntityId('');
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
                <th style={{ width: 40, textAlign: 'center' }} className={s.th}>
                  <input 
                    type="checkbox" 
                    onChange={toggleSelectAll} 
                    checked={sorted.length > 0 && selectedIds.length === sorted.filter(n => (n.status === 'DISPATCHED' || n.status === 'PARTIAL')).length}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                </th>
                <th className={s.th} onClick={() => setSortBy('number')} style={{ cursor: 'pointer' }}>
                  Número {sortBy === 'number' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className={s.th} onClick={() => setSortBy('date')} style={{ cursor: 'pointer' }}>
                  Fecha {sortBy === 'date' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className={s.th}>Proveedor</th>
                <th className={s.th}>Depósito</th>
                <th className={s.th} style={{ textAlign: 'center' }}>Estado</th>
                <th className={s.th} style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className={s.row}>
                    <td className={s.td} style={{ textAlign: 'center' }}><Skeleton width="16px" height="16px" /></td>
                    <td className={s.td}><Skeleton width="100px" height="18px" /></td>
                    <td className={s.td}><Skeleton width="80px" height="14px" /></td>
                    <td className={s.td}><Skeleton width="180px" height="16px" /></td>
                    <td className={s.td}><Skeleton width="120px" height="14px" /></td>
                    <td className={s.td} style={{ textAlign: 'center' }}><Skeleton width="80px" height="24px" borderRadius="12px" style={{ margin: 'auto' }} /></td>
                    <td className={s.td} style={{ textAlign: 'right' }}>
                       <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                         <Skeleton width="28px" height="28px" borderRadius="6px" />
                         <Skeleton width="28px" height="28px" borderRadius="6px" />
                       </div>
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: 80, textAlign: 'center' }}>
                    <div className={s.empty} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                      <div className={s.emptyTitle} style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
                        {hasActiveFilters ? "No hay resultados" : "Sin remitos"}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                sorted.map(n => {
                  const canInvoice = n.status === 'DISPATCHED' || n.status === 'PARTIAL';
                  return (
                    <tr key={n.id} className={`${s.row} ${selectedIds.includes(n.id) ? s.rowSelected : ''}`} onClick={() => handleOpenDetail(n)}>
                      <td className={s.td} style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        {canInvoice && (
                          <input 
                            type="checkbox" 
                            checked={selectedIds.includes(n.id)}
                            onChange={() => toggleSelect(n.id)}
                            style={{ width: 16, height: 16, cursor: 'pointer' }}
                          />
                        )}
                      </td>
                      <td className={s.td}><span className={s.numberLink}>{n.number}</span></td>
                      <td className={s.td} style={{ color: '#64748b' }}>{new Date(n.date).toLocaleDateString('es-AR')}</td>
                      <td className={s.td} style={{ fontWeight: 600 }}>{entityName(n.entity_id)}</td>
                      <td className={s.td} style={{ color: '#64748b' }}>{warehouses.find(w => w.id === n.warehouse_id)?.name || '-'}</td>
                      <td className={s.td} style={{ textAlign: 'center' }}>
                        <Badge variant={n.status}>{n.status}</Badge>
                      </td>
                      <td className={s.td} style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {n.attachment_url && (
                            <Button variant="ghost" size="sm" onClick={() => setPreviewUrl(n.attachment_url)} title="Ver Adjunto">
                              <Eye size={16} color="#64748b" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => handleOpenDetail(n)} title="Ver / Editar">
                            <Edit size={16} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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
