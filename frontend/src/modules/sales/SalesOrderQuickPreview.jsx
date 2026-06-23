import React from 'react';
import { FileText, Printer, ArrowUpRight, DollarSign, User, Percent, Clock } from 'lucide-react';
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
    "Producto sin nombre"
  );
}

function formatQty(value) {
  const n = Number(value || 0);
  return Number.isInteger(n)
    ? String(n)
    : n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function SalesOrderQuickPreview({ detail, entities, warehouses, onOpenFull, onPrint }) {
  if (!detail) return null;

  const entity = entities?.find(e => String(e.id) === String(detail.entity_id));
  const warehouse = warehouses?.find(w => String(w.id) === String(detail.warehouse_id));

  // Cálculos rápidos
  const totalQty = detail.lines?.reduce((sum, l) => sum + (parseFloat(l.qty) || 0), 0) || 0;
  const subtotal = detail.lines?.reduce((sum, l) => sum + ((parseFloat(l.qty) || 0) * (parseFloat(l.unit_price) || 0)), 0) || 0;
  const tax = detail.lines?.reduce((sum, l) => sum + ((parseFloat(l.qty) || 0) * (parseFloat(l.unit_price) || 0) * (parseFloat(l.vat_rate) || 0.21)), 0) || 0;
  const total = subtotal + tax;

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  };

  const getEquivalencia = (line) => {
    const qty = parseFloat(line.qty) || 0;
    const factor = parseFloat(line.unit_content || line.product?.quantity_per_container || line.quantity_per_container || 1);
    if (factor && factor !== 1) {
      const eq = qty / factor;
      return `${formatQty(eq)} env.`;
    }
    return '-';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      {/* Header Compacto */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 8 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ background: 'var(--primary-light)', padding: 8, borderRadius: 10, color: 'var(--primary)' }}>
            <FileText size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text)' }}>
                Orden de Venta {detail.number}
              </h2>
              <StatusBadge status={detail.status} />
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--muted)', fontWeight: 500, flexWrap: 'wrap' }}>
              <span>Cliente: <strong style={{ color: 'var(--text)' }}>{entity?.name || detail.entity_id}</strong></span>
              <span>·</span>
              <span>Fecha: <strong style={{ color: 'var(--text)' }}>{formatDate(detail.date)}</strong></span>
              <span>·</span>
              <span>Depósito: <strong style={{ color: 'var(--text)' }}>{warehouse?.name || '-'}</strong></span>
              
              {detail.seller_id && (
                <>
                  <span>·</span>
                  <span>Vendedor: <strong style={{ color: 'var(--text)' }}>{detail.seller_id}</strong></span>
                </>
              )}

              {detail.payment_term && (
                <>
                  <span>·</span>
                  <span>Condición: <strong style={{ color: 'var(--text)' }}>{detail.payment_term}</strong></span>
                </>
              )}

              {detail.currency && (
                <>
                  <span>·</span>
                  <span>Moneda: <strong style={{ color: 'var(--text)' }}>{detail.currency}</strong></span>
                </>
              )}

              {detail.notes && (
                <>
                  <span>·</span>
                  <span>Observaciones: <strong style={{ color: 'var(--text)' }}>{detail.notes}</strong></span>
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
              <th className={t.th}>PRODUCTO</th>
              <th className={t.th} style={{ textAlign: 'center' }}>CANTIDAD</th>
              <th className={t.th} style={{ textAlign: 'center' }}>EQUIV.</th>
              <th className={t.th} style={{ textAlign: 'center' }}>UNIDAD</th>
              <th className={t.th} style={{ textAlign: 'right' }}>PRECIO U.</th>
              <th className={t.th} style={{ textAlign: 'right' }}>NETO</th>
              <th className={t.th} style={{ textAlign: 'right' }}>IVA</th>
              <th className={t.th} style={{ textAlign: 'right' }}>TOTAL</th>
              <th className={t.th} style={{ textAlign: 'center' }}>REM/FAC/PTE</th>
            </tr>
          </thead>
          <tbody>
            {(detail.lines || []).map((line, idx) => {
              const productName = getLineProductName(line);
              const qty = parseFloat(line.qty) || 0;
              const price = parseFloat(line.unit_price) || 0;
              const vatRate = parseFloat(line.vat_rate) || 0.21;
              const lineNeto = qty * price;
              const lineVat = lineNeto * vatRate;
              const lineTotal = lineNeto + lineVat;
              const equivalencia = getEquivalencia(line);
              
              const qtyDelivered = parseFloat(line.qty_delivered || 0);
              const qtyInvoiced = parseFloat(line.qty_invoiced || 0);
              const qtyPending = Math.max(0, qty - qtyDelivered);

              return (
                <tr key={idx} className={t.row} style={{ fontSize: 12 }}>
                  <td className={t.td} style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {productName}
                  </td>
                  <td className={t.td} style={{ textAlign: 'center', fontWeight: 700 }}>
                    {formatQty(qty)}
                  </td>
                  <td className={t.td} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    {equivalencia}
                  </td>
                  <td className={t.td} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    {line.unit_short_name || 'u'}
                  </td>
                  <td className={t.td} style={{ textAlign: 'right', color: 'var(--muted)' }}>
                    US$ {price.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={t.td} style={{ textAlign: 'right', color: 'var(--muted)' }}>
                    US$ {lineNeto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={t.td} style={{ textAlign: 'right', color: 'var(--muted)' }}>
                    US$ {lineVat.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={t.td} style={{ textAlign: 'right', fontWeight: 700 }}>
                    US$ {lineTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={t.td} style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 11 }}>
                    {`${formatQty(qtyDelivered)} / ${formatQty(qtyInvoiced)} / ${formatQty(qtyPending)}`}
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
            <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Unidades Totales</span>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{formatQty(totalQty)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Neto Gravado</span>
            <span style={{ fontSize: 14, fontWeight: 800 }}>US$ {subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ color: 'var(--muted)', fontWeight: 600 }}>IVA</span>
            <span style={{ fontSize: 14, fontWeight: 800 }}>US$ {tax.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Total Valorizado</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--primary)' }}>US$ {total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
