import { useState, useEffect, useCallback } from 'react';
import { 
  Package, TrendingUp, ArrowRight, RefreshCw,
  Search, Filter, Info, AlertCircle, FileText
} from 'lucide-react';
import { API_URL } from '../../../config';
import { useToast } from '../../../context/ToastContext';
import Button from '../../../components/ui/Button';
import s from './GrainSettlementsPage.module.css'; // Reusing premium styles
import Skeleton from '../../../components/ui/Skeleton';
import { useNavigate } from 'react-router-dom';
import { navigateToError } from '../../../utils/errorNavigation';
import api from '../../../services/api';

export default function GrainStockPage() {
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/grains/summary');
      setStock(data);
    } catch (e) {
      console.error(e);
      navigateToError(navigate, {
        title: 'Error en Stock',
        message: 'Ocurrió un problema al calcular las existencias de granos.',
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

  const totalPendingTN = stock.reduce((acc, s) => acc + s.pending_settle_tons, 0);
  const totalStockTN = stock.reduce((acc, s) => acc + s.stock_tons, 0);

  return (
    <div className={s.container}>
      <header className={s.header}>
        <div className={s.headerTitle}>
          <h1 className={s.premiumTitle}>Análisis de <span className={s.accentText}>STOCK</span></h1>
          <p className={s.premiumSubtitle}>Control de existencias y mercadería pendiente de liquidar</p>
        </div>
        <div className={s.headerActions}>
           <Button variant="outline" onClick={fetchData}>
              <RefreshCw size={18} className={loading ? 'spin' : ''} />
           </Button>
        </div>
      </header>

      <div className={s.summaryGrid}>
        {loading && stock.length === 0 ? (
          [1, 2, 3].map(i => (
            <div key={i} className={s.statCardPremium}>
               <div className={s.statInfo}>
                  <Skeleton width="100px" height="14px" />
                  <Skeleton width="120px" height="28px" style={{ marginTop: '8px' }} />
                  <Skeleton width="150px" height="12px" style={{ marginTop: '8px' }} />
               </div>
               <div className={s.iconCircle} style={{ background: '#f1f5f9' }}>
                  <Skeleton width="24px" height="24px" circle />
               </div>
               <div className={s.statBar} style={{ background: '#e2e8f0' }} />
            </div>
          ))
        ) : (
          <>
            <div className={s.statCardPremium}>
              <div className={s.statInfo}>
                 <span className={s.statLabel}>Stock Físico Total</span>
                 <h3 className={s.statValue}>
                    {totalStockTN.toFixed(1)} TN
                 </h3>
              </div>
              <div className={s.iconCircle} style={{ background: '#ecfdf5', color: '#10b981' }}>
                 <Package size={28} />
              </div>
            </div>
            <div className={s.statCardPremium}>
              <div className={s.statInfo}>
                 <span className={s.statLabel}>Pendiente Liquidar</span>
                 <h3 className={s.statValue}>
                    {totalPendingTN.toFixed(1)} TN
                 </h3>
              </div>
              <div className={s.iconCircle} style={{ background: '#fef3c7', color: '#f59e0b' }}>
                 <FileText size={28} />
              </div>
            </div>
            <div className={s.statCardPremium}>
              <div className={s.statInfo}>
                 <span className={s.statLabel}>Variedades</span>
                 <h3 className={s.statValue}>{stock.length}</h3>
              </div>
              <div className={s.iconCircle} style={{ background: '#f0f9ff', color: '#3b82f6' }}>
                 <TrendingUp size={28} />
              </div>
            </div>
            {stock.map((item, idx) => (
              <div key={idx} className={s.statCardPremium}>
                <div className={s.statInfo}>
                   <span className={s.statLabel}>{item.grain_type}</span>
                   <h3 className={s.statValue}>{item.stock_tons.toFixed(2)} <span style={{fontSize: 14}}>TN</span></h3>
                   <span style={{fontSize: 11, color: item.pending_settle_tons > 0 ? '#f59e0b' : '#10b981', fontWeight: 700}}>
                     {item.pending_settle_tons > 0 ? `⚠️ ${item.pending_settle_tons.toFixed(2)} TN Pend.` : '✓ Todo Liquidado'}
                   </span>
                </div>
                <div className={s.iconCircle} style={{ background: 'linear-gradient(135deg, #4F46E5, #7C3AED)' }}>
                   <Package size={24} color="white" />
                </div>
                <div className={s.statBar} style={{ background: '#4F46E5' }} />
              </div>
            ))}
          </>
        )}
      </div>

      <div className={s.tableCard}>
         <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
               <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Detalle por Variedad</h4>
               <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Estado de las entregas y su procesamiento administrativo</p>
            </div>
         </div>
         <table className={s.itemTable} style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
               <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: '16px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Grano</th>
                  <th style={{ padding: '16px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>Stock Físico (TN)</th>
                  <th style={{ padding: '16px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>Pend. Liquidar (TN)</th>
                  <th style={{ padding: '16px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>% Pendiente</th>
                  <th style={{ width: 100 }}></th>
               </tr>
            </thead>
            <tbody>
               {loading ? (
                  [1, 2, 3].map(i => (
                    <tr key={i}>
                       <td style={{ padding: '16px' }}><Skeleton width="120px" height="14px" /></td>
                       <td style={{ padding: '16px', textAlign: 'right' }}><Skeleton width="80px" height="14px" style={{ marginLeft: 'auto' }} /></td>
                       <td style={{ padding: '16px', textAlign: 'right' }}><Skeleton width="80px" height="14px" style={{ marginLeft: 'auto' }} /></td>
                       <td style={{ padding: '16px', textAlign: 'right' }}><Skeleton width="100px" height="14px" style={{ marginLeft: 'auto' }} /></td>
                       <td style={{ padding: '16px', textAlign: 'right' }}><Skeleton width="24px" height="24px" circle style={{ marginLeft: 'auto' }} /></td>
                    </tr>
                  ))
               ) : stock.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No hay existencias registradas.</td></tr>
               ) : stock.map((item, idx) => {
                  const pct = item.stock_tons > 0 ? (item.pending_settle_tons / item.stock_tons) * 100 : 0;
                  return (
                     <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '16px', fontWeight: 700, color: '#1e293b' }}>{item.grain_type}</td>
                        <td style={{ padding: '16px', textAlign: 'right', fontWeight: 600 }}>{item.stock_tons.toFixed(2)}</td>
                        <td style={{ padding: '16px', textAlign: 'right', fontWeight: 700, color: item.pending_settle_tons > 0 ? '#d97706' : '#10b981' }}>
                           {item.pending_settle_tons.toFixed(2)}
                        </td>
                        <td style={{ padding: '16px', textAlign: 'right' }}>
                           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                              <div style={{ width: 60, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                                 <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: pct > 50 ? '#ef4444' : '#f59e0b' }} />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{pct.toFixed(0)}%</span>
                           </div>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'right' }}>
                           <Button variant="ghost" size="sm">Detalle <ArrowRight size={14} /></Button>
                        </td>
                     </tr>
                  );
               })}
            </tbody>
         </table>
      </div>
    </div>
  );
}
