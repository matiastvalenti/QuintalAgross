import React, { useState, useEffect } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Search, Calendar, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import t from '../../components/ui/Table.module.css';

export default function JournalPage() {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [expandedEntry, setExpandedEntry] = useState(null);

    const { showToast } = useToast();

    useEffect(() => {
        fetchEntries();
    }, []);

    const fetchEntries = async () => {
        try {
            setLoading(true);
            const data = await api.get(`/accounting/accounts-ledger/entries`);
            setEntries(data);
        } catch (e) {
            showToast("Error al cargar el libro diario", "error");
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const filtered = entries.filter(e =>
        e.description.toLowerCase().includes(search.toLowerCase()) ||
        e.lines.some(l => l.account_code.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-page)' }}>
            <div style={{ padding: '16px 20px 8px 20px' }}>
                <ContentHeader
                    title="Libro Diario (Journal)"
                    breadcrumbs={[{ label: 'Contabilidad' }, { label: 'Libro Diario' }]}
                    actions={
                        <Button variant="secondary" onClick={fetchEntries}>
                            Actualizar
                        </Button>
                    }
                />
            </div>

            <div style={{ flex: 1, padding: '0 20px 20px 20px', overflowY: 'auto' }}>
                <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
                    <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
                        <Search size={18} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-secondary)' }} />
                        <input
                            type="text"
                            placeholder="Buscar por descripción o cuenta..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px 12px 8px 40px',
                                borderRadius: 8,
                                border: '1px solid var(--border-color)',
                                fontSize: 'var(--text-sm)',
                                outline: 'none'
                            }}
                        />
                    </div>
                </div>

                <div style={{ background: 'white', borderRadius: 'var(--r-md)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                    <table className={t.table}>
                        <thead>
                            <tr>
                                <th style={{ width: 40 }}></th>
                                <th style={{ width: 150 }}>Fecha</th>
                                <th>Descripción / Concepto</th>
                                <th style={{ textAlign: 'right' }}>Debe (Total)</th>
                                <th style={{ textAlign: 'right' }}>Haber (Total)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="5" style={{ textAlign: 'center', padding: 40 }}>Cargando asientos...</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan="5" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>No hay asientos registrados aún.</td></tr>
                            ) : filtered.map(e => (
                                <React.Fragment key={e.id}>
                                    <tr 
                                        onClick={() => setExpandedEntry(expandedEntry === e.id ? null : e.id)}
                                        style={{ cursor: 'pointer', background: expandedEntry === e.id ? 'var(--bg-highlight)' : 'transparent' }}
                                    >
                                        <td>
                                            {expandedEntry === e.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </td>
                                        <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                                            {formatDate(e.date)}
                                        </td>
                                        <td style={{ fontWeight: 600 }}>
                                            {e.description}
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>
                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(e.total)}
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>
                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(e.total)}
                                        </td>
                                    </tr>
                                    {expandedEntry === e.id && (
                                        <tr>
                                            <td colSpan="5" style={{ padding: '0 0 16px 0', borderTop: 'none' }}>
                                                <div style={{ margin: '0 40px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                                                        <thead style={{ background: '#edf2f7', color: '#4a5568', textTransform: 'uppercase', fontSize: 10 }}>
                                                            <tr>
                                                                <th style={{ textAlign: 'left', padding: '8px 16px' }}>Cuenta</th>
                                                                <th style={{ textAlign: 'left', padding: '8px 16px' }}>Detalle</th>
                                                                <th style={{ textAlign: 'right', padding: '8px 16px', width: 120 }}>Debe</th>
                                                                <th style={{ textAlign: 'right', padding: '8px 16px', width: 120 }}>Haber</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {e.lines.map((l, idx) => (
                                                                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                                    <td style={{ padding: '8px 16px' }}>
                                                                        <code style={{ fontWeight: 700, color: '#2b6cb0' }}>{l.account_code}</code>
                                                                    </td>
                                                                    <td style={{ padding: '8px 16px', color: '#718096' }}>{l.description}</td>
                                                                    <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: l.debit > 0 ? 600 : 400 }}>
                                                                        {l.debit > 0 ? new Intl.NumberFormat('es-AR').format(l.debit) : '-'}
                                                                    </td>
                                                                    <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: l.credit > 0 ? 600 : 400 }}>
                                                                        {l.credit > 0 ? new Intl.NumberFormat('es-AR').format(l.credit) : '-'}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
