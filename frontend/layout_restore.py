import re

# 1. Update CSS
with open('src/modules/finance/SalesApplicationsPage.module.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Make sure we have the required CSS
css_updates = """
.pageContainer {
  width: 100%;
  max-width: none;
  padding: 28px 36px;
  box-sizing: border-box;
}

.pageHeader {
  margin-bottom: 20px;
}

.pageHeader h1 {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
}

.pageHeader p {
  margin: 6px 0 0;
  color: #64748b;
}

.filtersCard {
  position: relative;
  z-index: 50;
  overflow: visible;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 16px 20px;
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 180px minmax(260px, 1fr) auto;
  gap: 16px;
  align-items: end;
  margin-bottom: 18px;
}

.summaryRow {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 18px;
}

.summaryChip {
  display: inline-flex;
  align-items: center;
  gap: 18px;
  padding: 10px 16px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  font-size: 15px;
}

.workspaceGrid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 520px;
  gap: 20px;
  align-items: stretch;
  height: 640px;
}

.leftWorkspace {
  height: 100%;
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: 18px;
  min-height: 0;
}

.tableCard {
  height: 100%;
  min-height: 0;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tableHeader {
  flex-shrink: 0;
  padding: 14px 18px;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 700;
  font-size: 17px;
}

.tableScroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.table th,
.table td {
  height: 48px;
  padding: 0 16px;
  border-bottom: 1px solid #e5e7eb;
  vertical-align: middle;
}

.docCell {
  white-space: nowrap;
  overflow: visible;
  text-overflow: unset;
  font-weight: 600;
}

.sidePanel {
  height: 100%;
  min-height: 0;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
  padding: 18px;
  display: flex;
  flex-direction: column;
}

.selectedPairGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.miniDocCard {
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
}

.metricRow {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  padding: 3px 0;
}

.pendingApplicationsCard,
.historyCard {
  margin-top: 22px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  overflow: hidden;
}

/* Modals & Buttons */
.pendingApplicationItem {
  padding: 16px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pendingApplicationItem:last-child { border-bottom: none; }
.pendingApplicationMain { font-size: 15px; font-weight: 600; color: #111827; }
.pendingApplicationMeta { font-size: 13px; color: #6b7280; margin-top: 4px; }

.primaryButton { background: #3b82f6; color: white; padding: 8px 16px; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; }
.secondaryButton { background: #f3f4f6; color: #374151; padding: 8px 16px; border-radius: 8px; font-weight: 500; border: 1px solid #d1d5db; cursor: pointer; }
.dangerGhostButton { background: transparent; color: #dc2626; padding: 8px 16px; border-radius: 8px; font-weight: 500; border: 1px solid #dc2626; cursor: pointer; }

"""

css += "\n" + css_updates
with open('src/modules/finance/SalesApplicationsPage.module.css', 'w', encoding='utf-8') as f:
    f.write(css)

# 2. Update JSX layout
with open('src/modules/finance/SalesApplicationsPage.jsx', 'r', encoding='utf-8') as f:
    jsx = f.read()

# Fix header and filters
jsx = re.sub(
    r'<div className=\{styles\.header\}>\s*<h1>(.*?)</h1>\s*<p>(.*?)</p>\s*</div>\s*<div className=\{styles\.filtersBar\}>',
    r'<header className={styles.pageHeader}>\n        <h1>\1</h1>\n        <p>\2</p>\n      </header>\n\n      <section className={styles.filtersCard}>',
    jsx,
    flags=re.DOTALL
)

# Fix summary ARS/USD
summary_old = r'<div className=\{styles\.summaryGroup\}>\s*<h3>Resumen ARS</h3>.*?</div>\s*</div>\s*<div className=\{styles\.summaryGroup\}>\s*<h3>Resumen USD</h3>.*?</div>\s*</div>'
summary_new = """<section className={styles.summaryRow}>
        <div className={styles.summaryChip}>
          <strong>[ARS]</strong>
          <span>Créditos: <span className={styles.valCredit}>${formatNumberAR(arsBalances.credits)}</span></span>
          <span>Deudas: <span className={styles.valDebt}>${formatNumberAR(arsBalances.debts)}</span></span>
          <span>Neto: <span className={styles.valNet}>${formatNumberAR(arsBalances.net)}</span></span>
        </div>
        <div className={styles.summaryChip}>
          <strong>[USD]</strong>
          <span>Créditos: <span className={styles.valCredit}>U$S {formatNumberAR(usdBalances.credits)}</span></span>
          <span>Deudas: <span className={styles.valDebt}>U$S {formatNumberAR(usdBalances.debts)}</span></span>
          <span>Neto: <span className={styles.valNet}>U$S {formatNumberAR(usdBalances.net)}</span></span>
        </div>
      </section>"""
jsx = re.sub(r'<div className=\{styles\.summaryGroup\}>.*?</div>\s*</div>\s*<div className=\{styles\.summaryGroup\}>.*?</div>\s*</div>', summary_new, jsx, flags=re.DOTALL)

# Fix workspace grid
jsx = jsx.replace(
    '<div className={styles.mainLayout}>',
    '<section className={styles.workspaceGrid}>\n        <div className={styles.leftWorkspace}>'
)

# Wrap sidepanel and close grid correctly
sidepanel_regex = r'(<div className=\{styles\.actionPanel\}>.*?</div>\s*</div>\s*</div>)'
# I'll replace the actionPanel with sidePanel layout manually
# Actually, the actionPanel div should become sidePanel

action_panel_old = r'<div className=\{styles\.actionPanel\}>.*?</div>\s*</div>\s*</div>'
action_panel_new = """</div>
        <aside className={styles.sidePanel}>
          <div className={styles.panelTitle}>Aplicación actual</div>
          {selectedCredit || selectedDebt ? (
            <div className={styles.sidePanelContent}>
              <div className={styles.selectedPairGrid}>
                {selectedCredit ? (
                  <div className={styles.miniDocCard}>
                    <h4>Crédito</h4>
                    <strong>{documentTypes[selectedCredit.doc_type]} {selectedCredit.number}</strong>
                    <div className={styles.metricRow}><span>Total</span> <span>{selectedCredit.currency} {formatNumberAR(selectedCredit.total)}</span></div>
                    <div className={styles.metricRow}><span>Disp.</span> <span className={styles.amount}>{selectedCredit.currency} {formatNumberAR(getActualBalance(selectedCredit, true))}</span></div>
                  </div>
                ) : <div className={styles.miniDocCard} style={{opacity: 0.5}}>Seleccionar crédito...</div>}
                
                {selectedDebt ? (
                  <div className={styles.miniDocCard}>
                    <h4>Deuda</h4>
                    <strong>{documentTypes[selectedDebt.doc_type]} {selectedDebt.number}</strong>
                    <div className={styles.metricRow}><span>Total</span> <span>{selectedDebt.currency} {formatNumberAR(selectedDebt.total)}</span></div>
                    <div className={styles.metricRow}><span>Pend.</span> <span className={styles.amountDebt}>{selectedDebt.currency} {formatNumberAR(getActualBalance(selectedDebt, false))}</span></div>
                  </div>
                ) : <div className={styles.miniDocCard} style={{opacity: 0.5}}>Seleccionar deuda...</div>}
              </div>

              {selectedCredit && selectedDebt && (
                <div style={{ marginTop: '16px' }}>
                  {selectedCredit.currency !== selectedDebt.currency && (
                    <div className={styles.inlineInputsGrid} style={{marginBottom: '16px'}}>
                      <div className={styles.inputGroup}>
                        <label>TC Histórico</label>
                        <input type="text" value={selectedDebt.exchange_rate || 1.0} disabled />
                      </div>
                      <div className={styles.inputGroup}>
                        <label>TC Aplicación</label>
                        <input type="number" step="0.01" value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} />
                      </div>
                    </div>
                  )}

                  <div className={styles.inputGroup}>
                    <label>Importe a aplicar ({selectedDebt.currency})</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        type="number" 
                        step="0.01" 
                        value={amountToApply}
                        onChange={(e) => {
                          setAmountToApply(e.target.value);
                          setIsApplyingMax(false);
                        }}
                        placeholder="0.00"
                      />
                      <button className={styles.secondaryButton} onClick={handleApplyMax} style={{flexShrink:0}}>Max USD</button>
                      <button className={styles.secondaryButton} onClick={handleApplyFull} style={{flexShrink:0}}>Max Total</button>
                    </div>
                  </div>

                  <div className={styles.sidePanelActions} style={{marginTop: '24px'}}>
                    <button className={styles.primaryButton} onClick={handleAddApplication} style={{width: '100%'}}>
                      Agregar a confirmación
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.emptyPanelState}>Seleccioná un crédito o deuda para comenzar</div>
          )}
        </aside>
      </section>"""

jsx = re.sub(action_panel_old, action_panel_new, jsx, flags=re.DOTALL)

# Fix pending applications
pending_old = r'<div className=\{styles\.tableContainerWrapper\}>\s*<div className=\{styles\.tableHeader\}>\s*<h2>Aplicaciones a confirmar</h2>\s*</div>.*?<div className=\{styles\.confirmCardsList\}>.*?</div>\s*</div>\s*</div>\s*</div>\s*\)\}'
pending_new = """<section className={styles.pendingApplicationsCard}>
          <div className={styles.tableHeader}>
            <h2>Aplicaciones a confirmar</h2>
          </div>
          <div className={styles.confirmCardsList}>
            {pendingApplications.map(app => (
              <div className={styles.pendingApplicationItem} key={app.id}>
                <div>
                  <div className={styles.pendingApplicationMain}>
                    {documentTypes[app.credit_type] || app.credit_type} {app.credit_number} → {documentTypes[app.debit_type] || app.debit_type} {app.debit_number}
                  </div>
                  <div className={styles.pendingApplicationMeta}>
                    Cancela {formatCurrencySymbol(app.debit_currency || app.currency)} {formatNumberAR(app.amount)} · Consume {formatCurrencySymbol(app.credit_currency || 'ARS')} {formatNumberAR(app.amount_applied_ars)}
                    {app.fx_estimated > 0 && (
                      <span> · Generará ND-FX ${formatNumberAR(app.fx_estimated)} · Cancelada auto</span>
                    )}
                  </div>
                </div>
                <div>
                  <button className={styles.dangerGhostButton} onClick={() => handleRemoveApplication(app.id)}>Quitar</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '16px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end' }}>
            <button className={styles.primaryButton} onClick={handleConfirm} disabled={isSubmitting}>
              {isSubmitting ? 'Confirmando...' : 'Confirmar aplicaciones'}
            </button>
          </div>
        </section>
      )}"""
jsx = re.sub(r'<div className=\{styles\.tableContainerWrapper\}>\s*<div className=\{styles\.tableHeader\}>\s*<h2>Aplicaciones a confirmar</h2>\s*</div>.*?<div className=\{styles\.confirmCardsList\}>.*?</div>\s*</div>\s*</div>\s*</div>\s*\)\}', pending_new, jsx, flags=re.DOTALL)

# Fix history
hist_old = r'<div className=\{styles\.tableContainerWrapper\}>\s*<div className=\{styles\.tableHeader\}>\s*<h2>Historial de Aplicaciones</h2>.*?</div>\s*</div>\s*\)\}'
hist_new = """<section className={styles.historyCard}>
          <div className={styles.tableHeader}>
            <h2>Historial de Aplicaciones</h2>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Comprobantes</th>
                  <th>Importe Aplicado</th>
                  <th>FX</th>
                  <th>Origen</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {history.map(app => (
                  <tr key={app.application_id}>
                    <td>{new Date(app.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className={styles.docCell}>
                        {documentTypes[app.credit_type] || app.credit_type} {app.credit_number} → {documentTypes[app.debit_type] || app.debit_type} {app.debit_number}
                      </div>
                    </td>
                    <td>
                      <div>
                        <strong>{formatCurrencySymbol(app.debit_currency || app.currency)} {formatNumberAR(app.amount)}</strong>
                      </div>
                    </td>
                    <td>
                      {app.is_system_application ? (
                        <span className={styles.badge} style={{background: '#f1f5f9', color: '#475569'}}>Compensación DDC</span>
                      ) : app.fx_note_number ? (
                        <span className={styles.badge} style={{background: '#dbeafe', color: '#1e40af'}}>
                          {app.fx_note_type === 'DEBIT_NOTE' ? 'ND-FX' : 'NC-FX'} {app.fx_note_number}
                          {app.fx_auto_cancelled && ' (Auto)'}
                        </span>
                      ) : (
                        <span>-</span>
                      )}
                    </td>
                    <td>
                      {app.is_system_application || !app.can_void ? (
                        <span className={styles.badge} style={{background: '#f1f5f9', color: '#475569'}}>Sistema</span>
                      ) : (
                        <span className={styles.badge} style={{background: '#dcfce3', color: '#166534'}}>Manual</span>
                      )}
                    </td>
                    <td>
                      {app.can_void && !app.is_system_application ? (
                        <button className={styles.dangerGhostButton} onClick={() => handleVoidApplication(app.application_id)}>Revertir</button>
                      ) : (
                        <span>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}"""
jsx = re.sub(r'<div className=\{styles\.tableContainerWrapper\}>\s*<div className=\{styles\.tableHeader\}>\s*<h2>Historial de Aplicaciones</h2>.*?</div>\s*</div>\s*\)\}', hist_new, jsx, flags=re.DOTALL)


with open('src/modules/finance/SalesApplicationsPage.jsx', 'w', encoding='utf-8') as f:
    f.write(jsx)

print('Done layout restore.')
