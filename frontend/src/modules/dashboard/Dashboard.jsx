import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';
import { useCostCenter } from '../../context/CostCenterContext';
import { navigateToError } from '../../utils/errorNavigation';
import {
  RefreshCw,
  SlidersHorizontal,
  Plus,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Truck,
  Receipt,
  ShoppingCart,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  Wallet,
  Wheat,
  TrendingUp,
  Layers,
  ExternalLink,
  ChevronRight,
  X,
  Package,
  ShieldAlert
} from 'lucide-react';
import s from './Dashboard.module.css';

// Formateadores seguros
const fmtARS = (v) => {
  if (v === undefined || v === null) return '$ —';
  return formatCurrency(v);
};

const fmtUSD = (v) => {
  if (v === undefined || v === null) return 'u$s —';
  return `u$s ${Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtInteger = (v) => {
  if (v === undefined || v === null) return '0';
  return Number(v).toLocaleString('es-AR');
};
export default function Dashboard() {
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const { costCenter, setCostCenter } = useCostCenter();

  // Estados principales
  const [summary, setSummary] = useState(null);
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [updateError, setUpdateError] = useState(null);

  // Estados de interfaz
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [showCustomizeNotice, setShowCustomizeNotice] = useState(false);
  const [dashboardPreferences, setDashboardPreferences] = useState({
    layout: [],
    hidden_widgets: []
  });
  const [draftPreferences, setDraftPreferences] = useState(null);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesError, setPreferencesError] = useState(null);

  useEffect(() => {
    let active = true;

    const loadPreferences = async () => {
      setPreferencesLoading(true);
      try {
        const response = await api.get('/dashboard/preferences');
        if (active) {
          setDashboardPreferences({
            layout: response?.layout || [],
            hidden_widgets: response?.hidden_widgets || []
          });
          setPreferencesError(null);
        }
      } catch (error) {
        if (active) {
          console.error('Error cargando preferencias:', error);
          setPreferencesError('No se pudieron cargar las preferencias.');
        }
      } finally {
        if (active) setPreferencesLoading(false);
      }
    };

    loadPreferences();
    return () => { active = false; };
  }, [user?.id]);

  // Referencias para evitar solicitudes duplicadas y cerrar menús
  const isFetchingRef = useRef(false);
  const dropdownRef = useRef(null);

  // Cerrar menú "+ Nuevo" al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsNewMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Función principal de carga de datos
  const fetchData = async (isManual = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (isManual || !summary) {
      if (!summary) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }
    } else {
      setIsRefreshing(true);
    }

    try {
      const q = costCenter > 0 ? `?cost_center=${costCenter}` : '';
      const [summaryRes, ratesRes] = await Promise.all([
        api.get(`/dashboard/summary${q}`),
        api.get('/finance/rates/latest')
      ]);

      const now = new Date();
      setSummary(summaryRes);
      setRates(ratesRes || []);
      setLastUpdated(now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setUpdateError(null);

    } catch (err) {
      console.error('Error cargando dashboard:', err);
      // Si ya hay datos en pantalla, no redirigir a pantalla fatal de error
      if (summary) {
        setUpdateError('No se pudo actualizar en segundo plano. Se conservan los datos actuales.');
      } else {
        navigateToError(navigate, {
          title: 'Error de Datos',
          message: 'No pudimos conectar con los servicios centrales del panel general.',
          cause: err.message,
          status: 500
        });
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
      isFetchingRef.current = false;
    }
  };

  // Carga inicial y escucha de cambios de centro de costo
  useEffect(() => {
    fetchData();

    const handleCCChange = () => {
      fetchData(true);
    };

    window.addEventListener('cost-center-changed', handleCCChange);
    return () => window.removeEventListener('cost-center-changed', handleCCChange);
  }, []);

  // Cambio reactivo al cambiar costCenter
  useEffect(() => {
    fetchData(true);
  }, [costCenter]);

  // Refresco automático periódico cada 60 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(false);
    }, 60000);

    return () => clearInterval(interval);
  }, [costCenter]);


  const widgetCatalog = [
    { id: 'accounts_receivable', label: 'Cuentas por cobrar', modules: ['finance'] },
    { id: 'accounts_payable', label: 'Cuentas por pagar', modules: ['finance'] },
    { id: 'cheques', label: 'Cheques en cartera', modules: ['finance'] },
    { id: 'pending_delivery_notes', label: 'Remitos sin facturar', modules: ['sales_delivery'] },
    { id: 'commercial_activity', label: 'Actividad comercial', modules: ['sales_orders', 'sales_delivery', 'sales_invoices', 'purchase_invoices', 'customers'] },
    { id: 'agricultural_activity', label: 'Actividad agropecuaria', modules: ['grain_primary_settlements', 'grain_secondary_settlements', 'grain_contracts', 'grain_movements', 'grain_stock'] },
    { id: 'risks_and_due_dates', label: 'Riesgos y vencimientos', modules: ['finance', 'products'] },
  ];

  const allowedWidgets = widgetCatalog.filter(widget =>
    widget.modules.some(module => can(module, 'view'))
  );

  const orderedWidgets = [...allowedWidgets].sort((a, b) => {
    const order = (draftPreferences || dashboardPreferences).layout || [];
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });

  const widgetOrder = id => {
    const index = orderedWidgets.findIndex(widget => widget.id === id);
    return index < 0 ? 999 : index;
  };

  const isWidgetVisible = id =>
    !((draftPreferences || dashboardPreferences).hidden_widgets || []).includes(id);

  const toggleWidget = id => {
    setDraftPreferences(prev => ({
      ...prev,
      hidden_widgets: prev.hidden_widgets.includes(id)
        ? prev.hidden_widgets.filter(x => x !== id)
        : [...prev.hidden_widgets, id]
    }));
  };

  const [draggedWidget, setDraggedWidget] = useState(null);
  const [dragOverWidget, setDragOverWidget] = useState(null);

  const widgetGroup = id => {
    if ([
      'accounts_receivable',
      'accounts_payable',
      'cheques',
      'pending_delivery_notes'
    ].includes(id)) return 'kpi';

    if ([
      'commercial_activity',
      'agricultural_activity'
    ].includes(id)) return 'activity';

    return 'other';
  };

  const canMoveWidget = (id, direction) => {
    const index = orderedWidgets.findIndex(widget => widget.id === id);
    return index >= 0 && index + direction >= 0 &&
      index + direction < orderedWidgets.length;
  };

  const reorderWidget = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;


    const order = orderedWidgets.map(widget => widget.id);
    const from = order.indexOf(sourceId);
    const to = order.indexOf(targetId);

    if (from < 0 || to < 0) return;

    order.splice(from, 1);
    order.splice(to, 0, sourceId);

    setDraftPreferences(prev => ({
      ...prev,
      layout: order
    }));
  };

  const finishWidgetDrag = () => {
    setDraggedWidget(null);
    setDragOverWidget(null);
  };

  const openDashboardCustomizer = () => {
    setDraftPreferences({
      layout: [...dashboardPreferences.layout],
      hidden_widgets: [...dashboardPreferences.hidden_widgets]
    });
    setPreferencesError(null);
    setShowCustomizeNotice(true);
  };

  const closeDashboardCustomizer = () => {
    if (preferencesSaving) return;
    setShowCustomizeNotice(false);
    setDraftPreferences(null);
    setPreferencesError(null);
  };

  const saveDashboardPreferences = async () => {
    if (!draftPreferences || preferencesSaving || preferencesLoading) return;

    const payload = {
      layout: orderedWidgets.map(widget => widget.id),
      hidden_widgets: draftPreferences.hidden_widgets.filter(
        id => allowedWidgets.some(widget => widget.id === id)
      )
    };

    setPreferencesSaving(true);
    try {
      await api.put('/dashboard/preferences', payload);
      setDashboardPreferences(payload);
      setDraftPreferences(null);
      setShowCustomizeNotice(false);
      setPreferencesError(null);
    } catch (error) {
      console.error('Error guardando preferencias:', error);
      setPreferencesError('No se pudieron guardar los cambios.');
    } finally {
      setPreferencesSaving(false);
    }
  };

  const resetDashboardPreferences = async () => {
    if (preferencesSaving || preferencesLoading) return;
    setPreferencesSaving(true);
    try {
      await api.delete('/dashboard/preferences');
      setDashboardPreferences({ layout: [], hidden_widgets: [] });
      setDraftPreferences(null);
      setPreferencesError(null);
      setShowCustomizeNotice(false);
    } catch (error) {
      console.error('Error restableciendo preferencias:', error);
      setPreferencesError('No se pudo restablecer la personalización.');
    } finally {
      setPreferencesSaving(false);
    }
  };

  // Pantalla de carga inicial limpia
  if (loading && !summary) {
    return (
      <div className={s.loadingContainer}>
        <div className={s.loadingSpinner}></div>
        <div className={s.loadingText}>Conectando con el panel general...</div>
      </div>
    );
  }

  // Tasa de cambio de referencia
  const rateUSD = rates.find(
    r => r.currency?.trim().toUpperCase().replace(/[_\s]+/g, ' ') === 'USD DIVISA'
  )?.wholesale ?? 0;

  // 1. Cuentas por cobrar
  const arTotalUSD = summary?.financial?.ar_total ?? 0;
  const arTotalARS = summary?.financial?.ar_total_ars ?? 0;
  const arOverdueUSD = summary?.financial?.ar_overdue?.usd ?? 0;
  const arOverdueARS = summary?.financial?.ar_overdue?.ars ?? 0;

  // 2. Cuentas por pagar
  const apTotalUSD = summary?.financial?.ap_total ?? 0;
  const apTotalARS = summary?.financial?.ap_total_ars ?? 0;
  const apOverdueUSD = summary?.financial?.ap_overdue?.usd ?? 0;

  // 3. Cheques
  const checksTotalARS = summary?.financial?.checks_total_ars ?? 0;
  const checksTotalUSD = summary?.financial?.checks_total_usd ?? 0;
  const checksTotalUnknown = summary?.financial?.checks_total_unknown ?? 0;

  // 4. Remitos pendientes de facturar
  const pendingRemitosCount = summary?.kpis?.pending_delivery_notes ?? 0;
  const pendingRemitosUSD = summary?.kpis?.pending_delivery_notes_usd ?? 0;
  const pendingRemitosARS = summary?.kpis?.pending_delivery_notes_ars ?? 0;

  // Funnel comercial
  const funnel = summary?.funnel || null;

  // Unidades de negocio
  const salesByUnit = summary?.sales_by_unit || [];

  // Actividad reciente
  const activity = summary?.activity || [];

  // Alertas operativas reales
  const alerts = summary?.alerts || [];

  // Próximos vencimientos reales
  const upcoming = summary?.upcoming || [];

  // Precios de granos CBOT
  const grainPrices = summary?.grain_prices || [];

  return (
    <div className={s.dashboard}>
      {/* ====================================================================
          1. ENCABEZADO: TÍTULO, FILTROS Y CONTROLES
          ==================================================================== */}
      <header className={s.header}>
        <div className={s.headerLeft}>
          <div className={s.headerTitleWrapper}>
            <h1 className={s.title}>
              Panel general
              <span className={s.titleBadge}>Quintal Agross</span>
            </h1>
            <p className={s.subtitle}>
              Monitor integral de operaciones comerciales, financieras y agropecuarias
            </p>
          </div>
        </div>

        <div className={s.headerRight}>
          {/* Filtro Centro de Costos */}
          <div className={s.ccFilter}>
            <Layers size={14} color="#A594F9" />
            <span>Centro:</span>
            <select
              className={s.ccSelect}
              value={costCenter || 0}
              onChange={(e) => setCostCenter(Number(e.target.value))}
            >
              <option value={0}>Todos los centros</option>
              <option value={1}>CC 1 - Casa Central</option>
              <option value={2}>CC 2 - Sucursal Acopio</option>
            </select>
          </div>

          {/* Controles de actualización */}
          <div className={s.refreshGroup}>
            <div className={s.lastUpdateText}>
              <span className={s.updateDot}></span>
              <span>{lastUpdated ? `Actualizado ${lastUpdated}` : 'Sincronizando...'}</span>
            </div>
            <button
              className={`${s.refreshBtn} ${isRefreshing ? s.spinning : ''}`}
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
              title="Actualizar datos ahora"
            >
              <RefreshCw size={13} />
            </button>
          </div>

          {/* Botón Personalizar */}
          <button
            className={s.customizeBtn}
            onClick={showCustomizeNotice ? closeDashboardCustomizer : openDashboardCustomizer}
            title="Personalizar distribución del panel"
          >
            <SlidersHorizontal size={14} />
            <span>Personalizar</span>

          </button>
        </div>
      </header>


      {showCustomizeNotice && (
        <div
          className={s.customizerOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDashboardCustomizer();
          }}
        >
          <div
            className={s.customizerModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-customizer-title"
          >
            <div className={s.customizerHeader}>
              <div className={s.customizerHeading}>
                <div className={s.customizerIcon}>
                  <SlidersHorizontal size={21} />
                </div>
                <div>
                  <h2 id="dashboard-customizer-title">Personalizar dashboard</h2>
                  <p>Configurá tu espacio de trabajo</p>
                </div>
              </div>
              <button
                type="button"
                className={s.customizerClose}
                onClick={closeDashboardCustomizer}
                disabled={preferencesSaving}
                aria-label="Cerrar personalización"
              >
                <X size={20} />
              </button>
            </div>

            <div className={s.customizerBody}>
              <div className={s.customizerSectionHeading}>
                <div>
                  <h3>Tarjetas disponibles</h3>
                  <p>Activá, ocultá y ordená tus indicadores.</p>
                </div>
                <span className={s.customizerCount}>
                  {orderedWidgets.length} disponibles
                </span>
              </div>

              {preferencesLoading ? (
                <p>Cargando preferencias...</p>
              ) : (
                <div className={s.customizerList}>
                  {orderedWidgets.map((widget, index) => (
                    <div
                      key={widget.id}
                      className={`${s.customizerItem} ${
                        draggedWidget === widget.id ? s.customizerDragging : ''
                      } ${
                        dragOverWidget === widget.id &&
                        draggedWidget !== widget.id &&
                        widgetGroup(draggedWidget) === widgetGroup(widget.id)
                          ? s.customizerDragOver : ''
                      }`}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', widget.id);
                        setDraggedWidget(widget.id);
                      }}
                      onDragOver={(event) => {
                        if (
                          draggedWidget &&
                          widgetGroup(draggedWidget) === widgetGroup(widget.id)
                        ) {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                          setDragOverWidget(widget.id);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        reorderWidget(
                          event.dataTransfer.getData('text/plain'),
                          widget.id
                        );
                        finishWidgetDrag();
                      }}
                      onDragEnd={finishWidgetDrag}
                    >
                      <div className={s.customizerItemInfo}>
                        <span
                          className={s.customizerGrip}
                          title="Arrastrar para ordenar"
                          aria-hidden="true"
                        >⋮⋮</span>
                        <div className={s.customizerItemIcon}>
                          <Layers size={17} />
                        </div>
                        <div>
                          <div className={s.customizerItemTitle}>{widget.label}</div>
                          <div className={s.customizerItemSubtitle}>
                            {isWidgetVisible(widget.id) ? 'Visible en tu panel' : 'Oculto en tu panel'}
                          </div>
                        </div>
                      </div>

                      <div className={s.customizerItemActions}>
                        <label className={s.customizerSwitch}>
                          <input
                            type="checkbox"
                            checked={isWidgetVisible(widget.id)}
                            onChange={() => toggleWidget(widget.id)}
                            aria-label={`Mostrar ${widget.label}`}
                          />
                          <span className={s.customizerSwitchTrack} />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {preferencesError && (
                <p className={s.customizerError}>{preferencesError}</p>
              )}

              <p className={s.customizerHint}>
                Los cambios se guardan únicamente para tu usuario.
              </p>
            </div>

            <div className={s.customizerFooter}>
              <button
                type="button"
                className={s.customizerReset}
                onClick={resetDashboardPreferences}
                disabled={preferencesLoading || preferencesSaving}
              >
                Restablecer
              </button>
              <div className={s.customizerFooterActions}>
                <button
                  type="button"
                  className={s.customizerCancel}
                  onClick={closeDashboardCustomizer}
                  disabled={preferencesSaving}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={s.customizerSave}
                  onClick={saveDashboardPreferences}
                  disabled={preferencesLoading || preferencesSaving}
                >
                  <CheckCircle2 size={16} />
                  {preferencesSaving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Banner de error discreto si falla actualización en caliente */}
      {updateError && (
        <div className={s.updateErrorBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={15} color="#EF4444" />
            <span>{updateError}</span>
          </div>
          <button
            onClick={() => setUpdateError(null)}
            style={{ background: 'transparent', border: 'none', color: '#FCA5A5', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ====================================================================
          2. ACCESOS RÁPIDOS COMBINADOS
          ==================================================================== */}
      {(
        can("sales_invoices", "create") ||
        can("sales_delivery", "create") ||
        can("finance", "create") ||
        can("sales_orders", "create") ||
        can("purchase_orders", "create")
      ) && (
  <section className={s.quickActionsBar}>
        <div className={s.quickActionsLabel}>
          <Clock size={13} color="#A594F9" />
          <span>Accesos Rápidos</span>
        </div>

        <div className={s.quickActionsGroup}>
          {can("sales_invoices", "create") && (
          <button
            className={`${s.actionButton} ${s.actionButtonPrimary}`}
            onClick={() => navigate('/ventas/facturas')}
          >
            <FileText size={14} />
            <span>Nueva factura</span>
          </button>
          )}

          {can("sales_delivery", "create") && (
          <button
            className={s.actionButton}
            onClick={() => navigate('/ventas/remitos')}
          >
            <Truck size={14} />
            <span>Nuevo remito</span>
          </button>
          )}
          {can("finance", "create") && (
          <button
            className={s.actionButton}
            onClick={() => navigate('/finanzas/recibos')}
          >
            <Receipt size={14} />
            <span>Nuevo recibo</span>
          </button>
          )}
          {/* Menú desplegable "+ Nuevo" con otras operaciones */}
            {[
              "sales_orders",
              "purchase_orders",
              "finance"
            ].some(module => can(module, "create")) && (
          <div className={s.dropdownWrapper} ref={dropdownRef}>
            <button
              className={`${s.dropdownBtn} ${isNewMenuOpen ? s.dropdownBtnActive : ''}`}
              onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
            >
              <Plus size={14} />
              <span>+ Nuevo</span>
              <ChevronDown size={13} style={{ transform: isNewMenuOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
            </button>

            {isNewMenuOpen && (
              <div className={s.dropdownMenu}>
                <button
                  className={s.dropdownItem}
                  onClick={() => { setIsNewMenuOpen(false); navigate('/ventas/orden-venta'); }}
                >
                  <ShoppingCart size={14} color="#A594F9" />
                  <span>Nueva orden de venta</span>
                </button>

                <button
                  className={s.dropdownItem}
                  onClick={() => { setIsNewMenuOpen(false); navigate('/compras/orden-compra'); }}
                >
                  <ShoppingCart size={14} color="#38BDF8" />
                  <span>Nueva orden de compra</span>
                </button>

                <div className={s.dropdownDivider}></div>

                <button
                  className={s.dropdownItem}
                  onClick={() => { setIsNewMenuOpen(false); navigate('/finanzas/pagos'); }}
                >
                  <CreditCard size={14} color="#FBBF24" />
                  <span>Nuevo pago a proveedor</span>
                </button>

                <button
                  className={s.dropdownItem}
                  onClick={() => { setIsNewMenuOpen(false); navigate('/finanzas/cheques'); }}
                >
                  <Receipt size={14} color="#34D399" />
                  <span>Nuevo cheque</span>
                </button>

                <div className={s.dropdownDivider}></div>

                <button
                  className={s.dropdownItem}
                  onClick={() => { setIsNewMenuOpen(false); navigate('/cereales/liquidaciones-primarias'); }}
                >
                  <Wheat size={14} color="#F59E0B" />
                  <span>Liquidación primaria</span>
                </button>

                <button
                  className={s.dropdownItem}
                  onClick={() => { setIsNewMenuOpen(false); navigate('/cereales/contratos'); }}
                >
                  <FileText size={14} color="#A594F9" />
                  <span>Contrato de granos</span>
                </button>
              </div>
            )}
          </div>
          )}
        </div>
      </section>
      )}

      {/* ====================================================================
          3. CUATRO INDICADORES PRINCIPALES (EN UNA FILA EN ESCRITORIO)
          ==================================================================== */}
      <section className={s.unifiedWidgetGrid}>
{(can("finance", "view") || can("sales_delivery", "view")) && (
<div className={s.kpiGridUnified}>
        {/* KPI 1: Cuentas por cobrar */}
        {can("finance", "view") && (
        <div data-dashboard-widget="accounts_receivable" style={{ order: widgetOrder("accounts_receivable"), display: isWidgetVisible("accounts_receivable") ? undefined : "none" }}
          className={s.kpiCard}
          onClick={() => navigate('/contabilidad/cuenta-corriente')}
          title="Ver detalle en Cuenta Corriente"
        >
          <div className={s.kpiTop}>
            <div>
              <div className={s.kpiTitle}>Cuentas por cobrar</div>
              <div className={s.kpiValue}>{fmtUSD(arTotalUSD)}</div>
              <div className={s.kpiSecondaryValue}>Equiv. {fmtARS(arTotalARS)}</div>
            </div>
            <div className={`${s.kpiIconBox} ${s.kpiIconReceivable}`}>
              <ArrowUpRight size={18} />
            </div>
          </div>
          <div className={s.kpiFooter}>
            <span>Mora exigible:</span>
            {arOverdueUSD > 0 || arOverdueARS > 0 ? (
              <span className={`${s.kpiBadge} ${s.badgeDanger}`}>
                {fmtUSD(arOverdueUSD)}
              </span>
            ) : (
              <span className={`${s.kpiBadge} ${s.badgeSuccess}`}>
                Al día
              </span>
            )}
          </div>
        </div>
      )}
        {/* KPI 2: Cuentas por pagar */}
        {can("finance", "view") && (
        <div data-dashboard-widget="accounts_payable" style={{ order: widgetOrder("accounts_payable"), display: isWidgetVisible("accounts_payable") ? undefined : "none" }}
          className={s.kpiCard}
          onClick={() => navigate('/compras/facturas')}
          title="Ver detalle en Facturas de Compra"
        >
          <div className={s.kpiTop}>
            <div>
              <div className={s.kpiTitle}>Cuentas por pagar</div>
              <div className={s.kpiValue}>{fmtUSD(apTotalUSD)}</div>
              <div className={s.kpiSecondaryValue}>Equiv. {fmtARS(apTotalARS)}</div>
            </div>
            <div className={`${s.kpiIconBox} ${s.kpiIconPayable}`}>
              <ArrowDownRight size={18} />
            </div>
          </div>
          <div className={s.kpiFooter}>
            <span>Vencido proveedores:</span>
            {apOverdueUSD > 0 ? (
              <span className={`${s.kpiBadge} ${s.badgeWarning}`}>
                {fmtUSD(apOverdueUSD)}
              </span>
            ) : (
              <span className={`${s.kpiBadge} ${s.badgeSuccess}`}>
                Sin vencidos
              </span>
            )}
          </div>
        </div>
)}
      {/* KPI 3: Cheques en cartera */}
      {can("finance", "view") && (
<div data-dashboard-widget="cheques" style={{ order: widgetOrder("cheques"), display: isWidgetVisible("cheques") ? undefined : "none" }}
  className={s.kpiCard}
  onClick={() => navigate('/finanzas/cheques')}
  title="Ver cartera de cheques"
>
  <div className={s.kpiTop}>
    <div>
      <div className={s.kpiTitle}>Cheques en cartera</div>

      <div className={s.kpiValue}>
        {fmtARS(checksTotalARS)}
      </div>

      <div className={s.kpiSecondaryValue}>
        {fmtUSD(checksTotalUSD)}
      </div>
    </div>

    <div className={`${s.kpiIconBox} ${s.kpiIconChecks}`}>
      <Wallet size={18} />
    </div>
  </div>

  <div className={s.kpiFooter}>
    <span>
      {checksTotalUnknown !== 0
        ? "Hay cheques con moneda sin identificar"
        : "Estado:"}
    </span>

    <span
      className={`${s.kpiBadge} ${
        checksTotalUnknown !== 0
          ? s.badgeWarning
          : checksTotalARS !== 0 || checksTotalUSD !== 0
            ? s.badgeNeutral
            : s.badgeSuccess
      }`}
    >
      {checksTotalUnknown !== 0
        ? "Revisar monedas"
        : checksTotalARS !== 0 || checksTotalUSD !== 0
          ? "Documentos activos"
          : "Sin cheques"}
    </span>
  </div>
</div>
)}

        {/* KPI 4: Remitos sin facturar */}
        {can("sales_delivery", "view") && (
        <div data-dashboard-widget="pending_delivery_notes" style={{ order: widgetOrder("pending_delivery_notes"), display: isWidgetVisible("pending_delivery_notes") ? undefined : "none" }}
          className={s.kpiCard}
          onClick={() => navigate('/ventas/remitos')}
          title="Ver remitos pendientes de facturar"
        >
          <div className={s.kpiTop}>
            <div>
              <div className={s.kpiTitle}>Remitos sin facturar</div>
              <div className={s.kpiValue}>{fmtInteger(pendingRemitosCount)} <span style={{ fontSize: '13px', fontWeight: 600, color: '#94A3B8' }}>remitos</span></div>
              <div className={s.kpiSecondaryValue}>
                {pendingRemitosUSD > 0 ? `Aprox. ${fmtUSD(pendingRemitosUSD)}` : (pendingRemitosARS > 0 ? `Aprox. ${fmtARS(pendingRemitosARS)}` : 'Sin monto pendiente')}
              </div>
            </div>
            <div className={`${s.kpiIconBox} ${s.kpiIconDelivery}`}>
              <Truck size={18} />
            </div>
          </div>
          <div className={s.kpiFooter}>
            <span>Acción:</span>
            <span className={`${s.kpiBadge} ${pendingRemitosCount > 0 ? s.badgePrimary : s.badgeSuccess}`}>
              {pendingRemitosCount > 0 ? 'Pendiente de emisión' : 'Al día'}
            </span>
          </div>
        </div>
        )}
       </div>
)}
{/* ====================================================================
          4. DOS SECCIONES: ACTIVIDAD COMERCIAL Y ACTIVIDAD AGROPECUARIA
          ==================================================================== */}
      <section className={s.sectionsGrid}>
        {/* ====================================================================
          5. SECCIÓN DE PENDIENTES, RIESGOS Y VENCIMIENTOS
          ==================================================================== */}
      <section
        data-dashboard-widget="risks_and_due_dates"
        className={s.panel}
        style={{
          display: (
            (can("finance", "view") || can("products", "view")) &&
            isWidgetVisible("risks_and_due_dates")
          ) ? undefined : "none",
          order: widgetOrder("risks_and_due_dates")
        }}
      >
        <div className={s.panelHeader}>
          <div className={s.panelTitle}>
            <AlertTriangle size={15} color="#EF4444" />
            <span>Pendientes, Riesgos y Vencimientos</span>
          </div>
          {can('accounting_reports', 'view') && (
            <button
              className={s.actionButton}
              style={{ padding: '4px 10px', fontSize: '11px' }}
              onClick={() => navigate('/finanzas/mora')}
            >
              Gestión de mora <ExternalLink size={12} />
              </button>
          )}
        </div>

        <div className={s.panelContent}>
          <div className={s.risksSectionGrid}>
            {/* 1. Alertas Operativas */}
            <div>
              <div className={s.funnelHeader} style={{ marginBottom: '10px' }}>
                <span>Alertas Operativas Activas</span>
                <span className={alerts.length > 0 ? s.badgeDanger : s.badgeSuccess}>
                  {alerts.length} alertas
                </span>
              </div>

              {alerts.length > 0 ? (
                <div className={s.alertsList}>
                  {alerts.map((alert, idx) => (
                    <div
                      key={idx}
                      className={`${s.alertCard} ${alert.type === 'urgent' ? s.alertCardUrgent : s.alertCardWarning}`}
                    >
                      {alert.type === 'urgent' ? (
                        <AlertCircle size={16} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                      ) : (
                        <AlertTriangle size={16} color="#F59E0B" style={{ flexShrink: 0, marginTop: '2px' }} />
                      )}
                      <div className={s.alertInfo}>
                        <span className={s.alertTitle}>{alert.title}</span>
                        <span className={s.alertDesc}>{alert.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`${s.emptyState} ${s.emptyStatePositive}`}>
                  <CheckCircle2 size={24} color="#10B981" />
                  <span className={`${s.emptyStateTitle} ${s.emptyStatePositiveTitle}`}>
                    Sin alertas operativas activas
                  </span>
                  <span className={s.emptyStateText}>
                    No hay cheques rechazados, vehículos vencidos ni stock crítico pendiente.
                  </span>
                </div>
              )}
            </div>

            {/* 2. Próximos Vencimientos */}
            <div>
              <div className={s.funnelHeader} style={{ marginBottom: '10px' }}>
                <span>Próximos Vencimientos (15 días)</span>
                <span>Documentos & Cheques</span>
              </div>

              {upcoming.length > 0 ? (
                <div className={s.upcomingList}>
                  {upcoming.slice(0, 5).map((item, idx) => (
                    <div key={idx} className={s.upcomingItem}>
                      <div className={s.upcomingDateBadge}>{item.date}</div>
                      <div className={s.upcomingInfo}>
                        <span className={s.upcomingTitle}>{item.title}</span>
                        <span className={s.upcomingEntity}>{item.entity}</span>
                      </div>
                      <span className={s.upcomingAmount}>
                        {item.currency === 'USD' ? fmtUSD(item.amount) : fmtARS(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={s.emptyState}>
                  <Clock size={24} color="#6955CF" style={{ opacity: 0.7 }} />
                  <span className={s.emptyStateTitle}>Sin vencimientos en los próximos 15 días</span>
                  <span className={s.emptyStateText}>
                    No hay facturas por cobrar/pagar ni cheques que venzan en el corto plazo.
                  </span>
                </div>
              )}
            </div>

            {/* 3. Resumen y Gestión de Mora */}
            {can('finance', 'view') && (
              <div className={s.moraSummaryBlock}>
              <div className={s.funnelHeader} style={{ marginBottom: '10px' }}>
                <span>Control de Vencidos y Mora</span>
              </div>

              <div className={s.moraRow}>
                <span className={s.moraLabel}>Mora Clientes (Vencida):</span>
                <span className={arOverdueUSD > 0 || arOverdueARS > 0 ? s.moraValDanger : s.grainTrendPositive}>
                  {arOverdueUSD > 0 ? fmtUSD(arOverdueUSD) : (arOverdueARS > 0 ? fmtARS(arOverdueARS) : '$ 0,00')}
                </span>
              </div>

              <div className={s.moraRow}>
                <span className={s.moraLabel}>Vencido Proveedores:</span>
                <span className={apOverdueUSD > 0 ? s.moraValWarning : s.grainTrendPositive}>
                  {apOverdueUSD > 0 ? fmtUSD(apOverdueUSD) : '$ 0,00'}
                </span>
              </div>

              <div className={s.moraRow}>
                <span className={s.moraLabel}>Remitos a facturar:</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
                  {pendingRemitosCount} comprobantes
                </span>
              </div>

              <button
                className={s.moraActionBtn}
                onClick={() => navigate('/contabilidad/cuenta-corriente')}
              >
                <span>Ver Cuenta Corriente Completa</span>
                <ArrowUpRight size={14} />
              </button>
            </div>
            )}
          </div>
        </div>
      </section>


{/* SECCIÓN 1: ACTIVIDAD COMERCIAL */}
        {(
          can('sales_orders', 'view') ||
          can('sales_delivery', 'view') ||
          can('sales_invoices', 'view') ||
          can('purchase_invoices', 'view') ||
          can('customers', 'view')
        ) && (
        <div
          data-dashboard-widget="commercial_activity"
          className={s.panel}
          style={{
            display: isWidgetVisible("commercial_activity") ? undefined : "none",
            order: widgetOrder("commercial_activity")
          }}
        >
          <div className={s.panelHeader}>
            <div className={s.panelTitle}>
              <TrendingUp size={15} color="#A594F9" />
              <span>Actividad Comercial</span>
            </div>

            {can("sales_invoices", "view") ? (
              <button
                className={s.actionButton}
                style={{ padding: '4px 10px', fontSize: '11px' }}
                onClick={() => navigate('/ventas/facturas')}
              >
                Ver ventas <ExternalLink size={12} />
              </button>
            ) : can("sales_orders", "view") ? (
              <button
                className={s.actionButton}
                style={{ padding: '4px 10px', fontSize: '11px' }}
                onClick={() => navigate('/ventas/orden-venta')}
              >
                Ver órdenes <ExternalLink size={12} />
              </button>
            ) : null}

          </div>

          <div className={s.panelContent}>
            {/* Métricas clave del mes */}
            {(
              can("sales_invoices", "view") ||
              can("purchase_invoices", "view") ||
              can("customers", "view")
            ) && (
              <div className={s.monthSummaryGrid}>
                <div className={s.metricMiniBox}>
                  <span className={s.metricMiniLabel}>Facturación del mes</span>
                  <span className={s.metricMiniVal}>{fmtUSD(summary?.kpis?.sales_month_usd ?? 0)}</span>
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>{fmtARS(summary?.kpis?.sales_month ?? 0)}</span>
                </div>
                <div className={s.metricMiniBox}>
                  <span className={s.metricMiniLabel}>Compras del mes</span>
                  <span className={s.metricMiniVal}>{fmtARS(summary?.kpis?.purchases_month ?? 0)}</span>
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>Facturas proveedor</span>
                </div>
                <div className={s.metricMiniBox}>
                  <span className={s.metricMiniLabel}>Clientes con saldo</span>
                  <span className={s.metricMiniVal}>{fmtInteger(summary?.kpis?.active_clients_count ?? 0)}</span>
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>Cuentas abiertas</span>
                </div>
              </div>
            )}

            {/* Embudo comercial (Funnel) */}
            <div className={s.funnelContainer}>
              <div className={s.funnelHeader}>
                <span>Flujo de ventas del mes</span>
                <span>Proceso comercial</span>
              </div>

              <div className={s.funnelStepsGrid}>
                {can("sales_orders", "view") && (
                  <div className={s.funnelStep}>
                    <span className={s.funnelStepLabel}>1. Órdenes</span>
                    <span className={s.funnelStepVal}>{fmtUSD(funnel?.ordered)}</span>
                  </div>
                )}
                {can("sales_delivery", "view") && (
                  <div className={s.funnelStep}>
                    <span className={s.funnelStepLabel}>2. Entregado</span>
                    <span className={s.funnelStepVal}>{fmtUSD(funnel?.delivered)}</span>
                  </div>
                )}
                {can("sales_invoices", "view") && (
                  <div className={s.funnelStep}>
                    <span className={s.funnelStepLabel}>3. Facturado</span>
                    <span className={s.funnelStepVal}>{fmtUSD(funnel?.invoiced)}</span>
                  </div>
                )}
                {can("finance", "view") && (
                  <div className={s.funnelStep}>
                    <span className={s.funnelStepLabel}>4. Cobrado</span>
                    <span className={s.funnelStepVal}>{fmtUSD(funnel?.collected)}</span>
                  </div>
                )}
              </div>

              {/* Cuellos de botella si existen */}
              {funnel?.bottlenecks && (funnel.bottlenecks.to_deliver > 0 || funnel.bottlenecks.to_invoice > 0 || funnel.bottlenecks.to_collect > 0) && (
                <div className={s.bottlenecksRow}>
                  {funnel.bottlenecks.to_deliver > 0 && (
                    <div className={s.bottleneckCard}>
                      <span className={s.bottleneckLabel}>Por entregar</span>
                      <span className={s.bottleneckVal}>{fmtUSD(funnel.bottlenecks.to_deliver)}</span>
                    </div>
                  )}
                  {funnel.bottlenecks.to_invoice > 0 && (
                    <div className={`${s.bottleneckCard} ${s.bottleneckCardDanger}`}>
                      <span className={s.bottleneckLabel}>Por facturar</span>
                      <span className={s.bottleneckVal}>{fmtUSD(funnel.bottlenecks.to_invoice)}</span>
                    </div>
                  )}
                  {funnel.bottlenecks.to_collect > 0 && (
                    <div className={s.bottleneckCard}>
                      <span className={s.bottleneckLabel}>Por cobrar</span>
                      <span className={s.bottleneckVal}>{fmtUSD(funnel.bottlenecks.to_collect)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>



{/* Ventas por unidad de negocio */}
{can("sales_invoices", "view") && (
  <div>
    <div className={s.funnelHeader} style={{ marginBottom: '10px' }}>
      <span>Ventas por Unidad de Negocio</span>
    </div>

    {salesByUnit.length > 0 ? (
      <div className={s.unitsList}>
        {salesByUnit.map((unit, index) => (
          <div key={index} className={s.unitRow}>
            <div className={s.unitMeta}>
              <span className={s.unitName}>{unit.label}</span>
              <span className={s.unitAmount}>
                {fmtARS(unit.value)} ({unit.pct}%)
              </span>
            </div>

            <div className={s.progressBarTrack}>
              <div
                className={s.progressBarFill}
                style={{ width: `${Math.min(100, unit.pct)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className={s.emptyState}>
        <span className={s.emptyStateTitle}>
          Sin desglose por unidad este mes
        </span>
        <span className={s.emptyStateText}>
          Los comprobantes emitidos no tienen asignada unidad de negocio específica.
        </span>
      </div>
    )}
  </div>
)}



{/* Actividad comercial reciente */}
{activity.length > 0 && (
  <div>
    <div className={s.funnelHeader} style={{ marginBottom: '10px' }}>
      <span>Últimos Comprobantes</span>
    </div>

    <div className={s.activityList}>
      {activity.slice(0, 4).map((item, idx) => (
        <div key={idx} className={s.activityItem}>
          <div className={s.activityLeft}>
            <span className={s.activityIcon}>
              {item.icon || '📄'}
            </span>

            <div className={s.activityInfo}>
              <span className={s.activityTitle}>{item.title}</span>
              <span className={s.activityMeta}>{item.meta}</span>
            </div>
          </div>

          <span className={s.activityAmount}>
            {item.currency === 'USD'
              ? fmtUSD(item.amount)
              : fmtARS(item.amount)}
          </span>
        </div>
      ))}
    </div>
  </div>
)}

          </div>
        </div>
        )}
        {/* SECCIÓN 2: ACTIVIDAD AGROPECUARIA */}
        {(
          can('grain_primary_settlements', 'view') ||
          can('grain_secondary_settlements', 'view') ||
          can('grain_contracts', 'view') ||
          can('grain_movements', 'view') ||
          can('grain_stock', 'view')
        ) && (
            <div
          data-dashboard-widget="agricultural_activity"
          className={s.panel}
          style={{
            display: isWidgetVisible("agricultural_activity") ? undefined : "none",
            order: widgetOrder("agricultural_activity")
          }}
        >
          <div className={s.panelHeader}>
            <div className={s.panelTitle}>
              <Wheat size={15} color="#F59E0B" />
              <span>Actividad Agropecuaria</span>
            </div>
           {can('grain_primary_settlements', 'view') && (
            <button
              className={s.actionButton}
              style={{ padding: '4px 10px', fontSize: '11px' }}
              onClick={() => navigate('/cereales/liquidaciones-primarias')}
            >
              Módulo cereales <ExternalLink size={12} />
            </button>
)}
          </div>

          <div className={s.panelContent}>
            {/* Pizarra y Mercados CBOT */}
            <div>
              <div className={s.funnelHeader} style={{ marginBottom: '10px' }}>
                <span>Cotizaciones CBOT &amp; Pizarra de Granos</span>
                <span>Mercado de Referencia</span>
              </div>

              {grainPrices.length > 0 ? (
                <div className={s.grainPricesGrid}>
                  {grainPrices.map((grain, idx) => (
                    <div key={idx} className={s.grainCard}>
                      <span className={s.grainLabel}>{grain.label}</span>
                      <div className={s.grainValueRow}>
                        <span className={s.grainPrice}>${grain.value}</span>
                        <span className={s.grainUnit}>USD/TN</span>
                      </div>
                      {grain.trend && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span className={
                            grain.trend.startsWith('+') ? s.grainTrendPositive :
                            grain.trend.startsWith('-') ? s.grainTrendNegative :
                            s.grainTrendNeutral
                          }>
                            {grain.trend}%
                          </span>
                          <span style={{ fontSize: '10px', color: '#64748B' }}>vs cierre ant.</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className={s.emptyState}>
                  <span className={s.emptyStateTitle}>Cotizaciones en sincronización</span>
                  <span className={s.emptyStateText}>Consultando pizarra CBOT con el servidor financiero.</span>
                </div>
              )}
            </div>

            {/* Tipo de cambio de referencia */}
            <div className={s.fxRateCard}>
              <div>
                <span className={s.fxLabel}>Dólar Divisa</span>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94A3B8' }}>
                  Cotización de liquidación y conversión para contratos
                </p>
              </div>
              <div className={s.fxVal}>
                {rateUSD > 0 ? fmtARS(rateUSD) : '$ —'}
              </div>
            </div>

            {/* Operaciones agropecuarias y cereales */}
            <div>
              <div className={s.funnelHeader} style={{ marginBottom: '10px' }}>
                <span>Operaciones de Cereales</span>
              </div>

<div className={s.agroOpsGrid}>
  {can('grain_primary_settlements', 'view') && (
    <button
      className={s.agroOpBtn}
      onClick={() => navigate('/cereales/liquidaciones-primarias')}
    >
      <span>Liquidaciones primarias</span>
      <ChevronRight size={14} color="#A594F9" />
    </button>
  )}

  {can('grain_secondary_settlements', 'view') && (
    <button
      className={s.agroOpBtn}
      onClick={() => navigate('/cereales/liquidaciones-secundarias')}
    >
      <span>Liquidaciones secundarias</span>
      <ChevronRight size={14} color="#A594F9" />
    </button>
  )}

  {can('grain_contracts', 'view') && (
    <button
      className={s.agroOpBtn}
      onClick={() => navigate('/cereales/contratos')}
    >
      <span>Contratos</span>
      <ChevronRight size={14} color="#A594F9" />
    </button>
  )}

  {can('grain_movements', 'view') && (
    <button
      className={s.agroOpBtn}
      onClick={() => navigate('/cereales/movimientos')}
    >
      <span>Movimientos</span>
      <ChevronRight size={14} color="#A594F9" />
    </button>
  )}

  {can('grain_stock', 'view') && (
    <button
      className={s.agroOpBtn}
      onClick={() => navigate('/cereales/stock')}
    >
      <span>Stock en acopio</span>
      <ChevronRight size={14} color="#A594F9" />
    </button>
  )}
</div>

            </div>

            {/* Estado de Fijaciones y Contratos Abiertos */}
            {can('grain_contracts', 'view') && (
            <div>
              <div className={s.funnelHeader} style={{ marginBottom: '10px' }}>
                <span>Fijaciones y Compromisos</span>
              </div>
              <div className={s.emptyState}>
                <Package size={24} color="#6955CF" style={{ opacity: 0.7 }} />
                <span className={s.emptyStateTitle}>Sin fijaciones abiertas pendientes de liquidar</span>
                <span className={s.emptyStateText}>
                  Podés consultar contratos vigentes o emitir nuevas liquidaciones desde el módulo de cereales.
                </span>
                <button
                  className={s.actionButton}
                  style={{ marginTop: '6px' }}
                  onClick={() => navigate('/cereales/contratos')}
                >
                  Gestionar contratos
                </button>
              </div>
            </div>
            )}
          </div>
        </div>
      )}
      </section>



      </section>
    </div>
  );
}
