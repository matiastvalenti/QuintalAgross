import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  RefreshCw, DollarSign, Wallet, Calculator, ChevronDown, ChevronRight, Printer, Download, ArrowLeft
} from "lucide-react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import { useToast } from "../../../context/ToastContext";
import api from "../../../services/api";
import { openStandaloneWindow } from "../../../utils/openStandaloneWindow";

const DOC_TYPE_LABELS = {
    'INVOICE': 'Factura',
    'DEBIT_NOTE': 'Nota de Débito',
    'CREDIT_NOTE': 'Nota de Crédito',
    'FCE_MIPYME': 'Factura'
};

const STATUS_LABELS = {
    'PENDING': 'Pendiente',
    'PAID': 'Pagado',
    'PARCIAL': 'Parcial',
    'AVAILABLE': 'Disponible',
    'DISPONIBLE': 'Disponible',
    'NO DISPONIBLE': 'No disponible'
};

const MODE_LABELS = {
    'BY_COLLECTION': 'Sobre cobranza',
    'BY_MARGIN': 'Por margen',
    'BY_CASH': 'Sobre efectivo cobrado'
};

const RATE_LABELS = {
    'INVOICE_RATE': 'TC factura',
    'COLLECTION_RATE': 'TC cobro',
    'PAYMENT_RATE': 'TC liquidación'
};

export default function SellerCommissionStandalone() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  
  const [expandedInvoice, setExpandedInvoice] = useState(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [settleLoading, setSettleLoading] = useState(false);
  
  const [selectedLedgerItems, setSelectedLedgerItems] = useState([]);
  const [activeTab, setActiveTab] = useState('RESUMEN'); // RESUMEN, GENERADAS, REMITOS, LIQUIDACIONES, APLICACIONES

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/commissions/sellers/${id}/detail`);
      setData(res);
    } catch (err) {
      console.error(err);
      showToast("Error al cargar detalle del vendedor", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id]);

  const handleRecalc = async () => {
    setRecalcLoading(true);
    try {
      const res = await api.post(`/commissions/recalc-tc?seller_id=${id}`);
      showToast(`Recálculo exitoso (TC: ${res.tc_used})`, "success");
      fetchDetail();
    } catch (err) {
      showToast("Error al recalcular", "error");
    } finally {
      setRecalcLoading(false);
    }
  };

  const handleSettle = async (type = "ALL") => {
    const amount = type === "ALL" ? data?.kpis?.commission_available_usd - data?.kpis?.commission_paid_usd : 0; // TODO: Sum selected
    if (amount <= 0) {
        showToast("No hay saldo disponible para liquidar.", "warning");
        return;
    }
    if (!window.confirm(`¿Confirmas la liquidación de ${fmt(amount, data?.seller?.commission_currency)}?`)) return;
    
    setSettleLoading(true);
    try {
      await api.post(`/commissions/settle`, {
        seller_id: id,
        currency: data?.seller?.commission_currency || "USD",
        amount_usd: amount,
        amount_ars: 0, 
      });
      showToast("Comisión liquidada", "success");
      fetchDetail();
    } catch (err) {
      showToast("Error al liquidar", "error");
    } finally {
      setSettleLoading(false);
    }
  };

  const fmt = (val, cur = "USD") => {
    if (!val && val !== 0) return cur === "ARS" ? "$ 0.00" : "USD 0.00";
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: cur }).format(val);
  };

  const buildSellerCommissionLedger = (applications, settlements, invoices) => {
      const ledger = [];
      
      applications.forEach(app => {
          const inv = invoices.find(i => i.id === app.document_id);
          const invNumber = inv ? `${inv.doc_type} ${inv.number}` : 'Documento';

          ledger.push({
              id: `app_${app.id}`,
              date: app.date,
              type: 'APP',
              concept: `Comisión ${invNumber}`,
              a_favor: app.commission_amount_usd,
              pagado: 0,
              ref_id: app.id
          });
      });

      settlements.forEach(sett => {
          ledger.push({
              id: `sett_${sett.id}`,
              date: sett.date,
              type: sett.is_advance ? 'ADVANCE' : 'SETTLEMENT',
              concept: sett.is_advance ? 'Adelanto de Comisión' : 'Liquidación de Comisión',
              a_favor: 0,
              pagado: sett.amount_usd,
              ref_id: sett.id
          });
      });

      ledger.sort((a, b) => new Date(a.date) - new Date(b.date));

      let balance = 0;
      ledger.forEach(item => {
          balance = balance + item.a_favor - item.pagado;
          item.balance = balance;
      });

      return ledger.reverse();
  };

  const ledgerData = useMemo(() => {
      if (!data) return [];
      return buildSellerCommissionLedger(data.applications, data.settlements, data.invoices);
  }, [data]);

  const estimatedPendingCommission = useMemo(() => {
      if (!data) return 0;
      return data.delivery_notes_pending.reduce((acc, dn) => {
          return acc + (dn.total * (data.seller.commission_pct / 100));
      }, 0);
  }, [data]);

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
          <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto', marginBottom: '16px', color: 'var(--primary)' }} />
          <div>Cargando detalle...</div>
        </div>
      </div>
    );
  }

  if (!data) return <div>No se pudo cargar el vendedor.</div>;

  const { seller, kpis, invoices, delivery_notes_pending, settlements, applications } = data;
  const cur = seller.commission_currency || "USD";

  const toggleInvoice = (id) => {
      if (expandedInvoice === id) setExpandedInvoice(null);
      else setExpandedInvoice(id);
  };

  const tabs = [
    { id: 'RESUMEN', label: 'Resumen de Cuenta' },
    { id: 'GENERADAS', label: 'Comisiones Generadas' },
    { id: 'REMITOS', label: 'Remitos Pendientes' },
    { id: 'LIQUIDACIONES', label: 'Liquidaciones' },
    { id: 'APLICACIONES', label: 'Aplicaciones (Técnico)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f1f5f9', overflow: 'hidden' }}>
      
      {/* HEADER */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Button variant="outline" icon={<ArrowLeft size={16} />} iconOnly onClick={() => navigate(-1)} />
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Resumen de Cuenta del Vendedor
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              {seller.name}
            </h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#64748b', background: '#f8fafc', padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <span>Modalidad: <strong style={{ color: '#0f172a' }}>{MODE_LABELS[seller.commission_mode] || seller.commission_mode}</strong></span>
            <span>% Base: <strong style={{ color: '#0f172a' }}>{seller.commission_pct}%</strong></span>
            <span>TC: <strong style={{ color: '#0f172a' }}>{RATE_LABELS[seller.commission_exchange_mode] || 'TC factura'}</strong></span>
            <span>Moneda: <strong style={{ color: '#0f172a' }}>{cur}</strong></span>
        </div>
      </div>

      {/* KPIs SUPERIORES */}
      <div style={{ padding: '24px 24px 0 24px', flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
          <div style={{ background: 'white', padding: '16px 20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Comisión Generada</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>{fmt(kpis.commission_generated_usd, cur)}</div>
          </div>
          <div style={{ background: 'white', padding: '16px 20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#10b981', textTransform: 'uppercase' }}>Disponible para Liquidar</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#059669', marginTop: '4px' }}>{fmt(kpis.commission_available_usd, cur)}</div>
          </div>
          <div style={{ background: 'white', padding: '16px 20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Comisión Pagada</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#475569', marginTop: '4px' }}>{fmt(kpis.commission_paid_usd, cur)}</div>
          </div>
          <div style={{ background: 'white', padding: '16px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', borderTop: '4px solid #f59e0b' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#b45309', textTransform: 'uppercase' }}>Saldo Pendiente</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#d97706', marginTop: '4px' }}>{fmt(kpis.commission_pending_usd, cur)}</div>
          </div>
          <div style={{ background: 'white', padding: '16px 20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#3b82f6', textTransform: 'uppercase' }}>Remitos Pendientes</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#2563eb', marginTop: '4px' }}>{delivery_notes_pending.length}</div>
          </div>
        </div>
      </div>

      {/* TABS Y CONTENIDO */}
      <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            
            {/* TABS HEADER */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 8px', background: '#f8fafc', flexShrink: 0 }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: '16px 20px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                            color: activeTab === tab.id ? 'var(--primary)' : '#64748b',
                            fontWeight: activeTab === tab.id ? 600 : 500,
                            fontSize: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* TAB CONTENT (SCROLLABLE AREA) */}
            <div style={{ flex: 1, overflowY: 'auto', background: 'white' }}>
                
                {/* ───────────────────────────────────────────────────────── */}
                {/* 1. RESUMEN DE CUENTA */}
                {/* ───────────────────────────────────────────────────────── */}
                {activeTab === 'RESUMEN' && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'white', zIndex: 1, boxShadow: '0 1px 0 #e2e8f0' }}>
                            <tr>
                                <th style={{ padding: '12px 20px', width: '40px' }}>
                                    <input type="checkbox" style={{ accentColor: 'var(--primary)' }} />
                                </th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Fecha</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Concepto</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#0f172a', textTransform: 'uppercase', textAlign: 'right' }}>A Favor (Debe)</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#0f172a', textTransform: 'uppercase', textAlign: 'right' }}>Pagado / Desc. (Haber)</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#0f172a', textTransform: 'uppercase', textAlign: 'right' }}>Saldo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ledgerData.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No hay movimientos en la cuenta.</td></tr>
                            ) : ledgerData.map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '12px 20px' }}>
                                        {item.type === 'APP' && (
                                            <input 
                                                type="checkbox" 
                                                style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedLedgerItems(prev => [...prev, item.ref_id]);
                                                    else setSelectedLedgerItems(prev => prev.filter(i => i !== item.ref_id));
                                                }}
                                                checked={selectedLedgerItems.includes(item.ref_id)}
                                            />
                                        )}
                                    </td>
                                    <td style={{ padding: '12px 20px', color: '#64748b', fontSize: '13px' }}>{item.date ? item.date.substring(0,10) : ''}</td>
                                    <td style={{ padding: '12px 20px', fontWeight: 500, color: '#334155', fontSize: '13px' }}>{item.concept}</td>
                                    <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: item.a_favor > 0 ? 600 : 400, color: item.a_favor > 0 ? '#0f172a' : '#94a3b8', fontSize: '13px' }}>
                                        {fmt(item.a_favor, cur)}
                                    </td>
                                    <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: item.pagado > 0 ? 600 : 400, color: item.pagado > 0 ? '#ef4444' : '#94a3b8', fontSize: '13px' }}>
                                        {fmt(item.pagado, cur)}
                                    </td>
                                    <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 600, color: item.balance > 0 ? '#d97706' : '#10b981', fontSize: '13px' }}>
                                        {fmt(item.balance, cur)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* ───────────────────────────────────────────────────────── */}
                {/* 2. COMISIONES GENERADAS */}
                {/* ───────────────────────────────────────────────────────── */}
                {activeTab === 'GENERADAS' && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'white', zIndex: 1, boxShadow: '0 1px 0 #e2e8f0' }}>
                            <tr>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Fecha</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Documento</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Cliente</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Total Factura</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#0f172a', textTransform: 'uppercase', textAlign: 'right' }}>Com. Total</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#10b981', textTransform: 'uppercase', textAlign: 'right' }}>Disponible</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Pagada</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase', textAlign: 'right' }}>Saldo</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'center' }}>Estado</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'center' }}>Acciones</th>
                                <th style={{ padding: '12px 20px', width: '40px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.length === 0 ? (
                                <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No hay facturas que generen comisión.</td></tr>
                            ) : invoices.map(inv => {
                                const isExpanded = expandedInvoice === inv.id;
                                const saldo = inv.comm_generated_usd - inv.comm_paid_usd;
                                let statusColor = "neutral";
                                if (inv.comm_status === "DISPONIBLE") statusColor = "success";
                                if (inv.comm_status === "PENDIENTE") statusColor = "warning";
                                if (inv.comm_status === "PARCIAL") statusColor = "info";

                                return (
                                    <React.Fragment key={inv.id}>
                                        <tr 
                                            style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: isExpanded ? '#f8fafc' : 'transparent' }}
                                            onClick={() => toggleInvoice(inv.id)}
                                        >
                                            <td style={{ padding: '12px 20px', color: '#64748b', fontSize: '13px' }}>{inv.date ? inv.date.substring(0,10) : ''}</td>
                                            <td style={{ padding: '12px 20px', fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (inv.doc_type === 'INVOICE' || inv.doc_type === 'FCE_MIPYME') openStandaloneWindow(`/standalone/facturas/${inv.id}`);
                                                        else if (inv.doc_type === 'DEBIT_NOTE') openStandaloneWindow(`/standalone/notas-debito/${inv.id}`);
                                                        else if (inv.doc_type === 'CREDIT_NOTE') openStandaloneWindow(`/standalone/notas-credito/${inv.id}`);
                                                    }}
                                                    style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, fontWeight: 600, fontSize: '13px', textDecoration: 'underline' }}
                                                >
                                                    {DOC_TYPE_LABELS[inv.doc_type] || inv.doc_type} {inv.number}
                                                </button>
                                            </td>
                                            <td style={{ padding: '12px 20px', fontSize: '13px', color: '#334155' }}>{inv.client_name}</td>
                                            <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: '13px', color: '#64748b' }}>{fmt(inv.total_usd, "USD")}</td>
                                            <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>{fmt(inv.comm_generated_usd, cur)}</td>
                                            <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 600, color: '#10b981', fontSize: '13px' }}>{fmt(inv.comm_available_usd, cur)}</td>
                                            <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: '13px', color: '#64748b' }}>{fmt(inv.comm_paid_usd, cur)}</td>
                                            <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 600, color: saldo > 0 ? '#d97706' : '#64748b', fontSize: '13px' }}>{fmt(saldo, cur)}</td>
                                            <td style={{ padding: '12px 20px', textAlign: 'center' }}><Badge type={statusColor}>{STATUS_LABELS[inv.comm_status] || inv.comm_status}</Badge></td>
                                            <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                                                <Button variant="outline" size="sm" onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (inv.doc_type === 'INVOICE' || inv.doc_type === 'FCE_MIPYME') openStandaloneWindow(`/standalone/facturas/${inv.id}`);
                                                    else if (inv.doc_type === 'DEBIT_NOTE') openStandaloneWindow(`/standalone/notas-debito/${inv.id}`);
                                                    else if (inv.doc_type === 'CREDIT_NOTE') openStandaloneWindow(`/standalone/notas-credito/${inv.id}`);
                                                }}>
                                                    Ver
                                                </Button>
                                            </td>
                                            <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                                                {isExpanded ? <ChevronDown size={16} color="#64748b" /> : <ChevronRight size={16} color="#64748b" />}
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                <td colSpan={10} style={{ padding: '16px 20px 24px 20px' }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                        <div><div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total Factura (Origen)</div><div style={{ fontSize: '14px', fontWeight: 500, color: '#0f172a', marginTop: '4px' }}>{fmt(inv.total_amount, inv.currency)}</div></div>
                                                        <div><div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total Cobrado</div><div style={{ fontSize: '14px', fontWeight: 500, color: '#10b981', marginTop: '4px' }}>{fmt(inv.total_amount * (inv.pct_cobrado / 100), inv.currency)} ({inv.pct_cobrado}%)</div></div>
                                                        <div><div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>TC Factura</div><div style={{ fontSize: '14px', fontWeight: 500, color: '#0f172a', marginTop: '4px' }}>{inv.exchange_rate}</div></div>
                                                        <div><div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Modalidad</div><div style={{ fontSize: '14px', fontWeight: 500, color: '#0f172a', marginTop: '4px' }}>{MODE_LABELS[seller.commission_mode] || seller.commission_mode}</div></div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                {/* ───────────────────────────────────────────────────────── */}
                {/* 3. REMITOS PENDIENTES */}
                {/* ───────────────────────────────────────────────────────── */}
                {activeTab === 'REMITOS' && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'white', zIndex: 1, boxShadow: '0 1px 0 #e2e8f0' }}>
                            <tr>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Fecha</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Remito</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>OV</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Cliente</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Importe Estimado USD</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#3b82f6', textTransform: 'uppercase', textAlign: 'right' }}>Comisión Estimada USD</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'center' }}>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {delivery_notes_pending.length === 0 ? (
                                <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No hay remitos pendientes.</td></tr>
                            ) : delivery_notes_pending.map(dn => {
                                const estComm = dn.total * (seller.commission_pct / 100);
                                return (
                                    <tr key={dn.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '12px 20px', color: '#64748b', fontSize: '13px' }}>{dn.date ? dn.date.substring(0,10) : ''}</td>
                                        <td style={{ padding: '12px 20px', fontWeight: 500, fontSize: '13px' }}>{dn.number}</td>
                                        <td style={{ padding: '12px 20px', fontSize: '13px' }}>{dn.ov_number}</td>
                                        <td style={{ padding: '12px 20px', fontSize: '13px' }}>{dn.client_name}</td>
                                        <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: '13px' }}>{fmt(dn.total, "USD")}</td>
                                        <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 600, color: '#2563eb', fontSize: '13px' }}>{fmt(estComm, "USD")}</td>
                                        <td style={{ padding: '12px 20px', textAlign: 'center' }}><Badge type="warning">{dn.invoice_status}</Badge></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                {/* ───────────────────────────────────────────────────────── */}
                {/* 4. LIQUIDACIONES */}
                {/* ───────────────────────────────────────────────────────── */}
                {activeTab === 'LIQUIDACIONES' && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'white', zIndex: 1, boxShadow: '0 1px 0 #e2e8f0' }}>
                            <tr>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Fecha</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Moneda</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Importe USD</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Importe ARS</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Tipo de Cambio</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Notas</th>
                            </tr>
                        </thead>
                        <tbody>
                            {settlements.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No hay liquidaciones realizadas.</td></tr>
                            ) : settlements.map(s => (
                                <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '12px 20px', color: '#64748b', fontSize: '13px' }}>{s.date ? s.date.substring(0,10) : ''}</td>
                                    <td style={{ padding: '12px 20px', fontSize: '13px' }}>{s.currency}</td>
                                    <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>{fmt(s.amount_usd, "USD")}</td>
                                    <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: '13px' }}>{fmt(s.amount_ars, "ARS")}</td>
                                    <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: '13px' }}>{s.exchange_rate}</td>
                                    <td style={{ padding: '12px 20px', fontSize: '13px', color: '#64748b' }}>{s.notes || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* ───────────────────────────────────────────────────────── */}
                {/* 5. APLICACIONES */}
                {/* ───────────────────────────────────────────────────────── */}
                {activeTab === 'APLICACIONES' && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'white', zIndex: 1, boxShadow: '0 1px 0 #e2e8f0' }}>
                            <tr>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>ID Interno</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Fecha</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Total USD</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Disponible USD</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Pagado USD</th>
                                <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'center' }}>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {applications.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No hay aplicaciones.</td></tr>
                            ) : applications.map(a => (
                                <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '12px 20px', fontSize: '12px', fontFamily: 'monospace', color: '#94a3b8' }}>{a.id.substring(0,8)}...</td>
                                    <td style={{ padding: '12px 20px', color: '#64748b', fontSize: '13px' }}>{a.date ? a.date.substring(0,10) : ''}</td>
                                    <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: '13px' }}>{fmt(a.commission_amount_usd, "USD")}</td>
                                    <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: '13px', color: '#10b981' }}>{fmt(a.available_amount_usd, "USD")}</td>
                                    <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: '13px', color: '#475569' }}>{fmt(a.paid_amount_usd, "USD")}</td>
                                    <td style={{ padding: '12px 20px', textAlign: 'center' }}><Badge type="neutral">{a.status}</Badge></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

            </div>

            {/* BARRA DE ACCIONES FIJA INFERIOR */}
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                    {activeTab === 'RESUMEN' && (
                        <Button 
                            variant="primary" 
                            icon={<Wallet size={16} />} 
                            onClick={() => handleSettle("SELECTED")} 
                            disabled={selectedLedgerItems.length === 0}
                        >
                            Liquidar Seleccionadas ({selectedLedgerItems.length})
                        </Button>
                    )}
                    <Button 
                        variant={activeTab === 'RESUMEN' ? "outline" : "primary"} 
                        icon={<Wallet size={16} />}
                        onClick={() => handleSettle("ALL")} 
                        loading={settleLoading}
                    >
                        Liquidar Todo Disponible
                    </Button>
                    <Button 
                        variant="outline" 
                        onClick={() => showToast("En desarrollo", "info")}
                    >
                        Registrar Adelanto
                    </Button>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <Button variant="outline" icon={<Calculator size={16} />} onClick={handleRecalc} loading={recalcLoading}>
                        Recalcular al TC de Hoy
                    </Button>
                    <div style={{ width: '1px', background: '#cbd5e1', margin: '0 4px' }} />
                    <Button variant="outline" icon={<Printer size={16} />}>PDF</Button>
                    <Button variant="outline" icon={<Download size={16} />}>Excel</Button>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
}
