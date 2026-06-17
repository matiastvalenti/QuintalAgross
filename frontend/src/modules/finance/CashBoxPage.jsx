import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Wallet, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  RefreshCcw, 
  Plus, 
  LogOut, 
  ChevronRight,
  Calculator,
  History,
  Info,
  DollarSign
} from 'lucide-react';
import api from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import s from './CashBoxPage.module.css';

export default function CashBoxPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [today] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchStatus();
  }, [today]);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/finance/cash/status/${today}`);
      setStatus(res);
    } catch (err) {
      console.error('Error fetching cash status:', err);
      showToast('Error al obtener el estado de caja', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCash = async () => {
    try {
        const balances = { "ARS": 0, "USD": 0 };
        await api.post('/finance/cash/open', {
            date: today,
            balances: balances,
            opened_by: user?.username || 'admin'
        });
        showToast('Caja abierta correctamente', 'success');
        fetchStatus();
    } catch (err) {
        showToast(err.message, 'error');
    }
  };

  const handleCloseCash = async () => {
    if (!window.confirm('¿Está seguro de cerrar la caja por hoy?')) return;
    try {
        await api.post('/finance/cash/close', {
            date: today,
            balances: status.current_balances,
            closed_by: user?.username || 'admin'
        });
        showToast('Caja cerrada con éxito', 'success');
        fetchStatus();
    } catch (err) {
        showToast(err.message, 'error');
    }
  };

  if (loading) return (
    <div className={s.loading}>
      <RefreshCcw className={s.spin} size={48} />
      <p style={{ marginTop: 24 }}>Iniciando posición consolidada...</p>
    </div>
  );

  const isNotStarted = status?.status === 'NOT_STARTED';
  const isOpen = status?.status === 'OPEN';
  const isClosed = status?.status === 'CLOSED';

  return (
    <div className={s.container}>
      <header className={s.header}>
        <div className={s.titleArea}>
          <h1>Control de Cajas</h1>
          <p>Operaciones de tesorería y arqueo diario</p>
        </div>
        <div className={`${s.statusBadge} ${isOpen ? s.statusOpen : isClosed ? s.statusClosed : s.statusNone}`}>
          <div className={s.pulse} />
          {isOpen ? 'CAJA ABIERTA' : isClosed ? 'JORNADA CERRADA' : 'SIN INICIAR'}
        </div>
      </header>

      {isNotStarted ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 40px', background: 'white', borderRadius: '32px', border: '1px solid #e2e8f0' }}>
              <div style={{ padding: '24px', background: '#eff6ff', borderRadius: '24px', color: '#2563eb', marginBottom: '24px' }}>
                <Wallet size={48} />
              </div>
              <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#1e293b', marginBottom: '12px' }}>Apertura de Caja</h2>
              <p style={{ fontSize: '15px', color: '#64748b', textAlign: 'center', maxWidth: '400px', marginBottom: '32px' }}>
                Debe iniciar la jornada de tesorería para poder registrar movimientos, cobros y pagos en efectivo.
              </p>
              <button className={s.btnPrimary} onClick={handleOpenCash}>
                <Plus size={20} />
                Iniciar Jornada
              </button>
          </div>
      ) : (
        <>
          <div className={s.bentoGrid}>
            <div className={s.card}>
               <div className={s.cardIcon} style={{ background: '#f0fdf4', color: '#10b981' }}><DollarSign size={24} /></div>
               <div className={s.cardLabel}>Efectivo ARS</div>
               <div className={s.cardValue}>{formatCurrency(status?.current_balances?.ARS || 0)}</div>
               <div className={s.cardSub}>Balance actual en Caja Local</div>
            </div>

            <div className={s.card}>
               <div className={s.cardIcon} style={{ background: '#eff6ff', color: '#3b82f6' }}><Building2 size={24} /></div>
               <div className={s.cardLabel}>Efectivo USD</div>
               <div className={s.cardValue}>u$s {(status?.current_balances?.USD || 0).toLocaleString()}</div>
               <div className={s.cardSub}>Balance actual en Dólares</div>
            </div>

            <div className={s.card} style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', border: 'none' }}>
               <div className={s.cardIcon} style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}><History size={24} /></div>
               <div className={s.cardLabel} style={{ color: 'rgba(255,255,255,0.6)' }}>Último Cierre</div>
               <div className={s.cardValue} style={{ color: 'white' }}>{isClosed ? 'Hoy' : 'Ayer'}</div>
               <div className={s.cardSub} style={{ color: 'rgba(255,255,255,0.4)' }}>
                 {isClosed ? `Cerrado por ${status.closed_by}` : 'Operación normal'}
               </div>
            </div>
          </div>

          <div className={s.buttonArea}>
             <button className={s.btnSecondary} onClick={fetchStatus}>
               <RefreshCcw size={18} />
               Actualizar Arqueo
             </button>
             {isOpen && (
                <button className={s.btnPrimary} style={{ background: '#1e293b' }} onClick={handleCloseCash}>
                  <LogOut size={18} />
                  Cerrar Jornada
                </button>
             )}
          </div>

          <div className={s.tableContainer}>
            <div className={s.tableHeader}>
               <h2>Movimientos de la Jornada</h2>
               <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '11px', fontWeight: 850, color: '#94a3b8' }}>
                  <Info size={14} />
                  Sincronizado con Tesorería General
               </div>
            </div>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Origen / Origen</th>
                  <th>Concepto / Descripción</th>
                  <th>Moneda</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {status?.movements?.length > 0 ? status.movements.map((m, i) => (
                  <tr key={i}>
                    <td>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td><span style={{ fontWeight: 800 }}>{m.source}</span></td>
                    <td>{m.description}</td>
                    <td><span className={s.cardLabel}>{m.currency}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`${s.amount} ${m.amount >= 0 ? s.positive : s.negative}`}>
                        {m.amount >= 0 ? '+' : ''} {m.amount.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="5" className={s.empty}>
                       <RefreshCcw className={s.spin} size={32} />
                       <p>Sin movimientos registrados en este turno.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

    </div>
  );
}
