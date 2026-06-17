import { useState, useEffect, useCallback } from 'react';
import { 
  Plus, Search, Filter, RefreshCw, ChevronRight, 
  Truck, Archive, Calendar, User, ArrowDown, ArrowUp,
  FileCheck, Trash2, CheckCircle, Clock
} from 'lucide-react';
import { API_URL } from '../../../config';
import { useToast } from '../../../context/ToastContext';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import t from '../../../components/ui/Table.module.css';
import s from './GrainSettlementsPage.module.css'; // Reusing styles
import Skeleton from '../../../components/ui/Skeleton';
import { useNavigate } from 'react-router-dom';
import { navigateToError } from '../../../utils/errorNavigation';
import api from '../../../services/api';

export default function GrainMovementsPage() {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/grains/movements');
      setMovements(data);
    } catch (e) {
      console.error(e);
      navigateToError(navigate, {
        title: 'Error en Movimientos',
        message: 'Ocurrió un problema al cargar el registro de granos.',
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

  return (
    <div className={s.container}>
      <header className={s.header}>
        <div className={s.headerTitle}>
          <h1 className={s.premiumTitle}>Movimientos <span className={s.accentText}>CEREALES</span></h1>
          <p className={s.premiumSubtitle}>Registro de ingresos y egresos de grano (Cartas de Porte / Tickets)</p>
        </div>
        <div className={s.headerActions}>
          <Button variant="primary">
            <Plus size={18} /> Cargar Movimiento
          </Button>
          <Button variant="outline" onClick={fetchData}>
             <RefreshCw size={18} className={loading ? 'spin' : ''} />
          </Button>
        </div>
      </header>

      {/* Simplified summary for movements */}
      <div className={s.summaryGrid}>
         <div className={s.statCardPremium}>
            <div className={s.statInfo}>
              <span className={s.statLabel}>Ingresos Totales</span>
              <h3 className={s.statValue} style={{ color: '#10b981' }}>
                {(movements.filter(m => m.type === 'ENTRY').reduce((acc, m) => acc + (m.clean_kilos/1000), 0)).toFixed(1)} TN
              </h3>
            </div>
            <div className={s.iconCircle} style={{ background: '#ecfdf5', color: '#10b981' }}>
               <ArrowDown size={28} />
            </div>
         </div>
         <div className={s.statCardPremium}>
            <div className={s.statInfo}>
              <span className={s.statLabel}>Egresos Totales</span>
              <h3 className={s.statValue} style={{ color: '#ef4444' }}>
                {(movements.filter(m => m.type === 'EXIT').reduce((acc, m) => acc + (m.clean_kilos/1000), 0)).toFixed(1)} TN
              </h3>
            </div>
            <div className={s.iconCircle} style={{ background: '#fff1f2', color: '#ef4444' }}>
               <ArrowUp size={28} />
            </div>
         </div>
         <div className={s.statCardPremium}>
            <div className={s.statInfo}>
               <span className={s.statLabel}>Pend. Liquidar</span>
               <h3 className={s.statValue}>{movements.filter(m => m.type === 'ENTRY' && !m.settled).length}</h3>
            </div>
            <div className={s.iconCircle} style={{ background: '#fef3c7', color: '#f59e0b' }}>
               <Clock size={28} />
            </div>
         </div>
      </div>

      <div className={s.tableCard}>
        <table className={t.table}>
          <thead>
            <tr className={s.headerRow}>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Productor/Destino</th>
              <th>Grano</th>
              <th>CPe / Ref</th>
              <th className={t.num}>Kilos Netos</th>
              <th className={t.num}>Estado</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
               [1, 2, 3, 4, 5, 6].map(i => (
                <tr key={i}>
                  <td><Skeleton width="100px" height="14px" /></td>
                  <td><Skeleton width="80px" height="14px" /></td>
                  <td><Skeleton width="200px" height="14px" /></td>
                  <td><Skeleton width="100px" height="14px" /></td>
                  <td><Skeleton width="120px" height="14px" /></td>
                  <td className={t.num}><Skeleton width="90px" height="14px" style={{ marginLeft: 'auto' }} /></td>
                  <td className={t.num}><Skeleton width="24px" height="24px" circle style={{ marginLeft: 'auto' }} /></td>
                  <td><Skeleton width="30px" height="24px" style={{ marginLeft: 'auto' }} /></td>
                </tr>
              ))
            ) : movements.length === 0 ? (
              <tr><td colSpan={8} className={s.emptyCell}>No hay movimientos registrados.</td></tr>
            ) : movements.map(m => (
              <tr key={m.id} className={s.tableRow}>
                <td>{new Date(m.date).toLocaleDateString()}</td>
                <td>
                  <span style={{ 
                    padding: '4px 8px', 
                    borderRadius: '6px', 
                    fontSize: '11px', 
                    fontWeight: 800,
                    background: m.type === 'ENTRY' ? '#ecfdf5' : '#fff1f2',
                    color: m.type === 'ENTRY' ? '#10b981' : '#ef4444'
                  }}>
                    {m.type === 'ENTRY' ? 'INGRESO' : 'EGRESO'}
                  </span>
                </td>
                <td>{m.entity_name}</td>
                <td className={s.grainTag}>{m.grain_name}</td>
                <td>
                  <div>{m.cpe_number || 'S/N'}</div>
                  {m.contract_number && (
                    <div style={{ fontSize: 10, color: '#4f46e5', fontWeight: 600 }}>Cont: {m.contract_number}</div>
                  )}
                </td>
                <td className={t.num} style={{ fontWeight: 700 }}>{(m.clean_kilos/1000).toFixed(2)} TN</td>
                <td className={t.num}>
                   {m.settled ? (
                     <CheckCircle size={16} color="#10b981" title="Liquidado" />
                   ) : (
                     <Clock size={16} color="#94a3b8" title="Pendiente de Liquidar" />
                   )}
                </td>
                <td>
                   <Button variant="ghost" size="sm" style={{ color: '#ef4444' }}><Trash2 size={16} /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
