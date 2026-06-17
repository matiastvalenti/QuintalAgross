const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'modules', 'sales', 'SalesOrderForm.jsx');
let content = fs.readFileSync(file, 'utf8');

const newCrosses = `          {/* Secondary Bottom Tray - Cruces Operativos */}
          <div className={s.crossesTray}>
              <div className={s.crossesTitle}>CRUCES DE LA ORDEN</div>
              <div className={s.crossesCards}>
                  {/* REMITOS */}
                  <div className={s.crossCard}>
                      <div className={s.crossCardHeader}>
                          <span className={s.crossCardTitle}><Truck size={14} color="#d97706" /> Remitos</span>
                          <TraceabilityStatusBadge status={progress.delivered >= 100 ? 'FULLY_DELIVERED' : (progress.delivered > 0 ? 'PARTIALLY_DELIVERED' : 'CONFIRMED')} />
                      </div>
                      <div className={s.crossCardInfo}>{deliveryNotes.length} remito(s) generados</div>
                      <button onClick={() => setShowRemitoModal(true)} className={s.crossCardAction}>+ GENERAR REMITO</button>
                  </div>
                  
                  {/* FACTURAS */}
                  <div className={s.crossCard}>
                      <div className={s.crossCardHeader}>
                          <span className={s.crossCardTitle}><Receipt size={14} color="#0891b2" /> Facturas</span>
                          <TraceabilityStatusBadge status={progress.invoiced >= 100 ? 'INVOICED' : (progress.invoiced > 0 ? 'PARTIALLY_INVOICED' : 'CONFIRMED')} />
                      </div>
                      <div className={s.crossCardInfo}>{invoices.length} factura(s) generadas</div>
                      <button onClick={() => setShowInvoiceModal(true)} className={s.crossCardAction}>+ GENERAR FACTURA</button>
                  </div>

                  {/* COBRANZA */}
                  <div className={s.crossCard}>
                      <div className={s.crossCardHeader}>
                          <span className={s.crossCardTitle}><CreditCard size={14} color="#059669" /> Cobranza</span>
                          <TraceabilityStatusBadge status={progress.paid >= 100 ? 'PAID' : (progress.paid > 0 ? 'PARTIALLY_PAID' : 'CONFIRMED')} />
                      </div>
                      <div className={s.crossCardInfo}>{invoices.filter(i => i.status === 'PAID' || i.status === 'CLOSED').length} recibo(s) registrados</div>
                      <button onClick={handleOpenInvoiceModal} className={s.crossCardAction}>+ REGISTRAR COBRO</button>
                  </div>

                  {/* COMISIONES */}
                  <div className={s.crossCard}>
                      <div className={s.crossCardHeader}>
                          <span className={s.crossCardTitle}><ShoppingBasket size={14} color="#7c3aed" /> Comisiones</span>
                          <div style={{ fontSize: 10, fontWeight: 800, color: salespersonId ? '#059669' : '#d97706', background: salespersonId ? '#ecfdf5' : '#fffbeb', padding: '2px 8px', borderRadius: 12 }}>
                              {salespersonId ? 'Calculada' : 'Pendiente'}
                          </div>
                      </div>
                      <div className={s.crossCardInfo}>{sellers.find(s => s.id === salespersonId)?.name || 'Sin corredor asignado'}</div>
                      <button className={s.crossCardAction}>VER COMISIÓN</button>
                  </div>
              </div>
          </div>`;

const startMarker = "          {/* Secondary Bottom Tray */}";
const endMarker = "                  </div>";

const startIdx = content.indexOf(startMarker);
// Need to find the end of the entire bottomTray div. 
// It starts at startIdx, then has <div className={s.bottomTray}> ... </div> </div>
// Let's use a regex or string replacement strategy.

const blockToReplace = content.substring(startIdx, content.indexOf("{/* Footer with Totals */}"));

// Safety check
if (startIdx !== -1 && blockToReplace.includes("bottomTray")) {
    const before = content.substring(0, startIdx);
    const after = content.substring(startIdx + blockToReplace.length);
    fs.writeFileSync(file, before + newCrosses + "\n\n" + "          {/* Footer with Totals */}" + after.substring(26));
    console.log("Successfully replaced bottom tray with crosses!");
} else {
    console.error("Could not find markers!");
}
