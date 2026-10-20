import React from 'react';
import { FileText, Printer, ArrowUpRight, DollarSign } from 'lucide-react';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';
import t from '../../components/ui/Table.module.css';
import { openNuevoReciboDesdeFactura } from '../../utils/openStandaloneWindow';

function getLineProductName(line) {
  return (
    line.product_name ||
    line.product?.name ||
    line.product_description ||
    line.description ||
    line.name ||
    "Concepto sin nombre"
  );
}

function formatQty(value) {
  const n = Number(value || 0);
  return Number.isInteger(n)
    ? String(n)
    : n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function InvoiceQuickPreview({ detail, entities, onOpenFull, onPrint, onOpenCollectionModal }) {
  if (!detail) return null;

  const entity = entities?.find(e => String(e.id) === String(detail.entity_id));

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  };

  const salesOrders = detail.sales_orders || [];
  const isCancelledDn = (status) => {
    const raw = String(status || '').toUpperCase();
    return ['CANCELLED', 'CANCELED', 'ANULLED', 'VOID', 'VOIDED', 'ANULADO', 'CANCELADO'].includes(raw);
  };
  const deliveryNotes = (detail.delivery_notes || []).filter(dn => !isCancelledDn(dn.status));
  const isDirect = salesOrders.length === 0 && deliveryNotes.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
      {/* Header Compacto */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 12 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ background: 'var(--primary-light)', padding: 12, borderRadius: 12, color: 'var(--primary)' }}>
            <FileText size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text)' }}>
                Factura {detail.number}
              </h2>
              <StatusBadge status={detail.status} />
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--muted)', fontWeight: 500, flexWrap: 'wrap' }}>
              <span>Cliente: <strong style={{ color: 'var(--text)' }}>{entity?.name || detail.entity_name || detail.entity_id}</strong></span>
              <span>·</span>
              <span>Fecha: <strong style={{ color: 'var(--text)' }}>{formatDate(detail.date)}</strong></span>
              <span>·</span>
              <span>Vencimiento: <strong style={{ color: 'var(--text)' }}>{formatDate(detail.due_date)}</strong></span>
              <span>·</span>
              <span>Moneda: <strong style={{ color: 'var(--text)' }}>{detail.currency || 'ARS'}</strong></span>
              
              {detail.condition && (
                <>
                  <span>·</span>
                  <span>Condición: <strong style={{ color: 'var(--text)' }}>{detail.condition}</strong></span>
                </>
              )}
              
              {salesOrders.length > 0 && (
                <>
                  <span>·</span>
                  <span style={{ color: 'var(--primary)' }}>Origen OV: <strong>{salesOrders.map(o => o.number).join(', ')}</strong></span>
                </>
              )}

              {(salesOrders.length > 0 || (detail.delivery_notes && detail.delivery_notes.length > 0)) && (
                <>
                  <span>·</span>
                  {deliveryNotes.length > 0 ? (
                    <span style={{ color: 'var(--primary)' }}>Remito: <strong>{deliveryNotes.map(n => n.number).join(', ')}</strong></span>
                  ) : (
                    <span style={{ color: 'var(--text)' }}>Remito: <strong>Sin remito vinculado</strong></span>
                  )}
                </>
              )}

              {isDirect && (
                <>
                  <span>·</span>
                  <span>Origen: <strong style={{ color: 'var(--text)' }}>Directo</strong></span>
                </>
              )}
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: 8 }}>
          {onPrint && (
            <Button variant="secondary" onClick={() => onPrint(detail.id)} style={{ background: '#f8fafc', color: '#475569' }}>
              <Printer size={16} /> Imprimir
            </Button>
          )}
          {onOpenFull && (
            <Button variant="primary" onClick={() => onOpenFull(detail.id)}>
              <ArrowUpRight size={16} /> Abrir Completo
            </Button>
          )}
          {(() => {
            let saldoNum = null;
            if (detail.pending_amount != null) saldoNum = Number(detail.pending_amount);
            else if (detail.balance != null) saldoNum = Number(detail.balance);
            else if (detail.open_balance != null) saldoNum = Number(detail.open_balance);
            else if (detail.amount_due != null) saldoNum = Number(detail.amount_due);
            else if (detail.amount_applied != null) saldoNum = Number(detail.total_amount || 0) - Number(detail.amount_applied);
            
            if ((detail.status === 'OPEN' || detail.status === 'PARTIAL') && (saldoNum === null || saldoNum > 0)) {
              return (
                <Button
                  variant="success"
                  onClick={() => onOpenCollectionModal ? onOpenCollectionModal() : openNuevoReciboDesdeFactura(detail)}
                  style={{ background: '#16a34a', color: '#fff', fontWeight: 700 }}
                >
                  <DollarSign size={16} /> Cobrar
                </Button>
              );
            }
            return null;
          })()}
        </div>
      </div>

      {/* Items Table Container */}
      <div style={{ overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8, maxHeight: 300 }}>
        <table className={t.table} style={{ width: '100%', margin: 0 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-page)', fontSize: 11 }}>
            <tr>
              <th className={t.th}>CONCEPTO / PRODUCTO</th>
              <th className={t.th} style={{ textAlign: 'center' }}>ENVASES</th>
              <th className={t.th} style={{ textAlign: 'center' }}>CANTIDAD</th>
              <th className={t.th} style={{ textAlign: 'center' }}>UNIDAD</th>
              <th className={t.th} style={{ textAlign: 'right' }}>PRECIO U.</th>
              <th className={t.th} style={{ textAlign: 'right' }}>NETO</th>
              <th className={t.th} style={{ textAlign: 'right' }}>IVA</th>
              <th className={t.th} style={{ textAlign: 'right' }}>TOTAL</th>
              <th className={t.th} style={{ textAlign: 'center' }}>CUENTA</th>
            </tr>
          </thead>
          <tbody>
            {(detail.lines || []).map((line, idx) => {
              const productName = getLineProductName(line);
              const qty = parseFloat(line.qty) || 0;
              const envases = parseFloat(line.containers || line.container_qty || line.packages) || 0;
              const price = parseFloat(line.unit_price) || 0;
              const vatRate = parseFloat(line.vat_rate) || 0.21;
              const lineNeto = qty * price;
              const lineVat = lineNeto * vatRate;
              const lineTotal = lineNeto + lineVat;

              return (
                <tr key={idx} className={t.row} style={{ fontSize: 12 }}>
                  <td className={t.td} style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {productName}
                  </td>
                  <td className={t.td} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    {envases > 0 ? formatQty(envases) : '-'}
                  </td>
                  <td className={t.td} style={{ textAlign: 'center', fontWeight: 700 }}>
                    {formatQty(qty)}
                  </td>
                  <td className={t.td} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    {line.unit_short_name || 'u'}
                  </td>
                  <td className={t.td} style={{ textAlign: 'right', color: 'var(--muted)' }}>
                    {price.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={t.td} style={{ textAlign: 'right', color: 'var(--muted)' }}>
                    {lineNeto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={t.td} style={{ textAlign: 'right', color: 'var(--muted)' }}>
                    {lineVat.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={t.td} style={{ textAlign: 'right', fontWeight: 700 }}>
                    {lineTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={t.td} style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 11 }}>
                    {line.accounting_account_id || '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totals Summary */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', gap: 32, fontSize: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Neto Gravado</span>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{(detail.net_amount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ color: 'var(--muted)', fontWeight: 600 }}>IVA</span>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{((detail.total_amount || 0) - (detail.net_amount || 0)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Total Factura</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)' }}>{detail.currency || 'ARS'} {(detail.total_amount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          </div>
          {(() => {
            let saldoNum = null;
            if (detail.pending_amount != null) saldoNum = Number(detail.pending_amount);
            else if (detail.balance != null) saldoNum = Number(detail.balance);
            else if (detail.open_balance != null) saldoNum = Number(detail.open_balance);
            else if (detail.amount_due != null) saldoNum = Number(detail.amount_due);
            else if (detail.amount_applied != null) saldoNum = Number(detail.total_amount || 0) - Number(detail.amount_applied);

            if (saldoNum != null && (detail.status === 'OPEN' || detail.status === 'PARTIAL')) {
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingLeft: 24, borderLeft: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Saldo Pendiente</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--primary)' }}>{detail.currency || 'ARS'} {saldoNum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
              );
            } else if (detail.status === 'CLOSED') {
               return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingLeft: 24, borderLeft: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Saldo Pendiente</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--success)' }}>{detail.currency || 'ARS'} 0,00</span>
                </div>
              );
            }
            return null;
          })()}
        </div>
      </div>

      {/* Sección COBRO */}
      {(() => {
        const receipts = detail.applied_by || [];
        const totalAplied = receipts.reduce((s, r) => s + Number(r.amount_applied || 0), 0);
        const pending = detail.pending_amount != null
          ? Number(detail.pending_amount)
          : Math.max(0, Number(detail.total_amount || 0) - totalAplied);
        const paidPct = detail.total_amount > 0
          ? Math.min(100, Math.round((totalAplied / detail.total_amount) * 100))
          : (detail.status === 'CLOSED' ? 100 : 0);

        return (
          <div style={{ marginTop: 16, padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>
                COBRO
              </span>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, fontWeight: 600 }}>
                <span>Aplicado: <strong style={{ color: '#16a34a' }}>{detail.currency} {totalAplied.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong></span>
                <span>Saldo pendiente: <strong style={{ color: pending > 0 ? 'var(--primary)' : '#16a34a' }}>{detail.currency} {pending.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong></span>
                <span style={{ background: paidPct === 100 ? '#dcfce7' : '#e0f2fe', color: paidPct === 100 ? '#16a34a' : '#0369a1', padding: '1px 8px', borderRadius: 10, fontWeight: 700, fontSize: 11 }}>Cobro: {paidPct}%</span>
              </div>
            </div>
            {receipts.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12 }}>Sin cobros registrados</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {receipts.map((r, i) => {
                   const dateObj = new Date(r.created_at || r.from_document_date || Date.now());
                   const isInvalid = isNaN(dateObj.getTime());
                   const dateStr = isInvalid ? '-' : dateObj.toLocaleDateString('es-AR');
                   return (
                     <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
                       <span>Recibo {r.from_document_number || r.number || '-'} · {detail.currency} {Number(r.amount_applied || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })} · {dateStr}</span>
                     </div>
                   );
                })}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
