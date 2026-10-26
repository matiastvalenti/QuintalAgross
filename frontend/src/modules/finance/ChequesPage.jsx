import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Search, Filter, Plus, FileText, Download, Upload, 
  Eye, X, Mail, Calendar, Table, CheckCircle, AlertTriangle, 
  ChevronRight, ArrowRight, Trash2, Clock, Landmark, Ban,
  CreditCard, ExternalLink, ArrowDownToLine, Check, History,
  ChevronLeft, ArrowUp, ArrowDown, SlidersHorizontal, RotateCcw
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useWindow } from '../../context/WindowContext';
import { useToast } from '../../context/ToastContext';
import { useLocation } from 'react-router-dom';
import api from '../../services/api';
import { chequeService } from '../../api/cheques';
import s from './ChequesPage.module.css';
import t from '../../components/ui/Table.module.css';
import TableSkeleton from '../../components/ui/TableSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';

// --- HELPERS ---
const formatCurrency = (val, currency = 'ARS') => {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: String(currency || 'ARS').toUpperCase() === 'USD' ? 'USD' : 'ARS',
        minimumFractionDigits: 0
    }).format(val);
};

const formatChequeTotals = (checks) => {
    const totals = checks.reduce((acc, check) => {
        const currency = String(check.moneda || 'ARS').toUpperCase();
        acc[currency] = (acc[currency] || 0) + Number(check.importe || 0);
        return acc;
    }, {});
    return Object.entries(totals).map(([currency, total]) => formatCurrency(total, currency)).join(" · ");
};

// --- MODAL COMPONENTS ---
function RejectModal({ cheque, onClose, onReject }) {
    const [reason, setReason] = useState("Sin Fondos");
    const [createNd, setCreateNd] = useState(true);
    const [expenses, setExpenses] = useState(0);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onReject(cheque.id, {
                reason,
                create_nd: createNd,
                nd_expenses: Number(expenses)
            });
            onClose();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={s.modalOverlay} onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className={s.modal} onClick={e => e.stopPropagation()} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 24, width: 450, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                <div style={{ padding: '24px 32px', borderBottom: '1.5px solid #fef2f2', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ background: '#fef2f2', color: '#dc2626', padding: 10, borderRadius: 12 }}><AlertTriangle size={20} /></div>
                    <div>
                        <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>Rechazar Cheque</h2>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', margin: 0 }}>#{cheque.nro_cheque} · {formatCurrency(cheque.importe, cheque.moneda)}</p>
                    </div>
                </div>
                <form onSubmit={handleSubmit} style={{ padding: 32 }}>
                    <div style={{ marginBottom: 20 }}>
                        <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Motivo</label>
                        <select className={s.glassSelect} value={reason} onChange={e => setReason(e.target.value)} style={{ width: '100%', padding: '10px 14px' }}>
                            <option value="Sin Fondos">Sin Fondos</option>
                            <option value="Cuenta Cerrada">Cuenta Cerrada</option>
                            <option value="Defecto Formal">Defecto Formal</option>
                            <option value="Orden de No Pagar">Orden de No Pagar</option>
                        </select>
                    </div>
                    <div style={{ marginBottom: 20 }}>
                        <label className={s.checkboxLabel} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                            <input type="checkbox" checked={createNd} onChange={e => setCreateNd(e.target.checked)} style={{ width: 18, height: 18 }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Generar Nota de Débito automática</span>
                        </label>
                    </div>
                    {createNd && (
                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Gastos Bancarios ($)</label>
                            <input type="number" className={s.searchInp} style={{ width: '100%', padding: '10px 14px' }} value={expenses} onChange={e => setExpenses(e.target.value)} />
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 32 }}>
                        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                        <Button variant="primary" type="submit" style={{ background: '#dc2626' }} disabled={loading}>{loading ? 'Procesando...' : 'Confirmar Rechazo'}</Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function ClearModal({ cheque, onClose, onClear }) {
    const [createNd, setCreateNd] = useState(false);
    const [expenses, setExpenses] = useState(0);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onClear(cheque.id, { create_nd: createNd, nd_expenses: Number(expenses) });
            onClose();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={s.modalOverlay} onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className={s.modal} onClick={e => e.stopPropagation()} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 24, width: 450, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                <div style={{ padding: '24px 32px', borderBottom: '1.5px solid #f0fdf4', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ background: '#f0fdf4', color: '#166534', padding: 10, borderRadius: 12 }}><Check size={20} /></div>
                    <div>
                        <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>Acreditar Cheque</h2>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', margin: 0 }}>#{cheque.nro_cheque} · {formatCurrency(cheque.importe, cheque.moneda)}</p>
                    </div>
                </div>
                <form onSubmit={handleSubmit} style={{ padding: 32 }}>
                    <p style={{ fontSize: 14, color: '#475569', marginBottom: 24 }}>El cheque pasará a estado <b>COBRADO</b>. ¿Desea generar una ND por gastos?</p>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 24 }}>
                        <input type="checkbox" checked={createNd} onChange={e => setCreateNd(e.target.checked)} style={{ width: 18, height: 18 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Generar Nota de Débito</span>
                    </label>
                    {createNd && (
                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: uppercase, letterSpacing: '0.1em', marginBottom: 8 }}>Monto de Gastos ($)</label>
                            <input type="number" className={s.searchInp} style={{ width: '100%', padding: '10px 14px' }} value={expenses} onChange={e => setExpenses(e.target.value)} />
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                        <Button variant="primary" type="submit" style={{ background: '#166534' }} disabled={loading}>{loading ? 'Acreditando...' : 'Acreditar Ahora'}</Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// --- MAIN PAGE ---
const getStateVariant = (estado) => {
    const map = {
        EN_CARTERA: "warn",
        DEPOSITADO: "accent",
        COBRADO: "ok",
        ENDOSADO: "ok",
        VENCIDO: "bad",
        RECHAZADO: "bad",
        EMITIDO: "accent",
        PENDIENTE: "warn",
    };
    return map[estado] || "default";
};

export default function ChequesPage() {
    const [cheques, setCheques] = useState([]);
    const [loading, setLoading] = useState(true);
    const [entities, setEntities] = useState([]);
    const { showToast } = useToast();
    const [error, setError] = useState(null);
    const { openWindow } = useWindow();
    const location = useLocation();

    // UI state
    const [viewMode, setViewMode] = useState("table"); 
    const [currentDate, setCurrentDate] = useState(new Date());
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [selectedCheque, setSelectedCheque] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [triggeringAlerts, setTriggeringAlerts] = useState(false);

    // Advanced Filters
    const [filterDateFrom, setFilterDateFrom] = useState("");
    const [filterDateTo, setFilterDateTo] = useState("");
    const [filterType, setFilterType] = useState("");

    // Sort/Pagination state
    const [sortConfig, setSortConfig] = useState({ key: 'f_pago', direction: 'desc' });
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(20); 

    const loadCheques = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await chequeService.fetchCheques();
            setCheques(data);
            setCurrentPage(1); 
            setSelectedIds([]);
        } catch (err) {
            console.error(err);
            setError("Error de conexión");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setSelectedIds([]);
    }, [statusFilter]);

    useEffect(() => {
        loadCheques();
        api.get('/entities/', { params: { type: 'provider' } }).then(setEntities).catch(console.error);
    }, [loadCheques]);

    const resetFilters = () => {
        setSearch("");
        setFilterDateFrom("");
        setFilterDateTo("");
        setFilterType("");
        setCurrentPage(1);
    };

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleManualAlerts = async () => {
        setTriggeringAlerts(true);
        try {
            await api.post('/finance/cheques/alerts/run');
            showToast('Reporte de alertas enviado satisfactoriamente', 'success');
        } catch (err) {
            showToast('Error al procesar alertas', 'error');
        } finally {
            setTriggeringAlerts(false);
        }
    };

    const handleClear = async (id, data = null) => {
        try {
            await chequeService.clear(id, data);
            showToast('Cheque acreditado correctamente', 'success');
            loadCheques();
        } catch (err) {
            showToast('Error al acreditar', 'error');
        }
    };

    const handleReject = async (id, data) => {
        try {
            await chequeService.reject(id, data);
            showToast('Cheque rechazado correctamente', 'success');
            loadCheques();
        } catch (err) {
            showToast('Error al rechazar', 'error');
        }
    };

    const canEndorse = (check) => check.estado === "EN_CARTERA" && check.origen !== "PROPIO";

    const handleDeposit = async () => {
        const selectedCheques = cheques.filter(c => selectedIds.includes(c.id));
        if (!selectedCheques.length || selectedCheques.some(c => !canEndorse(c))) {
            showToast("Solo podés depositar cheques de terceros disponibles en cartera.", "error");
            return;
        }
        try {
            await chequeService.deposit({ cheque_ids: selectedIds });
            showToast(`${selectedIds.length} cheques depositados`, 'success');
            loadCheques();
        } catch (err) {
            showToast('Error al depositar', 'error');
        }
    };

    const handleOpenEndorseForm = () => {
        const selectedCheques = cheques.filter(c => selectedIds.includes(c.id));
        if (!selectedCheques.length || selectedCheques.some(c => !canEndorse(c))) {
            showToast("Seleccioná únicamente cheques disponibles en cartera para endosar.", "error");
            return;
        }
        const currencies = [...new Set(selectedCheques.map(c => String(c.moneda || 'ARS').toUpperCase()))];
        if (currencies.length !== 1) {
            showToast("Para endosar cheques de monedas diferentes, generá una orden de pago por moneda.", "error");
            return;
        }
        const initialPayments = selectedCheques.map(c => ({
            id: `cartera-${c.id}`,
            type: 'CHECK',
            check_origin: 'TERCERO',
            source_cheque_id: c.id,
            amount: Number(c.importe),
            description: `Endoso cheque ${c.nro_cheque}`,
            reference_number: String(c.nro_cheque),
            due_date: c.f_vencimiento || c.f_pago,
            issue_date: c.f_emision,
            bank_name: c.banco,
            drawer_name: c.librador || '',
            drawer_cuit: c.cuit_emisor || '',
            issuer_tax_id: c.cuit_emisor || '',
            check_type: c.tipo || 'FISICO'
        }));

        openWindow('receipt-form', {
            mode: 'new',
            isPayment: true,
            initialPayments,
            initialCurrency: currencies[0],
        }, {
            title: `Orden de Pago · Endoso de ${initialPayments.length} cheques`,
            width: 1270, height: 750, minWidth: 720, minHeight: 470,
            singletonKey: `endorse-${selectedCheques.map(c => c.id).sort((a,b)=>a-b).join('-')}`,
        });
    };

    const toggleSelect = (id) => {
        const cheque = cheques.find(c => c.id === id);
        if (!cheque || !canEndorse(cheque)) return;
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        const eligibleIds = paginatedData.filter(canEndorse).map(ch => ch.id);
        setSelectedIds(prev => eligibleIds.length && eligibleIds.every(id => prev.includes(id))
            ? prev.filter(id => !eligibleIds.includes(id))
            : [...new Set([...prev, ...eligibleIds])]);
    };

    const filteredData = useMemo(() => {
        let result = statusFilter ? cheques.filter(ch => statusFilter === 'EN_CARTERA' ? ['EN_CARTERA', 'PENDIENTE'].includes(ch.estado) : ch.estado === statusFilter) : cheques;
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(ch => 
                String(ch.nro_cheque).toLowerCase().includes(q) ||
                String(ch.banco).toLowerCase().includes(q) ||
                String(ch.cliente_dador || '').toLowerCase().includes(q)
            );
        }
        if (filterDateFrom) result = result.filter(ch => ch.f_pago >= filterDateFrom);
        if (filterDateTo) result = result.filter(ch => ch.f_pago <= filterDateTo);
        if (filterType) result = result.filter(ch => ch.tipo === filterType);

        return [...result].sort((a, b) => {
            const valA = a[sortConfig.key] || "";
            const valB = b[sortConfig.key] || "";
            if (sortConfig.key === 'importe') return sortConfig.direction === 'asc' ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [cheques, statusFilter, search, filterDateFrom, filterDateTo, filterType, sortConfig]);

    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredData.slice(start, start + itemsPerPage);
    }, [filteredData, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);

    const summary = useMemo(() => {
        const available = cheques.filter(c => c.estado === 'EN_CARTERA' && c.origen !== 'PROPIO');
        return {
            count: cheques.length,
            availableCount: available.length,
            deposited: cheques.filter(c => c.estado === 'DEPOSITADO').length,
            rejected: cheques.filter(c => c.estado === 'RECHAZADO').length,
            emitted: cheques.filter(c => c.estado === 'EMITIDO').length,
            byCurrency: available.reduce((acc, c) => {
                const currency = String(c.moneda || 'ARS').toUpperCase();
                acc[currency] = (acc[currency] || 0) + Number(c.importe || 0);
                return acc;
            }, {}),
        };
    }, [cheques]);

    const handleFileSelect = (e) => {
        const f = e.target.files?.[0];
        if (f) chequeService.importExcel(f).then(() => { showToast('Importación exitosa', 'success'); loadCheques(); }).catch(() => showToast('Error al importar', 'error'));
    };

    const SortIcon = ({ col }) => {
        if (sortConfig.key !== col) return <ArrowUp size={11} style={{ opacity: 0.3, marginLeft: 4 }} />;
        return sortConfig.direction === 'asc' ? <ArrowUp size={11} style={{ marginLeft: 4, color: '#24389c' }} /> : <ArrowDown size={11} style={{ marginLeft: 4, color: '#24389c' }} />;
    };

    const daysInMonth = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const totalDays = new Date(year, month + 1, 0).getDate();
        const days = [];
        for (let i = 0; i < firstDay; i++) days.push(null);
        for (let i = 1; i <= totalDays; i++) days.push(i);
        return days;
    }, [currentDate]);

    const getChequesForDay = (day) => {
        if (!day) return [];
        const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        return filteredData.filter(ch => ch.f_pago === dateStr);
    };

    const monthName = currentDate.toLocaleString('es-AR', { month: 'long', year: 'numeric' });

    const [clearingCheque, setClearingCheque] = useState(null);
    const [rejectingCheque, setRejectingCheque] = useState(null);

    return (
        <div className={s.pageLayout}>
            {/* STICKY TOPBAR */}
            <div className={s.topBar}>
                <div className={s.titleArea}>
                    <h1 className={s.mainTitle}>Gestión de Cheques</h1>
                    <span className={s.subtitle}>Cartera • Acreditaciones • Rechazos</span>
                </div>

                <div className={s.actionsGroup}>
                    <Button variant="ghost" onClick={handleManualAlerts} disabled={triggeringAlerts} title="Generar reporte de alertas hoy" style={{ borderRadius: 12 }}>
                        {triggeringAlerts ? <RotateCcw size={16} className={s.spin} /> : <Mail size={16} />} Alertas
                    </Button>
                    <Button variant="primary" onClick={() => document.getElementById('fileInp').click()} style={{ borderRadius: 12, background: '#059669' }}>
                        <Upload size={16} /> Importar Excel
                        <input id="fileInp" type="file" style={{display:'none'}} accept=".xls,.xlsx" onChange={handleFileSelect} />
                    </Button>
                    <div className={s.viewToggle}>
                        <button className={`${s.toggleBtn} ${viewMode === 'table' ? s.active : ''}`} onClick={() => setViewMode('table')}>
                            <Table size={14} /> Listado
                        </button>
                        <button className={`${s.toggleBtn} ${viewMode === 'calendar' ? s.active : ''}`} onClick={() => setViewMode('calendar')}>
                            <Calendar size={14} /> Calendario
                        </button>
                    </div>
                </div>
            </div>

            {/* SCROLLABLE CONTAINER */}
            <div className={s.container}>
                
                {/* STATS DASHBOARD */}
                <div className={s.summaryHeader}>
                    <div className={`${s.summaryCard} ${s.purple} ${!statusFilter ? s.active : ''}`} onClick={() => setStatusFilter("")}>
                        <div className={s.cardIcon}><Landmark size={18} /></div>
                        <span className={s.cardTitle}>Todos los cheques</span>
                        <div className={s.balanceValue}>{summary.count}</div>
                        <div className={s.cardFooter}><History size={10} style={{marginRight:4}} /> Recibidos y emitidos</div>
                    </div>
                    <div className={`${s.summaryCard} ${s.yellow} ${statusFilter === 'EN_CARTERA' ? s.active : ''}`} onClick={() => setStatusFilter("EN_CARTERA")}>
                        <div className={s.cardIcon}><Clock size={18} /></div>
                        <span className={s.cardTitle}>En Cartera</span>
                        <div className={s.balanceValue}>{summary.availableCount}</div>
                        <div className={s.cardFooter}>{Object.entries(summary.byCurrency).map(([cur, amount]) => formatCurrency(amount, cur)).join(" · ") || "Sin cheques disponibles"}</div>
                    </div>
                    <div className={`${s.summaryCard} ${s.blue} ${statusFilter === 'DEPOSITADO' ? s.active : ''}`} onClick={() => setStatusFilter("DEPOSITADO")}>
                        <div className={s.cardIcon}><ExternalLink size={18} /></div>
                        <span className={s.cardTitle}>Depósitos</span>
                        <div className={s.balanceValue}>{summary.deposited}</div>
                        <div className={s.cardFooter}>Pendientes de acreditar</div>
                    </div>
                    <div className={`${s.summaryCard} ${s.red} ${statusFilter === 'RECHAZADO' ? s.active : ''}`} onClick={() => setStatusFilter("RECHAZADO")}>
                        <div className={s.cardIcon}><AlertTriangle size={18} /></div>
                        <span className={s.cardTitle}>Rechazos</span>
                        <div className={s.balanceValue}>{summary.rejected}</div>
                        <div className={s.cardFooter} style={{color: '#dc2626'}}>Requieren gestión inmediata</div>
                    </div>
                    <div className={`${s.summaryCard} ${s.green} ${statusFilter === 'EMITIDO' ? s.active : ''}`} onClick={() => setStatusFilter("EMITIDO")}>
                        <div className={s.cardIcon}><CreditCard size={18} /></div>
                        <span className={s.cardTitle}>Cheques propios emitidos</span>
                        <div className={s.balanceValue}>{summary.emitted}</div>
                        <div className={s.cardFooter}>Emitidos en órdenes de pago</div>
                    </div>
                </div>

                {/* BATCH BAR */}
                {selectedIds.length > 0 && (
                    <div className={s.batchBar}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <CheckCircle size={20} />
                            <span style={{ fontWeight: 800 }}>{selectedIds.length} cheques seleccionados</span>
                            <div className={s.batchActions} style={{ marginLeft: 24 }}>
                                <Button variant="ghost" size="sm" onClick={handleOpenEndorseForm} style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>
                                    <ArrowRight size={14} /> Endosar a Proveedor
                                </Button>
                                <Button variant="ghost" size="sm" onClick={handleDeposit} style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>
                                    <Landmark size={14} /> Depositar en Banco
                                </Button>
                            </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])} style={{ color: 'white', opacity: 0.8 }}>Cancelar selección</Button>
                    </div>
                )}

                {/* FILTER BAR GLASS */}
                <div className={s.filterBar}>
                    <div className={s.filterGrid}>
                        <div className={s.filterCol}>
                            <span className={s.filterLabel}>Rango de Pago</span>
                            <div className={s.dateRange}>
                                <input type="date" className={s.dateInp} value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
                                <ChevronRight size={12} style={{ opacity: 0.3 }} />
                                <input type="date" className={s.dateInp} value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
                            </div>
                        </div>
                        <div className={s.filterCol}>
                            <span className={s.filterLabel}>Tipo de Valor</span>
                            <select className={s.glassSelect} value={filterType} onChange={e => setFilterType(e.target.value)}>
                                <option value="">Todos los tipos</option>
                                <option value="FISICO">Cheque Físico</option>
                                <option value="ECHEQ">E-Cheq</option>
                            </select>
                        </div>
                        <div className={s.searchCol}>
                            <div className={s.searchContainer}>
                                <Search size={16} className={s.searchIcon} />
                                <input className={s.searchInp} placeholder="Buscar por banco, número o cliente..." value={search} onChange={e => setSearch(e.target.value)} />
                            </div>
                            <button className={s.clearBtn} onClick={resetFilters} title="Limpiar todos los filtros">
                                <RotateCcw size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* CONTENT AREA */}
                {viewMode === 'table' ? (
                    <div className={s.tableContainer}>
                        <div className={s.paginationBar}>
                            <div className={s.paginationInfo}>Mostrando {paginatedData.length} de {filteredData.length} resultados</div>
                            <div className={s.paginationControls}>
                                <button className={s.pageBtn} onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}><ChevronLeft size={16} /></button>
                                <span className={s.currentPage}>Pág. {currentPage} / {totalPages || 1}</span>
                                <button className={s.pageBtn} onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages}><ChevronRight size={16} /></button>
                            </div>
                        </div>
                        <div className={t.container}>
                            {loading ? <TableSkeleton rows={15} cols={9} /> : (
                                <table className={t.table}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: 40 }}><input type="checkbox" checked={paginatedData.some(canEndorse) && paginatedData.filter(canEndorse).every(ch => selectedIds.includes(ch.id))} onChange={toggleSelectAll} aria-label="Seleccionar cheques disponibles" /></th>
                                            <th onClick={() => handleSort('banco')} style={{ cursor: 'pointer' }}>BANCO <SortIcon col="banco" /></th>
                                            <th onClick={() => handleSort('nro_cheque')} style={{ cursor: 'pointer' }}>NRO. <SortIcon col="nro_cheque" /></th>
                                            <th onClick={() => handleSort('f_pago')} style={{ cursor: 'pointer' }}>FECHA PAGO <SortIcon col="f_pago" /></th>
                                            <th>ESTADO / ORIGEN</th>
                                            <th onClick={() => handleSort('importe')} style={{ textAlign: 'right', cursor: 'pointer' }}>IMPORTE <SortIcon col="importe" /></th>
                                            <th>CLIENTE / DADOR</th>
                                            <th>DESTINO / BENEFIC.</th>
                                            <th style={{ textAlign: 'center' }}>ACCIONES</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedData.map(ch => (
                                            <tr key={ch.id} className={t.row}>
                                                <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(ch.id)} onChange={() => toggleSelect(ch.id)} disabled={!canEndorse(ch)} aria-label={`Seleccionar cheque ${ch.nro_cheque}`} /></td>
                                                <td style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>{ch.banco}</td>
                                                <td><code style={{ fontSize: 12, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>#{ch.nro_cheque}</code></td>
                                                <td style={{ fontWeight: 600 }}>{ch.f_pago}</td>
                                                <td><Badge variant={getStateVariant(ch.estado)}>{ch.estado}</Badge><small style={{ display: "block", marginTop: 4, color: "#64748b" }}>{ch.origen === "PROPIO" ? "Propio" : "De tercero"}</small></td>
                                                <td style={{ textAlign: 'right', fontWeight: 900, color: '#24389c', fontSize: 14 }}>{formatCurrency(ch.importe, ch.moneda)}</td>
                                                <td style={{ fontSize: 12, fontWeight: 600 }}>{ch.cliente_dador || '-'}</td>
                                                <td style={{ fontSize: 12, fontWeight: 700, color: ch.entregado_a ? '#24389c' : '#94a3b8' }}>{ch.entregado_a || '-'}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                                        {ch.estado === 'EN_CARTERA' && <Button variant="ghost" size="xs" style={{ color: '#059669' }} onClick={() => setClearingCheque(ch)} title="Acreditar"><Check size={14}/></Button>}
                                                        {ch.estado === 'EN_CARTERA' && <Button variant="ghost" size="xs" style={{ color: '#dc2626' }} onClick={() => setRejectingCheque(ch)} title="Rechazar"><Ban size={14}/></Button>}
                                                        <Button variant="ghost" size="xs" onClick={() => setSelectedCheque(ch)} title="Ver Detalle"><Eye size={14}/></Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className={s.calendarCard}>
                        <div className={s.calendarNav}>
                            <Button variant="ghost" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}><ChevronLeft /></Button>
                            <h2 className={s.monthTitle}>{monthName}</h2>
                            <Button variant="ghost" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}><ChevronRight /></Button>
                        </div>
                        <div className={s.calendarGrid}>
                            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
                                <div key={d} className={s.weekdayHeader}>{d}</div>
                            ))}
                            {daysInMonth.map((day, i) => {
                                const dayCheques = getChequesForDay(day);
                                const total = formatChequeTotals(dayCheques);
                                const isToday = day && 
                                    day === new Date().getDate() && 
                                    currentDate.getMonth() === new Date().getMonth() && 
                                    currentDate.getFullYear() === new Date().getFullYear();

                                return (
                                    <div key={i} className={`${s.calendarDay} ${isToday ? s.isToday : ''} ${dayCheques.length > 0 ? s.hasCheques : ''}`}>
                                        {day && (
                                            <>
                                                <div className={s.dayNumber}>{day}</div>
                                                {dayCheques.length > 0 && <div className={s.dayTotal}>{total}</div>}
                                                <div className={s.eventList}>
                                                    {dayCheques.slice(0, 3).map(ch => (
                                                        <div 
                                                            key={ch.id} 
                                                            onClick={() => setSelectedCheque(ch)} 
                                                            className={`${s.eventBadge} ${s['eventStatus_' + getStateVariant(ch.estado)]}`}
                                                        >
                                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
                                                            #{ch.nro_cheque} · {ch.banco.slice(0, 8)}
                                                        </div>
                                                    ))}
                                                    {dayCheques.length > 3 && <div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textAlign: 'center', marginTop: 2 }}>+ {dayCheques.length - 3} más</div>}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* MODALS */}
            {clearingCheque && <ClearModal cheque={clearingCheque} onClose={() => setClearingCheque(null)} onClear={handleClear} />}
            {rejectingCheque && <RejectModal cheque={rejectingCheque} onClose={() => setRejectingCheque(null)} onReject={handleReject} />}
            {selectedCheque && (
                <div onClick={() => setSelectedCheque(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 24, width: 600, overflow: 'hidden' }}>
                        <div style={{ padding: '24px 32px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: 18, fontWeight: 900 }}>Detalle de Cheque</h2>
                            <Button variant="ghost" onClick={() => setSelectedCheque(null)}><X size={20}/></Button>
                        </div>
                        <div style={{ padding: 32 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Banco</span>
                                    <span style={{ fontWeight: 800 }}>{selectedCheque.banco}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Importe</span>
                                    <span style={{ fontWeight: 900, color: '#24389c', fontSize: 18 }}>{formatCurrency(selectedCheque.importe, selectedCheque.moneda)}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Número</span>
                                    <span style={{ fontWeight: 700 }}>#{selectedCheque.nro_cheque}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Fecha de Pago</span>
                                    <span style={{ fontWeight: 700 }}>{selectedCheque.f_pago}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Estado</span>
                                    <div><Badge variant={getStateVariant(selectedCheque.estado)}>{selectedCheque.estado}</Badge></div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Cliente / Dador</span>
                                    <span style={{ fontWeight: 700 }}>{selectedCheque.cliente_dador || '-'}</span>
                                </div>
                            </div>
                            {selectedCheque.entregado_a && (
                                <div style={{ marginTop: 24, padding: 16, background: '#f8fafc', borderRadius: 16 }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Historial de Salida</span>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontWeight: 700 }}>Entregado a: {selectedCheque.entregado_a}</span>
                                        <span style={{ fontSize: 12, color: '#64748b' }}>OP: {selectedCheque.nro_orden_pago || '-'}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
