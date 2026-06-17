const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'modules', 'sales', 'SalesOrderForm.jsx');
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('ArrowRight')) {
    content = content.replace('ArrowUpRight,', 'ArrowUpRight,\n  ArrowRight,');
}

const timelineStartStr = '{/* Secondary Bottom Tray - Relaciones y Estado */}';
const timelineStartIdx = content.indexOf(timelineStartStr);

if (timelineStartIdx !== -1) {
    const timelineEndStr = '{/* Footer with Totals */}';
    const timelineEndIdx = content.indexOf(timelineEndStr, timelineStartIdx);

    if (timelineEndIdx !== -1) {
        const newBar = `{/* Secondary Bottom Tray - Relaciones y Estado */}
          <div className={s.relationsBar}>
              
              {/* OV */}
              <div className={s.relationCard} onClick={() => setDrawerState({ open: true, type: 'OV' })}>
                  <div className={s.nodeTitle} style={{ color: '#2563eb' }}>ORDEN DE VENTA</div>
                  <div className={s.nodeBadge}>● Documento Actual</div>
                  <div className={s.nodeMetric} style={{ color: '#0f172a', marginTop: 'auto' }}>{pv}-{number}</div>
                  <div className={s.nodeMetric}>{new Date(date + 'T00:00:00').toLocaleDateString()}</div>
              </div>

              <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

              {/* REMITO */}
              <div className={s.relationCard} onClick={() => setDrawerState({ open: true, type: 'REMITO' })}>
                  <div className={s.nodeTitle} style={{ color: progress.delivered > 0 ? '#0ea5e9' : '#0b132b' }}>REMITO</div>
                  <div className={s.nodeStatus} style={{ color: progress.delivered >= 100 ? '#10b981' : progress.delivered > 0 ? '#f97316' : '#eab308' }}>
                    {progress.delivered >= 100 ? 'Completado' : progress.delivered > 0 ? 'Parcial' : 'Pendiente'}
                  </div>
                  <div className={s.nodeMetric} style={{ color: '#0f172a' }}>{deliveryNotes.length} remitos &middot; {Math.round(progress.delivered)}%</div>
                  {nextLogicalAction === 'REMITO' && <button className={s.relationAction} onClick={(e) => { e.stopPropagation(); setShowRemitoModal(true); }}>Generar</button>}
              </div>

              <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

              {/* FACTURA */}
              <div className={s.relationCard} onClick={() => setDrawerState({ open: true, type: 'FACTURA' })}>
                  <div className={s.nodeTitle} style={{ color: progress.invoiced > 0 ? '#f97316' : '#0b132b' }}>FACTURA</div>
                  <div className={s.nodeStatus} style={{ color: progress.invoiced >= 100 ? '#10b981' : progress.invoiced > 0 ? '#f97316' : '#eab308' }}>
                    {progress.invoiced >= 100 ? 'Completado' : progress.invoiced > 0 ? 'Parcial' : 'Pendiente'}
                  </div>
                  <div className={s.nodeMetric} style={{ color: '#0f172a' }}>{invoices.length} facturas &middot; {Math.round(progress.invoiced)}%</div>
                  {nextLogicalAction === 'FACTURA' && <button className={s.relationAction} onClick={(e) => { e.stopPropagation(); setShowInvoiceModal(true); }}>Generar</button>}
              </div>

              <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

              {/* COBRO */}
              <div className={s.relationCard} onClick={() => setDrawerState({ open: true, type: 'COBRO' })}>
                  <div className={s.nodeTitle} style={{ color: progress.paid > 0 ? '#10b981' : '#0b132b' }}>COBRO</div>
                  <div className={s.nodeStatus} style={{ color: progress.paid >= 100 ? '#10b981' : progress.paid > 0 ? '#f97316' : '#eab308' }}>
                    {progress.paid >= 100 ? 'Completado' : progress.paid > 0 ? 'Parcial' : 'Pendiente'}
                  </div>
                  <div className={s.nodeMetric} style={{ color: '#0f172a' }}>{invoices.filter(i => i.status === 'PAID' || i.status === 'CLOSED').length} recibos &middot; {Math.round(progress.paid)}%</div>
                  {nextLogicalAction === 'COBRO' && <button className={s.relationAction} onClick={(e) => { e.stopPropagation(); handleOpenInvoiceModal(); }}>Registrar</button>}
              </div>

              <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

              {/* COMISIÓN */}
              <div className={s.relationCard} onClick={() => setDrawerState({ open: true, type: 'COMISION' })}>
                  <div className={s.nodeTitle} style={{ color: salespersonId ? '#8b5cf6' : '#0b132b' }}>COMISIÓN</div>
                  <div className={s.nodeStatus} style={{ color: salespersonId ? '#10b981' : '#eab308' }}>
                    {salespersonId ? 'Calculada' : 'Pendiente'}
                  </div>
                  <div className={s.nodeMetric} style={{ color: '#0f172a' }}>{salespersonId ? '2.00%' : '0%'}</div>
                  {nextLogicalAction === 'COMISION' && <button className={s.relationAction} onClick={(e) => { e.stopPropagation(); }}>Liquidar</button>}
              </div>

              {/* OBSERVACIONES COMPACTAS */}
              <div className={s.relationCard} style={{ maxWidth: '140px', background: 'transparent', border: 'none', paddingLeft: 8, cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                  <div className={s.nodeTitle} style={{ color: '#64748b' }}>OBSERVACIONES</div>
                  <div className={s.obsText} style={{ marginTop: 4 }}>{observations || 'Sin observaciones'}</div>
              </div>
          </div>\n\n          `;
        
        content = content.substring(0, timelineStartIdx) + newBar + content.substring(timelineEndIdx);
    }
}

fs.writeFileSync(file, content);
console.log("Replaced timeline with relation cards!");
