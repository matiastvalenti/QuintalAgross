import React, { useState, useEffect, useMemo } from 'react';
import { 
    TrendingUp, AlertCircle, FileText, DollarSign,
    MoreVertical, MessageSquare, Phone, UserCircle, Send, 
    ChevronRight, ArrowUpRight, ArrowDownRight, Layout, Mail, 
    MapPin, AlertTriangle, MessageCircle, MoreHorizontal, 
    Bell, Activity, Clock, ShieldCheck, CreditCard, Share2, 
    Zap, Calendar, BarChart, Truck, Package, Database, ExternalLink,
    Search, Filter, Plus, Target, Award, Infinity, History
} from 'lucide-react';
import { useWindow } from '../../context/WindowContext';
import api from '../../services/api';
import s from './EntityDashboard.module.css';
import { 
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip, 
    BarChart as ReBarChart, Bar, XAxis, YAxis 
} from 'recharts';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#64748b'];

const fmt = (v) => v !== undefined && v !== null ? `$ ${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$ 0,00';
const fmtUSD = (v) => v !== undefined && v !== null ? `u$s ${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'u$s 0,00';

export default function EntityDashboard({ entityId, entityName }) {
    const { openWindow } = useWindow();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [newNote, setNewNote] = useState('');
    const [noteCategory, setNoteCategory] = useState('Acuerdo');
    const [submittingNote, setSubmittingNote] = useState(false);

    useEffect(() => {
        if (entityId) fetchData();
    }, [entityId]);

    useEffect(() => {
        const handleRefresh = () => {
            if (entityId) fetchData();
        };
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
    }, [entityId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const d = await api.get(`/entities/${entityId}/dashboard`);
            setData(d);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddNote = async () => {
        if (!newNote.trim()) return;
        setSubmittingNote(true);
        try {
            await api.post(`/entities/${entityId}/notes`, {
                category: noteCategory,
                content: newNote,
                date: new Date().toISOString()
            });
            setNewNote('');
            fetchData();
        } catch (err) {
            console.error(err);
        } finally {
            setSubmittingNote(false);
        }
    };

    const getScoreColor = (score) => {
        if (score >= 80) return '#10b981';
        if (score >= 50) return '#f59e0b';
        return '#ef4444';
    };

    const creditUtilization = useMemo(() => {
        if (!data || !data.credit_limit) return 0;
        return Math.min(100, (data.total_balance_usd / data.credit_limit) * 100);
    }, [data]);

    if (loading) return (
       <div style={{ padding: 120, textAlign: 'center', background: '#f8fafc', height: '100%' }}>
          <div className="spin" style={{ width: 48, height: 48, border: '4px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 24px' }} />
          <h2 style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', letterSpacing: '0.1em' }}>VALORIZANDO ADN COMERCIAL 360...</h2>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>Sincronizando balances, logística y comportamiento de pago.</p>
       </div>
    );

    if (!data) return <div style={{ padding: 40, textAlign: 'center' }}>Error al sincronizar inteligencia operativa.</div>;

    return (
        <div className={s.container}>
            {/* --- HERO SECTION --- */}
            <header className={s.header}>
                <div style={{ position: 'absolute', right: -40, top: -40, opacity: 0.05, transform: 'rotate(15deg)' }}>
                    <ShieldCheck size={280} color="#0f172a" />
                </div>

                <div className={s.entityTitle} style={{ zIndex: 1 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                         <div style={{ background: '#0f172a', color: 'white', padding: '4px 12px', borderRadius: 20, fontSize: 10, fontWeight: 900, letterSpacing: '0.1em' }}>COMMAND CENTER 360</div>
                         <div className={`${s.riskBadge} ${data.credit_status === 'OK' ? s.ok : (data.credit_status === 'WARNING' ? s.warning : s.critical)}`}>
                             {data.credit_status === 'OK' ? 'ESTADO: NORMAL' : `ESTADO: ${data.credit_status}`}
                         </div>
                    </div>
                    <h1>{data.name}</h1>
                    <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginTop: 20 }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <MapPin size={16} color="#94a3b8" />
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>{data.city || 'Ubicación S/D'}, {data.state || 'Arg'}</span>
                         </div>
                         <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Target size={16} color="#94a3b8" />
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>CUIT: {data.tax_id}</span>
                         </div>
                         <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Mail size={16} color="#94a3b8" />
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>{data.email || 'Sin correo registrado'}</span>
                         </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 48, alignItems: 'center', zIndex: 1 }}>
                    <div style={{ textAlign: 'center' }}>
                         <div style={{ position: 'relative', width: 90, height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="90" height="90" style={{ transform: 'rotate(-90deg)' }}>
                                <circle cx="45" cy="45" r="40" stroke="#f1f5f9" strokeWidth="10" fill="none" />
                                <circle cx="45" cy="45" r="40" stroke={getScoreColor(data.performance_score)} strokeWidth="10" fill="none" 
                                    strokeDasharray={`${2 * Math.PI * 40}`} 
                                    strokeDashoffset={`${2 * Math.PI * 40 * (1 - data.performance_score / 100)}`}
                                    strokeLinecap="round"
                                    style={{ transition: 'stroke-dashoffset 1.5s ease-out' }}
                                />
                            </svg>
                            <div style={{ position: 'absolute', textAlign: 'center' }}>
                                <span style={{ fontSize: 24, fontWeight: 950, color: '#0f172a', display: 'block', lineHeight: 1 }}>{Math.round(data.performance_score)}</span>
                                <span style={{ fontSize: 8, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>ADN</span>
                            </div>
                         </div>
                         <div style={{ fontSize: 9, fontWeight: 900, color: '#64748b', marginTop: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Desempeño Global</div>
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.05em' }}>Mora Promedio (B5)</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 32, fontWeight: 950, color: data.avg_days_to_pay > 10 ? '#ef4444' : '#0f172a', lineHeight: 1 }}>
                                    {data.avg_days_to_pay > 0 ? `+${Math.round(data.avg_days_to_pay)}` : Math.round(data.avg_days_to_pay)}
                                    <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 800, marginLeft: 4 }}>Días</span>
                                </div>
                                <div style={{ fontSize: 10, color: data.avg_days_to_pay > 10 ? '#ef4444' : '#10b981', fontWeight: 800, marginTop: 4 }}>
                                    {data.avg_days_to_pay > 10 ? 'DEMORA CRÍTICA' : (data.avg_days_to_pay > 0 ? 'LIGERA DEMORA' : 'PAGADOR EJEMPLAR')}
                                </div>
                            </div>
                            {/* B5 Meter Visualization */}
                            <div style={{ width: 80, height: 40, position: 'relative', overflow: 'hidden' }}>
                                <svg width="80" height="40" viewBox="0 0 80 40">
                                    <path d="M 10 40 A 30 30 0 0 1 70 40" fill="none" stroke="#f1f5f9" strokeWidth="8" strokeLinecap="round" />
                                    <path d="M 10 40 A 30 30 0 0 1 70 40" fill="none" stroke={data.avg_days_to_pay > 15 ? '#ef4444' : '#10b981'} strokeWidth="8" strokeLinecap="round"
                                        strokeDasharray="94.2" strokeDashoffset={94.2 * (1 - Math.min(1, Math.max(0, data.avg_days_to_pay / 30)))}
                                        style={{ transition: 'stroke-dashoffset 1s ease-in-out' }} />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* --- KPI PULSE GRID --- */}
            <div className={s.statsGrid}>
                <div className={s.statCard}>
                    <span className={s.statLabel}><TrendingUp size={14} color="#3b82f6" /> SALDO TOTAL</span>
                    <div className={s.statValue}>{fmt(data.total_balance)}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', marginTop: 6 }}>{fmtUSD(data.total_balance_usd)} nominal</div>
                </div>
                
                <div className={s.statCard} style={{ borderBottom: `4px solid ${data.overdue_balance > 0 ? '#ef4444' : '#10b981'}` }}>
                    <span className={s.statLabel}><AlertCircle size={14} color={data.overdue_balance > 0 ? '#ef4444' : '#10b981'} /> DEUDA VENCIDA</span>
                    <div className={s.statValue} style={{ color: data.overdue_balance > 0 ? '#ef4444' : '#0f172a' }}>{fmt(data.overdue_balance)}</div>
                    <div className={s.chartPlaceholder}>
                        <div className={s.chartBar} style={{ width: `${(data.overdue_balance / (data.total_balance || 1)) * 100}%`, background: '#ef4444' }} />
                    </div>
                </div>

                <div className={s.statCard}>
                    <span className={s.statLabel}><CreditCard size={14} color="#8b5cf6" /> LÍMITE DE CRÉDITO</span>
                    <div className={s.statValue}>{data.credit_limit > 0 ? fmtUSD(data.credit_limit) : 'Ilimitado'}</div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Uso: {creditUtilization.toFixed(1)}%</span>
                        <span>{fmtUSD(Math.max(0, data.credit_limit - data.total_balance_usd))} disp.</span>
                    </div>
                    <div className={s.chartPlaceholder}>
                        <div className={s.chartBar} style={{ width: `${creditUtilization}%`, background: creditUtilization > 85 ? '#ef4444' : '#8b5cf6' }} />
                    </div>
                </div>

                <div className={s.statCard}>
                    <span className={s.statLabel}><Activity size={14} color="#f59e0b" /> CHEQUES DISPONIBLES</span>
                    <div className={s.statValue}>{fmt(data.checks_pending)}</div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', marginTop: 6 }}>En cartera / Pendientes</div>
                </div>
            </div>

            <div className={s.contentGrid}>
                {/* --- MAIN OPERATIONAL COLUMN --- */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    
                    {/* LOGISTICS & PIPELINE */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                        <div className={s.card}>
                             <h3 className={s.cardTitle}>
                                 <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Truck size={18} color="#3b82f6" /> REMITOS PENDIENTES</span>
                                 <span style={{ color: '#3b82f6', fontSize: 16 }}>{fmt(data.unbilled_balance)}</span>
                             </h3>
                             <div className={s.activityList}>
                                {data.pending_logistics?.map((item, i) => (
                                    <div key={i} className={s.item}>
                                        <div style={{ fontWeight: 800, color: '#64748b' }}>{new Date(item.date).toLocaleDateString()}</div>
                                        <div style={{ fontWeight: 900, color: '#0f172a' }}>{item.number}</div>
                                        <div style={{ textAlign: 'right', fontWeight: 900 }}>{fmt(item.amount)}</div>
                                        <div style={{ textAlign: 'right' }}><ChevronRight size={14} color="#cbd5e1" /></div>
                                    </div>
                                ))}
                                {!data.pending_logistics?.length && <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Sin logística pendiente.</div>}
                             </div>
                        </div>

                        <div className={s.card}>
                             <h3 className={s.cardTitle}>
                                 <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Package size={18} color="#8b5cf6" /> ÓRDENES ABIERTAS</span>
                                 <span style={{ color: '#8b5cf6', fontSize: 16 }}>{data.open_orders?.length || 0}</span>
                             </h3>
                             <div className={s.activityList}>
                                {data.open_orders?.map((item, i) => (
                                    <div key={i} className={s.item}>
                                        <div style={{ fontWeight: 800, color: '#64748b' }}>{new Date(item.date).toLocaleDateString()}</div>
                                        <div style={{ fontWeight: 900, color: '#0f172a' }}>{item.number}</div>
                                        <div style={{ textAlign: 'right', fontWeight: 900 }}>{fmt(item.amount)}</div>
                                        <div style={{ textAlign: 'right' }}><ChevronRight size={14} color="#cbd5e1" /></div>
                                    </div>
                                ))}
                                {!data.open_orders?.length && <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Sin órdenes en proceso.</div>}
                             </div>
                        </div>
                    </div>

                    {/* RECENT FINANCIAL TRACE */}
                    <div className={s.card}>
                        <h3 className={s.cardTitle}><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><History size={18} color="#0f172a" /> HISTORIAL DE DOCUMENTOS</span></h3>
                        <div className={s.activityList}>
                            {data.recent_activity.slice(0, 8).map((item, i) => (
                                <div key={i} className={s.item} style={{ gridTemplateColumns: '100px 1fr 140px 100px 40px' }}>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>{new Date(item.date).toLocaleDateString()}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                         <span style={{ fontWeight: 900, color: '#0f172a' }}>{item.number}</span>
                                         <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{item.doc_type}</span>
                                    </div>
                                    <div style={{ textAlign: 'right', fontWeight: 900 }}>{item.currency === 'USD' ? fmtUSD(item.amount) : fmt(item.amount)}</div>
                                    <div style={{ textAlign: 'right' }}>
                                         <span style={{ 
                                             fontSize: 9, fontWeight: 900, 
                                             color: item.status === 'CLOSED' ? '#10b981' : '#f59e0b', 
                                             background: item.status === 'CLOSED' ? '#f0fdf4' : '#fffbeb', 
                                             padding: '4px 10px', borderRadius: 20 
                                         }}>{item.status}</span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}><ExternalLink size={14} color="#cbd5e1" /></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* --- SIDEBAR: CRM & ACTIONS --- */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    
                    {/* LAST CRM INSIGHT */}
                    <div className={s.card} style={{ background: '#0f172a', color: 'white', border: 'none shadow: 0 20px 40px rgba(15,23,42,0.2)' }}>
                         <h3 className={s.cardTitle} style={{ color: 'white', borderColor: 'rgba(255,255,255,0.1)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MessageCircle size={18} /> ÚLTIMA GESTIÓN</span>
                         </h3>
                         <div style={{ minHeight: 100 }}>
                              {data.crm_notes?.[0] ? (
                                  <div>
                                      <div style={{ fontSize: 10, fontWeight: 900, color: '#94a3b8', marginBottom: 12, letterSpacing: '0.05em' }}>
                                          {new Date(data.crm_notes[0].date).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })} • {data.crm_notes[0].category.toUpperCase()}
                                      </div>
                                      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.5, color: '#f8fafc' }}>
                                          "{data.crm_notes[0].content}"
                                      </p>
                                  </div>
                              ) : (
                                  <div style={{ color: '#94a3b8', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>No existen registros en el historial CRM.</div>
                              )}
                         </div>
                         <button className={s.sidebarBtn} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', marginTop: 32, justifyContent: 'center' }} onClick={() => openWindow('crm-notes', { entityId: entityId }, { title: 'Historial CRM' })}>
                             EXPANDIR HISTORIAL COMPLETO
                         </button>
                    </div>

                    {/* QUICK ACTIONS PANEL */}
                    <div className={s.card}>
                        <h3 className={s.cardTitle}><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Zap size={18} color="#3b82f6" /> ACCIONES DIRECTAS</span></h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <button className={s.sidebarBtn} onClick={() => openWindow('invoice-form', { mode: 'new', initialEntityId: entityId })}>
                                <div style={{ background: '#eff6ff', padding: 8, borderRadius: 10 }}><FileText size={18} color="#3b82f6" /></div>
                                Emitir Factura
                            </button>
                            <button className={s.sidebarBtn} onClick={() => openWindow('receipt-form', { entityId: entityId })}>
                                <div style={{ background: '#ecfdf5', padding: 8, borderRadius: 10 }}><DollarSign size={18} color="#10b981" /></div>
                                Cobranza / Recibo
                            </button>
                            <button className={s.sidebarBtn} onClick={() => openWindow('statement-page', { entityId: entityId })}>
                                <div style={{ background: '#f8fafc', padding: 8, borderRadius: 10 }}><Activity size={18} color="#64748b" /></div>
                                Estado de Cuenta
                            </button>
                        </div>
                    </div>

                    {/* PURCHASE MIX CHART (D1) */}
                    <div className={s.card} style={{ minHeight: 320 }}>
                        <h3 className={s.cardTitle}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Award size={18} color="#f59e0b" /> MIX DE PRODUCTOS (D1)</span>
                        </h3>
                        {data.consumption_mix && data.consumption_mix.length > 0 ? (
                            <div style={{ height: 240, width: '100%', position: 'relative' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={data.consumption_mix}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={90}
                                            paddingAngle={5}
                                            dataKey="value"
                                            nameKey="category"
                                        >
                                            {data.consumption_mix.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <ReTooltip 
                                            contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 16px rgba(0,0,0,0.1)', fontSize: 12, fontWeight: 800 }}
                                            formatter={(value) => fmt(value)}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div style={{ 
                                    position: 'absolute', top: '50%', left: '50%', 
                                    transform: 'translate(-50%, -50%)', textAlign: 'center',
                                    pointerEvents: 'none'
                                }}>
                                    <div style={{ fontSize: 10, fontWeight: 900, color: '#94a3b8' }}>TOTAL</div>
                                    <div style={{ fontSize: 16, fontWeight: 950, color: '#0f172a' }}>
                                        {fmt(data.consumption_mix.reduce((a, b) => a + b.value, 0))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
                                Sin datos de facturación histórica.
                            </div>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                            {data.consumption_mix?.map((m, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800, background: '#f8fafc', padding: '4px 10px', borderRadius: 20 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length] }} />
                                    <span style={{ color: '#475569' }}>{m.category.toUpperCase()}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

