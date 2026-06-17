import { useState, useEffect, useMemo } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import t from '../../components/ui/Table.module.css';
import { 
  Package, Plus, Search, FilterX, ArrowRight, ClipboardList, Trash2, Eye, 
  ArrowLeftRight, Settings, Calendar, FileText, ChevronRight
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import StockMovementEditor from './StockMovementEditor';
import TableSkeleton from '../../components/ui/TableSkeleton';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';

export default function StockMovementsPage() {
    const [movements, setMovements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showEditor, setShowEditor] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [initialType, setInitialType] = useState('ADJUSTMENT');
    const [searchQuery, setSearchQuery] = useState('');
    const { showToast } = useToast();

    useEffect(() => {
        fetchMovements();

        const handleRefresh = () => fetchMovements();
        window.addEventListener('cost-center-changed', handleRefresh);
        return () => window.removeEventListener('cost-center-changed', handleRefresh);
    }, []);

    const fetchMovements = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.get('/inventory/stock/movements');
            setMovements(data);
        } catch (e) {
            console.error(e);
            setError(e.message || "No se pudo cargar la lista de movimientos");
        } finally {
            setLoading(false);
        }
    };

    const handleNew = (type = 'ADJUSTMENT') => {
        setInitialType(type);
        setSelectedId(null);
        setShowEditor(true);
    };

    const handleView = (id) => {
        setSelectedId(id);
        setShowEditor(true);
    };

    const handleVoid = async (id) => {
        if (!confirm("¿Está seguro de ANULAR este movimiento? Esto revertirá el stock impactado.")) return;
        try {
            await api.delete(`/inventory/stock/movements/${id}`);
            showToast("Movimiento anulado correctamente", "success");
            fetchMovements();
        } catch (e) {
            console.error(e);
            showToast(e.message || "Error al anular", "error");
        }
    };

    const filtered = useMemo(() => {
        return movements.filter(m => 
            m.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (m.notes || '').toLowerCase().includes(searchQuery.toLowerCase())
        ).sort((a,b) => new Date(b.date) - new Date(a.date));
    }, [movements, searchQuery]);

    const getMovementBadge = (type) => {
        switch(type) {
            case 'ADJUSTMENT': return <Badge variant="warning" icon={<Settings size={12}/>}>Ajuste</Badge>;
            case 'TRANSFER': return <Badge variant="info" icon={<ArrowLeftRight size={12}/>}>Transferencia</Badge>;
            case 'PRODUCTION': return <Badge variant="success" icon={<Package size={12}/>}>Producción</Badge>;
            default: return <Badge>{type}</Badge>;
        }
    };

    if (showEditor) {
        return (
            <div style={{ padding: '24px', height: '100%', overflowY: 'auto', background: 'var(--bg-page)' }}>
                <StockMovementEditor 
                    movementId={selectedId} 
                    initialType={initialType}
                    onSave={() => { setShowEditor(false); fetchMovements(); }}
                    onCancel={() => setShowEditor(false)}
                />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-page)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px 0 24px' }}>
                <ContentHeader 
                    title="Movimientos de Stock" 
                    breadcrumbs={[{label: 'Inventario'}, {label: 'Movimientos'}]}
                    actions={
                        <div style={{ display: 'flex', gap: 12 }}>
                            <Button variant="ghost" onClick={() => handleNew('TRANSFER')} icon={<ArrowLeftRight size={18}/>}>
                                Transferencia
                            </Button>
                            <Button variant="primary" onClick={() => handleNew('ADJUSTMENT')} icon={<Plus size={18}/>}>
                                Nuevo Ajuste
                            </Button>
                        </div>
                    }
                />
            </div>

            <div style={{ flex: 1, padding: '20px 24px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
                
                {/* Stats / Quick summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                    <Card style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: 12, borderRadius: 12 }}>
                            <ClipboardList size={24} />
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Total Movimientos</div>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>{filtered.length}</div>
                        </div>
                    </Card>
                    <Card style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ background: 'var(--info-light)', color: 'var(--info)', padding: 12, borderRadius: 12 }}>
                            <ArrowLeftRight size={24} />
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Transferencias</div>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>{filtered.filter(m => m.type === 'TRANSFER').length}</div>
                        </div>
                    </Card>
                    <Card style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ background: 'var(--warning-light)', color: 'var(--warning)', padding: 12, borderRadius: 12 }}>
                            <Settings size={24} />
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Ajustes</div>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>{filtered.filter(m => m.type === 'ADJUSTMENT').length}</div>
                        </div>
                    </Card>
                    <Card style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ background: 'var(--success-light)', color: 'var(--success)', padding: 12, borderRadius: 12 }}>
                            <Package size={24} />
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Producciones</div>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>{filtered.filter(m => m.type === 'PRODUCTION').length}</div>
                        </div>
                    </Card>
                </div>

                <Card noPad style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ 
                        padding: '12px 16px', 
                        borderBottom: '1px solid var(--border-light)', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        background: 'white'
                    }}>
                        <div style={{ position: 'relative', width: 350 }}>
                            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} size={16} />
                            <input 
                                type="text" 
                                placeholder="Buscar por número o notas..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ 
                                    padding: '8px 12px 8px 32px', 
                                    borderRadius: '10px', 
                                    border: '1px solid var(--border-color)', 
                                    fontSize: '14px',
                                    width: '100%',
                                    outline: 'none',
                                    background: 'var(--bg-page)'
                                }}
                            />
                        </div>
                        <Button variant="ghost" size="sm" onClick={fetchMovements}>Actualizar</Button>
                    </div>

                    <div className={t.container} style={{ flex: 1, overflowY: 'auto' }}>
                        {loading ? (
                            <TableSkeleton rows={10} cols={6} />
                        ) : error ? (
                            <ErrorState message={error} onRetry={fetchMovements} />
                        ) : filtered.length === 0 ? (
                            <EmptyState 
                                icon={Package} 
                                title="Sin movimientos" 
                                description={searchQuery ? "No se encontraron resultados para tu búsqueda" : "Todavía no se registraron movimientos de stock."}
                            />
                        ) : (
                            <table className={t.table}>
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Número</th>
                                        <th>Tipo</th>
                                        <th>Depósito</th>
                                        <th>Notas</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(m => (
                                        <tr key={m.id} onClick={() => handleView(m.id)} style={{ cursor: 'pointer' }}>
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <Calendar size={14} color="var(--text-tertiary)" />
                                                    {new Date(m.date).toLocaleDateString()}
                                                </div>
                                            </td>
                                            <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{m.number}</td>
                                            <td>{getMovementBadge(m.type)}</td>
                                            <td>
                                                {m.type === 'TRANSFER' ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                                        <span style={{ fontWeight: 500 }}>{m.from_warehouse?.name || 'S/D'}</span>
                                                        <ChevronRight size={12} color="var(--text-tertiary)" />
                                                        <span style={{ fontWeight: 500 }}>{m.to_warehouse?.name || 'S/D'}</span>
                                                    </div>
                                                ) : (
                                                    <span style={{ fontWeight: 500 }}>{m.to_warehouse?.name || m.from_warehouse?.name || 'S/D'}</span>
                                                )}
                                            </td>
                                            <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: 'var(--text-secondary)' }}>
                                                {m.notes || '-'}
                                            </td>
                                            <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                                    <Button variant="ghost" size="sm" onClick={() => handleView(m.id)}><Eye size={16}/></Button>
                                                    <Button variant="ghost" size="sm" onClick={() => handleVoid(m.id)} style={{ color: 'var(--bad)' }}><Trash2 size={16}/></Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
}
