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


    const refreshTimeoutRef = React.useRef(null);

    useEffect(() => {
        fetchBalances();
    }, [activeTab, costCenter]);

    useEffect(() => {
        const shouldRefresh = (eventData) => {
            if (!eventData?.type) return false;
        
            return [
              "QUINTAL_ACCOUNT_BALANCE_CHANGED",
              "QUINTAL_DOCUMENT_CREATED",
              "QUINTAL_DOCUMENT_UPDATED",
              "QUINTAL_DOCUMENT_CANCELLED",
              "QUINTAL_INVOICE_CREATED",
              "QUINTAL_INVOICE_UPDATED",
              "QUINTAL_RECEIPT_CREATED",
              "QUINTAL_RECEIPT_UPDATED",
              "QUINTAL_APPLICATION_CREATED",
              "QUINTAL_APPLICATION_REVERTED",
              "QUINTAL_DELIVERY_NOTE_UPDATED",
              "QUINTAL_DELIVERY_NOTE_INVOICED",
              "QUINTAL_DOCUMENT_SAVED"
            ].includes(eventData.type);
        };
        
        const handleRefreshEvent = (event) => {
            const eventData = event?.data;
            if (!shouldRefresh(eventData)) return;
        
            clearTimeout(refreshTimeoutRef.current);
            refreshTimeoutRef.current = setTimeout(() => {
                fetchBalances();
            }, 300);
        };
        
        window.addEventListener("message", handleRefreshEvent);
        const bc = new BroadcastChannel("quintal-documents");
        bc.onmessage = handleRefreshEvent;
        
        return () => {
            window.removeEventListener("message", handleRefreshEvent);
            bc.close();
            clearTimeout(refreshTimeoutRef.current);
        };
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
            const rows = Array.isArray(data) ? data : (data.data || []);
            setBalances(rows);
        } catch (err) {
            console.error("Error fetchBalances:", err);
            showToast(err.message || "Error al cargar saldos", "error");
            setBalances([]);
        } finally {
            setLoading(false);
        }
    };

    const groupedBalances = useMemo(() => {
        return balances.filter(b => {
            const name = (b.name || "").toLowerCase();
            const code = (b.code || "").toLowerCase();
            const q = searchQuery.toLowerCase();
            return name.includes(q) || code.includes(q);
        }).sort((a,b) => (a.name || "").localeCompare(b.name || ""));
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
        let viewParam = "customer";
        if (activeTab === "provider") viewParam = "supplier";
        else if (activeTab === "mixed") viewParam = "consolidated";

        openResumenCuenta(entityId, { 
            title: `Saldos Pendientes: ${name}`, 
            width: 1200, 
            height: 700 
        }, viewParam);
    };

    const getSituation = (balanceArs, balanceUsd) => {
        const ars = balanceArs || 0;
        const usd = balanceUsd || 0;

        if (Math.abs(ars) < 0.01 && Math.abs(usd) < 0.01) {
            return { label: 'SIN SALDO', color: '#64748b', bg: '#f1f5f9' };
        }
        if ((ars > 0.01 && usd < -0.01) || (ars < -0.01 && usd > 0.01)) {
            return { label: 'MIXTO', color: '#6d28d9', bg: '#ede9fe' };
        }
        if (ars > 0.01 || usd > 0.01) {
            if (activeTab === 'client') return { label: 'DEBE', color: '#b91c1c', bg: '#fef2f2' };
            if (activeTab === 'provider') return { label: 'A PAGAR', color: '#b91c1c', bg: '#fef2f2' };
            return { label: 'DEUDOR', color: '#b91c1c', bg: '#fef2f2' };
        }
        if (ars < -0.01 || usd < -0.01) {
            if (activeTab === 'client') return { label: 'A FAVOR', color: '#047857', bg: '#d1fae5' };
            if (activeTab === 'provider') return { label: 'A FAVOR', color: '#047857', bg: '#d1fae5' };
            return { label: 'ACREEDOR', color: '#047857', bg: '#d1fae5' };
        }
        return { label: 'SIN SALDO', color: '#64748b', bg: '#f1f5f9' };
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
                    {/* Summary Cards */}
                    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', flex: 1 }}>
                            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 4 }}>Saldo Neto ARS</div>
                            <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>
                                {fmt(groupedBalances.reduce((acc, b) => acc + (b.balance_ars || 0), 0), 'ARS')}
                            </div>
                        </div>
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', flex: 1 }}>
                            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 4 }}>Saldo Neto USD</div>
                            <div style={{ fontSize: 18, fontWeight: 600, color: '#f59e0b' }}>
                                {fmt(groupedBalances.reduce((acc, b) => acc + (b.balance_usd || 0), 0), 'USD')}
                            </div>
                        </div>
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', flex: 1 }}>
                            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 4 }}>Vencido ARS</div>
                            <div style={{ fontSize: 18, fontWeight: 600, color: '#e11d48' }}>
                                {fmt(groupedBalances.reduce((acc, b) => acc + (b.overdue_ars || 0), 0), 'ARS')}
                            </div>
                        </div>
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', flex: 1 }}>
                            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 4 }}>Vencido USD</div>
                            <div style={{ fontSize: 18, fontWeight: 600, color: '#e11d48' }}>
                                {fmt(groupedBalances.reduce((acc, b) => acc + (b.overdue_usd || 0), 0), 'USD')}
                            </div>
                        </div>
                    </div>

                    <div className={s.tableWrap}>
                        <table className={t.table}>
                            <thead>
                                <tr>
                                    <th style={{ width: 100 }}>Código</th>
                                    <th>Entidad</th>
                                    <th style={{ textAlign: 'right', width: 140 }}>Saldo ARS</th>
                                    <th style={{ textAlign: 'right', width: 140 }}>Saldo USD</th>
                                    <th style={{ textAlign: 'right', width: 140 }}>Vencido ARS</th>
                                    <th style={{ textAlign: 'right', width: 140 }}>Vencido USD</th>
                                    <th style={{ width: 60, textAlign: 'center' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 80 }}>
                                        <div className="spinner"></div>
                                        <p style={{ marginTop: 16, color: '#64748b' }}>Cargando saldos...</p>
                                    </td></tr>
                                ) : groupedBalances.length === 0 ? (
                                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>
                                        <div style={{ marginBottom: 16 }}><Search size={48} opacity={0.2} /></div>
                                        No se encontraron registros.
                                    </td></tr>
                                ) : groupedBalances.map((b) => {
                                    const sit = getSituation(b.balance_ars, b.balance_usd);
                                    return (
                                    <tr key={b.id} className={s.row} onClick={() => handleOpenStatement(b.id, b.name)} style={{ cursor: 'pointer' }}>
                                        <td className={s.codeCell}>{b.code || '---'}</td>
                                        <td>
                                            <div style={{ fontWeight: 600, color: '#1e293b' }}>{b.name}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                                <div style={{ fontSize: 11, color: '#94a3b8' }}>ID: {b.id.split('-')[0]}</div>
                                                <span style={{ 
                                                    fontSize: 10, fontWeight: 600, padding: '2px 6px', 
                                                    borderRadius: 4, color: sit.color, backgroundColor: sit.bg 
                                                }}>
                                                    {sit.label}
                                                </span>
                                            </div>
                                        </td>
                                        
                                        <td className={`${s.balanceCell} ${b.balance_ars > 0.01 ? s.positive : (b.balance_ars < -0.01 ? s.negative : s.neutral)}`}>
                                            {fmt(b.balance_ars, 'ARS')}
                                        </td>

                                        <td className={`${s.balanceCell} ${b.balance_usd > 0.01 ? s.positive : (b.balance_usd < -0.01 ? s.negative : s.neutral)}`} style={{ color: b.balance_usd !== 0 ? '#f59e0b' : 'inherit' }}>
                                            {fmt(b.balance_usd, 'USD')}
                                        </td>

                                        <td className={`${s.balanceCell} ${b.overdue_ars > 0.01 ? s.negative : s.neutral}`} style={{ color: b.overdue_ars > 0.01 ? '#e11d48' : 'inherit' }}>
                                            {fmt(b.overdue_ars, 'ARS')}
                                        </td>

                                        <td className={`${s.balanceCell} ${b.overdue_usd > 0.01 ? s.negative : s.neutral}`} style={{ color: b.overdue_usd > 0.01 ? '#e11d48' : 'inherit' }}>
                                            {fmt(b.overdue_usd, 'USD')}
                                        </td>

                                        <td style={{ textAlign: 'center' }}>
                                            <button 
                                                className={s.actionBtn}
                                                title="Ver Resumen de Cuenta"
                                                onClick={(e) => { e.stopPropagation(); handleOpenStatement(b.id, b.name); }}
                                            >
                                                <ChevronRight size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                    );
                                })}
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
