import { useState, useEffect, useMemo } from "react";
import {
  Search,
  Filter,
  Plus,
  FileText,
  ChevronDown,
  ChevronUp,
  Eye,
  Trash2,
  X,
  Edit,
  Download,
  TrendingUp,
  Clock,
  CheckCircle,
  BadgeDollarSign,
  Activity,
  Calendar,
  XCircle,
  Mail,
  Send,
  RefreshCcw,
  LayoutGrid,
  PlusCircle,
  ArrowUpRight
} from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { navigateToError } from '../../utils/errorNavigation';
import { openStandaloneWindow } from '../../utils/openStandaloneWindow';
import ContentHeader from "../../components/layout/ContentHeader";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import StatusBadge from "../../components/ui/StatusBadge";
import { useWindow } from "../../context/WindowContext";
import { useToast } from "../../context/ToastContext";
import { API_URL } from "../../config";
import api from '../../services/api';
import s from "../../components/layout/DocumentListPage.module.css";
import DocumentListPage from "../../components/layout/DocumentListPage";
// eslint-disable-next-line no-unused-vars
import { TableRowSkeleton } from "../../components/ui/TableSkeleton";
import ErrorState from "../../components/ui/ErrorState";
import EmptyState from "../../components/ui/EmptyState";


export default function CreditNotesPage() {
  const [invoices, setInvoices] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hideCancelled, setHideCancelled] = useState(true);
  const [sortBy, setSortBy] = useState("date"); // Default to Date for premium feel
  const [sortDir, setSortDir] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  const [showFilters, setShowFilters] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showCreationModal, setShowCreationModal] = useState(false);
  
  const { openWindow } = useWindow();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleBulkEmail = async () => {
    if (selectedInvoices.length === 0) return;
    setSendingEmail(true);
    try {
        const results = await api.post('/accounting/documents/bulk-email', {
            document_ids: selectedInvoices
        });
        
        const ok = results.filter(r => r.status === 'ok').length;
        const err = results.filter(r => r.status === 'error').length;
        
        if (err === 0) {
            showToast(`Se enviaron ${ok} nota de créditos correctamente.`, 'success');
        } else {
            showToast(`${ok} enviadas, ${err} fallaron. Revise los filtros de email.`, 'warning');
        }
        setSelectedInvoices([]);
        fetchInvoices(); // Refresh for history update
    } catch (err) {
        console.error(err);
        showToast("Error al procesar envío masivo: " + err.message, "error");
    } finally {
        setSendingEmail(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
    fetchEntities();

    const handleRefresh = () => fetchInvoices();
    window.addEventListener("invoice-changed", handleRefresh);
    window.addEventListener("cost-center-changed", handleRefresh);
    
    return () => {
      window.removeEventListener("invoice-changed", handleRefresh);
      window.removeEventListener("cost-center-changed", handleRefresh);
    };
  }, []);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get('/accounting/documents/');
      const filteredDocs = data.filter((d) => d.doc_type === "CREDIT_NOTE");
      setInvoices(filteredDocs);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchEntities = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`${API_URL}/entities/`, { headers });
      const data = await res.json();
      setEntities(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setEntities([]);
    }
  };

  const entityName = (id) =>
    entities.find((e) => e.id === id)?.name || `ID: ${id}`;

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (hideCancelled && inv.status === "CANCELLED") return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesSearch =
          String(inv.number).toLowerCase().includes(q) ||
          entityName(inv.entity_id).toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      if (
        selectedEntityId &&
        String(inv.entity_id) !== String(selectedEntityId)
      )
        return false;
      if (selectedStatus && inv.status !== selectedStatus) return false;
      if (filterCurrency && inv.currency !== filterCurrency) return false;

      if (dateFrom && inv.date < dateFrom) return false;
      if (dateTo && inv.date > dateTo) return false;

      return true;
    });
  }, [
    invoices,
    search,
    selectedEntityId,
    selectedStatus,
    filterCurrency,
    dateFrom,
    dateTo,
    hideCancelled,
    entities,
  ]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va = a[sortBy];
      let vb = b[sortBy];

      if (sortBy === "entity_id") {
        va = entityName(a.entity_id);
        vb = entityName(b.entity_id);
      }

      if (sortBy === "number") {
        va = parseInt(String(a.number).replace(/\D/g, "") || 0);
        vb = parseInt(String(b.number).replace(/\D/g, "") || 0);
        return sortDir === "asc" ? va - vb : vb - va;
      }

      if (sortBy === "date" || sortBy === "due_date") {
        va = new Date(va || 0).getTime();
        vb = new Date(vb || 0).getTime();
        return sortDir === "asc" ? va - vb : vb - va;
      }

      if (typeof va === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [filtered, sortBy, sortDir, entities]);

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthDocs = invoices.filter(inv => {
      const d = new Date(inv.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear && inv.status !== 'CANCELLED';
    });

    const pendingDocs = invoices.filter(inv => inv.status === 'OPEN' || inv.status === 'PARTIAL');

    return {
      monthTotal: monthDocs.reduce((acc, inv) => acc + Number(inv.total_amount || 0), 0),
      monthCount: monthDocs.length,
      pendingTotal: pendingDocs.reduce((acc, inv) => acc + Number(inv.total_amount || 0), 0),
      pendingCount: pendingDocs.length,
      totalCount: invoices.filter(inv => inv.status !== 'CANCELLED').length
    };
  }, [invoices]);

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortDir("desc");
    }
  };

  const hasActiveFilters = Boolean(
    search.trim() ||
    selectedEntityId ||
    selectedStatus ||
    filterCurrency ||
    dateFrom ||
    dateTo
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [
    hasActiveFilters,
    search,
    selectedEntityId,
    selectedStatus,
    filterCurrency,
    dateFrom,
    dateTo,
    hideCancelled,
  ]);

  const clearFilters = () => {
    setSearch("");
    setSelectedEntityId("");
    setSelectedStatus("");
    setFilterCurrency("");
    setDateFrom("");
    setDateTo("");
  };

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginatedData = useMemo(() => {
    return sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [sorted, currentPage, pageSize]);

  const handleOpenNew = () => {
    openStandaloneWindow('/standalone/notas-credito/nueva');
  };

  const handleAnnul = async (e, id, number) => {
    if (e) e.stopPropagation();
    const reason = window.prompt(`¿Por qué deseas anular el comprobante ${number}? (Opcional)`);
    if (reason === null) return; // Cancelled prompt

    setLoading(true);
    try {
      const resp = await api.post(`/accounting/documents/${id}/annul`, { reason });
      if (resp.ok || resp.status === 'ok') {
        showToast(`Documento ${number} anulado correctamente`, "success");
        fetchInvoices();
        window.dispatchEvent(new Event('document-changed'));
      } else {
        showToast(resp.detail || "Error al anular", "error");
      }
    } catch (err) {
      showToast("Error de conexión", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetail = (id, number) => {
    openStandaloneWindow(`/standalone/notas-credito/${id}`);
  };

  const fmt = (val, cur = 'ARS') => {
    return new Intl.NumberFormat('es-AR', { 
        style: 'currency', 
        currency: cur === 'USD' ? 'USD' : 'ARS',
        minimumFractionDigits: 2 
    }).format(val || 0);
  };

  const kpis = [
    {
      title: "Nota de Créditodo Mes",
      value: fmt(stats.monthTotal),
      subtitle: `${stats.monthCount} comprobantes hoy`,
      icon: TrendingUp,
      type: "primary"
    },
    {
      title: "Pendiente Cobro",
      value: fmt(stats.pendingTotal),
      subtitle: `${stats.pendingCount} nota de créditos abiertas`,
      icon: Clock,
      type: "warning"
    },
    {
      title: "Cobrado Histórico",
      value: fmt(invoices.filter(i => i.status === 'CLOSED').reduce((acc, i) => acc + Number(i.total_amount || 0), 0)),
      subtitle: "Total histórico cobrado",
      icon: CheckCircle,
      type: "success"
    },
    {
      title: "Total Vigentes",
      value: stats.totalCount,
      subtitle: `Resultados: ${filtered.length}`,
      icon: LayoutGrid,
      type: "neutral"
    }
  ];

  const toolbar = {
    search: (
      <div className={s.searchWrap}>
        <Search className={s.searchIcon} size={20} />
        <input
          type="text"
          placeholder="Filtrar por número, cliente o importe..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && <button className={s.inputClear} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }} onClick={() => setSearch("")}><X size={16} /></button>}
      </div>
    ),
    filtersToggle: (
      <button 
        type="button" 
        className={`${s.filterToggle} ${showFilters || hasActiveFilters ? s.active : ""}`}
        onClick={() => setShowFilters(!showFilters)}
      >
        <Filter size={18} />
        Filtros
        {hasActiveFilters && <span className={s.filterDot} />}
      </button>
    ),
    actions: (
      <>
        {selectedInvoices.length > 0 && (
            <button 
                disabled={sendingEmail}
                onClick={handleBulkEmail}
                className={s.ghostBtn}
            >
                {sendingEmail ? <RefreshCcw size={16} className={s.spin} /> : <Send size={16} />}
                {sendingEmail ? "ENVIANDO..." : `ENVIAR ${selectedInvoices.length} POR EMAIL`}
            </button>
        )}
        <button className={s.ghostBtn} title="Próximamente">Exportar</button>
        <button className={s.ghostBtn} title="Próximamente">Columnas</button>
        <button className={s.ghostBtn} style={{ color: '#ef4444' }} onClick={clearFilters} title="Limpiar Filtros">Limpiar</button>
        <button className={s.primaryCta} onClick={handleOpenNew}>
            <PlusCircle size={16} />
            Nueva Nota de Crédito
        </button>
      </>
    ),
    filtersArea: showFilters && (
      <div className={s.compactFiltersRow}>
          <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className={s.filterSelect}>
            <option value="">Estado: Todos</option>
            <option value="OPEN">📌 Pendiente de cobro</option>
            <option value="PARTIAL">🔶 Cobro Parcial</option>
            <option value="CLOSED">✅ Cobrada / Cerrada</option>
            <option value="CANCELLED">❌ Anulada</option>
          </select>
          <select value={selectedEntityId} onChange={(e) => setSelectedEntityId(e.target.value)} className={s.filterSelect}>
            <option value="">Cliente: Todos</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <select value={filterReason} onChange={(e) => setFilterReason(e.target.value)} className={s.filterSelect}>
            <option value="">Tipo: Todas</option>
            <option value="COMMON">Comunes</option>
            <option value="RETURN">Devolución</option>
            <option value="DISCOUNT">Bonificación</option>
            <option value="BILLING_ERROR">Error de facturación</option>
            <option value="EXCHANGE_DIFFERENCE">Diferencia de Cambio</option>
            <option value="COMMERCIAL_ADJUSTMENT">Ajuste comercial</option>
            <option value="OTHER">Otro</option>
          </select>
          <select value={filterCurrency} onChange={(e) => setFilterCurrency(e.target.value)} className={s.filterSelect}>
            <option value="">Moneda: Todas</option>
            <option value="USD">💵 Dólares (USD)</option>
            <option value="ARS">🇦🇷 Pesos (ARS)</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>Desde</span>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={s.dateInput} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>Hasta</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={s.dateInput} />
          </div>
          <label className={s.toggleLabel} style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
              <div className={`${s.switch} ${!hideCancelled ? s.active : ""}`}>
                  <input type="checkbox" checked={!hideCancelled} onChange={() => setHideCancelled(!hideCancelled)} />
                  <div className={s.slider} />
              </div>
              <span className={s.toggleText} style={{ fontSize: '10px' }}>Incluir Anuladas</span>
          </label>
      </div>
    )
  };

  const table = {
    columns: (
      <>
        <th className={s.th} style={{ width: 40, padding: '0 12px' }}>
          <input 
              type="checkbox" 
              onChange={(e) => setSelectedInvoices(e.target.checked ? paginatedData.map(i => i.id) : [])}
              checked={selectedInvoices.length > 0 && selectedInvoices.length === paginatedData.length}
              style={{ cursor: 'pointer', width: 18, height: 18, accentColor: 'var(--primary)' }}
          />
        </th>
        <th className={s.th} onClick={() => toggleSort('number')} style={{ cursor: 'pointer' }}>Nº COMPROBANTE</th>
        <th className={s.th} onClick={() => toggleSort('date')} style={{ cursor: 'pointer' }}>FECHA</th>
        <th className={s.th} onClick={() => toggleSort('entity_id')} style={{ cursor: 'pointer' }}>CLIENTE</th>
        <th className={s.th}>VENCIMIENTO</th>
        <th className={s.th} style={{ textAlign: 'right' }} onClick={() => toggleSort('total_amount')}>TOTAL</th>
        <th className={s.th} style={{ textAlign: 'center' }}>ESTADO</th>
        <th className={s.th} style={{ textAlign: 'right' }}>ACCIONES</th>
      </>
    ),
    body: loading ? (
        <TableRowSkeleton rows={8} cols={8} />
    ) : error ? (
        <tr><td colSpan="8"><ErrorState message={error} onRetry={fetchInvoices} /></td></tr>
    ) : sorted.length === 0 ? (
      <tr>
        <td colSpan="8">
          <EmptyState 
              icon={Search} 
              title={hasActiveFilters ? "Sin resultados" : "Sin nota de créditos registradas"}
              description={hasActiveFilters ? "Probá ajustando los filtros de búsqueda." : "Comenzá creando tu primera nota de crédito de venta."}
              actionLabel={!hasActiveFilters ? "Nueva Nota de Crédito" : null}
              onAction={!hasActiveFilters ? handleOpenNew : null}
          />
        </td>
      </tr>
    ) : (
      paginatedData.map((inv) => (
        <tr key={inv.id} className={`${s.row} ${selectedInvoices.includes(inv.id) ? s.rowSelected : ""}`} onClick={() => handleOpenDetail(inv.id, inv.number)}>
          <td className={s.td} onClick={(e) => e.stopPropagation()} style={{ width: 40, padding: '0 12px' }}>
            <input 
                type="checkbox"
                checked={selectedInvoices.includes(inv.id)}
                onChange={(e) => {
                    setSelectedInvoices(prev => prev.includes(inv.id) ? prev.filter(x => x !== inv.id) : [...prev, inv.id]);
                }}
                style={{ cursor: 'pointer', width: 17, height: 17, accentColor: 'var(--primary)' }}
            />
          </td>
          <td className={`${s.td} ${s.numberCell}`}>{inv.number}</td>
          <td className={s.td} style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>
            {new Date(inv.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
          </td>
          <td className={s.td} style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{inv.entity_name || entityName(inv.entity_id)}</td>
          <td className={s.td} style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {inv.due_date ? new Date(inv.due_date).toLocaleDateString('es-AR') : '-'}
          </td>
          <td className={`${s.td} ${s.totalCell}`}>
            <span className={s.currencyLabel}>{inv.currency}</span>
            {Number(inv.total_amount)?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </td>
          <td className={s.td} style={{ textAlign: 'center', width: 200 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <StatusBadge status={
                    inv.status === "OPEN" ? "PENDIENTE" :
                    inv.status === "PARTIAL" ? "EN PROCESO" :
                    inv.status === "CLOSED" ? "COMPLETADO" :
                    inv.status === "CANCELLED" ? "ANULADO" :
                    inv.status
                } />
            </div>
          </td>
          <td className={s.td} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button 
                onClick={(e) => { e.stopPropagation(); window.open(`/standalone/notas-credito/nueva?nota de crédito_id=${inv.id}`, `nota-debito-nota de crédito-${inv.id}`, 'width=1280,height=820,left=100,top=100'); }} 
                style={{ all: 'unset', cursor: 'pointer', opacity: 0.6 }} 
                title="Crear Nota de Crédito"
              >
                <PlusCircle size={18} />
              </button>
              {inv.attachment_url && (
                <button onClick={() => setPreviewUrl(inv.attachment_url)} style={{ all: 'unset', cursor: 'pointer', opacity: 0.4 }} title="Ver Adjunto">
                  <Eye size={18} />
                </button>
              )}
              {inv.status !== 'CANCELLED' && (
                <button onClick={(e) => handleAnnul(e, inv.id, inv.number)} style={{ all: 'unset', cursor: 'pointer', color: '#ef4444', opacity: 0.7 }} title="Anular Nota de Crédito">
                  <Trash2 size={18} />
                </button>
              )}
              <button onClick={() => handleOpenDetail(inv.id, inv.number)} style={{ all: 'unset', cursor: 'pointer', color: 'var(--accent-indigo)' }} title="Consultar Registro">
                <ArrowUpRight size={18} />
              </button>
            </div>
          </td>
        </tr>
      ))
    )
  };

  const pagination = {
    infoText: `REPORTE: ${filtered.length} NOTA DE DÉBITOS LOCALIZADAS`,
    totalPages: totalPages,
    currentPage: currentPage,
    onPageChange: setCurrentPage
  };

  return (
    <>
      <DocumentListPage 
        title="Libro de Notas de Crédito"
        breadcrumbs={[{ label: 'Suite Comercial' }, { label: 'Notas de Crédito' }]}
        kpis={kpis}
        toolbar={toolbar}
        table={table}
        pagination={pagination}
      />
      
      {/* Document View Overlay */}
      {previewUrl && (
          <div className={s.previewOverlay} onClick={() => setPreviewUrl(null)}>
              <div className={s.previewContent} onClick={e => e.stopPropagation()}>
                  <div className={s.previewHeader}>
                      <h3>VISTA PREVIA DEL DOCUMENTO</h3>
                      <button className={s.closePreview} onClick={() => setPreviewUrl(null)}><X size={20} /></button>
                  </div>
                  <div className={s.previewBody}>
                      {previewUrl.toLowerCase().endsWith('.pdf') ? (
                          <iframe src={previewUrl} className={s.previewFrame} title="Documento PDF" />
                      ) : (
                          <img src={previewUrl} alt="Comprobante" className={s.previewImage} />
                      )}
                  </div>
              </div>
          </div>
      )}
    </>
  );
}
