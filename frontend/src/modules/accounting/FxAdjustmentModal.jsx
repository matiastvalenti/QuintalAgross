import { useState } from 'react';
import { 
  X, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Calculator,
  ArrowRightLeft,
  Info
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

function formatVatRate(rate) {
  return `${(rate * 100).toFixed(1).replace('.0', '').replace('.', ',')}%`;
}

export default function FxAdjustmentModal({ applicationId, onClose, onConfirmed }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const [error, setError] = useState(null);

  const fetchPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/accounting/documents/applications/${applicationId}/fx-adjustment/preview`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Error al obtener preview');
        return;
      }
      setPreview(data);
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/accounting/documents/applications/${applicationId}/fx-adjustment/confirm`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Error al confirmar');
        return;
      }
      setConfirmed(data);
      if (onConfirmed) setTimeout(() => onConfirmed(data), 1500);
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setConfirming(false);
    }
  };

  // Auto-fetch preview on mount
  if (!preview && !loading && !error) {
    fetchPreview();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <header className={styles.header}>
          <h3><ArrowRightLeft size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} /> Ajuste por Diferencia de Cambio</h3>
          <button className={styles.closeBtn} onClick={onClose}><X size={24} /></button>
        </header>

        <div className={styles.body}>
          {loading && (
            <div className={styles.loadingText}>
              <RefreshCw size={32} className="animate-spin" style={{ marginBottom: 12, color: 'var(--primary)' }} />
              <p>Analizando brecha cambiaria y calculando ajustes impositivos...</p>
            </div>
          )}
          
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
                <strong>{confirmed.already_existed ? 'Ajuste ya existente' : 'Ajuste generado con éxito'}</strong>
                <p style={{ marginTop: 8 }}>
                  Documento: <strong>{confirmed.generated_doc_type} {confirmed.generated_doc_number}</strong>
                  <br />
                  Importe Total: <strong>{formatARS(confirmed.total_ars)}</strong>
                </p>
              </div>
            </div>
          )}

          {preview && !confirmed && (
            <>
              <div className={styles.summaryBox}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <Info size={18} style={{ marginTop: 2, color: '#3b82f6' }} />
                  <div>
                    <p className={styles.reason}>{preview.reason}</p>
                    <div className={styles.tcInfo}>
                      <span>TC Origen (Doc): <strong>{preview.tc_invoice.toFixed(2)}</strong></span>
                      <span>TC Aplicación (Pago): <strong>{preview.tc_application.toFixed(2)}</strong></span>
                      <span>Monto Original: <strong>USD {preview.applied_amount_original.toLocaleString()}</strong></span>
                    </div>
                  </div>
                </div>
              </div>

              {!preview.needs_adjustment ? (
                <div className={styles.noAdjustment}>
                  <CheckCircle2 size={32} style={{ marginBottom: 12, color: '#10b981' }} />
                  <p>No se detectaron diferencias significativas que requieran ajuste contable.</p>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 10, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Detalle del Recálculo (Línea por Línea)
                  </div>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.thLeft}>Concepto</th>
                        <th>IVA%</th>
                        <th>Subtotal (ARS)</th>
                        <th>Neto Adj.</th>
                        <th>IVA Adj.</th>
                        <th>Total Adj.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.lines.map((line, i) => (
                        <tr key={i}>
                          <td>{line.description}</td>
                          <td className={styles.numCell}>{formatVatRate(line.vat_rate)}</td>
                          <td className={styles.numCell}>{formatARS(line.ars_at_invoice_rate)}</td>
                          <td className={styles.numCell}>{formatARS(line.net_ars)}</td>
                          <td className={styles.numCell}>{formatARS(line.vat_ars)}</td>
                          <td className={styles.numCellBold}>{formatARS(line.diff_ars_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className={styles.totalRow}>
                        <td colSpan="3">TOTAL ESTIMADO {preview.sign}</td>
                        <td className={styles.numCellBold}>{formatARS(preview.total_net_ars)}</td>
                        <td className={styles.numCellBold}>{formatARS(preview.total_vat_ars)}</td>
                        <td className={styles.numCellBold} style={{ fontSize: '1rem' }}>{formatARS(preview.total_ars)}</td>
                      </tr>
                    </tfoot>
                  </table>

                  <div className={styles.actions}>
                    <button className={styles.cancelBtn} onClick={onClose}>Descartar</button>
                    <button
                      className={styles.confirmBtn}
                      onClick={handleConfirm}
                      disabled={confirming}
                    >
                      {confirming ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" style={{ marginRight: 8 }} />
                          Procesando...
                        </>
                      ) : (
                        <>
                          <Calculator size={16} style={{ marginRight: 8 }} />
                          Emitir {preview.sign}
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

