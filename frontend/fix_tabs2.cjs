const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'modules', 'sales', 'SalesOrderForm.jsx');
let content = fs.readFileSync(file, 'utf8');

const newTabs = `                          {secondaryTab === 'billing' && (
                              <div style={{ display: 'flex', gap: 24, alignItems: 'center', height: '100%', width: '100%', padding: '0 8px' }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Moneda/TC: <span style={{ fontWeight: 800, color: '#1e293b' }}>{currency} &middot; {exchangeRate}</span></div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Neto: <span style={{ fontWeight: 800, color: '#1e293b' }}>{fmt(totals.net)}</span></div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>IVA: <span style={{ fontWeight: 800, color: '#1e293b' }}>{fmt(totals.vat)}</span></div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Total: <span style={{ fontWeight: 900, color: '#0b132b' }}>{fmt(totals.total)}</span></div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Estado: <span style={{ fontWeight: 800, color: progress.paid >= 100 ? '#166534' : '#92400e' }}>{Math.round(progress.paid)}% cobrado</span></div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Pagos: <span style={{ fontWeight: 800, color: '#1e293b' }}>{invoices.length}</span></div>
                                  <button onClick={handleOpenInvoiceModal} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #dce3ed', color: '#0b132b', fontSize: 10, fontWeight: 800, padding: '4px 12px', borderRadius: 8, cursor: 'pointer' }}>+ NUEVO PAGO</button>
                              </div>
                          )}
                          {secondaryTab === 'tracking' && (
                              <div style={{ display: 'flex', gap: 24, alignItems: 'center', height: '100%', width: '100%', padding: '0 8px' }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Estado actual: <span style={{ fontWeight: 800, color: '#1e293b' }}>
                                      {(() => {
                                          let effStatus = status || 'DRAFT';
                                          if (effStatus !== 'CANCELLED' && effStatus !== 'DRAFT') {
                                              if (progress.delivered >= 100 && progress.invoiced >= 100) effStatus = 'Orden generada (Completado)';
                                              else if (progress.delivered >= 100 && progress.invoiced > 0) effStatus = 'Remitido Total (Facturado Parcial)';
                                              else if (progress.delivered > 0 && progress.invoiced >= 100) effStatus = 'Facturado Total (Remitido Parcial)';
                                              else if (progress.delivered > 0 && progress.invoiced > 0) effStatus = 'Parcialmente Entregado y Facturado';
                                              else if (progress.invoiced >= 100) effStatus = 'Facturado Total';
                                              else if (progress.invoiced > 0) effStatus = 'Parcialmente Facturado';
                                              else if (progress.delivered >= 100) effStatus = 'Remitido Total';
                                              else if (progress.delivered > 0) effStatus = 'Parcialmente Remitido';
                                          }
                                          return effStatus === 'DRAFT' ? 'Orden generada' : effStatus;
                                      })()}
                                  </span></div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Remito: <span style={{ fontWeight: 800, color: progress.delivered >= 100 ? '#10b981' : '#f59e0b' }}>{progress.delivered >= 100 ? 'Completado' : 'Pendiente'}</span></div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Factura: <span style={{ fontWeight: 800, color: progress.invoiced >= 100 ? '#10b981' : '#f59e0b' }}>{progress.invoiced >= 100 ? 'Completado' : 'Pendiente'}</span></div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Última modificación: <span style={{ fontWeight: 800, color: '#1e293b' }}>Hoy</span></div>
                              </div>
                          )}
                          {secondaryTab === 'commissions' && (
                              <div style={{ display: 'flex', gap: 24, alignItems: 'center', height: '100%', width: '100%', padding: '0 8px' }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Corredor: <span style={{ fontWeight: 800, color: '#1e293b' }}>{sellers.find(s => s.id === salespersonId)?.name || 'Sin asignar'}</span></div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Comisión: <span style={{ fontWeight: 800, color: '#1e293b' }}>{salespersonId ? 'Calculada' : '0%'}</span></div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Monto: <span style={{ fontWeight: 800, color: '#1e293b' }}>
                                      {fmt(items.reduce((acc, item) => {
                                          const cost = item.cost_price || 0;
                                          const up = item.unit_price || 0;
                                          const units = item.qty * (item._unit_content || 1);
                                          const discount = 1 - (item.discount_pct || 0) / 100;
                                          const comm = (cost > 0 && up > 0) ? ( (up * discount) - cost ) * units : 0;
                                          return acc + comm;
                                      }, 0))}
                                  </span></div>
                                  <button style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #dce3ed', color: '#0b132b', fontSize: 10, fontWeight: 800, padding: '4px 12px', borderRadius: 8, cursor: 'pointer' }}>ASIGNAR COMISIONISTA</button>
                              </div>
                          )}`;

const startMarker = "{secondaryTab === 'billing' && (";
const endMarker = "                          )}";

const startIdx = content.indexOf(startMarker);
const endBlockIdx = content.indexOf(endMarker, content.indexOf("{secondaryTab === 'commissions' && (")) + endMarker.length;

if (startIdx !== -1 && endBlockIdx !== -1) {
    const before = content.substring(0, startIdx);
    const after = content.substring(endBlockIdx);
    fs.writeFileSync(file, before + newTabs + after);
    console.log("Successfully replaced tabs content!");
} else {
    console.error("Could not find markers!");
}
