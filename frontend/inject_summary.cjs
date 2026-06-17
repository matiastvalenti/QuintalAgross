const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'modules', 'sales', 'SalesOrderForm.jsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add height: 100% to Comercial sideBlock
const comercialStr = '<div className={s.sideBlockTitle}><ShoppingBag size={12}/> COMERCIAL</div>';
const sideBlockStart = content.lastIndexOf('<div className={s.sideBlock}>', content.indexOf(comercialStr));
if (sideBlockStart !== -1) {
    content = content.substring(0, sideBlockStart) + '<div className={s.sideBlock} style={{ height: \'100%\' }}>' + content.substring(sideBlockStart + '<div className={s.sideBlock}>'.length);
}

// 2. Inject Summary Panel
const timelineEndStr = '</div>\n\n          {/* Footer with Totals */}';
const timelineEndIdx = content.indexOf(timelineEndStr);
if (timelineEndIdx !== -1) {
    const summaryPanel = `
          {/* Operational Summary */}
          <div className={s.summaryPanel}>
              <div className={s.summaryItem}>
                  <div className={s.summaryLabel}>CLIENTE</div>
                  <div className={s.summaryValue} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>{entity?.name || '-'}</div>
              </div>
              <div className={s.summaryItem}>
                  <div className={s.summaryLabel}>CONDICIÓN</div>
                  <div className={s.summaryValue}>{saleConditions.find(c => c.id === selectedConditionId)?.description || '-'}</div>
              </div>
              <div className={s.summaryItem}>
                  <div className={s.summaryLabel}>ITEMS</div>
                  <div className={s.summaryValue}>{items.length} ({orderedLts.toFixed(1)} u.)</div>
              </div>
              <div className={s.summaryItem}>
                  <div className={s.summaryLabel}>ESTADO</div>
                  <div className={s.summaryValue} style={{ color: nextLogicalAction ? '#f97316' : '#10b981' }}>
                      {nextLogicalAction ? 'Pend. ' + nextLogicalAction.charAt(0) + nextLogicalAction.slice(1).toLowerCase() : 'Completado'}
                  </div>
              </div>
              <div className={s.summaryItem}>
                  <div className={s.summaryLabel}>CORREDOR</div>
                  <div className={s.summaryValue}>{sellers.find(sl => sl.id === salespersonId)?.name || 'Ninguno'}</div>
              </div>
              <div className={s.summaryItem}>
                  <div className={s.summaryLabel}>COMISIÓN</div>
                  <div className={s.summaryValue}>{salespersonId ? '2.00%' : '0%'}</div>
              </div>
              <div className={s.summaryItem}>
                  <div className={s.summaryLabel}>MODIFICACIÓN</div>
                  <div className={s.summaryValue}>{new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</div>
              </div>
          </div>\n`;
    content = content.substring(0, timelineEndIdx + 6) + summaryPanel + content.substring(timelineEndIdx + 6);
}

fs.writeFileSync(file, content);
console.log("Injected height 100% and Summary Panel!");
