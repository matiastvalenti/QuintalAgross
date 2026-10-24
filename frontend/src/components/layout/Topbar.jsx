import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, ChevronDown, Layers, MapPin, Menu, Search, Sparkles } from 'lucide-react';
import { useCostCenter } from '../../context/CostCenterContext';
import { useSearch } from '../../context/SearchContext';
import { getCriticalCount } from '../../data/mockNotifications';
import VoiceAssistantModal from '../VoiceAssistant/VoiceAssistantModal';
import OperationalCenter from '../notifications/OperationalCenter';
import s from './Topbar.module.css';

const sectionForPath = (path) => {
  if (path.startsWith('/ventas')) return 'Ventas';
  if (path.startsWith('/compras')) return 'Compras';
  if (path.startsWith('/cereales')) return 'Cereales';
  if (path.startsWith('/finanzas')) return 'Tesorería';
  if (path.startsWith('/contabilidad')) return 'Contabilidad';
  if (path.startsWith('/campo')) return 'Campo';
  if (path.startsWith('/configuracion')) return 'Configuración';
  if (path.startsWith('/crm')) return 'CRM';
  if (path.startsWith('/servicios')) return 'Servicios';
  if (path.startsWith('/empleados')) return 'Personal';
  if (path.startsWith('/planificacion')) return 'Planificación';
  return 'Panel principal';
};

export default function Topbar({ onMenuClick }) {
  const { pathname } = useLocation();
  const { costCenter, setCostCenter } = useCostCenter();
  const { openSearch } = useSearch();
  const [showNotifs, setShowNotifs] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  // Los avisos provienen todavía de datos de ejemplo, no de alertas en tiempo real.
  const operationalAlertsCount = getCriticalCount();

  useEffect(() => {
    const handleGlobalKeyDown = (event) => {
      if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        openSearch();
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [openSearch]);

  return (
    <header className={s.topbar}>
      <div className={s.left}>
        <button
          type="button"
          className={s.menuBtn}
          onClick={onMenuClick}
          aria-label="Abrir menú principal"
          aria-controls="quintal-sidebar"
        >
          <Menu size={20} />
        </button>

        <div className={s.pageContext} aria-label="Sección actual">
          <span className={s.pageEyebrow}>ESPACIO DE TRABAJO</span>
          <strong className={s.pageTitle}>{sectionForPath(pathname)}</strong>
        </div>

        <button type="button" className={s.search} onClick={openSearch} title="Buscar en el sistema (Ctrl+K)" aria-label="Buscar en el sistema">
          <Search size={17} className={s.searchIcon} />
          <span className={s.searchPlaceholder}>Buscar clientes, órdenes, facturas...</span>
          <kbd className={s.searchShortcut}>Ctrl K</kbd>
        </button>
      </div>

      <div className={s.right}>
        <div className={s.contextControls}>
          <label className={s.costCenterSelector}>
            <span className={s.selectorIcon}><Layers size={17} /></span>
            <span className={s.selectText}>
              <span className={s.contextLabel}>CENTRO DE COSTO</span>
              <select
                className={s.ccSelect}
                value={costCenter}
                onChange={(event) => setCostCenter(event.target.value)}
                aria-label="Centro de costo activo"
              >
                <option value={1}>Centro 1</option>
                <option value={2}>Centro 2</option>
                <option value={0}>General (0)</option>
              </select>
            </span>
            <ChevronDown size={13} className={s.chevron} aria-hidden="true" />
          </label>

          <div className={s.branchSelector} title="Sucursal actual: Casa Central">
            <span className={s.selectorIcon}><MapPin size={17} /></span>
            <span className={s.branchInfo}>
              <span className={s.contextLabel}>SUCURSAL</span>
              <strong className={s.branchName}>Casa Central</strong>
            </span>
          </div>
        </div>

        <span className={s.actionDivider} aria-hidden="true" />

        <div className={s.actionsWrap}>
          <button
            type="button"
            className={s.aiBtn}
            title="Carga asistida por texto o voz (no es Gemini)"
            aria-label="Abrir asistente de carga por texto o voz"
            onClick={() => setIsAssistantOpen(true)}
          >
            <Sparkles size={17} />
            <span className={s.aiLabel}>Asistente</span>
          </button>

          <button
            type="button"
            className={`${s.notifBtn} ${showNotifs ? s.notifBtnActive : ''}`}
            title="Centro operativo (avisos de ejemplo)"
            aria-label={`Abrir centro operativo, ${operationalAlertsCount} avisos de ejemplo`}
            onClick={() => setShowNotifs(true)}
          >
            <Bell size={18} />
            {operationalAlertsCount > 0 && (
              <span className={s.notifBadge}>{operationalAlertsCount}</span>
            )}
          </button>
        </div>
      </div>

      <VoiceAssistantModal isOpen={isAssistantOpen} onClose={() => setIsAssistantOpen(false)} />
      <OperationalCenter isOpen={showNotifs} onClose={() => setShowNotifs(false)} />
    </header>
  );
}
