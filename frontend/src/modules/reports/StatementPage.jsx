import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    Search, Download, Activity, Printer, ChevronRight, Filter, 
    CheckCircle2, Clock, AlertCircle, X, Receipt, Wallet
} from 'lucide-react';
import { useWindow } from '../../context/WindowContext';
import { 
  openEditFactura, 
  openEditRecibo, 
  openEditPago, 
  openEditRemito,
  openEditNotaDebito,
  openEditNotaCredito,
  openEditFacturaCompra
} from '../../utils/openStandaloneWindow';
import { useCostCenter } from '../../context/CostCenterContext';
import { API_URL } from '../../config';
import api from '../../services/api';
import { fmt } from '../../utils/formatters';
import { exportToExcel } from '../../utils/ReportExporter';
import Autocomplete from '../../components/ui/Autocomplete';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import s from './StatementPage.module.css';

export default function StatementPage({ entityId: propsEntityId, defaultFilters = {} }) {
    const { openWindow } = useWindow();
    const { costCenter } = useCostCenter();
    
    // States
    const [selectedEntity, setSelectedEntity] = useState(null);

    // Initial load from props
    useEffect(() => {
        if (propsEntityId) {
            const loadInit = async () => {
                try {
                    const res = await api.get(`/entities/${propsEntityId}`);
                    setSelectedEntity(res);
                } catch (e) {
                    console.error("Error loading initial entity", e);
                }
            };
            loadInit();
        }
    }, [propsEntityId]);
    const [loading, setLoading] = useState(false);
    const [movements, setMovements] = useState([]);
    const [dashboard, setDashboard] = useState(null);
    const [unbilledMovements, setUnbilledMovements] = useState([]);
    const [showUnbilled, setShowUnbilled] = useState(false);
    const [saleConditions, setSaleConditions] = useState([]);
    
    const [filters, setFilters] = useState({
        from_date: '',
        to_date: '',
        currency: '',
        doc_type: '',
        sale_condition: '',
        only_unapplied: false,
        only_overdue: false,
        search: ''
    });

    const resetFilters = () => {
        setFilters({
            from_date: '',
            to_date: '',
            currency: '',
            doc_type: '',
            sale_condition: '',
            only_unapplied: false,
            only_overdue: false,
            search: ''
        });
    };

    const setDatePreset = (preset) => {
        const now = new Date();
        let start = new Date();
        let end = new Date();

        switch (preset) {
            case 'this_month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'last_month':
                start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                end = new Date(now.getFullYear(), now.getMonth(), 0);
                break;
            case 'this_year':
                start = new Date(now.getFullYear(), 0, 1);
                break;
            case 'today':
                // already set to now
                break;
            default:
                setFilters({ ...filters, from_date: '', to_date: '' });
                return;
        }
        
        setFilters({
            ...filters,
            from_date: start.toISOString().split('T')[0],
            to_date: end.toISOString().split('T')[0]
        });
    };

    // Fetch Data
    const fetchLedger = useCallback(async () => {
        if (!selectedEntity || !selectedEntity.id) return;
        
        setLoading(true);
        try {
            // Fetch Ledger and Unbilled simultaneously
            const [ledgerRes, unbilledRes, scRes, dashRes] = await Promise.all([
                api.get(`/accounts/${selectedEntity.id}/ledger`, { params: { cost_center: costCenter, ...filters } }),
                api.get(`/accounts/${selectedEntity.id}/unbilled-delivery-notes`, { params: { cost_center: costCenter } }),
                api.get(`/entities/commercial/sale-conditions`),
                api.get(`/entities/${selectedEntity.id}/dashboard`, { params: { cost_center: costCenter } })
            ]);
            
            setMovements(ledgerRes || []);
            setUnbilledMovements(unbilledRes || []);
            setSaleConditions(scRes || []);
            setDashboard(dashRes);
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    }, [selectedEntity, filters, costCenter]);

    useEffect(() => {
        fetchLedger();
    }, [fetchLedger]);

    useEffect(() => {
        const handleRefresh = () => fetchLedger();
        window.addEventListener('account-changed', handleRefresh);
        window.addEventListener('invoice-changed', handleRefresh);
        window.addEventListener('receipt-changed', handleRefresh);
        window.addEventListener('cost-center-changed', handleRefresh);
        
        return () => {
            window.removeEventListener('account-changed', handleRefresh);
            window.removeEventListener('invoice-changed', handleRefresh);
            window.removeEventListener('receipt-changed', handleRefresh);
            window.removeEventListener('cost-center-changed', handleRefresh);
        }
    }, [fetchLedger]);

    // Search Entities
    const searchEntities = async (query) => {
        try {
            const res = await api.get(`/entities/`, { params: { q: query, limit: 10 } });
            return res; // api.js returns data directly
        } catch (e) {
            return [];
        }
    };

    // Filters & Sorting
    const filteredMovements = useMemo(() => {
        let list = [...movements];
        if (filters.search) {
            const q = filters.search.toLowerCase();
            list = list.filter(m => 
                m.number?.toLowerCase().includes(q) || 
                m.notes?.toLowerCase().includes(q) ||
                m.doc_type?.toLowerCase().includes(q)
            );
        }
        return list;
    }, [movements, filters.search]);

    const filteredUnbilledMovements = useMemo(() => {
        let list = [...unbilledMovements];
        // Don't show unbilled if filtering by specific doc type that is not DELIVERY_NOTE
        if (filters.doc_type && filters.doc_type !== "DELIVERY_NOTE") return [];
        
        if (filters.search) {
            const q = filters.search.toLowerCase();
            list = list.filter(m => 
                m.number?.toLowerCase().includes(q) || 
                m.notes?.toLowerCase().includes(q)
            );
        }
        return list;
    }, [unbilledMovements, filters.search, filters.doc_type]);

    const totals = useMemo(() => {
        const t = { d_ars: 0, h_ars: 0, d_usd: 0, h_usd: 0, b_ars: 0, b_usd: 0 };
        filteredMovements.forEach(m => {
            if (m.amount_ars > 0) t.d_ars += m.amount_ars; else t.h_ars += Math.abs(m.amount_ars);
            if (m.amount_usd > 0) t.d_usd += m.amount_usd; else t.h_usd += Math.abs(m.amount_usd);
        });
        if (filteredMovements.length > 0) {
            const last = filteredMovements[filteredMovements.length - 1];
            t.b_ars = last.balance_ars;
            t.b_usd = last.balance_usd;
        }
        return t;
    }, [filteredMovements]);

    // Helpers for display
    const getCircuitoFallback = (docType, circuit) => {
        if (circuit && circuit !== '-') return circuit;
        const dt = docType?.toUpperCase();
        if (['INVOICE', 'FCE_MIPYME', 'DEBIT_NOTE', 'CREDIT_NOTE'].includes(dt)) return 'Venta';
        if (dt === 'RECEIPT') return 'Cobranza';
        if (['PURCHASE_INVOICE', 'PURCHASE_DEBIT_NOTE', 'PURCHASE_CREDIT_NOTE'].includes(dt)) return 'Compra';
        if (dt === 'PAYMENT') return 'Pago';
        return '-';
    };

    const getDescripcionFallback = (docType, desc) => {
        if (desc && desc !== '-') return desc;
        const dt = docType?.toUpperCase();
        switch (dt) {
            case 'INVOICE':
            case 'FCE_MIPYME': return 'Factura de Venta';
            case 'DEBIT_NOTE': return 'Nota de Débito de Venta';
            case 'CREDIT_NOTE': return 'Nota de Crédito de Venta';
            case 'RECEIPT': return 'Recibo de Cliente';
            case 'PURCHASE_INVOICE': return 'Factura de Compra';
            case 'PURCHASE_DEBIT_NOTE': return 'Nota de Débito de Compra';
            case 'PURCHASE_CREDIT_NOTE': return 'Nota de Crédito de Compra';
            case 'PAYMENT': return 'Orden de Pago';
            default: return '-';
        }
    };

    const getComprobanteName = (docType) => {
        const dt = docType?.toUpperCase();
        switch (dt) {
            case 'INVOICE':
            case 'FCE_MIPYME': return 'Factura';
            case 'RECEIPT': return 'Recibo';
            case 'PAYMENT': return 'Orden de Pago';
            case 'DEBIT_NOTE':
            case 'PURCHASE_DEBIT_NOTE': return 'Nota de Débito';
            case 'CREDIT_NOTE':
            case 'PURCHASE_CREDIT_NOTE': return 'Nota de Crédito';
            case 'PURCHASE_INVOICE': return 'Factura de Compra';
            case 'LPG_PRIMARY': return 'Liq. Primaria';
            case 'LPG_SECONDARY': return 'Liq. Secundaria';
            case 'DELIVERY_NOTE': return 'Remito';
            default: return docType || '-';
        }
    };

    // Actions
    const handleExport = () => {
        const listToExport = filteredMovements.length > 0 ? filteredMovements : movements;
        if (listToExport.length === 0) return;

        const formatDateStr = (d) => {
            if (!d) return '-';
            try {
                const parts = d.toString().split('T')[0].split('-');
                if (parts.length < 3) return d;
                return `${parts[2]}/${parts[1]}/${parts[0]}`;
            } catch (e) { return d; }
        };

        const exportData = listToExport.map(m => {
            const amt_ars = Number(m.amount_ars) || 0;
            const amt_usd = Number(m.amount_usd) || 0;
            const bal_ars = Number(m.balance_ars) || 0;
            const bal_usd = Number(m.balance_usd) || 0;

            return {
                'Fecha': formatDateStr(m.date),
                'Circuito': getCircuitoFallback(m.doc_type, m.circuit),
                'Comprobante': getComprobanteName(m.doc_type),
                'Número': m.number || '-',
                'Descripción': getDescripcionFallback(m.doc_type, m.description || m.notes),
                'Vencimiento': formatDateStr(m.due_date),
                'Moneda': m.currency || '-',
                'TC': m.exchange_rate || '',
                'Debe ARS': amt_ars > 0 ? amt_ars : '',
                'Haber ARS': amt_ars < 0 ? Math.abs(amt_ars) : '',
                'Saldo ARS': bal_ars,
                'Debe USD': amt_usd > 0 ? amt_usd : '',
                'Haber USD': amt_usd < 0 ? Math.abs(amt_usd) : '',
                'Saldo USD': bal_usd,
                'Notas': m.notes || ''
            };
        });

        // Add Totals row
        exportData.push({
            'Fecha': 'TOTALES',
            'Circuito': '',
            'Comprobante': '',
            'Número': '',
            'Descripción': '',
            'Vencimiento': '',
            'Moneda': '',
            'TC': '',
            'Debe ARS': Number(totals.d_ars.toFixed(2)),
            'Haber ARS': Number(totals.h_ars.toFixed(2)),
            'Saldo ARS': Number(totals.b_ars.toFixed(2)),
            'Debe USD': Number(totals.d_usd.toFixed(2)),
            'Haber USD': Number(totals.h_usd.toFixed(2)),
            'Saldo USD': Number(totals.b_usd.toFixed(2)),
            'Notas': ''
        });

        exportToExcel(exportData, `Dashboard_${selectedEntity?.name || 'Cliente'}`, 'Resumen Financiero');
    };

    const handleRowClick = (m) => {
        if (m.is_initial_load) return;

        let title = `${m.doc_type} ${m.number || ''}`;
        switch (m.doc_type) {
            case 'INVOICE':
                return openEditFactura(m.id, { title });
            case 'CREDIT_NOTE':
                return openEditNotaCredito(m.id, { title });
            case 'DEBIT_NOTE':
                return openEditNotaDebito(m.id, { title });
            case 'PURCHASE_INVOICE':
                return openEditFacturaCompra(m.id, { title });
            case 'RECEIPT':
                return openEditRecibo(m.id, { title });
            case 'PAYMENT':
                return openEditPago(m.id, { title });
            case 'DELIVERY_NOTE':
                return openEditRemito(m.id, { title });
            case 'LPG_PRIMARY':
            case 'LPG_SECONDARY':
                openWindow('grain-settlement', { id: m.id, mode: "edit" }, {
                    title: `${m.doc_type === 'LPG_PRIMARY' ? 'Liq. Primaria' : 'Liq. Secundaria'} ${m.number || ''}`,
                    width: 1200,
                    height: 750,
                    singletonKey: `lpg-${m.id}`
                });
                break;
            default:
                return;
        }
    };

    return (
        <div className={s.pageLayout}>
            {/* Sticky Professional Header */}
            <div className={s.topBar}>
                <div className={s.entitySearchBox}>
                    <Autocomplete
                        label=""
                        initialValue={selectedEntity}
                        onSelect={setSelectedEntity}
                        onSearch={searchEntities}
                        placeholder="Buscar cliente o proveedor..."
                        icon={<Search size={18} />}
                        minChars={0}
                    />
                </div>
                
                <div className={s.actionsGroup}>
                    <Button variant="secondary" size="md" onClick={handleExport} className={s.exportBtn}>
                        <Download size={16} /> Exportar Excel
                    </Button>
                    <Button variant="primary" size="md" onClick={() => window.print()} className={s.printBtn}>
                        <Printer size={16} /> Imprimir Todo
                    </Button>
                </div>
            </div>

            <div className={s.container}>
                {selectedEntity ? (
                    <div className={s.animate}>
                        {/* Summary Header Cards */}
                        <div className={s.summaryHeader}>
                            <div className={s.summaryCard} style={{ borderLeft: '4px solid #1d4ed8' }}>
                                <div className={s.cardIconBox} style={{ background: '#eff6ff', color: '#1d4ed8' }}><Receipt size={20}/></div>
                                <div className={s.cardContentBox}>
                                    <div className={s.cardTitle}>Saldo ARS</div>
                                    <div className={s.balanceValue} style={{ color: totals.b_ars < -0.1 ? '#dc2626' : '#1e293b' }}>
                                        {fmt(totals.b_ars, 'ARS')}
                                    </div>
                                    <div className={s.cardSubLabel}>Saldo real en pesos</div>
                                </div>
                            </div>

                            <div className={s.summaryCard} style={{ borderLeft: '4px solid #7c3aed' }}>
                                <div className={s.cardIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}><Wallet size={20}/></div>
                                <div className={s.cardContentBox}>
                                    <div className={s.cardTitle}>Saldo USD</div>
                                    <div className={s.balanceValue} style={{ color: totals.b_usd < -0.1 ? '#dc2626' : '#1e293b' }}>
                                        {fmt(totals.b_usd, 'USD')}
                                    </div>
                                    <div className={s.cardSubLabel}>Saldo real en dólares</div>
                                </div>
                            </div>

                            <div className={s.summaryCard} style={{ borderLeft: '4px solid #0f766e' }}>
                                <div className={s.cardIconBox} style={{ background: '#f0fdfa', color: '#0f766e' }}><Activity size={20}/></div>
                                <div className={s.cardContentBox}>
                                    <div className={s.cardTitle}>Total convertido a ARS</div>
                                    <div className={s.balanceValue} style={{ color: (dashboard?.total_balance || 0) < -0.1 ? '#dc2626' : '#1e293b' }}>
                                        {fmt(dashboard?.total_balance || 0, 'ARS')}
                                    </div>
                                    <div className={s.cardSubLabel}>Total informativo convertido</div>
                                </div>
                            </div>

                            <div className={s.summaryCard} style={{ borderLeft: '4px solid #ea580c' }}>
                                <div className={s.cardIconBox} style={{ background: '#fff7ed', color: '#ea580c' }}><Clock size={20}/></div>
                                <div className={s.cardContentBox}>
                                    <div className={s.cardTitle}>Pendiente de facturar</div>
                                    <div className={s.balanceValue} style={{ color: '#ea580c' }}>
                                        {fmt(dashboard?.unbilled_balance_usd || 0, 'USD')}
                                    </div>
                                    <div className={s.cardSubLabel}>Remitos entregados no facturados</div>
                                </div>
                            </div>
                        </div>

                        {/* Premium Comprehensive Filter Bar */}
                        <div className={s.filterBar}>
                            <div className={s.filterGrid}>
                                {/* Dates & Presets */}
                                <div className={s.filterCol} style={{ gridColumn: 'span 2' }}>
                                    <span className={s.filterLabel}>Rango de Fechas</span>
                                    <div className={s.dateRange}>
                                        <input type="date" className={s.dateInp} value={filters.from_date} onChange={e => setFilters({...filters, from_date: e.target.value})} />
                                        <ChevronRight size={14} style={{color: '#94a3b8'}} />
                                        <input type="date" className={s.dateInp} value={filters.to_date} onChange={e => setFilters({...filters, to_date: e.target.value})} />
                                    </div>
                                    <div className={s.presets}>
                                        <button className={s.presetBtn} onClick={() => setDatePreset('today')}>Hoy</button>
                                        <button className={s.presetBtn} onClick={() => setDatePreset('this_month')}>Mes Actual</button>
                                        <button className={s.presetBtn} onClick={() => setDatePreset('last_month')}>Mes Anterior</button>
                                        <button className={s.presetBtn} onClick={() => setDatePreset('this_year')}>Año</button>
                                    </div>
                                </div>

                                {/* Doc Type */}
                                <div className={s.filterCol}>
                                    <span className={s.filterLabel}>Comprobante</span>
                                    <select 
                                        className={s.glassSelect}
                                        value={filters.doc_type}
                                        onChange={e => setFilters({...filters, doc_type: e.target.value})}
                                    >
                                        <option value="">TODOS LOS TIPOS</option>
                                        <option value="INVOICE">FACTURAS</option>
                                        <option value="RECEIPT">RECIBOS</option>
                                        <option value="CREDIT_NOTE">NOTAS CRÉDITO</option>
                                        <option value="DEBIT_NOTE">NOTAS DÉBITO</option>
                                        <option value="PURCHASE_INVOICE">F. COMPRA</option>
                                        <option value="DELIVERY_NOTE">REMITOS PENDIENTES</option>
                                    </select>
                                </div>

                                {/* Sale Condition */}
                                <div className={s.filterCol}>
                                    <span className={s.filterLabel}>Condición</span>
                                    <select 
                                        className={s.glassSelect}
                                        value={filters.sale_condition}
                                        onChange={e => setFilters({...filters, sale_condition: e.target.value})}
                                    >
                                        <option value="">TODAS LAS CONDICIONES</option>
                                        {saleConditions.map(sc => (
                                            <option key={sc.id} value={sc.id}>{sc.description.toUpperCase()}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Currency */}
                                <div className={s.filterCol}>
                                    <span className={s.filterLabel}>Moneda</span>
                                    <div className={s.toggleButtons}>
                                        <button className={`${s.tglBtn} ${filters.currency === '' ? s.active : ''}`} onClick={() => setFilters({...filters, currency: ''})}>MIX</button>
                                        <button className={`${s.tglBtn} ${filters.currency === 'ARS' ? s.active : ''}`} onClick={() => setFilters({...filters, currency: 'ARS'})}>ARS</button>
                                        <button className={`${s.tglBtn} ${filters.currency === 'USD' ? s.active : ''}`} onClick={() => setFilters({...filters, currency: 'USD'})}>USD</button>
                                    </div>
                                </div>
                            </div>

                            <div className={s.filterGrid} style={{ paddingTop: 20, borderTop: '1px solid rgba(226, 232, 240, 0.5)' }}>
                                {/* Payment Status */}
                                <div className={s.filterCol}>
                                    <span className={s.filterLabel}>Estado Pago</span>
                                    <div className={s.toggleButtons}>
                                        <button className={`${s.tglBtn} ${!filters.only_unapplied ? s.active : ''}`} onClick={() => setFilters({...filters, only_unapplied: false})}>HISTÓRICO</button>
                                        <button className={`${s.tglBtn} ${filters.only_unapplied ? s.active : ''}`} onClick={() => setFilters({...filters, only_unapplied: true})} style={{ color: filters.only_unapplied ? '#d97706' : 'inherit' }}>SOLO PENDIENTES</button>
                                    </div>
                                </div>

                                {/* Overdue */}
                                <div className={s.filterCol}>
                                    <span className={s.filterLabel}>Vencimientos</span>
                                    <div className={s.toggleButtons}>
                                        <button className={`${s.tglBtn} ${!filters.only_overdue ? s.active : ''}`} onClick={() => setFilters({...filters, only_overdue: false})}>TODOS</button>
                                        <button className={`${s.tglBtn} ${filters.only_overdue ? s.active : ''}`} onClick={() => setFilters({...filters, only_overdue: true})} style={{ color: filters.only_overdue ? '#dc2626' : 'inherit' }}>SOLO VENCIDOS</button>
                                    </div>
                                </div>

                                {/* Show Unbilled */}
                                <div className={s.filterCol}>
                                    <span className={s.filterLabel}>Remitos Pendientes</span>
                                    <div className={s.toggleButtons}>
                                        <button className={`${s.tglBtn} ${!showUnbilled ? s.active : ''}`} onClick={() => setShowUnbilled(false)}>OCULTOS</button>
                                        <button className={`${s.tglBtn} ${showUnbilled ? s.active : ''}`} onClick={() => setShowUnbilled(true)} style={{ color: showUnbilled ? '#1e293b' : 'inherit' }}>MOSTRAR</button>
                                    </div>
                                </div>

                                {/* Search & Clear */}
                                <div className={s.searchCol}>
                                    <div className={s.filterCol} style={{ flex: 1 }}>
                                        <span className={s.filterLabel}>Búsqueda Rápida</span>
                                        <div className={s.searchContainer}>
                                            <Search size={14} className={s.searchIcon} />
                                            <input 
                                                className={s.searchInp}
                                                placeholder="Número, nota o tipo..." 
                                                value={filters.search} 
                                                onChange={e => setFilters({...filters, search: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                    <button className={s.clearBtn} onClick={resetFilters} title="Limpiar todos los filtros">
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Professional Ledger Table */}
                        <div className={s.tableContainer}>
                            <table className={s.ledgerTable}>
                                <colgroup>
                                    <col style={{ width: '85px' }} />
                                    <col style={{ width: '80px' }} />
                                    <col style={{ width: '110px' }} />
                                    <col style={{ width: '125px' }} />
                                    <col style={{ width: '100px' }} />
                                    <col style={{ width: '85px' }} />
                                    <col style={{ width: '55px' }} />
                                    <col style={{ width: '65px' }} />
                                    <col style={{ width: 'auto' }} />
                                    {/* Monetary cols */}
                                    <col style={{ width: '90px' }} />
                                    <col style={{ width: '90px' }} />
                                    <col style={{ width: '100px' }} />
                                    <col style={{ width: '90px' }} />
                                    <col style={{ width: '90px' }} />
                                    <col style={{ width: '100px' }} />
                                </colgroup>
                                <thead className={s.thead}>
                                    <tr className={s.groupHeader}>
                                        <th colSpan={9}></th>
                                        <th colSpan={3} style={{ borderLeft: '1px solid #e2e8f0', background: 'rgba(36, 56, 156, 0.05)', color: '#24389c' }}>Valores en Pesos (ARS)</th>
                                        <th colSpan={3} style={{ borderLeft: '1px solid #e2e8f0', background: 'rgba(217, 119, 6, 0.05)', color: '#d97706' }}>Valores en Dólares (USD)</th>
                                    </tr>
                                    <tr>
                                        <th className={s.th}>Fecha</th>
                                        <th className={s.th}>Circuito</th>
                                        <th className={s.th}>Comprobante</th>
                                        <th className={s.th}>Número</th>
                                        <th className={s.th}>Descripción</th>
                                        <th className={s.th}>Vencimiento</th>
                                        <th className={s.th}>Moneda</th>
                                        <th className={s.th}>TC</th>
                                        <th className={s.th}>Condición</th>
                                        {/* ARS */}
                                        <th className={`${s.th} ${s.cellNum}`}>Debe</th>
                                        <th className={`${s.th} ${s.cellNum}`}>Haber</th>
                                        <th className={`${s.th} ${s.cellNum}`}>Saldo</th>
                                        {/* USD */}
                                        <th className={`${s.th} ${s.cellNum}`}>Debe</th>
                                        <th className={`${s.th} ${s.cellNum}`}>Haber</th>
                                        <th className={`${s.th} ${s.cellNum}`}>Saldo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredMovements.map((m, idx) => (
                                        <tr key={m.id || idx} className={s.row} onClick={() => handleRowClick(m)}>
                                            <td className={s.cell}>{fmt(m.date, 'date')}</td>
                                            <td className={s.cell}>{getCircuitoFallback(m.doc_type, m.circuit)}</td>
                                            <td className={s.cell}>
                                                <div className={s.statusBadge} style={{ textTransform: 'none' }}>
                                                    {m.payment_status === 'PAID' ? <CheckCircle2 size={12} className={s.iconPaid} /> : 
                                                     m.payment_status === 'PARTIAL' ? <Clock size={12} className={s.iconPartial} /> : 
                                                     <AlertCircle size={12} className={s.iconOpen} />}
                                                    <span className={s.docLabel}>{getComprobanteName(m.doc_type)}</span>
                                                </div>
                                            </td>
                                            <td className={s.cell}>{m.number}</td>
                                            <td className={s.cell} title={getDescripcionFallback(m.doc_type, m.description || m.notes)}>{getDescripcionFallback(m.doc_type, m.description || m.notes)}</td>
                                            <td className={s.cell}>{m.due_date ? fmt(m.due_date, 'date') : '-'}</td>
                                            <td className={s.cell}>{m.currency}</td>
                                            <td className={s.cell}>{m.exchange_rate}</td>
                                            <td className={s.cell} title={m.sale_condition}>{m.sale_condition || '-'}</td>
                                            
                                            <td className={`${s.cell} ${s.cellNum}`}>{m.amount_ars > 0 ? fmt(m.amount_ars, 'ARS') : '-'}</td>
                                            <td className={`${s.cell} ${s.cellNum}`}>{m.amount_ars < 0 ? fmt(Math.abs(m.amount_ars), 'ARS') : '-'}</td>
                                            <td className={`${s.cell} ${s.cellNum} ${s.balanceArs}`}>{fmt(m.balance_ars, 'ARS')}</td>

                                            <td className={`${s.cell} ${s.cellNum}`}>{m.amount_usd > 0 ? fmt(m.amount_usd, 'USD') : '-'}</td>
                                            <td className={`${s.cell} ${s.cellNum}`}>{m.amount_usd < 0 ? fmt(Math.abs(m.amount_usd), 'USD') : '-'}</td>
                                            <td className={`${s.cell} ${s.cellNum} ${s.balanceUsd}`}>{fmt(m.balance_usd, 'USD')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className={s.tfoot}>
                                    <tr>
                                        <td colSpan={9} className={s.totalLabel}>TOTALES ACUMULADOS</td>
                                        <td className={s.cellTotal}>{fmt(totals.d_ars, 'ARS')}</td>
                                        <td className={s.cellTotal}>{fmt(totals.h_ars, 'ARS')}</td>
                                        <td className={`${s.cellTotal} ${s.finalBalance} ${s.balanceArs}`}>{fmt(totals.b_ars, 'ARS')}</td>
                                        
                                        <td className={s.cellTotal}>{fmt(totals.d_usd, 'USD')}</td>
                                        <td className={s.cellTotal}>{fmt(totals.h_usd, 'USD')}</td>
                                        <td className={`${s.cellTotal} ${s.finalBalance} ${s.balanceUsd}`}>{fmt(totals.b_usd, 'USD')}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {/* Unbilled Delivery Notes Section */}
                        {showUnbilled && (
                            <div className={s.unbilledSection}>
                                <div className={s.sectionHeader}>
                                    <h3 className={s.sectionTitle}>Remitos Pendientes de Facturar</h3>
                                    <div className={s.sectionLine}></div>
                                </div>
                                
                                <div className={s.tableContainer} style={{marginTop: 16}}>
                                    <table className={s.ledgerTable}>
                                        <colgroup>
                                            <col style={{ width: '85px' }} />
                                            <col style={{ width: '80px' }} />
                                            <col style={{ width: '110px' }} />
                                            <col style={{ width: '125px' }} />
                                            <col style={{ width: '100px' }} />
                                            <col style={{ width: '85px' }} />
                                            <col style={{ width: '55px' }} />
                                            <col style={{ width: '65px' }} />
                                            <col style={{ width: 'auto' }} />
                                            {/* Monetary cols */}
                                            <col style={{ width: '90px' }} />
                                            <col style={{ width: '90px' }} />
                                            <col style={{ width: '100px' }} />
                                            <col style={{ width: '90px' }} />
                                            <col style={{ width: '90px' }} />
                                            <col style={{ width: '100px' }} />
                                        </colgroup>
                                        <thead className={s.thead}>
                                            <tr className={s.groupHeader}>
                                                <th colSpan={9}></th>
                                                <th colSpan={3} style={{ borderLeft: '1px solid #e2e8f0', background: 'rgba(36, 56, 156, 0.05)', color: '#24389c' }}>Estimado ARS</th>
                                                <th colSpan={3} style={{ borderLeft: '1px solid #e2e8f0', background: 'rgba(217, 119, 6, 0.05)', color: '#d97706' }}>Estimado USD</th>
                                            </tr>
                                            <tr>
                                                <th className={s.th}>Fecha</th>
                                                <th className={s.th}>Circuito</th>
                                                <th className={s.th}>Tipo</th>
                                                <th className={s.th}>Número</th>
                                                <th className={s.th}>Descripción</th>
                                                <th className={s.th}>Vencimiento</th>
                                                <th className={s.th}>Moneda</th>
                                                <th className={s.th}>TC</th>
                                                <th className={s.th}>Condición</th>
                                                <th className={`${s.th} ${s.cellNum}`}>Debe</th>
                                                <th className={`${s.th} ${s.cellNum}`}>Haber</th>
                                                <th className={`${s.th} ${s.cellNum}`}>Total</th>
                                                <th className={`${s.th} ${s.cellNum}`}>Debe</th>
                                                <th className={`${s.th} ${s.cellNum}`}>Haber</th>
                                                <th className={`${s.th} ${s.cellNum}`}>Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredUnbilledMovements.length > 0 ? filteredUnbilledMovements.map((m, idx) => (
                                                <tr key={m.id || idx} className={s.row} onClick={() => handleRowClick({ ...m, doc_type: 'DELIVERY_NOTE' })}>
                                                    <td className={s.cell}>{fmt(m.date, 'date')}</td>
                                                    <td className={s.cell}>{getCircuitoFallback('DELIVERY_NOTE', m.circuit)}</td>
                                                    <td className={s.cell}>
                                                        <div className={s.statusBadge} style={{ textTransform: 'none' }}>
                                                            <Clock size={12} style={{ color: '#d97706' }} />
                                                            <span className={s.docLabel}>{getComprobanteName('DELIVERY_NOTE')}</span>
                                                        </div>
                                                    </td>
                                                    <td className={s.cell}>{m.number}</td>
                                                    <td className={s.cell} title={getDescripcionFallback('DELIVERY_NOTE', m.description || m.notes)}>{getDescripcionFallback('DELIVERY_NOTE', m.description || m.notes)}</td>
                                                    <td className={s.cell}>-</td>
                                                    <td className={s.cell}>{m.currency}</td>
                                                    <td className={s.cell}>{m.exchange_rate}</td>
                                                    <td className={s.cell} title={m.sale_condition}>{m.sale_condition || '-'}</td>
                                                    <td className={`${s.cell} ${s.cellNum}`}>{m.amount_ars > 0 ? fmt(m.amount_ars, 'ARS') : '-'}</td>
                                                    <td className={`${s.cell} ${s.cellNum}`}>{m.amount_ars < 0 ? fmt(Math.abs(m.amount_ars), 'ARS') : '-'}</td>
                                                    <td className={`${s.cell} ${s.cellNum} ${s.balanceArs}`}>{fmt(m.balance_ars, 'ARS')}</td>
                                                    <td className={`${s.cell} ${s.cellNum}`}>{m.amount_usd > 0 ? fmt(m.amount_usd, 'USD') : '-'}</td>
                                                    <td className={`${s.cell} ${s.cellNum}`}>{m.amount_usd < 0 ? fmt(Math.abs(m.amount_usd), 'USD') : '-'}</td>
                                                    <td className={`${s.cell} ${s.cellNum} ${s.balanceUsd}`}>{fmt(m.balance_usd, 'USD')}</td>
                                                </tr>
                                            )) : (
                                                <tr>
                                                    <td colSpan={15} style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>No hay remitos pendientes con los filtros aplicados.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className={s.emptyState}>
                        <div className={s.emptyIcon}>
                            <Activity size={48} />
                        </div>
                        <h2 style={{ fontSize: 24, fontWeight: 900, color: '#1e293b' }}>Resumen de Cuenta Corriente</h2>
                        <p style={{ maxWidth: 500, color: '#64748b', lineHeight: 1.6, marginTop: 4 }}>
                            Seleccione un cliente o proveedor para visualizar su historial financiero, saldos en vivo y gestión de documentos pendientes.
                        </p>
                    </div>
                )}
            </div>
            
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    .topBar, .controlStrip, .actionsGroup { display: none !important; }
                    .container { padding: 0 !important; }
                    .tableContainer { border: none !important; box-shadow: none !important; }
                    .pageLayout { background: white !important; }
                }
            `}} />
        </div>
    );
}
