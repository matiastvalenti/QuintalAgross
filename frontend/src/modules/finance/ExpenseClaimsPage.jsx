import React, { useState, useEffect } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import { 
    Receipt, Plus, Search, Filter, Eye, CheckCircle, Clock, 
    ChevronRight, ArrowUpRight, TrendingUp, AlertCircle, FileText, Wallet
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useWindow } from '../../context/WindowContext';
import { useToast } from '../../context/ToastContext';
import { openNuevaRendicion, openEditRendicion } from '../../utils/openStandaloneWindow';
import s from './ExpenseClaimsPage.module.css';
import api from '../../services/api';



export default function ExpenseClaimsPage() {
    const [claims, setClaims] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const { openWindow } = useWindow();
    const { showToast } = useToast();

    useEffect(() => {
        fetchClaims();
        
        const handleRefresh = () => fetchClaims();
        window.addEventListener('cost-center-changed', handleRefresh);
        return () => window.removeEventListener('cost-center-changed', handleRefresh);
    }, []);

    const fetchClaims = async () => {
        setLoading(true);
        try {
            const data = await api.get('/expenses/claims');
            setClaims(data);
        } catch (err) {
            console.error(err);
            showToast('No se pudieron cargar las rendiciones', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleNewClaim = () => {
        openNuevaRendicion({
            title: 'Nueva Rendición de Gastos',
            width: 1000,
            height: 750,
        });
    };

    const handleViewClaim = (claim) => {
        openEditRendicion(claim.id, {
            title: `Rendición: ${claim.title}`,
            width: 1000,
            height: 750,
        });
    };

    const getStatusStyles = (status) => {
        switch (status) {
            case 'DRAFT': return { label: "Borrador", color: "#64748b" };
            case 'SUBMITTED': return { label: "Presentado", color: "#f59e0b" };
            case 'APPROVED': return { label: "Aprobado", color: "#3b82f6" };
            case 'REIMBURSED': return { label: "Pagado", color: "#22c55e" };
            case 'REJECTED': return { label: "Rechazado", color: "#ef4444" };
            default: return { label: status, color: "#64748b" };
        }
    };

    const filteredClaims = claims.filter(c => 
        (c.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.employee_name || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    const stats = {
        totalPending: claims.filter(c => c.status === 'SUBMITTED').length,
        totalApproved: claims.filter(c => c.status === 'APPROVED').length,
        totalAmount: claims.reduce((acc, c) => acc + (c.total_amount || 0), 0)
    };

    return (
        <div className={s.container}>
            <ContentHeader 
                title="Rendición de Gastos y Viáticos" 
                subtitle="Gestión y control de comprobantes, alimentación, traslados y reembolsos."
                icon={Receipt}
                actions={(
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button className={s.refreshBtn} onClick={fetchClaims} title="Actualizar">
                            <Clock size={20} />
                        </button>
                        <button onClick={handleNewClaim} className={s.primaryCta}>
                            <Plus size={18} /> Nueva Rendición
                        </button>
                    </div>
                )}
            />

            {/* Quick Stats */}
            <div className={s.statsRow}>
                <div className={s.statCard}>
                    <div className={s.iconBox} style={{ background: '#eff6ff', color: '#3b82f6' }}><TrendingUp size={24}/></div>
                    <div>
                        <p className={s.statLabel}>Total Gestionado</p>
                        <h4 className={s.statValue}>$ {stats.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h4>
                    </div>
                </div>
                <div className={s.statCard}>
                    <div className={s.iconBox} style={{ background: '#fffbeb', color: '#f59e0b' }}><AlertCircle size={24}/></div>
                    <div>
                        <p className={s.statLabel}>Por Revisar</p>
                        <h4 className={s.statValue}>{stats.totalPending} Pendientes</h4>
                    </div>
                </div>
                <div className={s.statCard}>
                    <div className={s.iconBox} style={{ background: '#f0fdf4', color: '#22c55e' }}><CheckCircle size={24}/></div>
                    <div>
                        <p className={s.statLabel}>Aprobados</p>
                        <h4 className={s.statValue}>{stats.totalApproved} Listos</h4>
                    </div>
                </div>
            </div>

            <div className={s.mainPanel}>
                {/* Filters Toolbar */}
                <div className={s.toolbar}>
                    <div className={s.searchWrap}>
                        <Search size={18} className={s.searchIcon} />
                        <input 
                            type="text"
                            placeholder="Buscar por motivo o empleado..."
                            className={s.searchInput}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className={s.filterBtn}><Filter size={16} /> Filtros</button>
                    </div>
                </div>

                {/* Table */}
                <div className={s.tableContainer}>
                    <table className={s.table}>
                        <thead>
                            <tr>
                                <th className={s.th}>Fecha</th>
                                <th className={s.th}>Motivo de la Rendición</th>
                                <th className={s.th}>Responsable</th>
                                <th className={s.th} style={{ textAlign: 'right' }}>Monto Total</th>
                                <th className={s.th} style={{ textAlign: 'center' }}>Estado</th>
                                <th className={s.th} style={{ width: 60 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className={s.emptyCell}>Cargando rendiciones...</td></tr>
                            ) : filteredClaims.length === 0 ? (
                                <tr><td colSpan={6} className={s.emptyCell}>No hay rendiciones que coincidan con la búsqueda.</td></tr>
                            ) : filteredClaims.map(claim => {
                                const st = getStatusStyles(claim.status);
                                return (
                                    <tr key={claim.id} className={s.tr} onClick={() => handleViewClaim(claim)}>
                                        <td className={s.td}>{new Date(claim.date).toLocaleDateString()}</td>
                                        <td className={`${s.td} ${s.tdMain}`}>
                                            <div className={s.titleWrapper}>
                                                <FileText size={16} style={{color: '#94a3b8'}} />
                                                {claim.title}
                                            </div>
                                        </td>
                                        <td className={s.td}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div className={s.employeeTag}>{claim.employee_name}</div>
                                                <button 
                                                    title="Ver Cuenta Corriente"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openResumenCuenta(claim.entity_id, { 
                                                            title: `Resumen: ${claim.employee_name}`, 
                                                            width: 1200, 
                                                            height: 700 
                                                        });
                                                    }}
                                                    className={s.walletBtn}
                                                >
                                                    <Wallet size={14} />
                                                </button>
                                            </div>
                                        </td>
                                        <td className={s.td} style={{ textAlign: 'right' }}>
                                            <span className={s.amountText}>$ {claim.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </td>
                                        <td className={s.td} style={{ textAlign: 'center' }}>
                                            <span className={s.statusTag} style={{ background: `${st.color}15`, color: st.color, border: `1px solid ${st.color}30` }}>
                                                {st.label}
                                            </span>
                                        </td>
                                        <td className={s.td}>
                                            <div className={s.actionBtn}><ChevronRight size={18}/></div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
