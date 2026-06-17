import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, Building2, ChevronDown, Menu, MapPin, DollarSign, Filter, CheckCircle, AlertTriangle, AlertCircle, TrendingUp, Info, Layers } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCostCenter } from '../../context/CostCenterContext';
import api from '../../services/api';
import s from './Topbar.module.css';
import VoiceAssistantModal from '../VoiceAssistant/VoiceAssistantModal';
import { Sparkles as SparklesIcon } from 'lucide-react';
import OperationalCenter from '../notifications/OperationalCenter';
import { useSearch } from '../../context/SearchContext';
import { getCriticalCount } from '../../data/mockNotifications';

export default function Topbar({ onMenuClick }) {
  const navigate = useNavigate();
  const { costCenter, setCostCenter } = useCostCenter();
  const [realCount, setRealCount] = useState(0);
  const [bcraRate, setBcraRate] = useState(null);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const { openSearch } = useSearch();

  // TODO: Obtener el recuento de alertas operativas reales desde una API.
  // Por ahora se calcula sumando los items críticos del seed temporal.
  const operationalAlertsCount = getCriticalCount();

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        openSearch();
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [openSearch]);


  return (

    <header className={s.topbar}>
      <div className={s.left}>
        <button className={s.menuBtn} onClick={onMenuClick}>
          <Menu size={20} />
        </button>
        
        <div className={s.search} onClick={openSearch} style={{ cursor: 'pointer' }}>
          <Search size={16} className={s.searchIcon} />
          <input className={s.searchInput} placeholder="Buscar órdenes, clientes, facturas... (Ctrl+K)" readOnly style={{ cursor: 'pointer' }} />
          <div className={s.searchShortcut}>K</div>
        </div>
      </div>

      <div className={s.right}>
        {/* Cost Center Selector */}
        <div className={s.costCenterSelector}>
          <Layers size={13} style={{ color: costCenter === 1 ? '#4f46e5' : (costCenter === 2 ? '#0891b2' : '#6366f1') }} />
          <span className={s.ccLabel}>C. Costo</span>
          <select
            className={s.ccSelect}
            value={costCenter}
            onChange={e => setCostCenter(e.target.value)}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={0}>0</option>
          </select>
        </div>

        <div className={s.branchSelector}>
          <div className={s.branchIcon}><MapPin size={14} /></div>
          <div className={s.branchInfo}>
            <span className={s.branchName}>Casa Central</span>
          </div>
          <ChevronDown size={14} className={s.chevron} />
        </div>

        {/* BCRA Rate Display */}
        {bcraRate && (
          <div className={s.bcraRate} title="Dólar Divisa - Venta" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', padding: '6px 12px', borderRadius: '10px', border: '1px solid #bbf7d0', cursor: 'default' }}>
            <DollarSign size={14} color="#15803d" />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>{bcraRate.toFixed(2)}</span>
          </div>
        )}

        <div className={s.actionsWrap}>
          <button 
            className={s.aiBtn} 
            title="Asistente de Ventas con IA"
            onClick={() => setIsAssistantOpen(true)}
          >
            <SparklesIcon size={18} />
          </button>

          <div className={`notifWrapper ${s.notifWrapper}`} style={{ position: 'relative' }}>
              <button className={`${s.notifBtn} ${showNotifs ? s.notifBtnActive : ''}`} onClick={() => setShowNotifs(true)}>
                <Bell size={18} />
                {operationalAlertsCount > 0 && (
                  <span className={s.notifBadge}>
                    {operationalAlertsCount}
                  </span>
                )}
              </button>
          </div>
        </div>

        <VoiceAssistantModal 
          isOpen={isAssistantOpen} 
          onClose={() => setIsAssistantOpen(false)} 
        />

        <OperationalCenter isOpen={showNotifs} onClose={() => setShowNotifs(false)} />
      </div>
    </header>
  );
}
