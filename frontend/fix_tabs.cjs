const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'modules', 'sales', 'SalesOrderForm.jsx');
let content = fs.readFileSync(file, 'utf8');

const newTabs = `                          {secondaryTab === 'billing' && (
                              <div style={{ display: 'flex', gap: 24, alignItems: 'center', height: '100%', width: '100%' }}>
                                  <div style={{ display: 'flex', gap: 24, alignItems: 'center', borderRight: '1px solid #e2e8f0', paddingRight: 24, height: '100%' }}>
                                      <div>
                                          <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Moneda / TC</div>
                                          <div style={{ fontSize: 11, fontWeight: 800, color: '#1e293b' }}>{currency} &middot; {exchangeRate}</div>
                                      </div>
                                      <div>
                                          <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Neto</div>
                                          <div style={{ fontSize: 11, fontWeight: 800, color: '#1e293b' }}>{fmt(totals.net)}</div>
                                      </div>
                                      <div>
                                          <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>IVA Total</div>
                                          <div style={{ fontSize: 11, fontWeight: 800, color: '#1e293b' }}>{fmt(totals.vat)}</div>
                                      </div>
                                      <div>
                                          <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total General</div>
                                          <div style={{ fontSize: 13, fontWeight: 900, color: '#24389c' }}>{fmt(totals.total)}</div>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: progress.paid >= 100 ? '#f0fdf4' : '#fffbeb', padding: '4px 8px', borderRadius: 6 }}>
                                          {progress.paid >= 100 ? <Check size={12} color="#16a34a" /> : <Info size={12} color="#d97706" />}
                                          <span style={{ fontSize: 10, fontWeight: 800, color: progress.paid >= 100 ? '#166534' : '#92400e' }}>{Math.round(progress.paid)}% COBRADO</span>
                                      </div>
                                  </div>
                                  <div style={{ flex: 1, display: 'flex', gap: 12, alignItems: 'center' }}>
                                      <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', minWidth: 70 }}>Pagos ({invoices.length})</div>
                                      {invoices.length > 0 ? invoices.slice(0, 3).map(inv => (
                                          <div key={inv.id} style={{ padding: '4px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                                              <span style={{ fontSize: 10, fontWeight: 800, color: '#1e293b' }}>#{inv.number}</span>
                                              <span style={{ fontSize: 10, fontWeight: 700, color: '#059669' }}>{fmt(inv.status === 'CLOSED' ? inv.total_amount : inv.total_amount_paid || 0)}</span>
                                          </div>
                                      )) : (
                                          <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Sin pagos vinculados</span>
                                      )}
                                      {invoices.length > 3 && <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b' }}>+{invoices.length - 3}</span>}
                                      <button onClick={handleOpenInvoiceModal} style={{ marginLeft: 'auto', background: 'transparent', border: '1px dashed #cbd5e1', color: '#2563eb', fontSize: 10, fontWeight: 800, padding: '4px 12px', borderRadius: 6, cursor: 'pointer' }}>+ NUEVO PAGO</button>
                                  </div>
                              </div>
                          )}
                          {secondaryTab === 'tracking' && (
                              <div style={{ display: 'flex', gap: 24, alignItems: 'center', height: '100%', width: '100%' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderRight: '1px solid #e2e8f0', paddingRight: 24, minWidth: 150 }}>
                                      <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Estado Documento</div>
                                      {(() => {
                                          let effStatus = status || 'DRAFT';
                                          if (effStatus !== 'CANCELLED' && effStatus !== 'DRAFT') {
                                              if (progress.delivered >= 100 && progress.invoiced >= 100) effStatus = 'COMPLETED';
                                              else if (progress.delivered >= 100 && progress.invoiced > 0) effStatus = 'REMITIDO_TOTAL_FACTURADO_PARCIAL';
                                              else if (progress.delivered > 0 && progress.invoiced >= 100) effStatus = 'REMITIDO_PARCIAL_FACTURADO_TOTAL';
                                              else if (progress.delivered > 0 && progress.invoiced > 0) effStatus = 'REMITIDO_PARCIAL_FACTURADO_PARCIAL';
                                              else if (progress.invoiced >= 100) effStatus = 'INVOICED';
                                              else if (progress.invoiced > 0) effStatus = 'PARTIALLY_INVOICED';
                                              else if (progress.delivered >= 100) effStatus = 'FULLY_DELIVERED';
                                              else if (progress.delivered > 0) effStatus = 'PARTIALLY_DELIVERED';
                                          }
                                          return <TraceabilityStatusBadge status={effStatus} />;
                                      })()}
                                  </div>
                                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', borderRight: '1px solid #e2e8f0', paddingRight: 24 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <Truck size={14} color={progress.delivered >= 100 ? '#10b981' : '#f59e0b'} />
                                          <div style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{Math.round(progress.delivered)}% Remitido</div>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <Receipt size={14} color={progress.invoiced >= 100 ? '#10b981' : '#06b6d4'} />
                                          <div style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{Math.round(progress.invoiced)}% Facturado</div>
                                      </div>
                                  </div>
                                  <div style={{ flex: 1, display: 'flex', gap: 24, alignItems: 'center' }}>
                                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                          <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Remitos ({deliveryNotes.length})</div>
                                          {deliveryNotes.length > 0 ? deliveryNotes.slice(0, 2).map(dn => (
                                              <span key={dn.id} style={{ fontSize: 10, fontWeight: 800, background: '#f8fafc', border: '1px solid #e2e8f0', padding: '2px 6px', borderRadius: 4 }}>#{dn.number}</span>
                                          )) : <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Ninguno</span>}
                                          {deliveryNotes.length > 2 && <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b' }}>+{deliveryNotes.length - 2}</span>}
                                          <button onClick={() => setIsManualLinkModalOpen(true)} style={{ marginLeft: 6, background: 'transparent', border: '1px dashed #cbd5e1', color: '#059669', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, cursor: 'pointer' }}>+ REMITO</button>
                                      </div>
                                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderLeft: '1px solid #e2e8f0', paddingLeft: 12 }}>
                                          <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Facturas ({invoices.length})</div>
                                          {invoices.length > 0 ? invoices.slice(0, 2).map(inv => (
                                              <span key={inv.id} style={{ fontSize: 10, fontWeight: 800, background: '#f8fafc', border: '1px solid #e2e8f0', padding: '2px 6px', borderRadius: 4 }}>#{inv.number}</span>
                                          )) : <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Ninguno</span>}
                                          {invoices.length > 2 && <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b' }}>+{invoices.length - 2}</span>}
                                          <button onClick={() => setIsInvoiceLinkModalOpen(true)} style={{ marginLeft: 6, background: 'transparent', border: '1px dashed #cbd5e1', color: '#2563eb', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, cursor: 'pointer' }}>+ FACTURA</button>
                                      </div>
                                  </div>
                              </div>
                          )}
                          {secondaryTab === 'commissions' && (
                              <div style={{ display: 'flex', gap: 32, alignItems: 'center', height: '100%', width: '100%' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                                          <ShoppingBasket size={16} />
                                      </div>
                                      <div>
                                          <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Corredor / Vendedor</div>
                                          <div style={{ fontSize: 11, fontWeight: 800, color: '#1e293b' }}>{sellers.find(s => s.id === salespersonId)?.name || 'Sin vendedor asignado'}</div>
                                      </div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 24, borderLeft: '1px solid #e2e8f0', paddingLeft: 32 }}>
                                      <div>
                                          <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Base Comisionable</div>
                                          <div style={{ fontSize: 11, fontWeight: 800, color: '#1e293b' }}>{fmt(items.reduce((acc, item) => {
                                              const cost = item.cost_price || 0;
                                              const up = item.unit_price || 0;
                                              const units = item.qty * (item._unit_content || 1);
                                              const discount = 1 - (item.discount_pct || 0) / 100;
                                              const comm = (cost > 0 && up > 0) ? ( (up * discount) - cost ) * units : 0;
                                              return acc + comm;
                                          }, 0))}</div>
                                      </div>
                                      <div>
                                          <div style={{ fontSize: 9, fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>Comisión Estimada</div>
                                          <div style={{ fontSize: 13, fontWeight: 900, color: '#059669' }}>
                                              {fmt(items.reduce((acc, item) => {
                                                  const cost = item.cost_price || 0;
                                                  const up = item.unit_price || 0;
                                                  const units = item.qty * (item._unit_content || 1);
                                                  const discount = 1 - (item.discount_pct || 0) / 100;
                                                  const comm = (cost > 0 && up > 0) ? ( (up * discount) - cost ) * units : 0;
                                                  return acc + comm;
                                              }, 0))}
                                          </div>
                                      </div>
                                  </div>
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
