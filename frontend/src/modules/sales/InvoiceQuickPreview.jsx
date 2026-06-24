import React from 'react';
import { FileText, Printer, ArrowUpRight } from 'lucide-react';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';
import t from '../../components/ui/Table.module.css';

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

export default function InvoiceQuickPreview({ detail, entities, onOpenFull, onPrint }) {
  if (!detail) return null;

  const entity = entities?.find(e => String(e.id) === String(detail.entity_id));

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  };

  const salesOrders = detail.sales_orders || [];
  const deliveryNotes = detail.delivery_notes || [];
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

              {deliveryNotes.length > 0 && (
                <>
                  <span>·</span>
                  <span style={{ color: 'var(--primary)' }}>Remito: <strong>{deliveryNotes.map(n => n.number).join(', ')}</strong></span>
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
    </div>
  );
}
