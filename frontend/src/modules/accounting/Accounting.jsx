import { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  Search, 
  Filter, 
  Plus, 
  Calendar, 
  DollarSign, 
  FileText, 
  ArrowUpRight, 
  ArrowDownRight, 
  Download,
  Eye,
  MoreVertical,
  ChevronRight,
  TrendingUp,
  CreditCard,
  Building,
  History,
  Info,
  Printer
} from 'lucide-react';
import FxAdjustmentModal from './FxAdjustmentModal';
import styles from './Accounting.module.css';
import { useToast } from '../../context/ToastContext';
import * as XLSX from 'xlsx';
import { useWindow } from '../../context/WindowContext';
import { downloadLedgerPdf, downloadVatPdf } from '../../services/AccountingPdf';
import { useCostCenter } from '../../context/CostCenterContext';


import api from '../../services/api';
const API_URL = 'http://localhost:8000'; // Mantener por si se usa en otros sitios, pero usar api para peticiones


const fmt = (val, curr = 'ARS') => new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: curr,
  minimumFractionDigits: 2
}).format(val || 0);

export default function Accounting() {
  const { costCenter } = useCostCenter();
  const [activeTab, setActiveTab] = useState('journal'); // 'journal', 'ledger', 'create'
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const { openWindow } = useWindow();

  // --- GLOBAL JOURNAL STATE ---
  const [globalDocs, setGlobalDocs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [journalFilters, setJournalFilters] = useState({
    doc_type: '', currency: '', date_from: '', date_to: ''
  });

  // --- LEDGER STATE (Entity specific) ---
  const [entities, setEntities] = useState([]);
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [ledger, setLedger] = useState([]);
  const [ledgerFilters, setLedgerFilters] = useState({
    currency: '', doc_type: '', status: '', line: ''
  });

  // --- CREATE FORM STATE ---
  const [newDoc, setNewDoc] = useState({
    doc_type: 'INVOICE', number: '', currency: 'ARS',
    exchange_rate: 1.0, total_amount: 0.0, line: 'L1', notes: '',
    cost_center: costCenter || 1
  });

  const [docLines, setDocLines] = useState([]);
  const [newLine, setNewLine] = useState({
    description: '', qty: 1, unit_price: 0, discount_pct: 0, vat_rate: 0.21
  });

  // Detail modals
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [applications, setApplications] = useState([]);
  const [fxAppId, setFxAppId] = useState(null);

  // --- VAT LEDGER STATE ---
  const [vatYear, setVatYear] = useState(new Date().getFullYear());
  const [vatMonth, setVatMonth] = useState(new Date().getMonth() + 1);
  const [vatCategory, setVatCategory] = useState('sales'); // 'sales', 'purchases'
  const [vatData, setVatData] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [conciliating, setConciliating] = useState(false);

  useEffect(() => {
    fetchEntities();
  }, []);

  useEffect(() => {
    if (activeTab === 'journal') fetchGlobalJournal();
  }, [activeTab, journalFilters, costCenter]);

  useEffect(() => {
    if (selectedEntityId) fetchLedger();
  }, [selectedEntityId, ledgerFilters, costCenter]);

  useEffect(() => {
    if (activeTab === 'vat') fetchVatLedger();
  }, [activeTab, vatYear, vatMonth, vatCategory, costCenter]);


  const fetchVatLedger = async () => {
    setLoading(true);
    try {
      const data = await api.get('/accounting/documents/vat-ledger', {
        params: {
          month: vatMonth,
          year: vatYear,
          category: vatCategory
        }
      });
      setVatData(Array.isArray(data) ? data : []);
      setComparison(null);
    } catch (err) { 
      console.error(err);
      setVatData([]);
    }
    finally { setLoading(false); }
  };


  const fetchEntities = async () => {
    try {
      const data = await api.get('/entities', { params: { limit: 1000 } });
      setEntities(data);
    } catch (err) { console.error(err); }
  };


  const fetchGlobalJournal = async () => {
    setLoading(true);
    try {
      const params = {};
      if (journalFilters.doc_type) params.doc_type = journalFilters.doc_type;
      if (journalFilters.currency) params.currency = journalFilters.currency;
      
      let data = await api.get('/accounting/documents', { params });
      
      if (searchTerm) {
        data = data.filter(d => 
          (d.number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (d.entity_name || "").toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      
      setGlobalDocs(data.sort((a,b) => new Date(b.date) - new Date(a.date)));
    } catch (err) { 
      console.error(err);
      showToast("Error al cargar el libro diario", "error");
    } finally { setLoading(false); }
  };


  const fetchLedger = async () => {
    if (!selectedEntityId) return;
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(ledgerFilters).filter(([, v]) => v));
      // Usar la ruta estandarizada /accounts/{id}/ledger
      const data = await api.get(`/accounts/${selectedEntityId}/ledger`, { params });
      setLedger(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };


  const fetchApplications = async (docId) => {
    try {
      const data = await api.get(`/accounting/documents/${docId}/applications`);
      setApplications(data);
    } catch (err) { console.error(err); }
  };


  // --- HANDLERS ---
  const handleAddLine = () => {
    const net = newLine.qty * newLine.unit_price * (1 - newLine.discount_pct / 100);
    const vat = net * newLine.vat_rate;
    setDocLines([...docLines, {
      ...newLine,
      net_amount: Math.round(net * 100) / 100,
      vat_amount: Math.round(vat * 100) / 100,
      total_amount: Math.round((net + vat) * 100) / 100,
      line_order: docLines.length,
    }]);
    setNewLine({ description: '', qty: 1, unit_price: 0, discount_pct: 0, vat_rate: 0.21 });
  };

  const handleCreateDocument = async (e) => {
    e.preventDefault();
    if (!selectedEntityId) return showToast('Seleccione una entidad', 'error');
    try {
      const linesTotal = docLines.reduce((s, l) => s + l.total_amount, 0);
      const data = {
        ...newDoc,
        entity_id: selectedEntityId,
        total_amount: docLines.length > 0 ? linesTotal : newDoc.total_amount,
        lines: docLines.length > 0 ? docLines : undefined,
        cost_center: newDoc.cost_center || costCenter || 1,
      };

      
      await api.post('/accounting/documents', data);
      
      showToast("Comprobante creado correctamente", "success");
      setNewDoc({ doc_type: 'INVOICE', number: '', currency: 'ARS', exchange_rate: 1.0, total_amount: 0.0, line: 'L1', cost_center: costCenter || 1 });

      setDocLines([]);
      if (activeTab === 'create') setActiveTab('journal');
      fetchGlobalJournal();
    } catch (err) { 
      console.error(err);
      showToast(err.response?.data?.detail || "Error al crear comprobante", "error");
    }
  };

  const openDocInWindow = (doc) => {
    let type = 'invoice-form';
    if (doc.doc_type === 'RECEIPT' || doc.doc_type === 'PAYMENT') type = 'receipt-form';
    
    openWindow(type, { id: doc.id, mode: 'edit' }, {
      title: `${doc.doc_type} ${doc.number}`,
      width: 1100,
      height: 700,
      singletonKey: `doc-${doc.id}`
    });
  };

  // --- STATS / KPIs ---
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = globalDocs.filter(d => {
      const dt = new Date(d.date);
      return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
    });

    const sales = thisMonth.filter(d => ['INVOICE', 'DEBIT_NOTE'].includes(d.doc_type))
                   .reduce((acc, d) => acc + d.total_amount_ars, 0);
    const purchases = thisMonth.filter(d => d.doc_type === 'PURCHASE_INVOICE')
                       .reduce((acc, d) => acc + d.total_amount_ars, 0);
    const receipts = thisMonth.filter(d => d.doc_type === 'RECEIPT')
                      .reduce((acc, d) => acc + d.total_amount_ars, 0);

    return { sales, purchases, receipts };
  }, [globalDocs]);

  const handleAFIPUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setConciliating(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target.result;
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Read as an array of arrays
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        // Find header row (usually contains 'fecha' and 'tipo')
        let headerIdx = rawRows.findIndex(r => r.some(c => String(c).toLowerCase().includes('fecha')));
        if (headerIdx === -1) {
            showToast("No se encontró encabezado válido en el archivo", "error");
            setConciliating(false);
            return;
        }

        const header = rawRows[headerIdx].map(h => String(h).toLowerCase());
        const getCol = (names) => header.findIndex(h => names.some(n => h.includes(n)));

        const idxDate = getCol(['fecha']);
        const idxType = getCol(['tipo']);
        const idxNum = getCol(['nro', 'número', 'numero', 'desde']); // Número Desde
        const idxPV = getCol(['punto', 'p.v.', 'venta']);
        const idxCUIT = getCol(['cuit', 'doc. emisor', 'nro. doc']);
        const idxTotal = getCol(['total']);

        const arcaDocs = rawRows.slice(headerIdx + 1).filter(r => r[idxDate] && r[idxTotal]).map(r => {
          let cleanNum = String(r[idxNum] || "").replace(/\D/g, '').padStart(8, '0');
          let cleanPV = String(r[idxPV] || "").replace(/\D/g, '').padStart(5, '0');
          
          let dt = r[idxDate];
          // if date is excel serial number
          if (typeof dt === 'number') {
             const dateObj = new Date(Math.round((dt - 25569) * 86400 * 1000));
             const d = ("0" + dateObj.getUTCDate()).slice(-2);
             const m = ("0" + (dateObj.getUTCMonth() + 1)).slice(-2);
             dt = `${d}/${m}/${dateObj.getUTCFullYear()}`;
          }

          return {
            date: dt,
            type: r[idxType],
            number: `${cleanPV}-${cleanNum}`,
            clean_pv: parseInt(r[idxPV], 10) || 0,
            clean_num: parseInt(r[idxNum], 10) || 0,
            tax_id: String(r[idxCUIT] || "").replace(/\D/g, ''),
            total: parseFloat(String(r[idxTotal]).replace(',', '.') || 0),
            raw: r
          };
        });

      // Compare
      const matches = [];
      const mismatches = [];
      const sysOnly = [...vatData];

      arcaDocs.forEach(arca => {
        // Try to find in system (by PV and Number, ignoring leading zeros)
        const sysIdx = sysOnly.findIndex(s => {
           if (!s.number) return false;
           const parts = s.number.split('-');
           const sPv = parts.length > 1 ? parseInt(parts[0], 10) : 0;
           const sNum = parts.length > 1 ? parseInt(parts[1], 10) : parseInt(parts[0], 10) || 0;
           return sPv === arca.clean_pv && sNum === arca.clean_num;
        });
        if (sysIdx !== -1) {
            const sys = sysOnly.splice(sysIdx, 1)[0];
            const diff = Math.abs(parseFloat(sys.total_amount) - arca.total);
            if (diff > 1) {
                mismatches.push({ arca, sys, reason: 'amount_diff', diff });
            } else {
                matches.push({ arca, sys });
            }
        } else {
            mismatches.push({ arca, reason: 'missing_in_system' });
        }
      });

      setComparison({
        matches,
        errors: mismatches,
        onlyInSystem: sysOnly
      });
      showToast(`Cargados ${arcaDocs.length} registros de ARCA`, "success");
      } catch (err) {
        console.error(err);
        showToast("Error procesando el archivo Excel.", "error");
      }
      setConciliating(false);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; // reset
  };

  return (
    <div className={styles.container}>
      {/* Header Area */}
      <div className={styles.headerActions}>
        <div className={styles.titleArea}>
          <h1 className={styles.premiumTitle}>Gestión Contable <span className={styles.accentText}>Pro</span></h1>
          <p className={styles.premiumSubtitle}>Supervisión estratégica de flujos, saldos y cumplimiento impositivo.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className={styles.secondaryCta} onClick={() => fetchGlobalJournal()}>
            <History size={18} /> Actualizar
          </button>
          <button className={styles.primaryCta} onClick={() => setActiveTab('create')}>
            <Plus size={18} /> Nuevo Comprobante
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className={styles.statsRow}>
        <div className={styles.statCardPremium}>
          <div className={styles.statContent}>
            <div className={styles.iconCircle} style={{ background: '#f0fdf4', color: '#16a34a' }}>
              <TrendingUp size={24} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Ventas del Mes</span>
              <span className={styles.statValue}>{fmt(stats.sales)}</span>
            </div>
          </div>
          <div className={styles.statBar} style={{ background: '#16a34a' }}></div>
        </div>
        <div className={styles.statCardPremium}>
          <div className={styles.statContent}>
            <div className={styles.iconCircle} style={{ background: '#fff1f2', color: '#e11d48' }}>
              <CreditCard size={24} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Compras del Mes</span>
              <span className={styles.statValue}>{fmt(stats.purchases)}</span>
            </div>
          </div>
          <div className={styles.statBar} style={{ background: '#e11d48' }}></div>
        </div>
        <div className={styles.statCardPremium}>
          <div className={styles.statContent}>
            <div className={styles.iconCircle} style={{ background: '#f0f9ff', color: '#0284c7' }}>
              <DollarSign size={24} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Cobranzas del Mes</span>
              <span className={styles.statValue}>{fmt(stats.receipts)}</span>
            </div>
          </div>
          <div className={styles.statBar} style={{ background: '#0284c7' }}></div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className={styles.tabsContainer}>
        <div className={styles.tabs}>
          <button 
            className={`${styles.tabBtn} ${activeTab === 'journal' ? styles.active : ''}`}
            onClick={() => setActiveTab('journal')}
          >
            <BarChart3 size={18} /> Libro Diario
          </button>
          <button 
            className={`${styles.tabBtn} ${activeTab === 'ledger' ? styles.active : ''}`}
            onClick={() => setActiveTab('ledger')}
          >
            <Building size={18} /> Cuenta Corriente
          </button>
          <button 
            className={`${styles.tabBtn} ${activeTab === 'vat' ? styles.active : ''}`}
            onClick={() => setActiveTab('vat')}
          >
            <Calendar size={18} /> Libros IVA / ARCA
          </button>
          <button 
            className={`${styles.tabBtn} ${activeTab === 'create' ? styles.active : ''}`}
            onClick={() => setActiveTab('create')}
          >
            <Plus size={18} /> Carga Manual
          </button>
        </div>
      </div>

      {/* View Content */}
      <div className={styles.mainContent}>
        
        {/* --- GLOBAL JOURNAL --- */}
        {activeTab === 'journal' && (
          <>
            <div className={styles.toolbar}>
              <div className={styles.searchWrapper}>
                <Search size={18} className={styles.searchIcon} />
                <input 
                  type="text" 
                  placeholder="Número, entidad o referencia..." 
                  className={styles.searchInput}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <div className={styles.filtersPanel}>
                <select 
                  className={styles.filterSelect}
                  value={journalFilters.doc_type}
                  onChange={e => setJournalFilters({...journalFilters, doc_type: e.target.value})}
                >
                  <option value="">Todos los Tipos</option>
                  <option value="INVOICE">Facturas</option>
                  <option value="RECEIPT">Recibos</option>
                  <option value="PURCHASE_INVOICE">Gastos/Compras</option>
                  <option value="PAYMENT">Pagos</option>
                  <option value="CREDIT_NOTE">NC</option>
                </select>
                <select className={styles.filterSelect}>
                  <option value="">Toda la flota (Combustible)</option>
                </select>
                <button className={styles.secondaryCta} style={{ padding: '8px 12px' }} onClick={() => downloadLedgerPdf(globalDocs, "Libro Diario Global", `Al ${new Date().toLocaleDateString()}`)}>
                  <Download size={16} /> Exportar PDF
                </button>
              </div>
            </div>

            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Número</th>
                    <th>Entidad</th>
                    <th className={styles.num}>Monto</th>
                    <th>Mda</th>
                    <th className={styles.num}>ARS Equiv.</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="8" className={styles.emptyState}>Cargando libro diario...</td></tr>
                  ) : globalDocs.length === 0 ? (
                    <tr><td colSpan="8" className={styles.emptyState}>No hay registros.</td></tr>
                  ) : globalDocs.map(doc => (
                    <tr key={doc.id} className={styles.tr}>
                      <td>{new Date(doc.date).toLocaleDateString()}</td>
                      <td>
                        <span className={styles.typeBadge} style={{ 
                          background: doc.doc_type.includes('INVOICE') ? '#eff6ff' : (doc.doc_type === 'RECEIPT' ? '#ecfdf5' : '#f8fafc'),
                          color: doc.doc_type.includes('INVOICE') ? '#2563eb' : (doc.doc_type === 'RECEIPT' ? '#059669' : '#64748b')
                        }}>
                          {doc.doc_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{doc.number}</td>
                      <td>
                        <div className={styles.entityLink}>{doc.entity_name}</div>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>{doc.entity_tax_id}</span>
                      </td>
                      <td className={styles.num}>{doc.total_amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                      <td>{doc.currency}</td>
                      <td className={styles.num}>$ {doc.total_amount_ars.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                      <td>
                        <button className={styles.secondaryCta} style={{ padding: 6 }} onClick={() => openDocInWindow(doc)}>
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* --- ENTITY LEDGER --- */}
        {activeTab === 'ledger' && (
          <>
            <section className={styles.card} style={{ marginBottom: 20 }}>
              <div className={styles.field} style={{ maxWidth: 400 }}>
                <label>Seleccionar Cliente / Proveedor:</label>
                <select className={styles.filterSelect} value={selectedEntityId}
                  onChange={e => setSelectedEntityId(e.target.value)}>
                  <option value="">Seleccionar entidad...</option>
                  {entities.map(e => <option key={e.id} value={e.id}>{e.name} ({e.type})</option>)}
                </select>
              </div>
            </section>

            {selectedEntityId ? (
              <>
                <div className={styles.toolbar}>
                   <div className={styles.filtersPanel}>
                    {[
                      { label: 'Moneda', key: 'currency', opts: [['', 'Todas'], ['ARS', 'ARS'], ['USD', 'USD']] },
                      { label: 'Tipo', key: 'doc_type', opts: [['', 'Todos'], ['INVOICE', 'Factura'], ['RECEIPT', 'Recibo'], ['CREDIT_NOTE', 'NC'], ['DEBIT_NOTE', 'ND']] },
                      { label: 'Estado', key: 'status', opts: [['', 'Todos'], ['OPEN', 'Abierto'], ['PARTIAL', 'Parcial'], ['CLOSED', 'Cerrado']] },
                    ].map(f => (
                      <div key={f.key} className={styles.field}>
                        <select className={styles.filterSelect} value={ledgerFilters[f.key]} 
                               onChange={e => setLedgerFilters({ ...ledgerFilters, [f.key]: e.target.value })}>
                          <option value="">{f.label} (Todos)</option>
                          {f.opts.slice(1).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                        </select>
                      </div>
                    ))}
                    <button 
                      className={styles.secondaryCta} 
                      onClick={() => {
                        const entityName = entities.find(e => e.id === selectedEntityId)?.name || 'Entidad';
                        downloadLedgerPdf(ledger, `Estado de Cuenta: ${entityName}`, `Filtros Aplicados: ${JSON.stringify(ledgerFilters)}`);
                      }}
                      style={{ padding: '8px 12px' }}
                    >
                      <Download size={16} /> PDF
                    </button>
                  </div>
                </div>

                <div className={styles.tableContainer}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Fecha</th><th>Tipo</th><th>Número</th><th>Moneda</th>
                        <th className={styles.num}>Total</th><th className={styles.num}>Aplicado</th><th className={styles.num}>Saldo</th>
                        <th>Estado</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map(doc => (
                        <tr key={doc.id} className={styles.tr}>
                          <td>{new Date(doc.date).toLocaleDateString()}</td>
                          <td>{doc.doc_type}</td>
                          <td style={{ fontWeight: 600 }}>{doc.number}</td>
                          <td>{doc.currency}</td>
                          <td className={styles.num}>{doc.total_amount.toLocaleString('es-AR')}</td>
                          <td className={styles.num}>{doc.applied_amount.toLocaleString('es-AR')}</td>
                          <td className={`${styles.num} ${doc.remaining > 0 ? styles.positive : ''}`}>
                            {doc.remaining.toLocaleString('es-AR')}
                            {doc.currency === 'USD' && (
                              <span className={styles.arsEquiv}>≈ ${doc.remaining_ars.toLocaleString('es-AR')} ARS</span>
                            )}
                          </td>
                          <td>
                            <span className={styles.statusTag} style={{ 
                              background: doc.status === 'OPEN' ? '#fffbeb' : (doc.status === 'CLOSED' ? '#f1f5f9' : '#fef9c3'),
                              color: doc.status === 'OPEN' ? '#92400e' : (doc.status === 'CLOSED' ? '#475569' : '#854d0e')
                            }}>
                              {doc.status}
                            </span>
                          </td>
                          <td>
                            <button onClick={() => { setSelectedDoc(doc); fetchApplications(doc.id); }} className={styles.secondaryCta} style={{ padding: 6 }}>
                              <Info size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className={styles.emptyState}>
                <Building size={48} />
                <p>Seleccione una entidad para ver su estado de cuenta corriente detallado.</p>
              </div>
            )}
          </>
        )}

        {/* --- CREATE TAB --- */}
        {activeTab === 'create' && (
          <div className={styles.formsGrid}>
            <div className={styles.card}>
              <h3><FileText size={20} /> Nuevo Comprobante Genérico</h3>
              <form onSubmit={handleCreateDocument} className={styles.formGrid}>
                <div className={styles.field}>
                  <label>Entidad:</label>
                  <select value={selectedEntityId} onChange={e => setSelectedEntityId(e.target.value)} required>
                    <option value="">Seleccionar...</option>
                    {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <label>Tipo Comprobante:</label>
                  <select value={newDoc.doc_type} onChange={e => setNewDoc({ ...newDoc, doc_type: e.target.value })}>
                    <option value="INVOICE">Factura</option>
                    <option value="DEBIT_NOTE">Nota de Débito</option>
                    <option value="CREDIT_NOTE">Nota de Crédito</option>
                    <option value="RECEIPT">Recibo</option>
                    <option value="PURCHASE_INVOICE">Factura de Compra / Gasto</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label>Número:</label>
                  <input value={newDoc.number} onChange={e => setNewDoc({ ...newDoc, number: e.target.value })} required />
                </div>
                <div className={styles.field}>
                  <label>Moneda:</label>
                  <select value={newDoc.currency} onChange={e => setNewDoc({ ...newDoc, currency: e.target.value })}>
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label>Tipo de Cambio:</label>
                  <input type="number" step="0.01" value={newDoc.exchange_rate} onChange={e => setNewDoc({ ...newDoc, exchange_rate: parseFloat(e.target.value) || 1 })} />
                </div>
                <div className={styles.field}>
                  <label>Línea (Sucursal):</label>
                  <select value={newDoc.line} onChange={e => setNewDoc({ ...newDoc, line: e.target.value })}>
                    <option value="L1">L1</option>
                    <option value="L2">L2</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label>C. Costo:</label>
                  <select value={newDoc.cost_center} onChange={e => setNewDoc({ ...newDoc, cost_center: parseInt(e.target.value) })}>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </div>

                <div className={styles.field} style={{ gridColumn: 'span 2' }}>
                  <label>Notas / Observaciones:</label>
                  <textarea value={newDoc.notes} onChange={e => setNewDoc({...newDoc, notes: e.target.value})} />
                </div>

                <div className={styles.linesBox} style={{ gridColumn: 'span 2' }}>
                  <label style={{ fontWeight: 700, display: 'block', marginBottom: 10 }}>Renglones de Detalle (Opcional)</label>
                  <div className={styles.lineInputRow}>
                    <input placeholder="Descripción" value={newLine.description} onChange={e => setNewLine({ ...newLine, description: e.target.value })} style={{ flex: 2 }} />
                    <input type="number" placeholder="Cant." value={newLine.qty} onChange={e => setNewLine({ ...newLine, qty: parseFloat(e.target.value) || 0 })} style={{ width: 80 }} />
                    <input type="number" placeholder="P. Unit" value={newLine.unit_price} onChange={e => setNewLine({ ...newLine, unit_price: parseFloat(e.target.value) || 0 })} style={{ width: 100 }} />
                    <button type="button" className={styles.primaryCta} onClick={handleAddLine} style={{ padding: '8px 12px' }}><Plus size={16} /></button>
                  </div>
                  
                  {docLines.length > 0 && (
                    <table className={styles.table} style={{ fontSize: '0.75rem' }}>
                      <thead><tr><th>Detalle</th><th>Cant</th><th>Subtotal</th><th></th></tr></thead>
                      <tbody>
                        {docLines.map((l, i) => (
                          <tr key={i}>
                            <td>{l.description}</td>
                            <td>{l.qty}</td>
                            <td>{fmt(l.total_amount, newDoc.currency)}</td>
                            <td><button type="button" onClick={() => setDocLines(docLines.filter((_, idx)=>idx!==i))}>×</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {docLines.length === 0 && (
                   <div className={styles.field} style={{ gridColumn: 'span 2' }}>
                    <label>Importe Total Manual:</label>
                    <input type="number" step="0.01" value={newDoc.total_amount} onChange={e => setNewDoc({ ...newDoc, total_amount: parseFloat(e.target.value) || 0 })} />
                  </div>
                )}

                <div style={{ gridColumn: 'span 2', marginTop: 20 }}>
                  <button type="submit" className={styles.primaryCta} style={{ width: '100%', justifyContent: 'center' }}>
                    Guardar Comprobante Contable
                  </button>
                </div>
              </form>
            </div>

            <div className={styles.card}>
              <h3><Download size={20} /> Guía de Uso</h3>
              <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.6 }}>
                Este módulo permite la carga de ajustes manuales, facturas de gastos varios o cobros que no pasan por el circuito comercial estándar de Ventas/Compras.
              </p>
              <ul style={{ fontSize: '0.875rem', color: '#64748b', paddingLeft: 20 }}>
                <li><b>Facturas (L1/L2):</b> Impactan en el debe de la cuenta.</li>
                <li><b>Recibos:</b> Impactan en el haber y permiten cancelar deuda.</li>
                <li><b>Diferencia de Cambio:</b> El sistema genera ajustes automáticos si detecta brecha entre TC de facturación y cobranza.</li>
              </ul>
            </div>
          </div>
        )}

        {/* --- VAT TAB --- */}
        {activeTab === 'vat' && (
          <div className={styles.vatSection}>
             <div className={styles.vatToolbar}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div className={styles.field} style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: 11 }}>Periodo:</label>
                        <select value={vatMonth} onChange={e => setVatMonth(parseInt(e.target.value))} className={styles.filterSelect}>
                            {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m,i)=>(
                                <option key={i} value={i+1}>{m}</option>
                            ))}
                        </select>
                    </div>
                    <div className={styles.field} style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: 11 }}>Año:</label>
                        <input type="number" value={vatYear} onChange={e => setVatYear(e.target.value)} style={{ width: 80 }} className={styles.filterSelect} />
                    </div>
                    <div className={styles.toggleGroup}>
                        <button className={vatCategory === 'sales' ? styles.activeToggle : ''} onClick={() => setVatCategory('sales')}>Ventas</button>
                        <button className={vatCategory === 'purchases' ? styles.activeToggle : ''} onClick={() => setVatCategory('purchases')}>Compras</button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                    <label className={styles.primaryCta} style={{ cursor: 'pointer' }}>
                        <BarChart3 size={18} /> Conciliar ARCA (CSV)
                        <input type="file" hidden accept=".csv" onChange={handleAFIPUpload} />
                    </label>
                    <button className={styles.secondaryCta} onClick={() => downloadVatPdf(vatData, `LIBRO IVA ${vatCategory.toUpperCase()}`, `${vatMonth}/${vatYear}`)}>
                        <Download size={18} /> Exportar
                    </button>
                </div>
             </div>

             {conciliating && comparison && (
                <div className={styles.concilioPanel}>
                    <div className={styles.concilioHeader}>
                        <h3>Resultados de Conciliación ARCA</h3>
                        <button onClick={() => setConciliating(false)} className={styles.iconBtn}>×</button>
                    </div>
                    <div className={styles.concilioGrid}>
                        <div className={styles.concilioStat}>
                            <span className={styles.cLabel}>Coinciden</span>
                            <span className={styles.cValue} style={{ color: '#10b981' }}>{comparison.matches.length}</span>
                        </div>
                        <div className={styles.concilioStat}>
                            <span className={styles.cLabel}>Discrepancias</span>
                            <span className={styles.cValue} style={{ color: '#ef4444' }}>{comparison.errors.length}</span>
                        </div>
                        <div className={styles.concilioStat}>
                            <span className={styles.cLabel}>Solo en Sistema</span>
                            <span className={styles.cValue} style={{ color: '#f59e0b' }}>{comparison.onlyInSystem.length}</span>
                        </div>
                    </div>
                    <div className={styles.concilioList}>
                        {comparison.errors.map((err, i) => (
                            <div key={i} className={styles.concilioItem}>
                                <div className={styles.cDocInfo}>
                                    <strong>{err.arca.number}</strong>
                                    <span>{err.arca.date} - {err.arca.type}</span>
                                </div>
                                <div className={styles.cErrorDetail}>
                                    {err.reason === 'missing_in_system' ? (
                                        <span style={{ color: '#dc2626', fontWeight: 600 }}>Falta en Sistema</span>
                                    ) : (
                                        <span style={{ color: '#ea580c', fontWeight: 600 }}>Dif. Monto: ARCA {fmt(err.arca.total)} vs SIS {fmt(err.sys.total_amount)}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
             )}

             <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Fecha</th><th>Tipo</th><th>Número</th><th>Entidad</th>
                            <th className={styles.num}>Neto</th><th className={styles.num}>IVA</th>
                            <th className={styles.num}>Total</th><th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.isArray(vatData) && vatData.length > 0 ? (
                            vatData.map(v => (
                                <tr key={v.id} className={styles.tr}>
                                    <td>{v.date}</td>
                                    <td>{v.doc_type}</td>
                                    <td style={{ fontWeight: 600 }}>{v.number}</td>
                                    <td>{v.entity_name}</td>
                                    <td className={styles.num}>{fmt(v.total_net, v.currency)}</td>
                                    <td className={styles.num}>{fmt(v.total_vat, v.currency)}</td>
                                    <td className={styles.num}><strong>{fmt(v.total_amount, v.currency)}</strong></td>
                                    <td><button className={styles.secondaryCta} style={{ padding: 6 }} onClick={() => openDocInWindow(v)}><Eye size={14} /></button></td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>No se encontraron comprobantes para el período seleccionado.</td></tr>
                        )}
                    </tbody>
                </table>
             </div>
          </div>
        )}

      </div>

      {/* --- MODAL DETALLE APLICACIONES --- */}
      {selectedDoc && (
        <div className={styles.modalOverlay} onClick={() => setSelectedDoc(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
             <div className={styles.modalHeader}>
              <h3>Vínculos de {selectedDoc.doc_type} {selectedDoc.number}</h3>
              <button className={styles.modalClose} onClick={() => setSelectedDoc(null)}><Plus size={24} style={{ transform: 'rotate(45deg)' }} /></button>
            </div>
            <div className={styles.modalBody}>
               <table className={styles.table}>
                  <thead>
                    <tr><th>Fecha Aplic.</th><th>Vencimiento</th><th>Monto Aplicado</th><th>Equiv. ARS</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {applications.length === 0 ? (
                      <tr><td colSpan="5" className={styles.emptyState}>Sin aplicaciones registradas.</td></tr>
                    ) : applications.map(app => (
                      <tr key={app.id}>
                        <td>{new Date(app.created_at).toLocaleDateString()}</td>
                        <td>{app.to_document_number || 'S/N'}</td>
                        <td className={styles.num}>{app.amount_applied.toLocaleString('es-AR')}</td>
                        <td className={styles.num}>$ {app.amount_applied_ars.toLocaleString('es-AR')}</td>
                        <td>
                          <button onClick={() => setFxAppId(app.id)} className={styles.secondaryCta} style={{ padding: '4px 8px', fontSize: 10 }}>
                            Diferencia Cambio
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
               </table>
            </div>
          </div>
        </div>
      )}

      {/* FX Adjustment Modal integration */}
      {fxAppId && (
        <FxAdjustmentModal
          applicationId={fxAppId}
          onClose={() => setFxAppId(null)}
          onConfirmed={() => { setFxAppId(null); fetchLedger(); fetchGlobalJournal(); }}
        />
      )}
    </div>
  );
}

