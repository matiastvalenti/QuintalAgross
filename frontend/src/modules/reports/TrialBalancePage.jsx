import React, { useState, useEffect } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import { useToast } from '../../context/ToastContext';
import { useCostCenter } from '../../context/CostCenterContext';
import api from '../../services/api';
import { Printer, RefreshCw, AlertCircle } from 'lucide-react';

import t from '../../components/ui/Table.module.css';

export default function TrialBalancePage() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [dates, setDates] = useState({
        from: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0]
    });

    const { showToast } = useToast();
    const { costCenter } = useCostCenter();


    useEffect(() => {
        fetchBalance();
    }, [costCenter]);


    const fetchBalance = async () => {
        try {
            setLoading(true);
            const data = await api.get('/accounting/accounts-ledger/balance', {
                params: {
                    from_date: dates.from,
                    to_date: dates.to,
                    cost_center: costCenter
                }
            });
            setData(data);
        } catch (e) {
            showToast("Error al cargar el balance", "error");
        } finally {
            setLoading(false);
        }
    };


    const totals = data.reduce((acc, row) => ({
        debit: acc.debit + row.debit,
        credit: acc.credit + row.credit
    }), { debit: 0, credit: 0 });

    const isBalanced = Math.abs(totals.debit - totals.credit) < 0.01;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-page)' }}>
            <div style={{ padding: '16px 20px 8px 20px' }}>
                <ContentHeader
                    title="Balance de Sumas y Saldos"
                    breadcrumbs={[{ label: 'Contabilidad' }, { label: 'Informes' }]}
                    actions={
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Button variant="secondary" onClick={fetchBalance} disabled={loading}>
                                <RefreshCw size={16} style={{ marginRight: 6 }} className={loading ? 'spin' : ''} /> Recalcular
                            </Button>
                            <Button variant="secondary" onClick={() => window.print()}>
                                <Printer size={16} style={{ marginRight: 6 }} /> Imprimir
                            </Button>
                        </div>
                    }
                />
            </div>

            <div style={{ padding: '0 20px 20px 20px', flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ 
                    background: 'white', 
                    padding: '12px 20px', 
                    borderRadius: 'var(--r-md)', 
                    border: '1px solid var(--border-color)', 
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)' }}>Desde:</span>
                        <input type="date" value={dates.from} onChange={e => setDates({...dates, from: e.target.value})} style={{ border: '1px solid #ddd', borderRadius: 4, padding: '4px 8px', fontSize: 'var(--text-sm)' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)' }}>Hasta:</span>
                        <input type="date" value={dates.to} onChange={e => setDates({...dates, to: e.target.value})} style={{ border: '1px solid #ddd', borderRadius: 4, padding: '4px 8px', fontSize: 'var(--text-sm)' }} />
                    </div>
                    
                    {!isBalanced && data.length > 0 && (
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                            <AlertCircle size={16} /> ¡El balance no cierra! (Diferencia: {new Intl.NumberFormat('es-AR').format(totals.debit - totals.credit)})
                        </div>
                    )}
                </div>

                <div style={{ background: 'white', borderRadius: 'var(--r-md)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                    <table className={t.table}>
                        <thead style={{ background: 'var(--bg-app)' }}>
                            <tr>
                                <th style={{ width: 120 }}>Código</th>
                                <th>Cuenta</th>
                                <th style={{ textAlign: 'right', width: 140 }}>Sumas Debe</th>
                                <th style={{ textAlign: 'right', width: 140 }}>Sumas Haber</th>
                                <th style={{ textAlign: 'right', width: 140 }}>Saldo Deudor</th>
                                <th style={{ textAlign: 'right', width: 140 }}>Saldo Acreedor</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40 }}>Calculando balances...</td></tr>
                            ) : data.length === 0 ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>No hay datos para el período.</td></tr>
                            ) : data.map((row, idx) => (
                                <tr key={idx}>
                                    <td><code style={{ fontWeight: 700, color: 'var(--primary)' }}>{row.code}</code></td>
                                    <td style={{ fontWeight: 500 }}>{row.name}</td>
                                    <td style={{ textAlign: 'right' }}>{new Intl.NumberFormat('es-AR').format(row.debit)}</td>
                                    <td style={{ textAlign: 'right' }}>{new Intl.NumberFormat('es-AR').format(row.credit)}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--primary)' }}>
                                        {row.balance > 0 ? new Intl.NumberFormat('es-AR').format(row.balance) : '-'}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--danger)' }}>
                                        {row.balance < 0 ? new Intl.NumberFormat('es-AR').format(Math.abs(row.balance)) : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot style={{ background: '#f8fafc', fontWeight: 800 }}>
                            <tr>
                                <td colSpan="2" style={{ textAlign: 'right', padding: '16px 20px' }}>TOTALES GENERALES</td>
                                <td style={{ textAlign: 'right', fontSize: 'var(--text-md)' }}>{new Intl.NumberFormat('es-AR').format(totals.debit)}</td>
                                <td style={{ textAlign: 'right', fontSize: 'var(--text-md)' }}>{new Intl.NumberFormat('es-AR').format(totals.credit)}</td>
                                <td style={{ textAlign: 'right', fontSize: 'var(--text-md)', color: 'var(--primary)' }}>
                                    {new Intl.NumberFormat('es-AR').format(data.reduce((acc, r) => acc + (r.balance > 0 ? r.balance : 0), 0))}
                                </td>
                                <td style={{ textAlign: 'right', fontSize: 'var(--text-md)', color: 'var(--danger)' }}>
                                    {new Intl.NumberFormat('es-AR').format(data.reduce((acc, r) => acc + (r.balance < 0 ? Math.abs(r.balance) : 0), 0))}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
            
            <style>{`
                @media print {
                    button, .no-print { display: none !important; }
                    body { background: white !important; }
                    .spin { animation: none !important; }
                }
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
