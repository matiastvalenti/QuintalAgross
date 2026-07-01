import re
import os

with open('src/modules/finance/SalesApplicationsPage.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports and State
content = content.replace(
    "import Autocomplete from '../../components/ui/Autocomplete';",
    "import Autocomplete from '../../components/ui/Autocomplete';\nimport Modal from '../../components/ui/Modal';"
)

state_repl = """  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  
  const [confirmModalData, setConfirmModalData] = useState(null);
  const [voidModalData, setVoidModalData] = useState(null);
  const [repairModalData, setRepairModalData] = useState(null);"""
content = re.sub(
    r'  const \[isSubmitting, setIsSubmitting\] = useState\(false\);\n  const \[isLoading, setIsLoading\] = useState\(false\);\n  const \[isRepairing, setIsRepairing\] = useState\(false\);',
    state_repl,
    content
)

# 2. handleRepairFx Modal
repair_old = """      if (window.confirm(`Se encontraron ${dataDry.pairs_found} pares de ND/NC por diferencia de cambio sin aplicación. ¿Querés repararlos?`)) {
        const resApply = await fetch(`${API_URL}/accounting/applications/sales/repair-fx-compensations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity_id: entityId, dry_run: false })
        });
        if (!resApply.ok) throw new Error('Error al aplicar la reparación');
        
        notify(`Reparación completada. Se generaron ${dataDry.applications_to_create} aplicaciones de compensación.`, 'success');
        await loadCandidates(entityId);
        await loadHistory(entityId);
      }"""

repair_new = """      setRepairModalData(dataDry);"""

content = content.replace(repair_old, repair_new)

repair_confirm = """  const confirmRepairFx = async () => {
    if (!repairModalData) return;
    try {
      const resApply = await fetch(`${API_URL}/accounting/applications/sales/repair-fx-compensations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: entityId, dry_run: false })
      });
      if (!resApply.ok) throw new Error('Error al aplicar la reparación');
      notify(`Reparación completada.`, 'success');
      await loadCandidates(entityId);
      await loadHistory(entityId);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setRepairModalData(null);
    }
  };
"""
content = content.replace("const handleVoidApplication", repair_confirm + "\n  const handleVoidApplication")

# 3. handleVoidApplication Modal
void_old = """  const handleVoidApplication = async (applicationId) => {
    if (!window.confirm('Vas a revertir esta aplicación.\\n\\nEl crédito volverá a quedar disponible y la deuda volverá a quedar pendiente.\\n\\nSi esta aplicación generó diferencia de cambio, el sistema creará automáticamente el comprobante reverso correspondiente.\\n\\n¿Confirmar?')) {
      return;
    }
    
    setIsLoading(true);
    try {
      await voidSalesApplication(applicationId);
      notify('Aplicación revertida con éxito.', 'success');
      
      await loadCandidates(entityId);
      await loadHistory(entityId);
      
      const eventData = {
        type: "QUINTAL_APPLICATION_VOIDED",
        entityId,
        applicationId,
        timestamp: Date.now()
      };
      if (window.opener) {
        window.opener.postMessage(eventData, "*");
      }
      const bc = new BroadcastChannel("quintal-documents");
      bc.postMessage(eventData);
      bc.close();
      
    } catch (err) {
      console.error(err);
      notify(err.response?.data?.detail || 'Error al revertir la aplicación.', 'error');
    } finally {
      setIsLoading(false);
    }
  };"""

void_new = """  const handleVoidApplication = async (applicationId) => {
    setVoidModalData(applicationId);
  };
    
  const confirmVoidApplication = async () => {
    if (!voidModalData) return;
    setIsLoading(true);
    try {
      await voidSalesApplication(voidModalData);
      notify('Aplicación revertida con éxito.', 'success');
      await loadCandidates(entityId);
      await loadHistory(entityId);
    } catch (err) {
      notify(err.response?.data?.detail || 'Error al revertir la aplicación.', 'error');
    } finally {
      setIsLoading(false);
      setVoidModalData(null);
    }
  };"""

content = content.replace(void_old, void_new)

# 4. Add Modals to EOF
modals_jsx = """
      <Modal 
        open={!!voidModalData} 
        onClose={() => setVoidModalData(null)} 
        title="Revertir aplicación"
      >
        <div className={styles.modalContent}>
          <p>Vas a revertir esta aplicación.</p>
          <p>El crédito volverá a quedar disponible y la deuda volverá a quedar pendiente.</p>
          <p>Si esta aplicación generó diferencia de cambio, el sistema creará automáticamente el comprobante reverso correspondiente.</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
            <button className={styles.btnSecondary} onClick={() => setVoidModalData(null)}>Cancelar</button>
            <button className={styles.dangerGhostButton} onClick={confirmVoidApplication}>Confirmar</button>
          </div>
        </div>
      </Modal>
      
      <Modal 
        open={!!repairModalData} 
        onClose={() => setRepairModalData(null)} 
        title="Reparar compensaciones FX"
      >
        <div className={styles.modalContent}>
          <p>Se encontraron <strong>{repairModalData?.pairs_found}</strong> pares de ND/NC por diferencia de cambio sin aplicación.</p>
          <p>¿Querés repararlos? Se generarán aplicaciones automáticas de compensación.</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
            <button className={styles.btnSecondary} onClick={() => setRepairModalData(null)}>Cancelar</button>
            <button className={styles.primaryButton} onClick={confirmRepairFx}>Confirmar reparación</button>
          </div>
        </div>
      </Modal>
"""

content = content.replace("    </div>\n  );\n};", modals_jsx + "    </div>\n  );\n};")

# 5. Fix backend statuses
fx_old = """                          {app.notes && app.notes.includes('ND-FX') ? (
                            <>
                              <span className={styles.fxDoc}>ND-FX</span>
                              <span className={styles.fxStatus}>Cancelada auto</span>
                            </>
                          ) : app.notes && app.notes.includes('NC-FX') ? (
                            <>
                              <span className={styles.fxDoc}>NC-FX</span>
                              <span className={styles.fxStatus}>Cancelada auto</span>
                            </>
                          ) : (
                            <span className={styles.fxDoc}>-</span>
                          )}"""

fx_new = """                          {app.is_system_application ? (
                            <span className={styles.fxDoc}>Compensación DDC</span>
                          ) : app.fx_note_number ? (
                            <>
                              <span className={styles.fxDoc}>{app.fx_note_type === 'DEBIT_NOTE' ? 'ND-FX' : 'NC-FX'} {app.fx_note_number}</span>
                              {app.fx_auto_cancelled && <span className={styles.fxStatus}>Cancelada auto</span>}
                            </>
                          ) : (
                            <span className={styles.fxDoc}>-</span>
                          )}"""

content = content.replace(fx_old, fx_new)

void_btn_old = """                      <td>
                        <button 
                          className={styles.removeBtn}
                          onClick={() => handleVoidApplication(app.application_id)}
                        >
                          Revertir
                        </button>
                      </td>"""

void_btn_new = """                      <td>
                        {app.can_void && !app.is_system_application ? (
                          <button 
                            className={styles.removeBtn}
                            onClick={() => handleVoidApplication(app.application_id)}
                          >
                            Revertir
                          </button>
                        ) : (
                          <span>-</span>
                        )}
                      </td>"""

content = content.replace(void_btn_old, void_btn_new)


with open('src/modules/finance/SalesApplicationsPage.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done writing SalesApplicationsPage.jsx')
