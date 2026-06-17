import React, { useState, useEffect } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import AccountSelector from '../../components/ui/AccountSelector';
import api from '../../services/api';
import { Printer, FileText, Search, ArrowRight } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useCostCenter } from '../../context/CostCenterContext';
import t from '../../components/ui/Table.module.css';


export default function AccountReportPage() {
    const [selectedAccount, setSelectedAccount] = useState("");
    const [accountData, setAccountData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [dates, setDates] = useState({
        from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0]
    });

    const { showToast } = useToast();
    const { costCenter } = useCostCenter();


    useEffect(() => {
        if (selectedAccount) {
            handleSearch();
        }
    }, [selectedAccount, costCenter]);


    const handleSearch = async () => {
        if (!selectedAccount) {
            showToast("Seleccione una cuenta primero", "warning");
            return;
        }

        try {
            setLoading(true);
            const params = {};
            if (dates.from) params.from_date = dates.from;
            if (dates.to) params.to_date = dates.to;
            
            const data = await api.get(`/accounting/accounts-ledger/report/${selectedAccount}`, { 
                params: {
                    ...params,
                    cost_center: costCenter
                } 
            });
            setAccountData(data);
        } catch (e) {
            showToast("Error al cargar movimientos", "error");
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleDateString();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-page)' }}>
            <div style={{ padding: '16px 20px 8px 20px' }}>
                <ContentHeader
                    title="Mayor por Cuenta"
                    breadcrumbs={[{ label: 'Contabilidad' }, { label: 'Mayores' }]}
                    actions={
                        <Button variant="secondary" onClick={() => window.print()}>
                            <Printer size={16} style={{ marginRight: 6 }} /> Imprimir
                        </Button>
                    }
                />
            </div>

            <div style={{ padding: '0 20px 20px 20px', flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                {/* Filtros */}
                <div style={{ 
                    background: 'white', 
                    padding: 20, 
                    borderRadius: 'var(--r-md)', 
                    border: '1px solid var(--border-color)', 
                    boxShadow: 'var(--shadow-sm)',
                    marginBottom: 20,
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 20,
                    flexWrap: 'wrap'
                }}>
                    <div style={{ flex: 1, minWidth: 300 }}>
                        <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                            Seleccionar Cuenta
                        </label>
                        <AccountSelector 
                            value={selectedAccount} 
                            onChange={setSelectedAccount}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                            Desde
                        </label>
                        <input 
                            type="date" 
                            value={dates.from}
                            onChange={e => setDates({...dates, from: e.target.value})}
                            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 'var(--text-sm)', outline: 'none' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                            Hasta
                        </label>
                        <input 
                            type="date" 
                            value={dates.to}
                            onChange={e => setDates({...dates, to: e.target.value})}
                            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 'var(--text-sm)', outline: 'none' }}
                        />
                    </div>
                    <Button onClick={handleSearch} disabled={loading}>
                        <Search size={16} style={{ marginRight: 6 }} /> Consultar
                    </Button>
                </div>

                {/* Tabla de Movimientos */}
                <div style={{ 
                    background: 'white', 
                    borderRadius: 'var(--r-md)', 
                    border: '1px solid var(--border-color)', 
                    boxShadow: 'var(--shadow-sm)', 
                    overflow: 'hidden',
                    flex: 1
                }}>
                    <table className={t.table}>
                        <thead>
                            <tr>
                                <th style={{ width: 100 }}>Fecha</th>
                                <th>Asiento / Concepto</th>
                                <th>Detalle Línea</th>
                                <th style={{ textAlign: 'right', width: 120 }}>Debe</th>
                                <th style={{ textAlign: 'right', width: 120 }}>Haber</th>
                                <th style={{ textAlign: 'right', width: 140 }}>Saldo Acum.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40 }}>Analizando movimientos...</td></tr>
                            ) : accountData.length === 0 ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                                    {selectedAccount ? 'No hay movimientos para el período seleccionado.' : 'Seleccione una cuenta para visualizar su mayor.'}
                                </td></tr>
                            ) : accountData.map((row, idx) => (
                                <tr key={idx}>
                                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{formatDate(row.date)}</td>
                                    <td style={{ fontWeight: 600 }}>{row.entry_description}</td>
                                    <td style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>{row.line_description}</td>
                                    <td style={{ textAlign: 'right', fontWeight: row.debit > 0 ? 600 : 400 }}>
                                        {row.debit > 0 ? new Intl.NumberFormat('es-AR').format(row.debit) : '-'}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: row.credit > 0 ? 600 : 400 }}>
                                        {row.credit > 0 ? new Intl.NumberFormat('es-AR').format(row.credit) : '-'}
                                    </td>
                                    <td style={{ 
                                        textAlign: 'right', 
                                        fontWeight: 700, 
                                        color: row.balance >= 0 ? 'var(--primary)' : 'var(--danger)',
                                        background: 'var(--bg-app)'
                                    }}>
                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(row.balance)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
                {accountData.length > 0 && (
                    <div style={{ 
                        marginTop: 16, 
                        padding: '16px 24px', 
                        background: 'var(--primary)', 
                        color: 'white', 
                        borderRadius: 'var(--r-md)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        boxShadow: 'var(--shadow-md)'
                    }}>
                        <div style={{ display: 'flex', gap: 32 }}>
                            <div>
                                <div style={{ fontSize: 10, textTransform: 'uppercase', opacity: 0.8, marginBottom: 2 }}>Total Debe</div>
                                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>
                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(accountData.reduce((acc, row) => acc + row.debit, 0))}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: 10, textTransform: 'uppercase', opacity: 0.8, marginBottom: 2 }}>Total Haber</div>
                                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>
                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(accountData.reduce((acc, row) => acc + row.credit, 0))}
                                </div>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 10, textTransform: 'uppercase', opacity: 0.8, marginBottom: 2 }}>Saldo Final al {formatDate(dates.to)}</div>
                            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800 }}>
                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(accountData[accountData.length - 1]?.balance || 0)}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
