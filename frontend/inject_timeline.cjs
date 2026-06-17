const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'modules', 'sales', 'SalesOrderForm.jsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add customerPo state
if (!content.includes('const [customerPo, setCustomerPo] = useState("")')) {
    content = content.replace(
        'const [observations, setObservations] = useState("");',
        'const [observations, setObservations] = useState("");\n  const [customerPo, setCustomerPo] = useState("");'
    );
}

// 2. Replace Comercial Block
const comercialStartStr = '<div className={s.sideBlockTitle}><ShoppingBag size={12}/> COMERCIAL</div>';
const comercialStartIdx = content.indexOf(comercialStartStr);
if (comercialStartIdx !== -1) {
    const comercialEndStr = '                  </div>\n              </div>\n          </div>';
    const comercialEndIdx = content.indexOf(comercialEndStr, comercialStartIdx);
    
    if (comercialEndIdx !== -1) {
        const newComercial = `<div className={s.sideBlockTitle}><ShoppingBag size={12}/> COMERCIAL</div>
                      <div className={s.sideField}>
                          <label>ORD. COMPRA</label>
                          {isReadOnly ? <div className={s.sideInput}>{customerPo || '-'}</div> : (
                              <input type="text" className={s.sideInput} value={customerPo} onChange={e => setCustomerPo(e.target.value)} placeholder="Ej: OC-1234" />
                          )}
                      </div>
                      <div className={s.sideField}>
                          <label>DEPÓSITO</label>
                          {isReadOnly ? <div className={s.sideInput}>{warehouses.find(w => w.id === warehouseId)?.name || warehouseId}</div> : (
                              <select className={s.sideSelect} value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                                  <option value="">Seleccionar...</option>
                                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                              </select>
                          )}
                      </div>
                      <div className={s.sideField}>
                          <label>CORREDOR</label>
                          {isReadOnly ? <div className={s.sideInput}>{sellers.find(sl => sl.id === salespersonId)?.name || 'Ninguno'}</div> : (
                              <select className={s.sideSelect} value={salespersonId} onChange={e => setSalespersonId(e.target.value)}>
                                  <option value="">Ninguno</option>
                                  {sellers.map(sl => <option key={sl.id} value={sl.id}>{sl.name}</option>)}
                              </select>
                          )}
                      </div>
                      <div className={s.sideField}>
                          <label>COMISIÓN %</label>
                          <div className={s.sideInput} style={{ background: '#f8fafc', color: salespersonId ? '#1e293b' : '#94a3b8' }}>
                              {salespersonId ? '2.00%' : '0.00%'}
                          </div>
                      </div>
                      <div className={s.sideField}>
                          <label>C. COSTO</label>
                          {isReadOnly ? <div className={s.sideInput}>{ctroCosto === '1' ? 'CC1' : 'CC2'}</div> : (
                              <select className={s.sideSelect} value={ctroCosto} onChange={e => setCtroCosto(e.target.value)}>
                                  <option value="1">CC1</option>
                                  <option value="2">CC2</option>
                              </select>
                          )}
                      </div>
                      <div className={s.sideField}>
                          <label>CONDICIÓN</label>
                          {isReadOnly ? <div className={s.sideInput}>{saleConditions.find(c => c.id === selectedConditionId)?.description || '-'}</div> : (
                              <select className={s.sideSelect} value={selectedConditionId} onChange={e => setSelectedConditionId(e.target.value)}>
                                  {saleConditions.map(c => <option key={c.id} value={c.id}>{c.description}</option>)}
                              </select>
                          )}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                          <div className={s.sideField} style={{ flex: 1 }}>
                              <label>MONEDA</label>
                              {isReadOnly ? <div className={s.sideInput} style={{ width: '60%' }}>{currency}</div> : (
                                  <select className={s.sideSelect} style={{ width: '60%' }} value={currency} onChange={e => setCurrency(e.target.value)}>
                                      <option value="USD">USD</option>
                                      <option value="ARS">ARS</option>
                                  </select>
                              )}
                          </div>
                          <div className={s.sideField} style={{ flex: 1 }}>
                              <label>T. CAMBIO</label>
                              {isReadOnly ? <div className={s.sideInput} style={{ width: '50%' }}>{exchangeRate}</div> : (
                                  <input type="number" className={s.sideInput} style={{ width: '50%' }} value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} />
                              )}
                          </div>
                      </div>`;
        content = content.substring(0, comercialStartIdx) + newComercial + '\n' + content.substring(comercialEndIdx);
    }
}

// 3. Replace crossesTray with timelineTray
const crossesStartStr = '{/* Secondary Bottom Tray - Cruces Operativos */}';
const crossesStartIdx = content.indexOf(crossesStartStr);
if (crossesStartIdx !== -1) {
    const crossesEndStr = '{/* Footer with Totals */}';
    const crossesEndIdx = content.indexOf(crossesEndStr, crossesStartIdx);
    
    if (crossesEndIdx !== -1) {
        const newTimeline = `{/* Secondary Bottom Tray - Relaciones y Estado */}
          <div className={s.timelineTray}>
              <div className={s.timelineMain}>
                  <div className={s.timelineTrack}>
                      {/* Línea conectora de fondo */}
                      <div className={s.timelineLine}></div>
                      
                      {/* OV */}
                      <div className={s.timelineNode}>
                          <div className={s.timelineDot + " " + s.timelineDotActive}></div>
                          <div className={s.timelineContent}>
                              <div className={s.nodeTitle}>ORDEN DE VENTA</div>
                              <div className={s.nodeStatus}>Creada</div>
                              <div className={s.nodeMetric}>{new Date(date + 'T00:00:00').toLocaleDateString()}</div>
                          </div>
                      </div>

                      {/* REMITO */}
                      <div className={s.timelineNode} style={{ cursor: 'pointer' }} onClick={() => setShowRemitoModal(true)}>
                          <div className={s.timelineDot + " " + (progress.delivered > 0 ? s.timelineDotActive : '')}></div>
                          <div className={s.timelineContent}>
                              <div className={s.nodeTitle}>REMITO</div>
                              <div className={s.nodeStatus}>{progress.delivered >= 100 ? 'Completado' : progress.delivered > 0 ? 'Parcial' : 'Pendiente'}</div>
                              <div className={s.nodeMetric}>{deliveryNotes.length} docs • {Math.round(progress.delivered)}%</div>
                          </div>
                      </div>

                      {/* FACTURA */}
                      <div className={s.timelineNode} style={{ cursor: 'pointer' }} onClick={() => setShowInvoiceModal(true)}>
                          <div className={s.timelineDot + " " + (progress.invoiced > 0 ? s.timelineDotActive : '')}></div>
                          <div className={s.timelineContent}>
                              <div className={s.nodeTitle}>FACTURA</div>
                              <div className={s.nodeStatus}>{progress.invoiced >= 100 ? 'Completado' : progress.invoiced > 0 ? 'Parcial' : 'Pendiente'}</div>
                              <div className={s.nodeMetric}>{invoices.length} docs • {Math.round(progress.invoiced)}%</div>
                          </div>
                      </div>

                      {/* COBRO */}
                      <div className={s.timelineNode} style={{ cursor: 'pointer' }} onClick={handleOpenInvoiceModal}>
                          <div className={s.timelineDot + " " + (progress.paid > 0 ? s.timelineDotActive : '')}></div>
                          <div className={s.timelineContent}>
                              <div className={s.nodeTitle}>COBRO</div>
                              <div className={s.nodeStatus}>{progress.paid >= 100 ? 'Completado' : progress.paid > 0 ? 'Parcial' : 'Pendiente'}</div>
                              <div className={s.nodeMetric}>{invoices.filter(i => i.status === 'PAID' || i.status === 'CLOSED').length} rec • {Math.round(progress.paid)}%</div>
                          </div>
                      </div>

                      {/* COMISIÓN */}
                      <div className={s.timelineNode} style={{ cursor: 'pointer' }}>
                          <div className={s.timelineDot + " " + (salespersonId ? s.timelineDotActive : '')}></div>
                          <div className={s.timelineContent}>
                              <div className={s.nodeTitle}>COMISIÓN</div>
                              <div className={s.nodeStatus}>{salespersonId ? 'Calculada' : 'Pendiente'}</div>
                              <div className={s.nodeMetric}>Liq. Pendiente</div>
                          </div>
                      </div>
                  </div>
              </div>
              <div className={s.timelineObs}>
                  <div className={s.obsHeader}>OBSERVACIONES DE LA ORDEN</div>
                  {isReadOnly ? (
                      <div className={s.obsText}>{observations || <span style={{ color: '#cbd5e1' }}>Sin observaciones...</span>}</div>
                  ) : (
                      <textarea 
                          className={s.obsInput} 
                          placeholder="Añadir notas u observaciones internas..." 
                          value={observations} 
                          onChange={e => setObservations(e.target.value)}
                      />
                  )}
              </div>
          </div>\n\n          `;
        content = content.substring(0, crossesStartIdx) + newTimeline + content.substring(crossesEndIdx);
    }
}

fs.writeFileSync(file, content);
console.log("Successfully replaced JSX!");
