import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Download, Trash2, Mail, MessageCircle, 
  PhoneCall, ExternalLink, Calendar, Calculator,
  TrendingUp, AlertTriangle, ShieldAlert, ChevronDown,
  ArrowRight, FileText, User, Filter, RefreshCcw, Layout,
  XCircle, CheckCircle2, AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import { useWindow } from '../../context/WindowContext';
import { useCostCenter } from '../../context/CostCenterContext';
import s from './MoraManagement.module.css';

const fmtUSD = (v) => v !== undefined && v !== null ? `u$s ${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'u$s 0,00';

export default function MoraManagement() {
  const navigate = useNavigate();
  const { openWindow } = useWindow();
  const { costCenter } = useCostCenter();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allDebtors, setAllDebtors] = useState([]);
  const [summary, setSummary] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [viewType, setViewType] = useState('ALL'); // 'CRITICAL', 'ALL'

  useEffect(() => {
    fetchData();
  }, [costCenter]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const q = costCenter > 0 ? `?cost_center=${costCenter}` : '';
      const response = await api.get(`/entities/reports/ageing${q}`);
      
      const entities = response.data || [];
      const stats = response.summary || {};
      
      setAllDebtors(entities);
      setSummary({
          total_overdue: stats.total_overdue || stats.overdue_balance || 0,
          total_debt: stats.total_debt || stats.total_balance || 0,
          entities_count: entities.filter(e => (e.overdue_balance || e.total_overdue) > 0).length,
          mora_pct: (stats.total_overdue / stats.total_debt) * 100 || 0
      });

    } catch (err) {
      console.error("DEBUG - MoraManagement ERROR:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredDebtors = useMemo(() => {
    let list = [...allDebtors];
    
    // Filtro por tipo de vista (Mora Crítica vs Todos)
    if (viewType === 'CRITICAL') {
       list = list.filter(d => (d.overdue_balance || d.total_overdue) > 0);
    }
    
    // Filtro de búsqueda
    if (searchTerm) {
       const q = searchTerm.toLowerCase();
       list = list.filter(d => 
         d.name.toLowerCase().includes(q) || 
         d.code.toLowerCase().includes(q)
       );
    }
    
    // Ordenar: primero los que tienen más mora
    return list.sort((a,b) => (b.overdue_balance || b.total_overdue) - (a.overdue_balance || a.total_overdue));
  }, [allDebtors, searchTerm, viewType]);

  const getUrgencyBadge = (days, amount) => {
    if (amount <= 0) return <span className={`${s.daysBadge} ${s.safe}`}>SIN MORA</span>;
    if (days >= 90) return <span className={`${s.daysBadge} ${s.critical}`}>CRÍTICO (+90)</span>;
    if (days >= 30) return <span className={`${s.daysBadge} ${s.warning}`}>30+ DÍAS</span>;
    return <span className={`${s.daysBadge} ${s.warning}`}>MORA INICIAL</span>;
  };

  const handleWhatsApp = (debtor) => {
    const amount = debtor.overdue_balance || debtor.total_overdue || 0;
    const text = `Hola ${debtor.name}, te saludo de Quintal Agross. Te contacto porque registramos un saldo vencido de u$s ${amount.toLocaleString()}. ¿Cómo podemos regularizarlo? Saludos!`;
    window.open(`https://wa.me/${debtor.phone || ''}?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (loading) return (
     <div style={{ padding: 120, textAlign: 'center', background: '#f8fafc', height: '100vh' }}>
        <RefreshCcw size={50} className="animate-spin" style={{ color: '#3b82f6', opacity: 0.6, margin: '0 auto' }} />
        <h2 style={{ marginTop: 24, fontWeight: 950, color: '#0f172a', letterSpacing: '-0.02em' }}>GENERANDO REPORTE DE GESTIÓN...</h2>
        <p style={{ color: '#94a3b8', fontWeight: 800 }}>Analizando antigüedad de cartera en tiempo real</p>
     </div>
  );

  return (
    <div className={s.container}>
      <div className={s.statsGrid}>
         <div className={s.statCard} style={{ background: '#fef2f2', borderColor: '#fee2e2' }}>
            <span className={s.statLabel} style={{ color: '#ef4444' }}>MORA CRÍTICA (USD)</span>
            <div className={s.statValue} style={{ color: '#b91c1c' }}>{fmtUSD(summary?.total_overdue)}</div>
            <p style={{ fontSize: 11, fontWeight: 900, color: '#ef4444' }}>{summary?.entities_count} clientes excedidos</p>
         </div>
         <div className={s.statCard}>
            <span className={s.statLabel}>PORCENTAJE DE MORA</span>
            <div className={s.statValue}>{summary?.mora_pct.toFixed(2)}%</div>
            <p style={{ fontSize: 11, fontWeight: 900, color: '#94a3b8' }}>sobre saldo u$s {summary?.total_debt.toLocaleString()}</p>
         </div>
         <div className={s.statCard}>
            <span className={s.statLabel}>PROMEDIO DE RECUPERO</span>
            <div className={s.statValue}>18 días</div>
            <p style={{ fontSize: 11, fontWeight: 900, color: '#10b981' }}>Efectividad de cobranza</p>
         </div>
         <div className={s.statCard} style={{ background: '#eff6ff', borderColor: '#dbeafe' }}>
            <span className={s.statLabel} style={{ color: '#3b82f6' }}>TAREAS DE HOY</span>
            <div className={s.statValue} style={{ color: '#1e40af' }}>{summary?.entities_count}/{summary?.entities_count}</div>
            <p style={{ fontSize: 11, fontWeight: 900, color: '#3b82f6' }}>Contactos a realizar</p>
         </div>
      </div>

      <div className={s.toolbar}>
         <div className={s.searchWrap}>
            <Search size={22} style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input 
              className={s.searchInput} 
              placeholder="Escribe el nombre del cliente o su código..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
         </div>
         <div className={s.viewToggle}>
            <button className={`${s.toggleBtn} ${viewType === 'CRITICAL' ? s.toggleBtnActive : ''}`} onClick={() => setViewType('CRITICAL')}>
               SOLO CRÍTICOS
            </button>
            <button className={`${s.toggleBtn} ${viewType === 'ALL' ? s.toggleBtnActive : ''}`} onClick={() => setViewType('ALL')}>
               VER TODA LA CARTERA
            </button>
         </div>
      </div>

      <div className={s.debtorsList}>
         {filteredDebtors.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 80, background: 'white', borderRadius: 40, boxShadow: '0 20px 50px rgba(0,0,0,0.03)' }}>
               <CheckCircle2 size={60} style={{ color: '#10b981', margin: '0 auto', opacity: 0.8 }} />
               <h3 style={{ fontSize: 24, fontWeight: 950, color: '#1e293b', marginTop: 24, letterSpacing: '-0.03em' }}>TODO AL DÍA</h3>
               <p style={{ color: '#94a3b8', fontWeight: 800, maxWidth: 300, margin: '12px auto' }}>Enhorabuena, no se registran moras en este segmento o centro de costo.</p>
               <button onClick={() => setViewType('ALL')} style={{ marginTop: 20, color: '#3b82f6', background: 'none', border: 'none', fontWeight: 950, cursor: 'pointer' }}>Ver todas las entidades</button>
            </div>
         ) : (
            filteredDebtors.map((debtor) => (
              <div key={debtor.id} className={s.debtorCard}>
                 <div className={s.debtorHeader}>
                    <div className={s.entityInfo}>
                       <h3>{debtor.name}</h3>
                       <span className={s.entityCode}>{debtor.code}</span>
                    </div>
                    <div className={s.debtSummary}>
                       <div className={s.summaryItem}>
                          <span className={s.summaryLabel}>SALDO VENCIDO</span>
                          <span className={s.summaryValue} style={{ color: (debtor.overdue_balance || debtor.total_overdue) > 0 ? '#ef4444' : 'inherit' }}>
                             {fmtUSD(debtor.overdue_balance || debtor.total_overdue)}
                          </span>
                       </div>
                       <div className={s.summaryItem}>
                          <span className={s.summaryLabel}>RIESGO</span>
                          {getUrgencyBadge(debtor.max_days || 0, debtor.overdue_balance || debtor.total_overdue)}
                       </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                       <button className={s.actionBtn} onClick={() => setExpandedId(expandedId === debtor.id ? null : debtor.id)} style={{ border: 'none', background: '#f1f5f9' }}>
                          {expandedId === debtor.id ? <ChevronDown size={20} /> : <ArrowRight size={20} />}
                       </button>
                    </div>
                 </div>

                 {expandedId === debtor.id && (
                   <div style={{ background: '#fdfdfd', padding: '10px 0' }}>
                      <table className={s.detailTable}>
                         <thead>
                           <tr>
                              <th>Vencimiento</th>
                              <th>Importe (USD)</th>
                              <th>Días de Atraso</th>
                              <th>Estado del Tramo</th>
                           </tr>
                         </thead>
                         <tbody>
                           {(debtor.aging_buckets || []).map((bucket, idx) => (
                             <tr key={idx}>
                                <td style={{ fontWeight: 900, color: '#64748b' }}>{bucket.label}</td>
                                <td style={{ fontWeight: 950, fontSize: 15 }}>{fmtUSD(bucket.amount)}</td>
                                <td style={{ fontWeight: 900, color: bucket.amount > 0 && idx >= 1 ? '#ef4444' : 'inherit' }}>
                                    {bucket.amount > 0 && idx >= 1 ? 'VENCIDO' : 'AL DÍA'}
                                </td>
                                <td>
                                   {bucket.amount > 0 ? <AlertCircle size={18} color={idx >= 3 ? "#ef4444" : "#f59e0b"} /> : <CheckCircle2 size={18} color="#10b981" />}
                                </td>
                             </tr>
                           ))}
                         </tbody>
                      </table>
                   </div>
                 )}

                 <div className={s.actionsBar}>
                     {(debtor.overdue_balance || debtor.total_overdue) > 0 && (
                       <button className={`${s.actionBtn} ${s.whatsappBtn}`} onClick={() => handleWhatsApp(debtor)}>
                          <MessageCircle size={18} /> INICIAR RECLAMO
                       </button>
                     )}
                     <button className={`${s.actionBtn} ${s.ghostBtn}`} onClick={() => openWindow('entity-dashboard', { entityId: debtor.id }, { title: `Vista 360 - ${debtor.name}`, width: 1100, height: 800 })}>
                        <Layout size={18} /> VISTA 360
                     </button>
                     <button className={`${s.actionBtn} ${s.ghostBtn}`} onClick={() => navigate(`/contabilidad/cuenta-corriente/${debtor.id}`)}>
                        <FileText size={18} /> CUENTA CORRIENTE
                     </button>
                 </div>
              </div>
            ))
         )}
      </div>
    </div>
  );
}
