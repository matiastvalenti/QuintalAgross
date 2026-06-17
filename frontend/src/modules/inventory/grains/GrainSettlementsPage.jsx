import { useState, useEffect, useCallback } from 'react';
import { 
  Plus, Search, Filter, RefreshCw, ChevronRight, 
  FileText, TrendingUp, Package, Calendar, User,
  ArrowUpRight, ArrowDownRight, CheckCircle, Clock, FileCheck
} from 'lucide-react';
import { API_URL } from '../../../config';
import { useToast } from '../../../context/ToastContext';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import t from '../../../components/ui/Table.module.css';
import s from './GrainSettlementsPage.module.css';
import GrainSettlementModal from './GrainSettlementModal';
import Skeleton from '../../../components/ui/Skeleton';
import { useNavigate } from 'react-router-dom';
import { navigateToError } from '../../../utils/errorNavigation';
import api from '../../../services/api';

export default function GrainSettlementsPage({ type }) {
  const [settlements, setSettlements] = useState([]);
  const [grains, setGrains] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filters, setFilters] = useState({ 
    entity_id: '', 
    grain_type_id: '', 
    harvest_id: '', 
    settlement_type: type || '',
    operation_type: ''
  });
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Update filters if type prop changes
  useEffect(() => {
    if (type) setFilters(f => ({ ...f, settlement_type: type }));
  }, [type]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const settleParams = {
        entity_id: filters.entity_id,
        grain_type_id: filters.grain_type_id,
        settlement_type: filters.settlement_type,
        harvest_id: filters.harvest_id
      };
      
      const [settlements, grains, harvests] = await Promise.all([
        api.get('/grains/settlements', settleParams),
        api.get('/grains/types'),
        api.get('/grains/harvests')
      ]);

      setSettlements(settlements);
      setGrains(grains);
      setHarvests(harvests);
    } catch (e) {
      console.error(e);
      navigateToError(navigate, {
        title: 'Error en Cereales',
        message: 'Ocurrió un problema al cargar la sección de granos.',
        cause: e.message,
        status: 500
      });
    } finally {
      setLoading(false);
    }
  }, [filters, navigate]);

  useEffect(() => {
    fetchData();
    window.addEventListener('cost-center-changed', fetchData);
    return () => window.removeEventListener('cost-center-changed', fetchData);
  }, [fetchData]);

  const fmt = (v, curr = 'USD') => 
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: curr }).format(v || 0);

  const totalTons = settlements.reduce((acc, s) => acc + (s.total_kilos / 1000), 0);
  const totalUsd = settlements.reduce((acc, s) => acc + s.net_amount, 0);

  const pageTitle = type === 'PRIMARY' ? 'Primarias (Compra)' : type === 'SECONDARY' ? 'Secundarias (Venta)' : 'Liquidaciones';

  return (
    <div className={s.container}>
      <header className={s.header}>
        <div className={s.headerTitle}>
          <h1 className={s.premiumTitle}>Liquidaciones <span className={s.accentText}>{type === 'PRIMARY' ? 'Primarias' : 'Secundarias'}</span></h1>
          <p className={s.premiumSubtitle}>Gestión de {pageTitle}</p>
        </div>
        <div className={s.headerActions}>
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <Plus size={18} /> Nueva {type === 'PRIMARY' ? 'LPG' : 'LSG'}
          </Button>
          <Button variant="outline" onClick={fetchData}>
             <RefreshCw size={18} className={loading ? 'spin' : ''} />
          </Button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className={s.summaryGrid}>
         <div className={s.statCardPremium}>
            <div className={s.statInfo}>
              <span className={s.statLabel}>Kilos Liq. (Entrada)</span>
              <h3 className={s.statValue}>
                {(settlements.filter(s => s.settlement_type === 'PRIMARY').reduce((acc, s) => acc + (Number(s.total_kilos)/1000), 0)).toFixed(1)} TN
              </h3>
            </div>
            <div className={s.iconCircle} style={{ background: '#ecfdf5', color: '#10b981' }}>
              <ArrowDownRight size={28} />
            </div>
         </div>
         <div className={s.statCardPremium}>
            <div className={s.statInfo}>
              <span className={s.statLabel}>Kilos Liq. (Salida)</span>
              <h3 className={s.statValue}>
                {(settlements.filter(s => s.settlement_type === 'SECONDARY').reduce((acc, s) => acc + (Number(s.total_kilos)/1000), 0)).toFixed(1)} TN
              </h3>
            </div>
            <div className={s.iconCircle} style={{ background: '#fff1f2', color: '#ef4444' }}>
              <ArrowUpRight size={28} />
            </div>
         </div>
         <div className={s.statCardPremium}>
            <div className={s.statInfo}>
              <span className={s.statLabel}>Total Operaciones</span>
              <h3 className={s.statValue}>{settlements.length}</h3>
            </div>
            <div className={s.iconCircle} style={{ background: '#f0f9ff', color: '#3b82f6' }}>
               <FileCheck size={28} />
            </div>
         </div>
      </div>

      <div className={s.filtersCard}>
        <div className={s.filterGroup}>
          {!type && (
            <div className={s.filterItem} style={{ flex: 1.5 }}>
              <label>Tipo de Liquidación</label>
              <Select value={filters.settlement_type} onChange={e => setFilters(f => ({...f, settlement_type: e.target.value}))}>
                <option value="">Todas</option>
                <option value="PRIMARY">Primaria (Compra)</option>
                <option value="SECONDARY">Secundaria (Venta)</option>
              </Select>
            </div>
          )}
          <div className={s.filterItem}>
            <label>Grano</label>
            <Select value={filters.grain_type_id} onChange={e => setFilters(f => ({...f, grain_type_id: e.target.value}))}>
              <option value="">Todos los granos</option>
              {grains.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
          <div className={s.filterItem}>
            <label>Campaña</label>
            <Select value={filters.harvest_id} onChange={e => setFilters(f => ({...f, harvest_id: e.target.value}))}>
              <option value="">Todas</option>
              {harvests.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
          </div>
        </div>
      </div>

      <div className={s.tableCard}>
        <table className={t.table}>
          <thead>
            <tr className={s.headerRow}>
              <th>Imputación</th>
              <th>Comprobante</th>
              <th>Número / COE</th>
              <th>Tipo</th>
              <th>Productor / Corredor</th>
              <th>Granos</th>
              <th>Importe</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1, 2, 3, 4, 5, 6].map(i => (
                <tr key={i}>
                  <td><Skeleton width="100px" height="14px" /></td>
                  <td><Skeleton width="100px" height="14px" /></td>
                  <td><Skeleton width="120px" height="14px" /></td>
                  <td><Skeleton width="40px" height="20px" borderRadius="10px" /></td>
                  <td><Skeleton width="180px" height="14px" /></td>
                  <td><Skeleton width="120px" height="14px" /></td>
                  <td className={t.num}><Skeleton width="90px" height="14px" style={{ marginLeft: 'auto' }} /></td>
                  <td><Skeleton width="24px" height="24px" circle /></td>
                </tr>
              ))
            ) : settlements.length === 0 ? (
              <tr><td colSpan={8} className={s.emptyCell}>No hay liquidaciones registradas.</td></tr>
            ) : settlements.map(sett => (
              <tr key={sett.id} className={s.tableRow}>
                <td>{new Date(sett.input_date || sett.date).toLocaleDateString()}</td>
                <td>{new Date(sett.date).toLocaleDateString()}</td>
                <td>
                   <div style={{ fontWeight: 700 }}>{sett.number}</div>
                   {sett.coe_number && <div style={{fontSize: 10, color: '#64748b'}}>COE: {sett.coe_number}</div>}
                </td>
                <td>
                   <span className={`${s.typeBadge} ${sett.settlement_type === 'PRIMARY' ? s.primaryBadge : s.secondaryBadge}`}>
                     {sett.settlement_type === 'PRIMARY' ? 'PG' : 'SG'}
                   </span>
                </td>
                <td>
                  <div style={{fontWeight: 600}}>{sett.entity_name}</div>
                  {sett.broker_name && <div style={{fontSize: 10, color: '#4f46e5'}}>Interm: {sett.broker_name}</div>}
                </td>
                <td>
                   <div style={{fontWeight: 700}}>{sett.grain_name}</div>
                   <div style={{fontSize: 10}}>{(sett.total_kilos / 1000).toFixed(2)} TN</div>
                </td>
                <td className={t.num}>
                   <div style={{fontSize: 10, color: '#94a3b8'}}>{sett.currency}</div>
                   <div style={{ fontWeight: 900, fontSize: 14 }}>{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(sett.net_amount)}</div>
                </td>
                <td>
                  <Button variant="ghost" size="sm"><ChevronRight size={16} /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <GrainSettlementModal 
          onClose={() => setShowModal(false)} 
          onSuccess={fetchData} 
          initialType={type}
        />
      )}
    </div>
  );
}
