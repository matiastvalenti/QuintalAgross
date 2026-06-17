import React, { useState, useEffect } from 'react';
import { 
  X, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Calculator,
  ArrowRightLeft,
  Info,
  Scale
} from 'lucide-react';
import styles from './FxAdjustmentModal.module.css';

const API_URL = 'http://localhost:8000';

function formatARS(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(value || 0);
}

export default function FxAdjustmentDocModal({ documentId, onClose, onConfirmed }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPreview();
  }, [documentId]);

  const fetchPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/accounting/documents/${documentId}/fx-adjustment/preview`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.detail || 'Error al obtener preview');
        return;
      }
      setData(json);
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (mode = 'FISCAL') => {
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/accounting/documents/${documentId}/fx-adjustment/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.detail || 'Error al confirmar');
        return;
      }
      setConfirmed(true);
      if (onConfirmed) setTimeout(() => onConfirmed(json), 1500);
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setConfirming(false);
    }
  };

  if (!data && loading) {
     return (
        <div className={styles.overlay}>
             <div className={styles.modal}>
                 <div className={styles.loadingText}>
                    <RefreshCw size={32} className="animate-spin" style={{ marginBottom: 12, color: 'var(--primary)' }} />
                    <p>Analizando brecha cambiaria...</p>
                 </div>
             </div>
        </div>
     );
  }

  // Si no hay nada que ajustar pero ya cargo
  if (data && !data.has_any_adjustment) {
      // Directamente no mostrar nada, o cerrar
      // Como no se ejecuta JSX desde un efecto fácil sin warning, lo llamamos si es seguro.
      setTimeout(() => onConfirmed && onConfirmed(), 100);
      return null;
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: 800 }}>
        <header className={styles.header}>
          <h3><ArrowRightLeft size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} /> Diferencias de Cambio Detectadas</h3>
          <button className={styles.closeBtn} onClick={onClose}><X size={24} /></button>
        </header>

        <div className={styles.body}>
          {error && (
            <div className={styles.errorText}>
              <AlertCircle size={32} style={{ marginBottom: 12, color: 'var(--error)' }} />
              <p>{error}</p>
            </div>
          )}

          {confirmed && (
            <div className={styles.successBanner}>
              <CheckCircle2 size={48} style={{ marginBottom: 16 }} />
              <div>
                <strong>Ajuste completado con éxito</strong>
                <p style={{ marginTop: 8 }}>
                  Las diferencias de cambio han sido procesadas según lo indicado.
                </p>
              </div>
            </div>
          )}

          {data && data.has_any_adjustment && !confirmed && !error && (
            <>
              <div className={styles.summaryBox}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <Info size={18} style={{ marginTop: 2, color: '#3b82f6' }} />
                  <div>
                    <p className={styles.reason}>Se detectaron cobros/pagos a un Tipo de Cambio distinto al que fueron emitidas las facturas.</p>
                    <p style={{ fontSize: '0.85rem', color: '#1e3a8a', marginTop: 4 }}>
                        El saldo en moneda original (USD) queda saldado perfectamente, pero queda una diferencia en Pesos (ARS) en la cuenta corriente.
                    </p>
                  </div>
                </div>
              </div>

              {/* Recibir los previews */}
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {Object.entries(data.previews).map(([appId, p]) => {
                      if (!p.needs_adjustment) return null;
                      return (
                          <div key={appId} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
                              <p style={{ fontWeight: 'bold', margin: '0 0 8px 0', fontSize: '0.9rem' }}>
                                  {p.reason}
                              </p>
                              <div style={{ display: 'flex', gap: '30px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                  <span>Total a Ajustar: <strong style={{color: 'var(--text-main)'}}>{p.sign} {formatARS(p.total_ars)}</strong></span>
                                  <span>Neto: {formatARS(p.total_net_ars)}</span>
                                  <span>IVA: {formatARS(p.total_vat_ars)}</span>
                              </div>
                          </div>
                      )
                  })}
              </div>

              <div className={styles.actions} style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 30 }}>
                <div>
                   <button className={styles.cancelBtn} onClick={onClose} style={{ color: 'var(--text-muted)' }}>Ignorar (Dejar Saldo Colgado)</button>
                </div>
                <div style={{ display: 'flex', gap: 15 }}>
                    <button
                        className={styles.cancelBtn}
                        onClick={() => handleConfirm('COMPENSATION')}
                        disabled={confirming}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, borderColor: '#3b82f6', color: '#3b82f6', fontWeight: 600 }}
                        title="Corrige el saldo en ARS sin facturarle nada al cliente ni calcularle IVA."
                    >
                    {confirming ? <RefreshCw size={16} className="animate-spin" /> : <Scale size={16} />}
                    Compensar (Saldo Cero)
                    </button>
                    
                    <button
                        className={styles.confirmBtn}
                        onClick={() => handleConfirm('FISCAL')}
                        disabled={confirming}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        title="Genera una Nota de Débito / Crédito fiscal por la diferencia, calculando los respectivos IVAs."
                    >
                    {confirming ? <RefreshCw size={16} className="animate-spin" /> : <Calculator size={16} />}
                    Generar Notas (Fiscal)
                    </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
