import React, { useState, useEffect, useCallback } from 'react';
import {
    FileText, Download, Filter, RefreshCcw,
    TrendingUp, TrendingDown, ChevronDown,
    CheckCircle2, AlertCircle, Clock, BarChart2
} from 'lucide-react';
import api from '../../services/api';
import { API_URL } from '../../config';
import s from './TaxReportsPage.module.css';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const fmt = (n) => {
    if (n == null) return '$0';
    return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const StatusBadge = ({ status }) => {
    const map = {
        APPROVED: { label: 'Aprobado', cls: s.badgeSuccess },
        PENDING: { label: 'Pendiente', cls: s.badgeWarning },
        REJECTED: { label: 'Rechazado', cls: s.badgeDanger },
    };
    const { label, cls } = map[status] || { label: status, cls: s.badgeNeutral };
    return <span className={`${s.badge} ${cls}`}>{label}</span>;
};

export default function TaxReportsPage() {
    const today = new Date();
    const firstDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = today.toISOString().split('T')[0];

    const [tab, setTab] = useState('ventas');
    const [desde, setDesde] = useState(firstDay);
    const [hasta, setHasta] = useState(lastDay);
    const [libro, setLibro] = useState(null);
    const [resumen, setResumen] = useState([]);
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState(null);

    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    const fetchLibro = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.get(`/accounting/iva/libro`, {
                params: { tipo: tab, desde, hasta }
            });
            setLibro(data);
        } catch (e) {
            console.error('Error cargando libro IVA', e);
        } finally {
            setLoading(false);
        }
    }, [tab, desde, hasta]);

    const fetchResumen = useCallback(async () => {
        try {
            const data = await api.get(`/accounting/iva/resumen`, {
                params: { year: today.getFullYear() }
            });
            setResumen(data);
        } catch (e) { /* ignore */ }
    }, []);

    useEffect(() => { fetchLibro(); fetchResumen(); }, [tab]);

    const handleDownload = async (format) => {
        setDownloading(format);
        try {
            const storedCC = localStorage.getItem('costCenter') || '1';
            const res = await fetch(
                `${API_URL}/accounting/iva/export/${format}?tipo=${tab}&desde=${desde}&hasta=${hasta}&cost_center=${storedCC}`,
                { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
            );
            if (!res.ok) return;
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const ext = format === 'csv' ? 'csv' : 'txt';
            const a = document.createElement('a');
            a.href = url;
            a.download = `libro_iva_${tab}_${desde}_${hasta}.${ext}`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Error exportando', e);
        } finally {
            setDownloading(null);
        }
    };

    const totals = libro?.totals || {};
    const rows = libro?.rows || [];

    return (
        <div className={s.page}>
            {/* Header */}
            <div className={s.header}>
                <div>
                    <h1 className={s.title}>Libros de IVA</h1>
                    <p className={s.subtitle}>Libro IVA Ventas y Compras — Exportación ARCA</p>
                </div>
                <div className={s.actions}>
                    <button
                        className={s.exportBtn}
                        onClick={() => handleDownload('csv')}
                        disabled={downloading === 'csv' || loading}
                    >
                        <Download size={15} />
                        {downloading === 'csv' ? 'Exportando...' : 'CSV'}
                    </button>
                    <button
                        className={`${s.exportBtn} ${s.exportTxt}`}
                        onClick={() => handleDownload('txt')}
                        disabled={downloading === 'txt' || loading}
                    >
                        <FileText size={15} />
                        {downloading === 'txt' ? 'Exportando...' : 'TXT ARCA'}
                    </button>
                </div>
            </div>

            {/* Resumen anual */}
            {resumen.length > 0 && (
                <div className={s.resumenCard}>
                    <div className={s.resumenHeader}>
                        <BarChart2 size={16} />
                        <span>Posición IVA {today.getFullYear()}</span>
                    </div>
                    <div className={s.resumenGrid}>
                        {resumen.map(m => (
                            <div key={m.mes} className={s.resumenMonth}>
                                <div className={s.monthName}>{m.mes_nombre}</div>
                                <div className={s.monthBar}>
                                    <div
                                        className={s.barDebito}
                                        style={{ height: `${Math.min((m.debito_fiscal / 200000) * 60, 60)}px` }}
                                        title={`Débito: ${fmt(m.debito_fiscal)}`}
                                    />
                                    <div
                                        className={s.barCredito}
                                        style={{ height: `${Math.min((m.credito_fiscal / 200000) * 60, 60)}px` }}
                                        title={`Crédito: ${fmt(m.credito_fiscal)}`}
                                    />
                                </div>
                                <div className={`${s.monthSaldo} ${m.saldo_iva >= 0 ? s.positive : s.negative}`}>
                                    {m.saldo_iva >= 0 ? '+' : ''}{Math.round(m.saldo_iva / 1000)}k
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className={s.legend}>
                        <span><span className={s.dotDebito} /> Débito Fiscal</span>
                        <span><span className={s.dotCredito} /> Crédito Fiscal</span>
                    </div>
                </div>
            )}

            {/* Filtros + Tabs */}
            <div className={s.toolbar}>
                <div className={s.tabs}>
                    <button
                        className={`${s.tab} ${tab === 'ventas' ? s.active : ''}`}
                        onClick={() => setTab('ventas')}
                    >
                        <TrendingUp size={14} /> IVA Ventas
                    </button>
                    <button
                        className={`${s.tab} ${tab === 'compras' ? s.active : ''}`}
                        onClick={() => setTab('compras')}
                    >
                        <TrendingDown size={14} /> IVA Compras
                    </button>
                </div>
                <div className={s.filters}>
                    <div className={s.filterGroup}>
                        <label>Desde</label>
                        <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={s.dateInput} />
                    </div>
                    <div className={s.filterGroup}>
                        <label>Hasta</label>
                        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={s.dateInput} />
                    </div>
                    <button className={s.applyBtn} onClick={fetchLibro} disabled={loading}>
                        <Filter size={14} />
                        Filtrar
                    </button>
                </div>
            </div>

            {/* KPI Strip */}
            <div className={s.kpiStrip}>
                <div className={s.kpi}>
                    <span className={s.kpiLabel}>Comprobantes</span>
                    <span className={s.kpiValue}>{totals.count || 0}</span>
                </div>
                <div className={s.kpi}>
                    <span className={s.kpiLabel}>Neto Gravado</span>
                    <span className={s.kpiValue}>{fmt(totals.total_neto)}</span>
                </div>
                <div className={`${s.kpi} ${s.kpiHighlight}`}>
                    <span className={s.kpiLabel}>Total IVA</span>
                    <span className={s.kpiValue}>{fmt(totals.total_iva)}</span>
                </div>
                <div className={s.kpi}>
                    <span className={s.kpiLabel}>IVA 21%</span>
                    <span className={s.kpiValue}>{fmt(totals.iva_21)}</span>
                </div>
                <div className={s.kpi}>
                    <span className={s.kpiLabel}>IVA 10.5%</span>
                    <span className={s.kpiValue}>{fmt(totals.iva_105)}</span>
                </div>
                <div className={s.kpi}>
                    <span className={s.kpiLabel}>Percepciones</span>
                    <span className={s.kpiValue} style={{ color: '#f59e0b' }}>{fmt(totals.percepciones)}</span>
                </div>
                <div className={s.kpi}>
                    <span className={s.kpiLabel}>Retenciones</span>
                    <span className={s.kpiValue} style={{ color: '#10b981' }}>{fmt(totals.retenciones)}</span>
                </div>
                <div className={s.kpi}>
                    <span className={s.kpiLabel}>Exento</span>
                    <span className={s.kpiValue}>{fmt(totals.exento)}</span>
                </div>
                <div className={s.kpi}>
                    <span className={s.kpiLabel}>Total</span>
                    <span className={s.kpiValue}>{fmt(totals.total)}</span>
                </div>
            </div>

            {/* Table */}
            <div className={s.tableWrap}>
                {loading ? (
                    <div className={s.loading}>
                        <RefreshCcw size={22} className={s.spinning} />
                        <span>Cargando libro IVA...</span>
                    </div>
                ) : rows.length === 0 ? (
                    <div className={s.empty}>
                        <FileText size={40} strokeWidth={1} />
                        <p>No hay comprobantes en el período seleccionado</p>
                    </div>
                ) : (
                    <table className={s.table}>
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Tipo</th>
                                <th>Número</th>
                                <th>Razón Social</th>
                                <th>CUIT</th>
                                <th>Cond. IVA</th>
                                <th className={s.right}>Neto 21%</th>
                                <th className={s.right}>IVA 21%</th>
                                <th className={s.right}>Neto 10.5%</th>
                                <th className={s.right}>IVA 10.5%</th>
                                <th className={s.right}>Percep.</th>
                                <th className={s.right}>Retenc.</th>
                                <th className={s.right}>Exento</th>
                                <th className={s.right}>Total</th>
                                <th>CAE</th>
                                <th>AFIP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i} className={i % 2 === 0 ? s.even : ''}>
                                    <td className={s.mono}>{r.fecha}</td>
                                    <td>
                                        <span className={s.tipoCbte}>
                                            {r.tipo_cbte === '01' || r.tipo_cbte === '02' || r.tipo_cbte === '03' ? 'A' :
                                             r.tipo_cbte === '06' || r.tipo_cbte === '07' || r.tipo_cbte === '08' ? 'B' : r.letra}
                                            {' '}
                                            {getDocTypeLabel(r.tipo_cbte)}
                                        </span>
                                    </td>
                                    <td className={s.mono}>{r.numero}</td>
                                    <td className={s.entityName}>{r.razon_social}</td>
                                    <td className={s.mono}>{r.cuit}</td>
                                    <td className={s.condicion}>
                                        <span className={s.condBadge}>{formatCondicion(r.condicion_iva)}</span>
                                    </td>
                                    <td className={s.right}>{r.neto_21 !== 0 ? fmt(r.neto_21) : '—'}</td>
                                    <td className={`${s.right} ${s.ivaCell}`}>{r.iva_21 !== 0 ? fmt(r.iva_21) : '—'}</td>
                                    <td className={s.right}>{r.neto_105 !== 0 ? fmt(r.neto_105) : '—'}</td>
                                    <td className={`${s.right} ${s.ivaCell}`}>{r.iva_105 !== 0 ? fmt(r.iva_105) : '—'}</td>
                                    <td className={s.right} style={{ color: '#f59e0b' }}>{r.percepciones !== 0 ? fmt(r.percepciones) : '—'}</td>
                                    <td className={s.right} style={{ color: '#10b981' }}>{r.retenciones !== 0 ? fmt(r.retenciones) : '—'}</td>
                                    <td className={s.right}>{r.exento !== 0 ? fmt(r.exento) : '—'}</td>
                                    <td className={`${s.right} ${s.totalCell}`}>{fmt(r.total)}</td>
                                    <td className={s.mono}>{r.cae || <span className={s.noCae}>—</span>}</td>
                                    <td><StatusBadge status={r.afip_status} /></td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className={s.totalsRow}>
                                <td colSpan={6}><strong>TOTALES ({totals.count} cbtes.)</strong></td>
                                <td className={s.right}><strong>{fmt(totals.neto_21)}</strong></td>
                                <td className={`${s.right} ${s.ivaCell}`}><strong>{fmt(totals.iva_21)}</strong></td>
                                <td className={s.right}><strong>{fmt(totals.neto_105)}</strong></td>
                                <td className={`${s.right} ${s.ivaCell}`}><strong>{fmt(totals.iva_105)}</strong></td>
                                <td className={s.right} style={{ color: '#f59e0b' }}><strong>{fmt(totals.percepciones)}</strong></td>
                                <td className={s.right} style={{ color: '#10b981' }}><strong>{fmt(totals.retenciones)}</strong></td>
                                <td className={s.right}><strong>{fmt(totals.exento)}</strong></td>
                                <td className={`${s.right} ${s.totalCell}`}><strong>{fmt(totals.total)}</strong></td>
                                <td colSpan={2} />
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>
        </div>
    );
}

function getDocTypeLabel(code) {
    const map = {
        '01': 'Factura', '02': 'N. Débito', '03': 'N. Crédito',
        '06': 'Factura', '07': 'N. Débito', '08': 'N. Crédito',
        '19': 'Factura E',
    };
    return map[code] || 'Cbte.';
}

function formatCondicion(cat) {
    const map = {
        'RESPONSABLE_INSCRIPTO': 'R.I.',
        'MONOTRIBUTO': 'Mono.',
        'EXENTO': 'Exento',
        'CONSUMIDOR_FINAL': 'C.F.',
        'EXTERIOR': 'Ext.',
    };
    return map[cat?.toUpperCase()] || cat || 'N/D';
}
