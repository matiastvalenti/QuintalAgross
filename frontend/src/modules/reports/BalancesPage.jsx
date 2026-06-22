import React, { useState, useEffect, useMemo } from 'react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import {
    Search, Filter, Download, Printer, Calendar,
    ArrowUpCircle, ArrowDownCircle, AlertCircle,
    ChevronRight, ChevronDown, RefreshCw, X,
    Users, Truck, Shuffle
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useWindow } from '../../context/WindowContext';
import { useCostCenter } from '../../context/CostCenterContext';
import { openResumenCuenta } from '../../utils/openStandaloneWindow';

import ContentHeader from '../../components/layout/ContentHeader';
import api from '../../services/api';
import { exportToExcel } from '../../utils/ReportExporter';
import t from '../../components/ui/Table.module.css';
import s from './BalancesPage.module.css';

const fmt = (val, curr = 'ARS') => new Intl.NumberFormat('es-AR', { 
    style: 'currency', 
    currency: curr,
    minimumFractionDigits: 2
}).format(val || 0);

export default function BalancesPage() {
    const [activeTab, setActiveTab] = useState('client'); // client, provider, mixed
    const [balances, setBalances] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    
    const { showToast } = useToast();
    const { openWindow } = useWindow();
    const { costCenter } = useCostCenter();


    useEffect(() => {
        fetchBalances();
    }, [activeTab, costCenter]);


    const fetchBalances = async () => {
        setLoading(true);
        try {
            const data = await api.get(`/entities/reports/ageing`, { 
              params: { 
                type: activeTab,
                cost_center: costCenter
              } 
            });
            setBalances(data.data || []);
        } catch (err) {
            console.error(err);
            showToast("Error al cargar saldos", "error");
        } finally {
            setLoading(false);
        }
    };

    const groupedBalances = useMemo(() => {
        // The new API endpoint /entities/reports/ageing returns data already grouped by entity
        // and with total_balance and overdue_balance.
        // So, we just need to filter and sort.
        return balances.filter(b => 
            b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (b.code && b.code.toLowerCase().includes(searchQuery.toLowerCase()))
        ).sort((a,b) => a.name.localeCompare(b.name));
    }, [balances, searchQuery]);

    const handleExportExcel = () => {
        if (groupedBalances.length === 0) {
            showToast("No hay datos para exportar", "warning");
            return;
        }

        const dataToExport = groupedBalances.map(b => ({
            'Código': b.code || '',
            'Entidad': b.name,
            'Saldo Total (ARS)': b.total_balance,
            'Saldo Vencido (ARS)': b.overdue_balance
        }));

        const success = exportToExcel(dataToExport, `Saldos_${activeTab}`, 'Saldos');
        if (success) showToast("Archivo Excel generado con éxito", "success");
    };

    const handleOpenStatement = (entityId, name) => {
        openResumenCuenta(entityId, { 
            title: `Saldos Pendientes: ${name}`, 
            width: 1200, 
            height: 700 
        });
    };

    return (
        <div className={s.pageLayout}>
            <ContentHeader 
                title="Resumen de Saldos" 
                breadcrumbs={[{ label: 'Contabilidad' }, { label: 'Saldos' }]}
                actions={
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Button variant="outline" onClick={handleExportExcel}>
                            <Download size={18} style={{ marginRight: 8 }} /> Exportar
                        </Button>
                        <Button variant="outline">
                            <Printer size={18} style={{ marginRight: 8 }} /> Imprimir
                        </Button>
                    </div>
                }
            />

            <div className={s.container}>
                <div className={s.sidebar}>
                    <div className={s.sidebarHeader}>
                        <h3 className={s.sidebarTitle}>Filtros de Búsqueda</h3>
                    </div>
                    
                    <div className={s.filterContent}>
                        <div className={s.filterSection}>
                            <label className={s.filterLabel}>Tipo de Entidad</label>
                            <div className={s.verticalTabs}>
                                <button 
                                    className={`${s.verticalTab} ${activeTab === 'client' ? s.active : ''}`}
                                    onClick={() => setActiveTab('client')}
                                >
                                    <Users size={16} />
                                    Clientes
                                </button>
                                <button 
                                    className={`${s.verticalTab} ${activeTab === 'provider' ? s.active : ''}`}
                                    onClick={() => setActiveTab('provider')}
                                >
                                    <Truck size={16} />
                                    Proveedores
                                </button>
                                <button 
                                    className={`${s.verticalTab} ${activeTab === 'mixed' ? s.active : ''}`}
                                    onClick={() => setActiveTab('mixed')}
                                >
                                    <Shuffle size={16} />
                                    Mixtos
                                </button>
                            </div>
                        </div>

                        <div className={s.filterSection}>
                            <label className={s.filterLabel}>Búsqueda Rápida</label>
                            <Input 
                                placeholder="Nombre o código..." 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                icon={<Search size={18} />}
                            />
                        </div>

                        <div className={s.statsMini}>
                            <div className={s.miniStat}>
                                <span className={s.miniLabel}>Resultados</span>
                                <span className={s.miniValue}>{groupedBalances.length}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={s.mainContent}>
                    <div className={s.tableWrap}>
                        <table className={t.table}>
                            <thead>
                                <tr>
                                    <th style={{ width: 100 }}>Código</th>
                                    <th>Entidad</th>
                                    <th style={{ textAlign: 'right', width: 180 }}>Saldo Total (ARS)</th>
                                    <th style={{ textAlign: 'right', width: 180 }}>Saldo Vencido (ARS)</th>
                                    <th style={{ width: 60, textAlign: 'center' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 80 }}>
                                        <div className="spinner"></div>
                                        <p style={{ marginTop: 16, color: '#64748b' }}>Cargando saldos...</p>
                                    </td></tr>
                                ) : groupedBalances.length === 0 ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>
                                        <div style={{ marginBottom: 16 }}><Search size={48} opacity={0.2} /></div>
                                        No se encontraron registros.
                                    </td></tr>
                                ) : groupedBalances.map((b) => (
                                    <tr key={b.id} className={s.row}>
                                        <td className={s.codeCell}>{b.code || '---'}</td>
                                        <td>
                                            <div style={{ fontWeight: 600, color: '#1e293b' }}>{b.name}</div>
                                            <div style={{ fontSize: 11, color: '#94a3b8' }}>ID: {b.id.split('-')[0]}</div>
                                        </td>
                                        
                                        <td className={`${s.balanceCell} ${b.total_balance > 0.01 ? s.positive : (b.total_balance < -0.01 ? s.negative : s.neutral)}`}>
                                            {fmt(b.total_balance, 'ARS')}
                                        </td>

                                        <td className={`${s.balanceCell} ${b.overdue_balance > 0.01 ? s.negative : s.neutral}`} style={{ color: b.overdue_balance > 0.01 ? '#e11d48' : 'inherit' }}>
                                            {fmt(b.overdue_balance, 'ARS')}
                                        </td>

                                        <td style={{ textAlign: 'center' }}>
                                            <button 
                                                className={s.actionBtn}
                                                title="Ver Resumen de Cuenta"
                                                onClick={() => handleOpenStatement(b.id, b.name)}
                                            >
                                                <ChevronRight size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                .spinner {
                    width: 32px;
                    height: 32px;
                    border: 3px solid #e2e8f0;
                    border-top: 3px solid var(--primary);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}} />
        </div>
    );
}
