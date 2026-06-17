const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'modules', 'sales', 'SalesOrderForm.jsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add Drawer import
if (!content.includes('import Drawer from')) {
    content = content.replace(
        'import Modal from "../../components/ui/Modal";',
        'import Modal from "../../components/ui/Modal";\nimport Drawer from "../../components/ui/Drawer";'
    );
}

// 2. Add state and calculations
if (!content.includes('const [drawerState, setDrawerState] = useState')) {
    content = content.replace(
        'const [customerPo, setCustomerPo] = useState("");',
        `const [customerPo, setCustomerPo] = useState("");
  const [drawerState, setDrawerState] = useState({ open: false, type: null });`
    );
}

if (!content.includes('const invoicedAmount = useMemo')) {
    const hasProgressIdx = content.indexOf('const hasProgress = useMemo');
    if (hasProgressIdx !== -1) {
        const extraCalculations = `
  const invoicedAmount = useMemo(() => invoices.reduce((acc, inv) => acc + (inv.total_amount || 0), 0), [invoices]);
  const deliveredLts = useMemo(() => items.reduce((acc, item) => acc + ((parseFloat(item.qty_delivered) || 0) * (parseFloat(item._unit_content) || 1)), 0), [items]);
  const orderedLts = useMemo(() => items.reduce((acc, item) => acc + ((parseFloat(item.qty) || 0) * (parseFloat(item._unit_content) || 1)), 0), [items]);
  
  const nextLogicalAction = useMemo(() => {
    if (progress.delivered < 100) return 'REMITO';
    if (progress.invoiced < 100) return 'FACTURA';
    if (progress.paid < 100) return 'COBRO';
    if (salespersonId) return 'COMISION';
    return null;
  }, [progress, salespersonId]);\n\n  `;
        content = content.substring(0, hasProgressIdx) + extraCalculations + content.substring(hasProgressIdx);
    }
}

// 3. Replace timelineTray
const timelineStartStr = '{/* Secondary Bottom Tray - Relaciones y Estado */}';
const timelineStartIdx = content.indexOf(timelineStartStr);
if (timelineStartIdx !== -1) {
    const timelineEndStr = '{/* Footer with Totals */}';
    const timelineEndIdx = content.indexOf(timelineEndStr, timelineStartIdx);
    
    if (timelineEndIdx !== -1) {
        const newTimeline = `{/* Secondary Bottom Tray - Relaciones y Estado */}
          <div className={s.timelineTray}>
              <div className={s.timelineMain}>
                  <div className={s.timelineTrack}>
                      <div className={s.timelineLine}></div>
                      
                      {/* OV */}
                      <div className={s.timelineNode} onClick={() => setDrawerState({ open: true, type: 'OV' })}>
                          <div className={s.timelineDot + " " + s.timelineDotActive} style={{ background: '#2563eb', boxShadow: '0 0 0 1px #2563eb' }}></div>
                          <div className={s.timelineContent}>
                              <div className={s.nodeTitle} style={{ color: '#2563eb' }}>ORDEN DE VENTA</div>
                              <div className={s.nodeBadge}>● Documento Actual</div>
                              <div className={s.nodeMetric} style={{ color: '#0f172a' }}>{pv}-{number}</div>
                              <div className={s.nodeMetric}>{new Date(date + 'T00:00:00').toLocaleDateString()}</div>
                          </div>
                      </div>

                      {/* REMITO */}
                      <div className={s.timelineNode} onClick={() => setDrawerState({ open: true, type: 'REMITO' })}>
                          <div className={s.timelineDot + " " + (progress.delivered > 0 ? s.timelineDotActive : '')} style={progress.delivered > 0 ? { background: '#0ea5e9', boxShadow: '0 0 0 1px #0ea5e9' } : {}}></div>
                          <div className={s.timelineContent}>
                              <div className={s.nodeTitle} style={{ color: progress.delivered > 0 ? '#0ea5e9' : '#0b132b' }}>REMITO</div>
                              <div className={s.nodeStatus} style={{ color: progress.delivered >= 100 ? '#10b981' : progress.delivered > 0 ? '#f97316' : '#eab308' }}>
                                {progress.delivered >= 100 ? 'Completado' : progress.delivered > 0 ? 'Parcial' : 'Pendiente'}
                              </div>
                              <div className={s.nodeMetric} style={{ color: '#0f172a' }}>{deliveryNotes.length} remitos</div>
                              <div className={s.nodeMetric}>{deliveredLts.toFixed(1)} / {orderedLts.toFixed(1)} u.</div>
                              <div className={s.nodeMetric}>{Math.round(progress.delivered)}%</div>
                          </div>
                      </div>

                      {/* FACTURA */}
                      <div className={s.timelineNode} onClick={() => setDrawerState({ open: true, type: 'FACTURA' })}>
                          <div className={s.timelineDot + " " + (progress.invoiced > 0 ? s.timelineDotActive : '')} style={progress.invoiced > 0 ? { background: '#f97316', boxShadow: '0 0 0 1px #f97316' } : {}}></div>
                          <div className={s.timelineContent}>
                              <div className={s.nodeTitle} style={{ color: progress.invoiced > 0 ? '#f97316' : '#0b132b' }}>FACTURA</div>
                              <div className={s.nodeStatus} style={{ color: progress.invoiced >= 100 ? '#10b981' : progress.invoiced > 0 ? '#f97316' : '#eab308' }}>
                                {progress.invoiced >= 100 ? 'Completado' : progress.invoiced > 0 ? 'Parcial' : 'Pendiente'}
                              </div>
                              <div className={s.nodeMetric} style={{ color: '#0f172a' }}>{invoices.length} facturas</div>
                              <div className={s.nodeMetric}>USD {fmt(invoicedAmount)}</div>
                              <div className={s.nodeMetric}>{Math.round(progress.invoiced)}%</div>
                          </div>
                      </div>

                      {/* COBRO */}
                      <div className={s.timelineNode} onClick={() => setDrawerState({ open: true, type: 'COBRO' })}>
                          <div className={s.timelineDot + " " + (progress.paid > 0 ? s.timelineDotActive : '')} style={progress.paid > 0 ? { background: '#10b981', boxShadow: '0 0 0 1px #10b981' } : {}}></div>
                          <div className={s.timelineContent}>
                              <div className={s.nodeTitle} style={{ color: progress.paid > 0 ? '#10b981' : '#0b132b' }}>COBRO</div>
                              <div className={s.nodeStatus} style={{ color: progress.paid >= 100 ? '#10b981' : progress.paid > 0 ? '#f97316' : '#eab308' }}>
                                {progress.paid >= 100 ? 'Completado' : progress.paid > 0 ? 'Parcial' : 'Pendiente'}
                              </div>
                              <div className={s.nodeMetric} style={{ color: '#0f172a' }}>{invoices.filter(i => i.status === 'PAID' || i.status === 'CLOSED').length} recibos</div>
                              <div className={s.nodeMetric}>USD {fmt(totals.total * (progress.paid / 100))}</div>
                              <div className={s.nodeMetric}>{Math.round(progress.paid)}%</div>
                          </div>
                      </div>

                      {/* COMISIÓN */}
                      <div className={s.timelineNode} onClick={() => setDrawerState({ open: true, type: 'COMISION' })}>
                          <div className={s.timelineDot + " " + (salespersonId ? s.timelineDotActive : '')} style={salespersonId ? { background: '#8b5cf6', boxShadow: '0 0 0 1px #8b5cf6' } : {}}></div>
                          <div className={s.timelineContent}>
                              <div className={s.nodeTitle} style={{ color: salespersonId ? '#8b5cf6' : '#0b132b' }}>COMISIÓN</div>
                              <div className={s.nodeStatus} style={{ color: salespersonId ? '#10b981' : '#eab308' }}>
                                {salespersonId ? 'Calculada' : 'Pendiente'}
                              </div>
                              <div className={s.nodeMetric} style={{ color: '#0f172a' }}>{salespersonId ? '2.00%' : '0%'}</div>
                              <div className={s.nodeMetric}>Liquidación Pend.</div>
                          </div>
                      </div>
                  </div>
                  
                  {/* Fila de Acción Lógica */}
                  <div className={s.nextActionRow}>
                      {nextLogicalAction === 'REMITO' && <button className={s.nextActionButton} onClick={() => setShowRemitoModal(true)}>Generar Remito</button>}
                      {nextLogicalAction === 'FACTURA' && <button className={s.nextActionButton} onClick={() => setShowInvoiceModal(true)}>Generar Factura</button>}
                      {nextLogicalAction === 'COBRO' && <button className={s.nextActionButton} onClick={handleOpenInvoiceModal}>Registrar Cobro</button>}
                      {nextLogicalAction === 'COMISION' && <button className={s.nextActionButton}>Liquidar Comisión</button>}
                  </div>
              </div>

              <div className={s.timelineObs}>
                  <div className={s.obsHeader}>OBSERVACIONES</div>
                  {isReadOnly ? (
                      <div className={s.obsText}>{observations || <span style={{ color: '#cbd5e1' }}>Sin observaciones</span>}</div>
                  ) : (
                      <textarea 
                          className={s.obsInput} 
                          placeholder="Añadir notas..." 
                          value={observations} 
                          onChange={e => setObservations(e.target.value)}
                      />
                  )}
              </div>
          </div>\n\n          `;
        content = content.substring(0, timelineStartIdx) + newTimeline + content.substring(timelineEndIdx);
    }
}

// 4. Inject Drawer UI at the bottom before closing </div>
const drawerJSX = `
      {/* Dynamic Drawer for Document Viewing */}
      <Drawer open={drawerState.open} onClose={() => setDrawerState({ open: false, type: null })} title={
          drawerState.type === 'REMITO' ? 'Remitos Relacionados' :
          drawerState.type === 'FACTURA' ? 'Facturas Relacionadas' :
          drawerState.type === 'COBRO' ? 'Cobros Registrados' :
          drawerState.type === 'COMISION' ? 'Liquidaciones de Comisión' :
          'Documentos'
      }>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
             {(drawerState.type === 'REMITO' && deliveryNotes.length === 0) ||
              (drawerState.type === 'FACTURA' && invoices.length === 0) ||
              (drawerState.type === 'COBRO' && invoices.filter(i => i.status === 'PAID' || i.status === 'CLOSED').length === 0) ||
              (drawerState.type === 'COMISION') ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13, background: '#f8fafc', borderRadius: 12 }}>
                      No hay documentos relacionados en esta etapa.
                  </div>
              ) : null}

              {drawerState.type === 'REMITO' && deliveryNotes.map(dn => (
                  <div key={dn.id} style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: '#1e293b' }}>{dn.pv}-{dn.number}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Fecha: {new Date(dn.created_at).toLocaleDateString()}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Estado: {dn.status}</div>
                      <button style={{ marginTop: 12, background: '#f1f5f9', color: '#0f172a', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>VER DETALLE</button>
                  </div>
              ))}
              {drawerState.type === 'FACTURA' && invoices.map(inv => (
                  <div key={inv.id} style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: '#1e293b' }}>{inv.pv}-{inv.number}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Monto: {inv.currency} {inv.total_amount}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Estado: {inv.status}</div>
                      <button style={{ marginTop: 12, background: '#f1f5f9', color: '#0f172a', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>VER DETALLE</button>
                  </div>
              ))}
              {drawerState.type === 'COBRO' && invoices.filter(i => i.status === 'PAID' || i.status === 'CLOSED').map(inv => (
                  <div key={inv.id} style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: '#1e293b' }}>Cobro a Fac. {inv.pv}-{inv.number}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Monto: {inv.currency} {inv.total_amount}</div>
                      <button style={{ marginTop: 12, background: '#f1f5f9', color: '#0f172a', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>VER DETALLE</button>
                  </div>
              ))}
          </div>
      </Drawer>
    </div>
  );
}`;
content = content.replace('      {/* Remito Selection Modal */}', drawerJSX + '\n\n      {/* Remito Selection Modal */}');

fs.writeFileSync(file, content);
console.log("Successfully injected advanced timeline logic and Drawer!");
