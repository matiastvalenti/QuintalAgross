const fs = require('fs');

const path = 'src/modules/sales/SalesOrderForm.jsx';
let content = fs.readFileSync(path, 'utf8');

const leftColEndMarker = "                      )}\n                  </div>\n              </div>\n\n              {/* Columna Derecha: Panel Lateral Administrativo */}";

const trackingStartMarker = "{/* DOC. ACTUAL CARD */}";
const trackingEndMarker = "                      {/* Accordion: Facturación y Pagos */}";
let trackingContent = content.substring(content.indexOf(trackingStartMarker), content.indexOf(trackingEndMarker));
trackingContent = trackingContent.substring(0, trackingContent.lastIndexOf("</div>\n                      )}\n                  </div>")).trim();

const billingStartMarker = "{/* Financial Detail Card */}";
const billingEndMarker = "{/* Accordion: Comisiones */}";
let billingContent = content.substring(content.indexOf(billingStartMarker), content.indexOf(billingEndMarker));
billingContent = billingContent.substring(0, billingContent.lastIndexOf("</div>\n              </div>\n          )}\n      </div>")).trim();

// Strip the wrapper accordion body flex gap column from billing
billingContent = billingContent.replace(/<div className=\{s\.accordionBody\}>\n\s*<div style=\{\{ display: 'flex', flexDirection: 'column', gap: 12 \}\}>\n\s*/, '');
// Wrap billing into two equal columns
billingContent = "<div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>\n<div style={{ flex: 1, minWidth: 300 }}>\n" + billingContent.replace(/\{(\/\* Payment Status Card \/ Activity \*\/)\}/, "</div>\n<div style={{ flex: 1, minWidth: 300 }}>\n{$1}") + "\n</div>\n</div>";

const commStartMarker = "{/* Accordion: Comisiones */}";
const commEndMarker = "{/* Footer with Totals */}";
let commContent = content.substring(content.indexOf(commStartMarker), content.indexOf(commEndMarker));
const innerCommStart = commContent.indexOf("<h4 style={{ fontSize: 10, fontWeight: 900");
const innerCommEnd = commContent.lastIndexOf("</div>\n                          </div>\n                      )}\n                  </div>");
commContent = commContent.substring(innerCommStart, innerCommEnd).trim();

// Build bottom tray via string concat
let bottomTray = "";
bottomTray += "                  {/* Secondary Bottom Tray */}\n";
bottomTray += "                  <div className={s.bottomTray}>\n";
bottomTray += "                      <div className={s.bottomTrayTabs}>\n";
bottomTray += "                          <div className={`\\${s.bottomTrayTab} \\${secondaryTab === 'billing' ? s.bottomTrayTabActive : ''}`} onClick={() => setSecondaryTab('billing')}>\n";
bottomTray += "                              <CreditCard size={12}/> FACTURACIÓN Y PAGO\n";
bottomTray += "                          </div>\n";
bottomTray += "                          <div className={`\\${s.bottomTrayTab} \\${secondaryTab === 'tracking' ? s.bottomTrayTabActive : ''}`} onClick={() => setSecondaryTab('tracking')}>\n";
bottomTray += "                              <Layers size={12}/> TRAZABILIDAD\n";
bottomTray += "                          </div>\n";
bottomTray += "                          <div className={`\\${s.bottomTrayTab} \\${secondaryTab === 'commissions' ? s.bottomTrayTabActive : ''}`} onClick={() => setSecondaryTab('commissions')}>\n";
bottomTray += "                              <ShoppingBasket size={12}/> COMISIONISTAS\n";
bottomTray += "                          </div>\n";
bottomTray += "                      </div>\n";
bottomTray += "                      <div className={s.bottomTrayContent}>\n";

// Append Billing
bottomTray += "                          {secondaryTab === 'billing' && (\n";
bottomTray += "                              " + billingContent + "\n";
bottomTray += "                          )}\n";

// Append Tracking
bottomTray += "                          {secondaryTab === 'tracking' && (\n";
bottomTray += "                              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>\n";
bottomTray += "                                  <div style={{ flex: 1, minWidth: 260 }}>\n";
// Grab DOC ACTUAL CARD from trackingContent
const docActualEnd = trackingContent.indexOf("{/* REMITOS ASOCIADOS */}");
let docActualContent = trackingContent.substring(0, docActualEnd).trim();
bottomTray += "                                      " + docActualContent + "\n";
bottomTray += "                                  </div>\n";
bottomTray += "                                  <div style={{ flex: 1, minWidth: 260 }}>\n";
// Grab REMITOS
const remitosEnd = trackingContent.indexOf("{/* FACTURAS ASOCIADAS */}");
let remitosContent = trackingContent.substring(docActualEnd, remitosEnd).trim();
bottomTray += "                                      " + remitosContent + "\n";
bottomTray += "                                  </div>\n";
bottomTray += "                                  <div style={{ flex: 1, minWidth: 260 }}>\n";
// Grab FACTURAS
let facturasContent = trackingContent.substring(remitosEnd).trim();
bottomTray += "                                      " + facturasContent + "\n";
bottomTray += "                                  </div>\n";
bottomTray += "                              </div>\n";
bottomTray += "                          )}\n";

// Append Commissions
bottomTray += "                          {secondaryTab === 'commissions' && (\n";
bottomTray += "                              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0', maxWidth: 600 }}>\n";
bottomTray += "                                  " + commContent + "\n";
bottomTray += "                              </div>\n";
bottomTray += "                          )}\n";

bottomTray += "                      </div>\n";
bottomTray += "                  </div>\n";


content = content.replace(leftColEndMarker, bottomTray + "\n" + leftColEndMarker);

const oldAccordionsRegex = /\{\/\* Accordion: Trazabilidad \*\/\}[\s\S]*?\{\/\* Footer with Totals \*\/\}/;
content = content.replace(oldAccordionsRegex, "{/* Footer with Totals */}");

fs.writeFileSync(path, content);
console.log('Done!');
