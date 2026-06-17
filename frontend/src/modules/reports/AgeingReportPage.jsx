import React, { useState, useEffect, useMemo } from 'react';
import { Search, Download, ArrowUpDown, ChevronRight, ChevronDown,
    DollarSign, AlertTriangle, Users, Percent, Layout as LayoutIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWindow } from '../../context/WindowContext';
import { useCostCenter } from '../../context/CostCenterContext';

import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import { API_URL } from '../../config';
import { exportToExcel } from '../../utils/ReportExporter';
import s from './AgeingReportPage.module.css';
import t from '../../components/ui/Table.module.css';
import Skeleton from '../../components/ui/Skeleton';
import api from '../../services/api';

export default function AgeingReportPage() {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('client'); // 'client' or 'provider'
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'total_balance', direction: 'desc' });
    const [expandedIds, setExpandedIds] = useState({});
    const { openWindow } = useWindow();
    const { costCenter } = useCostCenter();
    const navigate = useNavigate();
    
    const toggleExpand = (id) => {
        setExpandedIds(prev => ({...prev, [id]: !prev[id]}));
    };

    useEffect(() => {
        const fetchReport = async () => {
            setLoading(true);
            try {
                const data = await api.get(`/entities/reports/ageing`, { 
                  params: { 
                    type: filterType,
                    cost_center: costCenter
                  } 
                });
                setReport(data);
            } catch (error) {
                console.error("Error al cargar el reporte de antigüedad:", error);
                navigate(`/error?title=Reporte Fallido&message=No pudimos generar el reporte de antigüedad.&cause=${encodeURIComponent(error.message)}&status=500`);
            } finally {
                setLoading(false);
            }
        };
        fetchReport();
    }, [filterType, navigate, costCenter]);


    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'decimal',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    };

    const handleSort = (key) => {
        let direction = 'desc';
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const sortedData = useMemo(() => {
        if (!report) return [];
        let items = [...report.data];

        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            items = items.filter(ent => 
                ent.name.toLowerCase().includes(q) || 
                ent.code.toLowerCase().includes(q)
            );
        }

        items.sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (a[sortConfig.key] > b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
        return items;
    }, [report, searchTerm, sortConfig]);

    const handleExportExcel = () => {
        if (!report || report.data.length === 0) return;

        const dataToExport = report.data.map(item => {
            const exp = {
                'Código': item.code,
                'Nombre': item.name,
                'Saldo Total (USD)': item.total_balance,
                'Total Vencido (USD)': item.overdue_balance
            };
            // Map buckets dynamically based on our knowledge of the backend keys
            (item.aging_buckets || []).forEach(b => {
                exp[b.label] = b.amount;
            });
            return exp;
        });

        exportToExcel(dataToExport, `Antiguedad_${filterType}`, 'Reporte');
    };

    const ReportSkeleton = () => (
        <div className={s.pageContainer}>
            <ContentHeader 
                title="Antigüedad de Deuda" 
                subtitle="Cargando análisis detallado..."
                actions={<Skeleton width="180px" height="42px" borderRadius="10px" />}
            />
            <div className={s.statsGrid}>
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className={s.statCard} style={{ background: 'white' }}>
                        <div className={s.statIcon}><Skeleton width="24px" height="24px" circle /></div>
                        <div className={s.statValue} style={{ marginTop: '10px' }}><Skeleton width="120px" height="28px" /></div>
                        <div className={s.statLabel} style={{ marginTop: '8px' }}><Skeleton width="80px" height="14px" /></div>
                        <div className={s.statTrend} style={{ marginTop: '4px' }}><Skeleton width="100px" height="12px" /></div>
                    </div>
                ))}
            </div>
            <div className={s.toolbar}>
                <div className={s.toolbarTop}>
                    <Skeleton width="200px" height="40px" borderRadius="10px" />
                    <Skeleton width="300px" height="40px" borderRadius="10px" />
                </div>
            </div>
            <div className={s.tableCard}>
                <div className={t.container}>
                    <table className={t.table}>
                        <thead>
                            <tr>
                                <th style={{ padding: '16px 24px' }}>ENTIDAD</th>
                                <th>SALDO TOTAL</th>
                                <th>VENCIDO</th>
                                <th style={{ textAlign: 'right' }}>A VENCER</th>
                                <th style={{ textAlign: 'right' }}>0-30</th>
                                <th style={{ textAlign: 'right' }}>31-60</th>
                                <th style={{ textAlign: 'right' }}>61-90</th>
                                <th style={{ textAlign: 'right' }}>+90</th>
                                <th style={{ textAlign: 'center' }}>ACCIONES</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                                <tr key={i} className={t.row}>
                                    <td style={{ padding: '16px 24px' }}>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <Skeleton width="16px" height="16px" />
                                            <div>
                                                <Skeleton width="150px" height="14px" />
                                                <Skeleton width="80px" height="10px" style={{ marginTop: '4px' }} />
                                            </div>
                                        </div>
                                    </td>
                                    <td><Skeleton width="80px" height="14px" /></td>
                                    <td><Skeleton width="80px" height="14px" /></td>
                                    <td><Skeleton width="60px" height="14px" style={{ marginLeft: 'auto' }} /></td>
                                    <td><Skeleton width="60px" height="14px" style={{ marginLeft: 'auto' }} /></td>
                                    <td><Skeleton width="60px" height="14px" style={{ marginLeft: 'auto' }} /></td>
                                    <td><Skeleton width="60px" height="14px" style={{ marginLeft: 'auto' }} /></td>
                                    <td><Skeleton width="60px" height="14px" style={{ marginLeft: 'auto' }} /></td>
                                    <td><Skeleton width="100px" height="30px" borderRadius="6px" /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    if (loading && !report) return <ReportSkeleton />;

    const overduePct = report?.summary.total_debt > 0 
        ? (report.summary.total_overdue / report.summary.total_debt) * 100 
        : 0;

    return (
        <div className={s.pageContainer}>
            <ContentHeader 
                title="Antigüedad de Deuda" 
                subtitle={`Análisis detallado de la cartera de ${filterType === 'client' ? 'cobros' : 'pagos'}`}
                actions={
                    <Button variant="primary" onClick={handleExportExcel}>
                        <Download size={18} style={{ marginRight: 8 }} /> Exportar Excel
                    </Button>
                }
            />

            {/* KPI STATS */}
            <div className={s.statsGrid}>
                <div className={`${s.statCard} ${s.purple}`}>
                    <div className={s.statIcon}><DollarSign size={22} /></div>
                    <div className={s.statValue}>
                        <span style={{ fontSize: '14px', color: 'var(--text-secondary)', marginRight: 4 }}>US$</span>
                        {formatCurrency(report?.summary.total_debt || 0)}
                    </div>
                    <div className={s.statLabel}>Deuda Total</div>
                    <div className={s.statTrend}>Cartera consolidada</div>
                </div>
                
                <div className={`${s.statCard} ${s.red}`}>
                    <div className={s.statIcon}><AlertTriangle size={22} /></div>
                    <div className={s.statValue} style={{ color: 'var(--bad)' }}>
                        <span style={{ fontSize: '14px', marginRight: 4 }}>US$</span>
                        {formatCurrency(report?.summary.total_overdue || 0)}
                    </div>
                    <div className={s.statLabel}>Total Vencido</div>
                    <div className={s.statTrend} style={{ color: 'var(--bad)' }}>Fuera de término</div>
                </div>

                <div className={`${s.statCard} ${s.yellow}`}>
                    <div className={s.statIcon}><Percent size={22} /></div>
                    <div className={s.statValue}>
                        {overduePct.toFixed(1)}
                        <span style={{ fontSize: '16px', marginLeft: 2 }}>%</span>
                    </div>
                    <div className={s.statLabel}>Mora s/ Cartera</div>
                    <div className={s.progressContainer}>
                        <div className={s.progressBar} style={{ width: `${Math.min(100, overduePct)}%` }}></div>
                    </div>
                </div>

                <div className={`${s.statCard} ${s.blue}`}>
                    <div className={s.statIcon}><Users size={22} /></div>
                    <div className={s.statValue}>
                        {report?.data.length || 0}
                    </div>
                    <div className={s.statLabel}>Entidades Activas</div>
                    <div className={s.statTrend}>Cuentas activas</div>
                </div>
            </div>

            {/* TOOLBAR */}
            <div className={s.toolbar}>
                <div className={s.toolbarTop}>
                    <div className={s.viewToggle}>
                        <button 
                            className={`${s.toggleBtn} ${filterType === 'client' ? s.active : ''}`} 
                            onClick={() => setFilterType('client')}
                        >
                            Clientes
                        </button>
                        <button 
                            className={`${s.toggleBtn} ${filterType === 'provider' ? s.active : ''}`} 
                            onClick={() => setFilterType('provider')}
                        >
                            Proveedores
                        </button>
                    </div>

                    <div className={s.searchWrap}>
                        <Search size={18} className={s.searchIcon} />
                        <input 
                            className={s.searchInput}
                            placeholder="Buscar por nombre o código..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* TABLE */}
            <div className={s.tableCard}>
                <div className={t.container}>
                    <table className={t.table}>
                        <thead>
                            <tr>
                                <th style={{ padding: '16px 24px' }}>ENTIDAD</th>
                                <th onClick={() => handleSort('total_balance')} style={{ cursor: 'pointer' }}>
                                    SALDO TOTAL {sortConfig.key === 'total_balance' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </th>
                                <th onClick={() => handleSort('overdue_balance')} style={{ cursor: 'pointer' }}>
                                    VENCIDO {sortConfig.key === 'overdue_balance' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </th>
                                <th style={{ textAlign: 'right' }}>A VENCER</th>
                                <th style={{ textAlign: 'right' }}>0-30</th>
                                <th style={{ textAlign: 'right' }}>31-60</th>
                                <th style={{ textAlign: 'right' }}>61-90</th>
                                <th style={{ textAlign: 'right' }}>+90</th>
                                <th style={{ textAlign: 'center' }}>ACCIONES</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 100 }}>Actualizando datos...</td></tr>
                            ) : sortedData.length === 0 ? (
                                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 100 }}>No se encontraron saldos</td></tr>
                            ) : sortedData.map((ent) => (
                                <React.Fragment key={ent.id}>
                                    <tr className={t.row}>
                                        <td style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <button 
                                                onClick={() => toggleExpand(ent.id)} 
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}
                                            >
                                                {expandedIds[ent.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                            </button>
                                            <div>
                                                <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '14px' }}>{ent.name}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: 2, fontWeight: 500 }}>{ent.code}</div>
                                            </div>
                                        </td>
                                        <td style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
                                            {formatCurrency(ent.total_balance)}
                                        </td>
                                        <td style={{ fontWeight: 700, fontSize: '14px', color: ent.overdue_balance > 0 ? 'var(--bad)' : 'var(--good)' }}>
                                            {ent.overdue_balance > 0 ? formatCurrency(ent.overdue_balance) : '—'}
                                        </td>
                                        {ent.aging_buckets.map((b, idx) => (
                                            <td key={idx} style={{ 
                                                textAlign: 'right', 
                                                fontSize: '13px', 
                                                fontWeight: 600,
                                                color: b.amount > 0 ? (idx >= 3 ? 'var(--bad)' : 'var(--text)') : '#cbd5e1'
                                            }}>
                                                {b.amount > 0 ? formatCurrency(b.amount) : '—'}
                                            </td>
                                        ))}
                                        <td style={{ textAlign: 'center' }}>
                                            <button 
                                                className={s.pillsBtn}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openWindow('entity-dashboard', { entityId: ent.id }, { title: `Vista 360 - ${ent.name}`, width: 1100, height: 800 });
                                                }}
                                                title="Ver Vista 360"
                                                style={{ margin: '0 auto' }}
                                            >
                                                <LayoutIcon size={14} />
                                                360
                                            </button>
                                        </td>
                                    </tr>
                                    {expandedIds[ent.id] && ent.conditions && ent.conditions.length > 0 && ent.conditions.map((cond, cIdx) => (
                                        <tr key={`cond-${ent.id}-${cIdx}`} style={{ background: '#f8fafc' }}>
                                            <td style={{ padding: '8px 24px 8px 60px', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                                └ {cond.name}
                                            </td>
                                            <td style={{ fontSize: '13px', color: 'var(--text)' }}>{formatCurrency(cond.total_balance)}</td>
                                            <td style={{ fontSize: '13px', color: cond.overdue_balance > 0 ? 'var(--bad)' : 'inherit' }}>
                                                {cond.overdue_balance > 0 ? formatCurrency(cond.overdue_balance) : '—'}
                                            </td>
                                            {cond.aging_buckets.map((b, idx) => (
                                                <td key={`cb-${idx}`} style={{ 
                                                    textAlign: 'right', 
                                                    fontSize: '12px', 
                                                    color: b.amount > 0 ? (idx >= 3 ? 'var(--bad)' : 'var(--text-secondary)') : '#cbd5e1'
                                                }}>
                                                    {b.amount > 0 ? formatCurrency(b.amount) : '—'}
                                                </td>
                                            ))}
                                            <td></td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <style dangerouslySetInnerHTML={{ __html: `
                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 4px solid var(--border-color);
                    border-top: 4px solid var(--primary);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 20px auto;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}} />
        </div>
    );
}
