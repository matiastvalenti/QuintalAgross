import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';
import { useCostCenter } from '../../context/CostCenterContext';
import { navigateToError } from '../../utils/errorNavigation';
import { Circle, ShoppingCart, Truck, FileText, Receipt, Landmark } from 'lucide-react';
import s from './Dashboard.module.css';

const fmt = (v) => formatCurrency(v);
const fmtUSD = (v) => v !== undefined && v !== null ? `u$s ${v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : 'u$s —';

let dashboardCache = null;

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { costCenter } = useCostCenter();
  
  const [summary, setSummary] = useState(dashboardCache?.summary || null);
  const [rates, setRates] = useState(dashboardCache?.rates || []);
  const [loading, setLoading] = useState(!dashboardCache);

  useEffect(() => {
    fetchData();
    const handleCCChange = () => dashboardCache = null;
    window.addEventListener('cost-center-changed', handleCCChange);
    return () => window.removeEventListener('cost-center-changed', handleCCChange);
  }, []);

  useEffect(() => {
    fetchData(true);
  }, [costCenter]);

  const fetchData = async (isManualRefresh = false) => {
    if (!dashboardCache || isManualRefresh) {
        if (!dashboardCache) setLoading(true);
    }
    try {
      const q = costCenter > 0 ? `?cost_center=${costCenter}` : '';
      const [summaryData, ratesData] = await Promise.all([
        api.get(`/dashboard/summary${q}`),
        api.get('/finance/rates/latest')
      ]);
      setSummary(summaryData);
      setRates(ratesData || []);
      dashboardCache = { summary: summaryData, rates: ratesData || [] };
    } catch (err) {
      console.error(err);
      navigateToError(navigate, {
        title: 'Error de Datos',
        message: 'No pudimos conectar con los servicios centrales.',
        cause: err.message,
        status: 500
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div style={{ padding: 32, fontFamily: 'Inter', color: '#6B7280' }}>
      Cargando terminal...
    </div>
  );

  const rateUSD = rates.find(r => r.currency === 'USD_DIVISA' || r.currency === 'USD')?.sell || 1400;

  // Variables de datos
  const remitosPendientes = summary?.kpis?.pending_delivery_notes || 10;
  const moraExigible = summary?.financial?.ar_overdue?.usd || 774;
  const saldoClientes = summary?.financial?.ar_overdue?.usd || 1250400;

  const priorityActions = [
    {
      id: 'facturar_remitos',
      title: 'Facturar remitos',
      quantity: remitosPendientes,
      impact: 'u$s 48.200',
      severity: 'CRITICA',
      route: '/ventas/facturas',
      actionText: 'Facturar'
    },
    {
      id: 'confirmar_liquidaciones',
      title: 'Confirmar liquidaciones',
      quantity: 2,
      impact: '1.500 TN',
      severity: 'MEDIA',
      route: '/cereales/liquidaciones-primarias',
      actionText: 'Confirmar'
    },
    {
      id: 'resolver_dif_cambio',
      title: 'Resolver diferencias de cambio',
      quantity: 4,
      impact: 'u$s 7.800',
      severity: 'MEDIA',
      route: '/contabilidad/cuenta-corriente',
      actionText: 'Resolver'
    }
  ];

  return (
    <div className={s.dashboard}>
      
      {/* 1. BARRA EJECUTIVA COMPACTA (Terminal style) */}
      <div className={s.executiveBar}>
        <div className={s.execGroup}>
          <div className={s.marketCards}>
            <div className={s.marketCard}>
              <span className={s.marketLabel}>SOJA CBOT</span>
              <span className={`${s.marketVal} ${s.tickerHighlight}`}>414.7</span>
            </div>
            <div className={s.marketCard}>
              <span className={s.marketLabel}>MAÍZ</span>
              <span className={s.marketVal}>166.9</span>
            </div>
            <div className={s.marketCard}>
              <span className={s.marketLabel}>TRIGO</span>
              <span className={s.marketVal}>213.8</span>
            </div>
            <div className={s.marketCard}>
              <span className={s.marketLabel}>USD DIVISA</span>
              <span className={s.marketVal}>{fmt(rateUSD)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. ACCESOS RÁPIDOS */}
      <div className={s.opsRow}>
        <div className={s.opsContainer}>
          <button className={s.opsBtn} onClick={() => navigate('/ventas/orden-venta')}><ShoppingCart size={14} /> Nueva Orden</button>
          <button className={s.opsBtn} onClick={() => navigate('/ventas/remitos')}><Truck size={14} /> Nuevo Remito</button>
          <button className={s.opsBtn} onClick={() => navigate('/ventas/facturas')}><FileText size={14} /> Nueva Factura</button>
          <button className={s.opsBtn} onClick={() => navigate('/finanzas/recibos')}><Receipt size={14} /> Nuevo Recibo</button>
          <button className={s.opsBtn} onClick={() => navigate('/contabilidad/cuenta-corriente')}><Landmark size={14} /> Cuenta Corriente</button>
        </div>
      </div>

      {/* 3. LAYOUT PRINCIPAL (25/50/25) */}
      <div className={s.mainGrid}>
        
        {/* COL 1: POSICIÓN FINANCIERA (25%) */}
        <div className={s.panel} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
          <div className={s.panelHeader}>Posición Financiera</div>
          <div className={s.panelContent} style={{ padding: '12px 16px', gap: '8px', overflowY: 'auto' }}>
            
            <div className={s.accountsGrid}>
              <div className={s.accountCell}>
                <span className={s.accountLabel}>Clientes</span>
                <span className={s.accountVal}>{fmtUSD(saldoClientes)}</span>
                <span className={s.accountCtx}>3 cuentas abiertas</span>
              </div>
              <div className={s.accountCell}>
                <span className={s.accountLabel}>USD Exp.</span>
                <span className={s.accountVal}>u$s 800.400</span>
                <span className={s.accountCtx}>Posición neta</span>
              </div>
              <div className={s.accountCell}>
                <span className={s.accountLabel}>Proveedores</span>
                <span className={s.accountVal}>-u$s 45.000</span>
                <span className={s.accountCtx}>12 comprobantes pendientes</span>
              </div>
              <div className={s.accountCell}>
                <span className={s.accountLabel}>Mora</span>
                <span className={`${s.accountVal} ${s.textDanger}`}>{fmtUSD(moraExigible)}</span>
                <span className={s.accountCtx}>Vencida &gt; 30 días</span>
              </div>
            </div>

            <div className={s.divider} style={{ margin: '8px 0' }}></div>

            <div className={s.subSectionHeader}>AGRO</div>
            <div className={s.subPanelCard}>
              <div className={s.flatList}>
                <div className={s.flatRow}>
                  <span className={s.flatLabelDark}>Granos comprometidos</span>
                  <span className={s.flatVal}>2.500 TN</span>
                </div>
                <div className={s.flatRow}>
                  <span className={s.flatLabelDark}>Fijaciones abiertas</span>
                  <span className={s.flatVal}>1.200 TN</span>
                </div>
              </div>
            </div>

            <div className={s.divider} style={{ margin: '8px 0' }}></div>

            <div className={s.subSectionHeader}>CORREDORES</div>
            <div className={s.subPanelCard}>
              <div className={s.flatRow} style={{ marginTop: '0' }}>
                <span className={s.flatLabelDark} style={{ fontWeight: 800 }}>Total Neto</span>
                <span className={s.flatVal} style={{ fontWeight: 900, color: '#10b981' }}>+u$s 9.500</span>
              </div>
              
              <div className={s.divider} style={{ margin: '8px 0' }}></div>
              <div className={s.subSectionHeader} style={{ margin: '0 0 8px 0', fontSize: '10px' }}>TOP CORREDORES</div>
              
              <div className={s.flatList}>
                <div className={s.flatRow} style={{ padding: 0 }}>
                  <span className={s.flatLabelDark}>BLD</span>
                  <span className={s.flatVal}>+u$s 12.000</span>
                </div>
                <div className={s.flatRow} style={{ padding: 0 }}>
                  <span className={s.flatLabelDark}>Mistrorigo</span>
                  <span className={s.flatVal}>+u$s 2.500</span>
                </div>
                <div className={s.flatRow} style={{ padding: 0 }}>
                  <span className={s.flatLabelDark}>Grimaldi</span>
                  <span className={s.flatVal}>-u$s 5.000</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* COL 2: ACCIONES PRIORITARIAS + TRABAJO PENDIENTE (50%) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>
          
          <div className={s.panel} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div className={`${s.panelHeader} ${s.coreHeader}`}>Acciones Prioritarias</div>
            
            <div className={s.panelContent} style={{ padding: '12px 16px', gap: '8px', overflowY: 'auto' }}>
              
              {/* KPI EJECUTIVO CENTRAL */}
              <div className={s.kpiCentralBlockRow}>
                <span className={s.kpiCentralLabel}>TRABAJO PENDIENTE</span>
                <span className={s.kpiCentralVal} style={{ fontSize: '28px' }}>
                  u$s 56.000 <span className={s.kpiCentralPlus}>+</span> 1.500 TN
                </span>
              </div>
              
              {priorityActions.slice(0, 5).map(action => (
                <div key={action.id} className={s.priorityActionItem}>
                  <div className={s.actionInfo}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={`${s.severityBadge} ${
                        action.severity === 'CRITICA' ? s.badgeCritica :
                        action.severity === 'ALTA' ? s.badgeAlta :
                        s.badgeMedia
                      }`}>
                        {action.severity}
                      </span>
                      <span className={s.actionTitle}>{action.title}</span>
                    </div>
                    <span className={`${s.actionImpactValStage9} ${action.severity === 'CRITICA' || action.severity === 'ALTA' ? s.textDanger : ''}`}>
                      {action.impact}
                    </span>
                    <span className={s.actionQtyStage9}>
                      {action.quantity} tareas pendientes
                    </span>
                  </div>
                  <button className={s.actionBtn} onClick={() => navigate(action.route)}>{action.actionText}</button>
                </div>
              ))}

            </div>
          </div>

        </div>

        {/* COL 3: RIESGOS Y VENCIMIENTOS (25%) */}
        <div className={`${s.panel} ${s.riskWidget}`} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className={s.panelHeader}>Riesgos y Vencimientos</div>
          <div className={s.panelContent} style={{ padding: '12px 16px', gap: '12px', overflowY: 'auto' }}>
            
            <div className={`${s.portfolioItemRisk} ${s.riskAlto}`} onClick={() => navigate('/finanzas/cheques')}>
              <span className={s.riskCardTitle}>CHEQUES HOY</span>
              <span className={s.riskCardValHuge}>$ 2.450.000</span>
              <span className={s.riskCardQty}>5 documentos</span>
              <div className={s.statusBarContainer}><div className={s.statusBarWarning} style={{ width: '80%' }}></div></div>
            </div>

            <div className={`${s.portfolioItemRisk} ${s.riskCritico}`} onClick={() => navigate('/finanzas/mora')}>
              <span className={s.riskCardTitle} style={{ color: '#D14343' }}>FACTURAS VENCIDAS</span>
              <span className={`${s.riskCardValHuge} ${s.textDanger}`}>u$s 85.000</span>
              <span className={s.riskCardQty}>7 comprobantes</span>
              <div className={s.statusBarContainer}><div className={s.statusBarDanger} style={{ width: '65%' }}></div></div>
            </div>

            <div className={`${s.portfolioItemRisk} ${s.riskMedio}`} onClick={() => navigate('/finanzas/cheques')}>
              <span className={s.riskCardTitle}>PRÓXIMOS 7 DÍAS</span>
              <span className={s.riskCardValHuge}>$ 8.100.000</span>
              <span className={s.riskCardQty}>12 cheques</span>
              <div className={s.statusBarContainer}><div className={s.statusBarWarning} style={{ width: '40%' }}></div></div>
            </div>

            <div className={s.divider} style={{ margin: '8px 0' }}></div>
            
            <div className={s.subSectionHeader} style={{ marginTop: '4px', marginBottom: '12px' }}>COBRANZA DEL DÍA</div>
            <div className={s.cobranzaList}>
              <div className={s.cobranzaItem}>
                <span className={s.cobranzaClient}>Passaglia</span>
                <span className={s.cobranzaVal}>u$s 12.500</span>
                <span className={`${s.cobranzaStatus} ${s.cobranzaHoy}`}>Hoy</span>
              </div>
              <div className={s.cobranzaItem}>
                <span className={s.cobranzaClient}>Agrohumboldt</span>
                <span className={s.cobranzaVal}>$ 850.000</span>
                <span className={`${s.cobranzaStatus} ${s.cobranzaManana}`}>Mañana</span>
              </div>
              <div className={s.cobranzaItem}>
                <span className={s.cobranzaClient}>Mistrorigo</span>
                <span className={s.cobranzaVal}>u$s 7.800</span>
                <span className={`${s.cobranzaStatus} ${s.cobranzaVencido}`}>Vencido</span>
              </div>
            </div>
            
            <button className={s.actionBtn} onClick={() => navigate('/contabilidad/cuenta-corriente')} style={{ marginTop: 'auto', background: '#0f172a', width: '100%' }}>VER CUENTA CORRIENTE</button>

            <div className={s.divider} style={{ margin: '8px 0' }}></div>
            <div className={s.subSectionHeader} style={{ marginTop: '4px', marginBottom: '12px' }}>ALERTAS OPERATIVAS</div>
            
            <div className={s.alertItem}>
              <span className={s.alertIcon}>⚠</span>
              <span className={s.alertText}><b>Agrohumboldt</b> superó límite de crédito.</span>
            </div>
            <div className={s.alertItem}>
              <span className={s.alertIcon}>⚠</span>
              <span className={s.alertText}>Factura <b>FC-0021</b> sin aplicar a recibo.</span>
            </div>
            <div className={s.alertItem}>
              <span className={s.alertIcon}>⚠</span>
              <span className={s.alertText}>Cheque N° 099881 <b>rechazado</b> por falta de fondos.</span>
            </div>
            <div className={s.alertItem}>
              <span className={s.alertIcon}>⚠</span>
              <span className={s.alertText}>Cliente <b>Passaglia</b> bloqueado administrativamente.</span>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
