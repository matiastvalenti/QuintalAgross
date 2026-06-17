const fs = require('fs');

const missingCode = `                              clearOnSelect={true}
                          />
                      </div>
                  )}

                  <div className={s.bentoContainer} style={{ padding: 0, overflow: 'hidden', flex: items.length > 0 ? 1 : 'none' }}>
                      {items.length > 0 ? (
                        <>
                            <div className={s.tableHeader}>
                                <div className={s.th}>PRODUCTO</div>
                                <div className={s.th}>ENVASES</div>
                                <div className={s.th}>UNIDADES</div>
                                <div className={s.th}>P. COSTO</div>
                                <div className={s.th}>P. UNIT</div>
                                <div className={s.th}>DTO%</div>
                                <div className={s.th}>IVA%</div>
                                <div className={s.th}>COMISIÓN</div>
                                <div className={s.th}>TOTAL</div>
                                {!isReadOnly && <div></div>}
                            </div>
                            <div className={s.itemsList}>
                                {items.map(item => {
                                  const qtyDelivered = parseFloat(item.qty_delivered || 0);
                                  const qtyOrdered = parseFloat(item.qty || 0);
                                  const isPending = qtyOrdered - qtyDelivered > 0;
                                  return (
                                    <div key={item.id} className={s.tableRow} style={isPending && isReadOnly ? { borderLeft: '3px solid #f59e0b' } : {}}>
                                        <div style={{ padding: '4px 0', overflow: 'hidden' }}>
                                            <div style={{ fontSize: 11, fontWeight: 900, color: '#1e293b', lineHeight: 1.1, marginBottom: 2 }}>{item.name || item.product?.name || item.description}</div>
                                            <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>{item.brand || item.product?.brand?.name}</div>
                                            {isReadOnly && qtyDelivered > 0 && (
                                              <div style={{ fontSize: 9, fontWeight: 800, color: qtyDelivered >= qtyOrdered ? '#059669' : '#d97706' }}>
                                                Remitido: {qtyDelivered} / {qtyOrdered} · Pendiente: {(qtyOrdered - qtyDelivered).toFixed(2)}
                                              </div>
                                            )}
                                        </div>
                                        {isReadOnly ? (
                                          <>
                                            <div style={{ fontSize: 11, fontWeight: 700, textAlign: 'center' }}>{item.qty || 0}</div>
                                            <div style={{ fontSize: 11, fontWeight: 700, textAlign: 'center' }}>{((item.qty || 0) * (item._unit_content || 1)).toFixed(2)} {item._unit_label}</div>
                                            <input
                                              type="number"
                                              className={s.tableInput}
                                              value={item.cost_price || 0}
                                              onChange={(e) => handleUpdateItem(item.id, 'cost_price', e.target.value)}
                                              onBlur={async () => {
                                                const token = localStorage.getItem("token");
                                                await fetch(\`\${API_URL}/sales/sales-orders/\${id}/lines/\${item.id}\`, {
                                                  method: 'PATCH',
                                                  headers: { Authorization: \`Bearer \${token}\`, 'Content-Type': 'application/json' },
                                                  body: JSON.stringify({ cost_price: item.cost_price })
                                                });
                                              }}
                                              style={{ textAlign: 'center', fontWeight: 800, background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 8, color: '#92400e' }}
                                              title="Editar precio costo (se guarda automáticamente)"
                                            />
                                            <div style={{ fontSize: 11, fontWeight: 700, textAlign: 'center' }}>{item.unit_price || 0}</div>
                                            <div style={{ fontSize: 11, fontWeight: 700, textAlign: 'center' }}>{item.discount_pct || 0}%</div>
                                            <div style={{ fontSize: 11, fontWeight: 600, textAlign: 'center' }}>{((item.vat_rate || 0.21) * 100).toFixed(0)}%</div>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textAlign: 'right' }}>
                                                {fmtValue((item.cost_price > 0 && item.unit_price > 0) ? ((item.unit_price * (1 - (item.discount_pct||0)/100)) - item.cost_price) * (item.qty * (item._unit_content || 1)) : 0)}
                                            </div>
                                            <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--primary)', textAlign: 'right' }}>
                                                {fmtValue(((item.qty || 0) * (item._unit_content || 1) * (item.unit_price||0) * (1 - (item.discount_pct||0)/100)) * (1 + (item.vat_rate||0.21)))}
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            <input type="number" className={s.tableInput} value={item.qty || 0} onChange={(e) => handleUpdateItem(item.id, 'qty', e.target.value)} readOnly={hasProgress || isReadOnly} style={{ background: (hasProgress || isReadOnly) ? '#f8fafc' : '#fff' }} />
                                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                <input type="number" className={s.tableInput} value={(item.qty * (item._unit_content || 1)) || 0} onChange={(e) => handleUpdateItem(item.id, 'equiv', e.target.value)} />
                                                <span style={{ fontSize: 9, fontWeight: 800 }}>{item._unit_label}</span>
                                            </div>
                                            <input 
                                                type="number" 
                                                className={s.tableInput} 
                                                value={item.cost_price || 0} 
                                                onChange={(e) => handleUpdateItem(item.id, 'cost_price', e.target.value)} 
                                                style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e' }}
                                                title="Puedes editar el costo incluso si la orden está bloqueada"
                                            />
                                            <input type="number" className={s.tableInput} value={item.unit_price || 0} onChange={(e) => handleUpdateItem(item.id, 'unit_price', e.target.value)} readOnly={hasProgress || isReadOnly} style={{ background: (hasProgress || isReadOnly) ? '#f8fafc' : '#fff' }} />
                                            <input type="number" className={s.tableInput} value={item.discount_pct || 0} onChange={(e) => handleUpdateItem(item.id, 'discount_pct', e.target.value)} readOnly={hasProgress || isReadOnly} style={{ background: (hasProgress || isReadOnly) ? '#f8fafc' : '#fff' }} />
                                            <div style={{ fontSize: 11, fontWeight: 600, textAlign: 'center' }}>{((item.vat_rate || 0.21) * 100).toFixed(0)}%</div>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textAlign: 'right' }}>
                                                {fmtValue((item.cost_price > 0 && item.unit_price > 0) ? ( (item.unit_price * (1 - (item.discount_pct||0)/100)) - item.cost_price ) * (item.qty * (item._unit_content || 1)) : 0)}
                                            </div>
                                            <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--primary)', textAlign: 'right' }}>
                                                {fmtValue((item.qty * (item._unit_content || 1) * item.unit_price * (1 - (item.discount_pct||0)/100)) * (1 + (item.vat_rate||0.21)))}
                                            </div>
                                            <button style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }} onClick={() => setItems(items.filter(i => i.id !== item.id))}>
                                                <Trash2 size={16} />
                                            </button>
                                          </>
                                        )}
                                    </div>
                                  );
                                })}
                            </div>
                        </>
                      ) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 0', minHeight: 80 }}>
                            <Search size={24} style={{ marginBottom: 8, opacity: 0.3, color: 'var(--text-secondary)' }} />
                            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>Sin ítems cargados</div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>Buscá un producto para agregarlo a la orden</div>
                        </div>
                      )}
                  </div>
              </div>

              {/* Columna Derecha: Panel Lateral Administrativo */}`;

let file = fs.readFileSync('src/modules/sales/SalesOrderForm.jsx', 'utf8');

file = file.replace(
  /                              clearOnSelect=\{true\}\n                          \/>\n                      <\/div>\n                  \)\}\n\n              <\/div>\n\n              \{\/\* Columna Derecha: Panel Lateral Administrativo \*\/\}/,
  missingCode
);

fs.writeFileSync('src/modules/sales/SalesOrderForm.jsx', file);
console.log('Restored table!');
