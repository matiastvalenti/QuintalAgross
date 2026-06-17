const fs = require('fs');

const missingCode = `              {/* Columna Derecha: Panel Lateral Administrativo */}
              <div className={s.rightCol}>
                  {/* Bloque Cliente */}
                  <div className={s.sideBlock}>
                      <div className={s.sideBlockTitle}><User size={12}/> CLIENTE</div>
                      <div className={s.sideField}>
                          <label>NOMBRE</label>
                          {isReadOnly ? (
                              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)', textAlign: 'right' }}>{entity?.name || '-'}</div>
                          ) : (
                              <div style={{ flex: 1 }}>
                                  <Autocomplete onSearch={searchEntities} onSelect={setEntity} initialValue={entity} placeholder="Buscar..." minChars={0} variant="glass" />
                              </div>
                          )}
                      </div>
                      <div className={s.sideField}>
                          <label>PTO. VENTA</label>
                          {isReadOnly ? <div className={s.sideInput}>{pv}</div> : (
                              <select className={s.sideSelect} value={pv} onChange={(e) => setPv(e.target.value)}>
                                  {pointsOfSale.map(p => <option key={p.pv} value={p.pv}>{p.pv}</option>)}
                              </select>
                          )}
                      </div>
                      <div className={s.sideField}>
                          <label>NÚMERO</label>
                          {isReadOnly ? <div className={s.sideInput}>{number}</div> : (
                              <input className={s.sideInput} value={number} onChange={e => setNumber(e.target.value)} onBlur={() => setNumber(padNumber(number))} />
                          )}
                      </div>
                      <div className={s.sideField}>
                          <label>FECHA</label>
                          {isReadOnly ? <div className={s.sideInput}>{date ? new Date(date).toLocaleDateString('es-AR') : '-'}</div> : (
                              <input type="date" className={s.sideInput} value={date} onChange={e => setDate(e.target.value)} />
                          )}
                      </div>
                  </div>

                  {/* Bloque Comercial */}
                  <div className={s.sideBlock}>
                      <div className={s.sideBlockTitle}><ShoppingBag size={12}/> COMERCIAL</div>
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
                          <label>VENDEDOR</label>
                          {isReadOnly ? <div className={s.sideInput}>{sellers.find(sl => sl.id === salespersonId)?.name || 'Ninguno'}</div> : (
                              <select className={s.sideSelect} value={salespersonId} onChange={e => setSalespersonId(e.target.value)}>
                                  <option value="">Ninguno</option>
                                  {sellers.map(sl => <option key={sl.id} value={sl.id}>{sl.name}</option>)}
                              </select>
                          )}
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
                      </div>
                  </div>
              </div>
          </div>

          {/* Secondary Bottom Tray */}`;

let file = fs.readFileSync('src/modules/sales/SalesOrderForm.jsx', 'utf8');

// Find the first occurrence of `{/* Columna Derecha: Panel Lateral Administrativo */}`
const startIdx = file.indexOf('{/* Columna Derecha: Panel Lateral Administrativo */}');
if (startIdx === -1) {
    console.error("No se encontró el inicio de la Columna Derecha");
    process.exit(1);
}

// Find the occurrence of `{/* Secondary Bottom Tray */}` AFTER the startIdx
const endIdx = file.indexOf('{/* Secondary Bottom Tray */}', startIdx);
if (endIdx === -1) {
    console.error("No se encontró el final (Secondary Bottom Tray)");
    process.exit(1);
}

// Also, the previous operations might have left garbage before `{/* Columna Derecha... */}`. 
// Specifically, after the bento container ends, there should be just `</div>\n              </div>\n`.
// Let's find `                  </div>\n              </div>` before the startIdx.

const bentoEndIdx = file.lastIndexOf('</div>\n              </div>', startIdx);
if (bentoEndIdx === -1) {
    console.log("No bentoEndIdx found, replacing from startIdx directly");
    file = file.substring(0, startIdx) + missingCode + file.substring(endIdx + '{/* Secondary Bottom Tray */}'.length);
} else {
    // replace everything from after bentoEndIdx to endIdx
    const beforeStr = file.substring(0, bentoEndIdx + '</div>\n              </div>'.length);
    const afterStr = file.substring(endIdx + '{/* Secondary Bottom Tray */}'.length);
    file = beforeStr + '\n\n' + missingCode + afterStr;
}

fs.writeFileSync('src/modules/sales/SalesOrderForm.jsx', file);
console.log('Restored rightCol!');
