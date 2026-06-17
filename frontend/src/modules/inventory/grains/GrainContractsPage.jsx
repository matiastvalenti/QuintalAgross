import { useState, useEffect, useCallback } from 'react';
import { 
  Plus, Search, Filter, RefreshCw, FileText, 
  ArrowRight, CheckCircle, Clock, Trash2, 
  Target, Info, Calendar, User, Package
} from 'lucide-react';
import { API_URL } from '../../../config';
import { useToast } from '../../../context/ToastContext';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import t from '../../../components/ui/Table.module.css';
import s from './GrainSettlementsPage.module.css';
import GrainContractModal from './GrainContractModal';
import Skeleton from '../../../components/ui/Skeleton';
import { useNavigate } from 'react-router-dom';
import { navigateToError } from '../../../utils/errorNavigation';
import api from '../../../services/api';

export default function GrainContractsPage() {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/grains/contracts');
      setContracts(data);
    } catch (e) {
      console.error(e);
      navigateToError(navigate, {
        title: 'Error en Contratos',
        message: 'Ocurrió un problema al cargar los contratos de granos.',
        cause: e.message,
        status: 500
      });
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchData();
    window.addEventListener('cost-center-changed', fetchData);
    return () => window.removeEventListener('cost-center-changed', fetchData);
  }, [fetchData]);

  const getProgressColor = (contract) => {
    const p = (Number(contract.delivered_kilos) / Number(contract.total_kilos)) * 100;
    if (p >= 100) return '#10b981';
    if (p > 80) return '#3b82f6';
    if (p > 0) return '#f59e0b';
    return '#94a3b8';
  };

  return (
    <div className={s.container}>
      <header className={s.header}>
        <div className={s.headerTitle}>
          <h1 className={s.premiumTitle}>Contratos <span className={s.accentText}>CEREALES</span></h1>
          <p className={s.premiumSubtitle}>Gestión de cupos y compromisos de entrega de granos</p>
        </div>
        <div className={s.headerActions}>
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <Plus size={18} /> Nuevo Contrato
          </Button>
          <Button variant="outline" onClick={fetchData}>
             <RefreshCw size={18} className={loading ? 'spin' : ''} />
          </Button>
        </div>
      </header>

      <div className={s.summaryGrid}>
         <div className={s.statCardPremium}>
            <div className={s.statInfo}>
               <span className={s.statLabel}>Contratos Activos</span>
               <h3 className={s.statValue}>{contracts.filter(c => c.status === 'OPEN').length}</h3>
            </div>
            <div className={s.iconCircle} style={{ background: '#ecfdf5', color: '#10b981' }}>
               <FileText size={28} />
            </div>
         </div>
         <div className={s.statCardPremium}>
            <div className={s.statInfo}>
               <span className={s.statLabel}>Total Kilos Pautados</span>
               <h3 className={s.statValue}>
                  {(contracts.reduce((acc, c) => acc + (Number(c.total_kilos)/1000), 0)).toFixed(1)} TN
               </h3>
            </div>
            <div className={s.iconCircle} style={{ background: '#f0f9ff', color: '#3b82f6' }}>
               <Package size={28} />
            </div>
         </div>
         <div className={s.statCardPremium}>
            <div className={s.statInfo}>
               <span className={s.statLabel}>Cumplimiento Prom.</span>
               <h3 className={s.statValue}>
                  {contracts.length > 0 
                    ? ((contracts.reduce((acc, c) => acc + (Number(c.delivered_kilos) / Number(c.total_kilos)), 0) / contracts.length) * 100).toFixed(0)
                    : 0}%
               </h3>
            </div>
            <div className={s.iconCircle} style={{ background: '#fef3c7', color: '#f59e0b' }}>
               <CheckCircle size={28} />
            </div>
         </div>
      </div>

      <div className={s.tableCard}>
        <table className={t.table}>
          <thead>
            <tr className={s.headerRow}>
              <th>N° Contrato</th>
              <th>Entidad</th>
              <th>Grano / Campaña</th>
              <th className={t.num}>Kilos Comp.</th>
              <th className={t.num}>Progreso</th>
              <th className={t.num}>Estado</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1, 2, 3, 4, 5].map(i => (
                <tr key={i}>
                  <td><Skeleton width="100px" height="14px" /></td>
                  <td><Skeleton width="180px" height="14px" /></td>
                  <td><Skeleton width="120px" height="14px" /></td>
                  <td className={t.num}><Skeleton width="60px" height="14px" style={{ marginLeft: 'auto' }} /></td>
                  <td className={t.num}><Skeleton width="100px" height="20px" style={{ marginLeft: 'auto' }} /></td>
                  <td className={t.num}><Skeleton width="70px" height="20px" borderRadius="10px" style={{ marginLeft: 'auto' }} /></td>
                  <td><Skeleton width="30px" height="24px" style={{ marginLeft: 'auto' }} /></td>
                </tr>
              ))
            ) : contracts.length === 0 ? (
              <tr><td colSpan={7} className={s.emptyCell}>No hay contratos registrados.</td></tr>
            ) : contracts.map(c => {
               const progress = (Number(c.delivered_kilos) / Number(c.total_kilos)) * 100;
               return (
                <tr key={c.id} className={s.tableRow}>
                  <td>
                    <div style={{ fontWeight: 800, color: '#1e293b' }}>{c.number}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{new Date(c.date).toLocaleDateString()}</div>
                  </td>
                  <td>
                    <div className={s.entityName}>{c.entity_name}</div>
                    <div className={s.typeBadge} style={{ 
                      display: 'inline-block', 
                      background: c.type === 'PURCHASE' ? '#eff6ff' : '#faf5ff',
                      color: c.type === 'PURCHASE' ? '#2563eb' : '#9333ea',
                      marginTop: 4
                    }}>
                      {c.type === 'PURCHASE' ? 'COMPRA' : 'VENTA'}
                    </div>
                  </td>
                  <td>
                    <div className={s.grainTag}>{c.grain_name}</div>
                    <div className={s.miniSub}>{c.harvest_name}</div>
                  </td>
                  <td className={t.num} style={{ fontWeight: 700 }}>
                    {(Number(c.total_kilos)/1000).toFixed(0)} TN
                  </td>
                  <td className={t.num}>
                    <div style={{ width: '100%', maxWidth: 120, marginLeft: 'auto' }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
                          <span>{(Number(c.delivered_kilos)/1000).toFixed(1)} TN</span>
                          <span>{progress.toFixed(0)}%</span>
                       </div>
                       <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ 
                            height: '100%', 
                            width: `${Math.min(progress, 100)}%`, 
                            background: getProgressColor(c),
                            transition: 'width 0.5s ease'
                          }} />
                       </div>
                    </div>
                  </td>
                  <td className={t.num}>
                    <span className={`${s.statusBadge} ${c.status === 'OPEN' ? s.statusOpen : s.statusClosed}`}>
                      {c.status === 'OPEN' ? 'ABIERTO' : 'CERRADO'}
                    </span>
                  </td>
                  <td>
                    <Button variant="ghost" size="sm"><ArrowRight size={18} /></Button>
                  </td>
                </tr>
               )
            })}
          </tbody>
        </table>
      </div>

      <GrainContractModal 
        open={showModal} 
        onClose={() => setShowModal(false)} 
        onSaved={fetchData} 
      />
    </div>
  );
}
