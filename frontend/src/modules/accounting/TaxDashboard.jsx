import React, { useState, useEffect, useCallback } from 'react';
import { 
    BarChart3, Calendar, Filter, Download, 
    Search, RefreshCcw, FileText, MapPin, 
    ChevronDown, CreditCard, Receipt
} from 'lucide-react';
import { API_URL } from '../../config';
import { useToast } from '../../context/ToastContext';
import s from './TaxDashboard.module.css';

const JURISDICTIONS = [
    "ARBA", "AGIP", "Córdoba", "Santa Fe", "Mendoza", 
    "Tucumán", "Salta", "Misiones", "Chaco", "Corrientes",
    "Entre Ríos", "San Juan", "San Luis", "La Pampa", 
    "Neuquén", "Río Negro", "Chubut", "Santa Cruz", "Tierra del Fuego"
];

const fmt = (n) => {
    if (n == null) return '$0';
    return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function TaxDashboard() {
    const today = new Date();
    const firstDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = today.toISOString().split('T')[0];

    const [desde, setDesde] = useState(firstDay);
    const [hasta, setHasta] = useState(lastDay);
    const [jurisdiction, setJurisdiction] = useState('');
    const [summary, setSummary] = useState([]);
    const [details, setDetails] = useState([]);
    const [loading, setLoading] = useState(false);
    const { showToast } = useToast();

    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = `desde=${desde}&hasta=${hasta}${jurisdiction ? `&jurisdiction=${jurisdiction}` : ''}`;
            
            const [summaryRes, detailsRes] = await Promise.all([
                fetch(`${API_URL}/accounting/perceptions/summary?${queryParams}`, { headers }),
                fetch(`${API_URL}/accounting/perceptions/details?${queryParams}`, { headers })
            ]);

            if (summaryRes.ok) {
                setSummary(await summaryRes.json());
            } else if (summaryRes.status === 422) {
                showToast('Formato de fecha inválido', 'error');
            }
            if (detailsRes.ok) {
                setDetails(await detailsRes.json());
            }
        } catch (e) {
            console.error('Error cargando datos impositivos', e);
            showToast('Error al conectar con la API', 'error');
        } finally {
            setLoading(false);
        }
    }, [desde, hasta, jurisdiction, showToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <div className={s.page}>
            <div className={s.header}>
                <div>
                    <h1 className={s.title}>Dashboard de Impuestos Provinciales</h1>
                    <p className={s.subtitle}>Consolidado de Percepciones y Retenciones de IIBB por Jurisdicción</p>
                </div>
            </div>

            <div className={s.toolbar}>
                <div className={s.filters}>
                    <div className={s.filterGroup}>
                        <Calendar size={14} />
                        <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={s.dateInput} />
                    </div>
                    <div className={s.filterGroup}>
                        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={s.dateInput} />
                    </div>
                    <div className={s.filterGroup}>
                        <MapPin size={14} />
                        <select 
                            value={jurisdiction} 
                            onChange={e => setJurisdiction(e.target.value)} 
                            className={s.selectInput}
                        >
                            <option value="">Todas las Jurisdicciones</option>
                            {JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}
                        </select>
                    </div>
                    <button className={s.applyBtn} onClick={fetchData} disabled={loading}>
                        {loading ? <RefreshCcw size={14} className={s.spinning} /> : <Filter size={14} />}
                        Actualizar
                    </button>
                </div>
            </div>

            <div className={s.content}>
                {loading && summary.length === 0 ? (
                    <div className={s.loading}>
                        <RefreshCcw size={32} className={s.spinning} />
                        <p>Cargando información tributaria...</p>
                    </div>
                ) : (
                    <>
                        <div className={s.summaryGrid}>
                            {summary.length === 0 ? (
                                <div className={s.emptyCard}>No hay datos para el período seleccionado</div>
                            ) : (
                                summary.map((item, idx) => (
                                    <div key={idx} className={s.summaryCard}>
                                        <div className={s.cardHeader}>
                                            <span className={s.taxJurisdiction}>{item.jurisdiction || 'S/D'}</span>
                                            <span className={`${s.taxType} ${item.type === 'PERCEPTION' ? s.perception : s.retention}`}>
                                                {item.type === 'PERCEPTION' ? 'Percepción' : 'Retención'}
                                            </span>
                                        </div>
                                        <div className={s.amountContainer}>
                                            <span className={s.amountLabel}>Total Acumulado</span>
                                            <span className={s.amountValue}>{fmt(item.total_amount)}</span>
                                        </div>
                                        <div className={s.cardFooter}>
                                            <span className={s.taxName}>{item.tax_name}</span>
                                            <span className={s.count}>{item.count} comprobantes</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className={s.tableSection}>
                            <div className={s.sectionHeader}>
                                <h2 className={s.sectionTitle}>Detalle de Comprobantes</h2>
                                <button 
                                    className={s.exportBtn} 
                                    onClick={() => {
                                        if (details.length === 0) return showToast('No hay datos para exportar', 'warning');
                                        const headers = ['Fecha', 'Tipo', 'Doc', 'Entidad', 'Jurisdiccion', 'Impuesto', 'Base', 'Importe', 'Certificado'];
                                        const rows = details.map(d => [
                                            d.document_date?.split('T')[0],
                                            d.type,
                                            d.document_number,
                                            d.entity_name,
                                            d.jurisdiction,
                                            d.tax_name,
                                            d.base_amount,
                                            d.amount,
                                            d.certificate || ''
                                        ].join(';'));
                                        const csv = [headers.join(';'), ...rows].join('\n');
                                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                                        const url = URL.createObjectURL(blob);
                                        const link = document.createElement('a');
                                        link.href = url;
                                        link.setAttribute('download', `Impuestos_${desde}_${hasta}.csv`);
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                    }}
                                    style={{background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6}}
                                >
                                    <Download size={14} /> Exportar Detalle
                                </button>
                            </div>
                            <div className={s.tableWrap}>
                                <table className={s.table}>
                                    <thead>
                                        <tr>
                                            <th>Fecha</th>
                                            <th>Tipo</th>
                                            <th>Número</th>
                                            <th>Entidad</th>
                                            <th>Jurisdicción</th>
                                            <th>Impuesto</th>
                                            <th className={s.right}>Base Imp.</th>
                                            <th className={s.right}>Importe</th>
                                            <th>Certificado / Obs</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {details.map((it, idx) => (
                                            <tr key={idx}>
                                                <td className={s.mono}>{it.document_date?.split('T')[0]}</td>
                                                <td>
                                                    <span className={`${s.typeBadge} ${it.type === 'PERCEPTION' ? s.rowPerception : s.rowRetention}`}>
                                                        {it.type === 'PERCEPTION' ? 'PERC' : 'RET'}
                                                    </span>
                                                </td>
                                                <td className={s.mono}>{it.document_number}</td>
                                                <td className={s.bold}>{it.entity_name}</td>
                                                <td>{it.jurisdiction}</td>
                                                <td>{it.tax_name}</td>
                                                <td className={s.right}>{fmt(it.base_amount)}</td>
                                                <td className={`${s.right} ${s.bold}`} style={{color: it.type === 'PERCEPTION' ? '#c2410c' : '#047857'}}>
                                                    {fmt(it.amount)}
                                                </td>
                                                <td className={s.mono} style={{fontSize: 11}}>{it.certificate || it.doc_type || '—'}</td>
                                            </tr>
                                        ))}
                                        {details.length === 0 && (
                                            <tr>
                                                <td colSpan={9} style={{textAlign: 'center', padding: 40, color: '#94a3b8'}}>
                                                    No se encontraron movimientos.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
