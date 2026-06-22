import { useState, useEffect, useMemo } from 'react';
import { 
  Search, Filter, Plus, FileText, ChevronDown, ChevronUp, 
  Eye, Trash2, X, Download, TrendingUp, Clock, Wallet, Calendar, User, DollarSign, ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import { useWindow } from '../../context/WindowContext';
import { useToast } from '../../context/ToastContext';
import { openNuevoRecibo, openEditRecibo } from '../../utils/openStandaloneWindow';
import api from '../../services/api';
import t from '../../components/ui/Table.module.css';
import TableSkeleton from "../../components/ui/TableSkeleton";
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [entities, setEntities] = useState([]);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  
  const { openWindow } = useWindow(); 
  const { showToast } = useToast();
  const navigate = useNavigate();
  
  // Sorting
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    fetchData();

    const onRefresh = () => fetchData(true);
    window.addEventListener("receipt-changed", onRefresh);
    window.addEventListener("invoice-changed", onRefresh);
    window.addEventListener("cost-center-changed", onRefresh);
    return () => {
      window.removeEventListener("receipt-changed", onRefresh);
      window.removeEventListener("invoice-changed", onRefresh);
      window.removeEventListener("cost-center-changed", onRefresh);
    };
  }, []);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [receiptsRes, entitiesRes] = await Promise.all([
        api.get('/accounting/documents/', { params: { doc_type: 'RECEIPT' } }),
        api.get('/entities/')
      ]);
      
      setReceipts(Array.isArray(receiptsRes) ? receiptsRes : []);
      setEntities(Array.isArray(entitiesRes) ? entitiesRes : []);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("No se pudieron cargar los datos de recibos");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const entityName = (id) => entities.find(e => e.id === id)?.name || `ID: ${id.substring(0,8)}...`;

  const filtered = useMemo(() => {
    return receipts.filter((rec) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesSearch = String(rec.number).toLowerCase().includes(q) || entityName(rec.entity_id).toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (selectedEntityId && rec.entity_id !== selectedEntityId) return false;
      if (dateFrom && new Date(rec.date) < new Date(dateFrom)) return false;
      if (dateTo && new Date(rec.date) > new Date(dateTo + "T23:59:59")) return false;
      return true;
    }).sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];
      if (sortBy === 'date') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      }
      if (sortDir === 'asc') return valA > valB ? 1 : -1;
      return valA < valB ? 1 : -1;
    });
  }, [receipts, search, selectedEntityId, dateFrom, dateTo, sortBy, sortDir, entities]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage]);

  const totalPages = Math.ceil(filtered.length / pageSize);

  const handleHandleNew = () => {
    openNuevoRecibo({ 
      title: 'Nuevo Recibo', 
      width: 1100, 
      height: 800,
    });
  };

  const handleOpen = (id) => {
    openEditRecibo(id, { 
      mode: 'view',
      title: `Recibo ${receipts.find(r => r.id === id)?.number || ''}`, 
      width: 1100, 
      height: 800 
    });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'OPEN': return <Badge variant="warning">Pendiente</Badge>;
      case 'PARTIAL': return <Badge variant="info">Parcial</Badge>;
      case 'CLOSED': return <Badge variant="success">Cobrado</Badge>;
      case 'CANCELLED': return <Badge variant="error">Anulado</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  if (error) return <ErrorState message={error} onRetry={() => fetchData()} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-page)', overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px 0 24px' }}>
        <ContentHeader 
          title="Recibos de Cobro" 
          breadcrumbs={[{label: 'Finanzas'}, {label: 'Recibos'}]}
          actions={
            <Button onClick={handleHandleNew} icon={<Plus size={18}/>} variant="primary">
              Nuevo Recibo
            </Button>
          }
        />
      </div>

      <div style={{ flex: 1, padding: '16px 24px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
        
        {/* Stats Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <Card style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: 12, borderRadius: 12 }}>
                    <Wallet size={24} />
                </div>
                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Total Recibidos</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{filtered.length}</div>
                </div>
            </Card>
            <Card style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ background: 'var(--success-light)', color: 'var(--success)', padding: 12, borderRadius: 12 }}>
                    <TrendingUp size={24} />
                </div>
                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Monto Total (ARS)</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>
                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(filtered.reduce((acc, curr) => acc + (curr.total_amount_ars || 0), 0))}
                    </div>
                </div>
            </Card>
            <Card style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ background: 'var(--warning-light)', color: 'var(--warning)', padding: 12, borderRadius: 12 }}>
                    <Clock size={24} />
                </div>
                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Pendientes de Aplicar</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>
                        {filtered.filter(r => r.status === 'OPEN').length}
                    </div>
                </div>
            </Card>
            <Card style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ background: 'var(--info-light)', color: 'var(--info)', padding: 12, borderRadius: 12 }}>
                    <FileText size={24} />
                </div>
                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Recibos en Dólares</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>
                        {filtered.filter(r => r.currency === 'USD').length}
                    </div>
                </div>
            </Card>
        </div>

        <Card noPad style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{ 
            padding: '12px 16px', 
            borderBottom: '1px solid var(--border-light)', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            background: 'white'
          }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1 }}>
                <div style={{ position: 'relative', width: 300 }}>
                    <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} size={16} />
                    <input 
                        type="text" 
                        placeholder="Buscar por número o cliente..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ 
                            padding: '8px 12px 8px 32px', 
                            borderRadius: '10px', 
                            border: '1px solid var(--border-color)', 
                            fontSize: '14px',
                            width: '100%',
                            outline: 'none',
                            background: 'var(--bg-page)',
                            transition: 'all 0.2s'
                        }}
                    />
                </div>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setShowFilters(!showFilters)}
                    icon={<Filter size={16} />}
                >
                    Filtros {showFilters ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                </Button>
            </div>
            
            <div style={{ display: 'flex', gap: 8 }}>
                 <Button variant="ghost" size="sm" onClick={() => fetchData()}>Actualizar</Button>
            </div>
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div style={{ 
                padding: '16px', 
                background: '#f8fafc', 
                borderBottom: '1px solid var(--border-light)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Cliente</label>
                    <select 
                        value={selectedEntityId} 
                        onChange={e => setSelectedEntityId(e.target.value)}
                        style={{ padding: '8px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'white' }}
                    >
                        <option value="">Todos</option>
                        {entities.filter(e => e.type === 'client' || e.type === 'mixed').map(e => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Desde</label>
                    <input 
                        type="date" 
                        value={dateFrom} 
                        onChange={e => setDateFrom(e.target.value)}
                        style={{ padding: '8px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'white' }}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Hasta</label>
                    <input 
                        type="date" 
                        value={dateTo} 
                        onChange={e => setDateTo(e.target.value)}
                        style={{ padding: '8px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'white' }}
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setSelectedEntityId(""); setDateFrom(""); setDateTo(""); }}>Limpiar</Button>
                </div>
            </div>
          )}

          {/* Table Container */}
          <div className={t.container} style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <TableSkeleton rows={8} cols={7} />
            ) : filtered.length === 0 ? (
              <EmptyState 
                icon={Wallet} 
                title="Sin recibos" 
                description={search ? "No se encontraron resultados para tu búsqueda" : "Todavía no se registraron recibos de cobro."}
                actionLabel={!search ? "Crear Primer Recibo" : null}
                onAction={!search ? handleHandleNew : null}
              />
            ) : (
              <table className={t.table}>
                <thead>
                  <tr>
                    <th onClick={() => { setSortBy('date'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }} style={{ cursor: 'pointer' }}>
                        Fecha {sortBy === 'date' && (sortDir === 'asc' ? <ChevronUp size={14}/> : <ChevronDown size={14}/>)}
                    </th>
                    <th>Número</th>
                    <th>Cliente</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'center' }}>Moneda</th>
                    <th>Estado</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(rec => (
                    <tr key={rec.id} onClick={() => handleOpen(rec.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Calendar size={14} color="var(--text-tertiary)" />
                            {new Date(rec.date).toLocaleDateString()}
                          </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{rec.number}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <User size={14} color="var(--text-tertiary)" />
                            <div style={{ fontWeight: 500 }}>{entityName(rec.entity_id)}</div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: rec.currency }).format(rec.total_amount)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                         <Badge variant={rec.currency === 'USD' ? 'accent' : 'secondary'}>{rec.currency}</Badge>
                      </td>
                      <td>{getStatusBadge(rec.status)}</td>
                      <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <Button variant="ghost" size="sm" onClick={() => handleOpen(rec.id)}><Eye size={16}/></Button>
                          <Button variant="ghost" size="sm" onClick={async () => {
                              if(window.confirm("¿Eliminar recibo?")) {
                                try {
                                  await api.delete(`/accounting/documents/${rec.id}`);
                                  showToast("Recibo eliminado", "success");
                                  fetchData(true);
                                } catch(e) {
                                  showToast(e.response?.data?.detail || "Error", "error");
                                }
                              }
                          }}><Trash2 size={16}/></Button>
                          <Button variant="ghost" size="sm" onClick={() => {/* TODO: Print */}}><Download size={16}/></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ 
                padding: '12px 16px', 
                borderTop: '1px solid var(--border-light)', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                background: '#f8fafc'
            }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Mostrando <strong>{paginated.length}</strong> de <strong>{filtered.length}</strong> resultados
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Button 
                        size="sm" 
                        variant="ghost" 
                        disabled={currentPage === 1} 
                        onClick={() => setCurrentPage(v => v - 1)}
                    >
                        Anterior
                    </Button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', fontSize: 14 }}>
                        Página <strong>{currentPage}</strong> de {totalPages}
                    </div>
                    <Button 
                        size="sm" 
                        variant="ghost" 
                        disabled={currentPage === totalPages} 
                        onClick={() => setCurrentPage(v => v + 1)}
                    >
                        Siguiente
                    </Button>
                </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
