const fs = require('fs');

const path = 'src/modules/sales/SalesOrderForm.jsx';
let content = fs.readFileSync(path, 'utf8');

const leftColEndMarker = "                      )}\n                  </div>\n              </div>\n\n              {/* Columna Derecha: Panel Lateral Administrativo */}";

// Extract Tracking content
const trackingStartMarker = "{/* DOC. ACTUAL CARD */}";
const trackingEndMarker = "                      {/* Accordion: Facturación y Pagos */}";
let trackingContent = content.substring(content.indexOf(trackingStartMarker), content.indexOf(trackingEndMarker));
trackingContent = trackingContent.substring(0, trackingContent.lastIndexOf("</div>\n                      )\}\n                  </div>")).trim();

// Extract Billing content
const billingStartMarker = "{/* Financial Detail Card */}";
const billingEndMarker = "{/* Accordion: Comisiones */}";
let billingContent = content.substring(content.indexOf(billingStartMarker), content.indexOf(billingEndMarker));
billingContent = billingContent.substring(0, billingContent.lastIndexOf("</div>\n              </div>\n          )}\n      </div>")).trim();
billingContent = billingContent.replace(/<div className=\{s\.accordionBody\}>\n\s*<div style=\{\{ display: 'flex', flexDirection: 'column', gap: 12 \}\}>\n\s*/, '');
billingContent = "<div style={{ display: 'flex', gap: 16 }}>\n                                  <div style={{ flex: 1 }}>\n                                      " + billingContent.replace(/\{(\/\* Payment Status Card \/ Activity \*\/)\}/, "</div><div style={{ flex: 1 }}>{$1}") + "\n                                  </div>\n                              </div>";

// Extract Commissions content
const commStartMarker = "{/* Accordion: Comisiones */}";
const commEndMarker = "{/* Footer with Totals */}";
let commContent = content.substring(content.indexOf(commStartMarker), content.indexOf(commEndMarker));
const innerCommStart = commContent.indexOf("<h4 style={{ fontSize: 10, fontWeight: 900");
const innerCommEnd = commContent.lastIndexOf("</div>\n                          </div>\n                      )\}\n                  </div>");
commContent = commContent.substring(innerCommStart, innerCommEnd).trim();

// Build Bottom Tray
const bottomTray = `
                  {/* Secondary Bottom Tray */}
                  <div className={s.bottomTray}>
                      <div className={s.bottomTrayTabs}>
                          <div className={\`\${s.bottomTrayTab} \${secondaryTab === 'billing' ? s.bottomTrayTabActive : ''}\`} onClick={() => setSecondaryTab('billing')}>
                              <CreditCard size={12}/> FACTURACIÓN Y PAGO
                          </div>
                          <div className={\`\${s.bottomTrayTab} \${secondaryTab === 'tracking' ? s.bottomTrayTabActive : ''}\`} onClick={() => setSecondaryTab('tracking')}>
                              <Layers size={12}/> TRAZABILIDAD
                          </div>
                          <div className={\`\${s.bottomTrayTab} \${secondaryTab === 'commissions' ? s.bottomTrayTabActive : ''}\`} onClick={() => setSecondaryTab('commissions')}>
                              <ShoppingBasket size={12}/> COMISIONISTAS
                          </div>
                      </div>
                      <div className={s.bottomTrayContent}>
                          {secondaryTab === 'billing' && (
                              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                                  <div style={{ flex: 1 }}>
                                      {/* Financial Detail Card */}
                                      <div style={{ background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                                          <h4 style={{ fontSize: 10, fontWeight: 900, marginBottom: 8, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Estado de Cuenta del Pedido</h4>
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Moneda / T. Cambio</span>
                                                  <span style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>{currency} &middot; {exchangeRate}</span>
                                              </div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Total Neto</span>
                                                  <span style={{ fontSize: 13, fontWeight: 700 }}>{fmt(totals.net)}</span>
                                              </div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>IVA Total</span>
                                                  <span style={{ fontSize: 13, fontWeight: 700 }}>{fmt(totals.vat)}</span>
                                              </div>
                                              <div style={{ borderTop: '2px dashed #e2e8f0', paddingTop: 12, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                  <span style={{ fontSize: 14, fontWeight: 900, color: '#24389c' }}>TOTAL ORDEN</span>
                                                  <span style={{ fontSize: 20, fontWeight: 900, color: '#24389c' }}>{fmt(totals.total)}</span>
                                              </div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, padding: '10px 12px', background: progress.paid >= 100 ? '#f0fdf4' : '#fffbeb', borderRadius: 12 }}>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                      {progress.paid >= 100 ? <Check size={16} color="#16a34a" /> : <Info size={16} color="#d97706" />}
                                                      <span style={{ fontSize: 12, fontWeight: 800, color: progress.paid >= 100 ? '#166534' : '#92400e' }}>COBRADO</span>
                                                  </div>
                                                  <span style={{ fontSize: 14, fontWeight: 900, color: progress.paid >= 100 ? '#16a34a' : '#d97706' }}>{Math.round(progress.paid)}%</span>
                                              </div>
                                          </div>
                                      </div>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                      {/* Payment Status Card / Activity */}
                                      <div style={{ background: '#ffffff', padding: 20, borderRadius: 20, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                          <h4 style={{ fontSize: 11, fontWeight: 900, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Comprobantes de Pago</h4>
                                          <div style={{ flex: 1, overflowY: 'auto' }}>
                                              {invoices.length > 0 ? (
                                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                      {invoices.map(inv => (
                                                          <div key={inv.id} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 12, border: '1px solid #f1f5f9' }}>
                                                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                                  <span style={{ fontSize: 11, fontWeight: 800, color: '#1e293b' }}>#{inv.number}</span>
                                                                  <span style={{ fontSize: 11, fontWeight: 800, color: '#24389c' }}>{fmt(inv.total_amount)}</span>
                                                              </div>
                                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                  <TraceabilityStatusBadge status={inv.status} />
                                                                  <span style={{ fontSize: 10, fontWeight: 700, color: '#059669' }}>
                                                                      Cobrado: {fmt(inv.status === 'CLOSED' ? inv.total_amount : inv.total_amount_paid || 0)}
                                                                  </span>
                                                              </div>
                                                          </div>
                                                      ))}
                                                  </div>
                                              ) : (
                                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.6 }}>
                                                      <Receipt size={24} style={{ marginBottom: 8 }} />
                                                      <span style={{ fontSize: 10, fontWeight: 800 }}>SIN PAGOS APLICADOS</span>
                                                  </div>
                                              )}
                                          </div>
                                          <button 
                                            className={s.actionBtn} 
                                            style={{ width: '100%', height: 38, borderRadius: 10, border: 'none', background: '#24389c', color: 'white', fontWeight: 800, cursor: 'cursor', fontSize: 12 }}
                                            onClick={handleOpenInvoiceModal}
                                          >
                                              {invoices.length > 0 ? 'VINCULAR OTRO PAGO' : 'GENERAR FACTURA / PAGO'}
                                          </button>
                                      </div>
                                  </div>
                              </div>
                          )}
                          {secondaryTab === 'tracking' && (
                              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                                  <div style={{ flex: 1 }}>
                                    {/* DOC. ACTUAL CARD */}
                                    <div style={{ background: '#f8fafc', padding: 16, borderRadius: 20, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#eff3ff', color: '#24389c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <ShoppingBag size={18} />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 900, color: '#1e293b' }}>ORDEN ACTUAL</div>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{new Date(date).toLocaleDateString()}</div>
                                            </div>
                                        </div>
                                        <div style={{ padding: 16, background: '#ffffff', borderRadius: 16, border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                                <span style={{ fontSize: 14, fontWeight: 900, color: '#24389c' }}>#{number || 'Borrador'}</span>
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
                                            
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                <div style={{ fontSize: 9, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Progreso del Flujo</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <Truck size={12} color="#f59e0b" />
                                                    <div style={{ flex: 1, height: 4, background: '#f1f5f9', borderRadius: 2 }}>
                                                        <div style={{ height: '100%', background: '#f59e0b', width: \`\${progress.delivered}%\`, borderRadius: 2 }}></div>
                                                    </div>
                                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#475569' }}>{Math.round(progress.delivered)}%</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <Receipt size={12} color="#06b6d4" />
                                                    <div style={{ flex: 1, height: 4, background: '#f1f5f9', borderRadius: 2 }}>
                                                        <div style={{ height: '100%', background: '#06b6d4', width: \`\${progress.invoiced}%\`, borderRadius: 2 }}></div>
                                                    </div>
                                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#475569' }}>{Math.round(progress.invoiced)}%</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <Check size={12} color="#10b981" />
                                                    <div style={{ flex: 1, height: 4, background: '#f1f5f9', borderRadius: 2 }}>
                                                        <div style={{ height: '100%', background: '#10b981', width: \`\${progress.paid}%\`, borderRadius: 2 }}></div>
                                                    </div>
                                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#475569' }}>{Math.round(progress.paid)}%</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                      {/* REMITOS ASOCIADOS */}
                                      <div style={{ background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#f0fdf4', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Truck size={18} />
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 900, color: '#1e293b' }}>REMITOS ASOCIADOS</div>
                                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{deliveryNotes.length} comprobante(s)</div>
                                                </div>
                                            </div>
                                            {mode === 'edit' && (
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button 
                                                        onClick={handleUnlinkAll} 
                                                        style={{ width: 28, height: 28, borderRadius: 8, background: '#ffffff', border: '1px solid #fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                                        title="Desvincular todo (Remitos)"
                                                    >
                                                        <Link2Off size={14} />
                                                    </button>
                                                    <button onClick={() => setIsManualLinkModalOpen(true)} style={{ width: 28, height: 28, borderRadius: 8, background: '#ffffff', border: '1px solid #e2e8f0', color: '#24389c', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                                        <Plus size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 150, overflowY: 'auto', paddingRight: 4 }}>
                                            {deliveryNotes.length > 0 ? deliveryNotes.map(dn => (
                                                <div key={dn.id} style={{ padding: 12, background: '#ffffff', borderRadius: 16, border: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => openWindow('delivery-note', { id: dn.id, mode: 'edit' }, { title: \`Remito \${dn.number}\`, width: 1200 })}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <div style={{ width: 24, height: 24, borderRadius: 8, background: '#f0fdf4', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <Truck size={12} />
                                                            </div>
                                                            <span style={{ fontSize: 11, fontWeight: 900, color: '#1e293b' }}>#{dn.number}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            {mode === 'edit' && (
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); handleOpenLinkManager(dn.id, 'REMITO', dn.number); }}
                                                                    style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s' }}
                                                                    title="Gestionar vínculos (Descruzar)"
                                                                    onMouseEnter={e => e.currentTarget.style.color = '#24389c'}
                                                                    onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
                                                                >
                                                                    <Unplug size={12} />
                                                                </button>
                                                            )}
                                                            <TraceabilityStatusBadge status={dn.status} />
                                                        </div>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 0', opacity: 0.6 }}>
                                                    <Truck size={24} style={{ marginBottom: 8 }} />
                                                    <span style={{ fontSize: 10, fontWeight: 800 }}>SIN REMITOS</span>
                                                </div>
                                            )}
                                        </div>
                                      </div>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                      {/* FACTURAS ASOCIADAS */}
                                      <div style={{ background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Receipt size={18} />
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 900, color: '#1e293b' }}>FACTURAS ASOCIADAS</div>
                                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{invoices.length} comprobante(s)</div>
                                                </div>
                                            </div>
                                            {mode === 'edit' && (
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button onClick={() => setIsInvoiceLinkModalOpen(true)} style={{ width: 28, height: 28, borderRadius: 8, background: '#ffffff', border: '1px solid #e2e8f0', color: '#24389c', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                                        <Plus size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 150, overflowY: 'auto', paddingRight: 4 }}>
                                            {invoices.length > 0 ? invoices.map(inv => (
                                                <div key={inv.id} style={{ padding: 12, background: '#ffffff', borderRadius: 16, border: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => openWindow('invoice', { id: inv.id, mode: 'edit' }, { title: \`Factura \${inv.number}\`, width: 1200 })}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <div style={{ width: 24, height: 24, borderRadius: 8, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <Receipt size={12} />
                                                            </div>
                                                            <span style={{ fontSize: 11, fontWeight: 900, color: '#1e293b' }}>#{inv.number}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            {mode === 'edit' && (
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); handleOpenLinkManager(inv.id, 'FACTURA', inv.number); }}
                                                                    style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s' }}
                                                                    title="Gestionar vínculos (Descruzar)"
                                                                    onMouseEnter={e => e.currentTarget.style.color = '#24389c'}
                                                                    onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
                                                                >
                                                                    <Unplug size={12} />
                                                                </button>
                                                            )}
                                                            <TraceabilityStatusBadge status={inv.status} />
                                                        </div>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 0', opacity: 0.6 }}>
                                                    <Receipt size={24} style={{ marginBottom: 8 }} />
                                                    <span style={{ fontSize: 10, fontWeight: 800 }}>SIN FACTURAS</span>
                                                </div>
                                            )}
                                        </div>
                                      </div>
                                  </div>
                              </div>
                          )}
                          {secondaryTab === 'commissions' && (
                              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0', maxWidth: 600 }}>
                                  <h4 style={{ fontSize: 10, fontWeight: 900, marginBottom: 12, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Resumen de Comisiones</h4>
                                  <div className={s.itemsList}>
                                      <div className={s.tableHeader} style={{ gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 8px' }}>
                                          <div className={s.th} style={{ fontSize: 9 }}>VENDEDOR</div>
                                          <div className={s.th} style={{ fontSize: 9 }}>BASE</div>
                                          <div className={s.th} style={{ fontSize: 9, textAlign: 'right' }}>COMISIÓN</div>
                                      </div>
                                      <div className={s.tableRow} style={{ gridTemplateColumns: '2fr 1fr 1fr', padding: '8px', fontSize: 10 }}>
                                          <div style={{ fontWeight: 800 }}>{sellers.find(s => s.id === salespersonId)?.name || 'Sin vendedor'}</div>
                                          <div>{fmt(items.reduce((acc, item) => {
                                              const cost = item.cost_price || 0;
                                              const up = item.unit_price || 0;
                                              const units = item.qty * (item._unit_content || 1);
                                              const discount = 1 - (item.discount_pct || 0) / 100;
                                              const comm = (cost > 0 && up > 0) ? ( (up * discount) - cost ) * units : 0;
                                              return acc + comm;
                                          }, 0))}</div>
                                          <div style={{ textAlign: 'right', fontWeight: 900, color: '#059669' }}>
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
                                  <div style={{ marginTop: 12, padding: 8, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                                      <div style={{ fontSize: 9, fontWeight: 700, color: '#166534' }}>
                                          Nota: Diferencia entre P. Venta y Costo.
                                      </div>
                                  </div>
                              </div>
                          )}
                      </div>
                  </div>
\`;

content = content.replace(leftColEndMarker, bottomTray + "\n                      )}\n                  </div>\n              </div>\n\n              {/* Columna Derecha: Panel Lateral Administrativo */}");

const oldAccordionsRegex = /\{\/\* Accordion: Trazabilidad \*\/\}[\\s\\S]*?\{\/\* Footer with Totals \*\/\}/;
content = content.replace(oldAccordionsRegex, "{/* Footer with Totals */}");

fs.writeFileSync(path, content);
console.log('Done!');
