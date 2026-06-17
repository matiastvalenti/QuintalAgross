import React, { useState, useEffect } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import { API_URL } from '../../config';
import { 
    Search, Calendar, User as UserIcon, Activity, 
    Filter, Database, Clock, ArrowRight, Shield, 
    ChevronLeft, ChevronRight, FileText, Trash2, 
    Plus, Edit, LogIn, AlertCircle
} from 'lucide-react';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import t from '../../components/ui/Table.module.css';

const ACTION_COLORS = {
    'CREATE': '#10b981',
    'UPDATE': '#f59e0b',
    'DELETE': '#ef4444',
    'LOGIN': '#3b82f6',
    'ANULAR': '#6366f1',
    'IMPORT': '#8b5cf6'
};

const MODULE_LABELS = {
    'sales_orders': 'Órdenes de Venta',
    'invoices': 'Facturas',
    'delivery_notes': 'Remitos',
    'products': 'Artículos',
    'cheques': 'Cheques / Tesorería',
    'users': 'Usuarios y Roles',
    'auth': 'Autenticación',
    'stock': 'Movimientos de Stock'
};

export default function AuditLogsPage() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit] = useState(50);
    const [moduleFilter, setModuleFilter] = useState('');
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetchLogs();
    }, [page, moduleFilter]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_URL}/auth/audit-logs?page=${page}&limit=${limit}&module=${moduleFilter}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setLogs(data);
            }
        } catch (e) {
            console.error("Error loading logs", e);
        } finally {
            setLoading(false);
        }
    };

    const getActionIcon = (action) => {
        if (action.includes('CREATE')) return <Plus size={14} />;
        if (action.includes('UPDATE')) return <Edit size={14} />;
        if (action.includes('DELETE')) return <Trash2 size={14} />;
        if (action.includes('LOGIN')) return <LogIn size={14} />;
        return <Activity size={14} />;
    };

    const filteredLogs = logs.filter(l => 
        l.username.toLowerCase().includes(search.toLowerCase()) ||
        l.description.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-page)' }}>
            <div style={{ padding: '16px 20px' }}>
                <ContentHeader 
                    title="Logs de Auditoría" 
                    breadcrumbs={[{ label: 'Sistema' }, { label: 'Seguridad' }, { label: 'Auditoría' }]}
                />
            </div>

            {/* Filters */}
            <div style={{ padding: '0 20px 16px 20px', display: 'flex', gap: 12 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={18} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-tertiary)' }} />
                    <input 
                        type="text" 
                        placeholder="Buscar por usuario o descripción..." 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            width: '100%', padding: '10px 10px 10px 40px', borderRadius: 12,
                            border: '1px solid var(--border-color)', background: 'white',
                            fontSize: 14, outline: 'none'
                        }}
                    />
                </div>
                <select 
                    value={moduleFilter} 
                    onChange={e => { setModuleFilter(e.target.value); setPage(1); }}
                    style={{
                        padding: '0 16px', borderRadius: 12, border: '1px solid var(--border-color)',
                        background: 'white', fontSize: 14, outline: 'none', minWidth: 200
                    }}
                >
                    <option value="">Todos los Módulos</option>
                    {Object.entries(MODULE_LABELS).map(([id, label]) => (
                        <option key={id} value={id}>{label}</option>
                    ))}
                </select>
            </div>

            <div style={{ flex: 1, padding: '0 20px 20px 20px', overflowY: 'auto' }}>
                <div style={{ background: 'white', borderRadius: 16, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                    <table className={t.table}>
                        <thead>
                            <tr>
                                <th style={{ width: 180 }}>Fecha y Hora</th>
                                <th style={{ width: 140 }}>Usuario</th>
                                <th style={{ width: 140 }}>Acción</th>
                                <th style={{ width: 160 }}>Módulo</th>
                                <th>Descripción</th>
                                <th style={{ width: 60 }}>Detalle</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Cargando registros...</td></tr>
                            ) : filteredLogs.length === 0 ? (
                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>No se encontraron registros de auditoría.</td></tr>
                            ) : filteredLogs.map(log => (
                                <tr key={log.id}>
                                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Clock size={12} />
                                            {new Date(log.timestamp).toLocaleString('es-AR')}
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--primary)' }}>
                                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
                                                {log.username.charAt(0).toUpperCase()}
                                            </div>
                                            @{log.username}
                                        </div>
                                    </td>
                                    <td>
                                        <span style={{ 
                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                            padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800,
                                            background: `${ACTION_COLORS[log.action] || '#64748b'}15`,
                                            color: ACTION_COLORS[log.action] || '#64748b',
                                            textTransform: 'uppercase'
                                        }}>
                                            {getActionIcon(log.action)}
                                            {log.action}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: 13, fontWeight: 500 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Database size={12} color="var(--text-tertiary)" />
                                            {MODULE_LABELS[log.module] || log.module}
                                        </div>
                                    </td>
                                    <td style={{ fontSize: 13 }}>{log.description}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        {log.data && (
                                            <button 
                                                title="Ver datos técnicos"
                                                style={{ padding: 6, borderRadius: 8, border: 'none', background: 'var(--bg-app)', cursor: 'pointer', color: 'var(--text-secondary)' }}
                                                onClick={() => console.log(log.data)}
                                            >
                                                <FileText size={16} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24 }}>
                    <Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
                        <ChevronLeft size={18} /> Anterior
                    </Button>
                    <div style={{ display: 'flex', alignItems: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Página {page}
                    </div>
                    <Button variant="secondary" disabled={logs.length < limit} onClick={() => setPage(page + 1)}>
                        Siguiente <ChevronRight size={18} />
                    </Button>
                </div>
            </div>
        </div>
    );
}
