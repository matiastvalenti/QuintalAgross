import React, { useState, useEffect } from 'react';
import { fetchSalesCandidates, createSalesApplications, fetchSalesApplicationHistory, voidSalesApplication } from '../../services/AccountingService';
import Autocomplete from '../../components/ui/Autocomplete';
import { formatNumberAR } from '../../utils/formatters';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import { API_URL } from '../../config';
import styles from './SalesApplicationsPage.module.css';

const documentTypes = {
  CREDIT_NOTE: 'NC',
  RECEIPT: 'Recibo',
  INVOICE: 'Factura',
  DEBIT_NOTE: 'ND'
};

const badgeClasses = {
  OPEN: styles.badgeOpen,
  PARTIAL: styles.badgePartial,
  CLOSED: styles.badgeClosed,
  CANCELLED: styles.badgeCancelled
};

const formatStatus = (status) => {
  const map = { OPEN: 'Abierto', PARTIAL: 'Parcial', CLOSED: 'Cerrado', CANCELLED: 'Anulado' };
  return map[status] || status;
};

const formatCurrencySymbol = (curr) => {
  if (curr === 'ARS') return '$';
  if (curr === 'USD') return 'U$S';
  return curr;
};

const SalesApplicationsPage = ({ mode = "internal", embeddedEntityId = null }) => {
  const { showToast } = useToast();
  const notify = (msg, type = 'info') => {
    if (typeof showToast === 'function') {
      showToast(msg, type);
    } else {
      console[type === 'error' ? 'error' : 'log'](msg);
    }
  };
  const [entityId, setEntityId] = useState(embeddedEntityId);
  const [applicationDate, setApplicationDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  
  const [debts, setDebts] = useState([]);
  const [credits, setCredits] = useState([]);
  const [history, setHistory] = useState([]);
  
  const [selectedCredit, setSelectedCredit] = useState(null);
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [amountToApply, setAmountToApply] = useState('');
  
  const [pendingApplications, setPendingApplications] = useState([]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);

  useEffect(() => {
    if (embeddedEntityId) {
      setEntityId(embeddedEntityId);
    }
  }, [embeddedEntityId]);

  useEffect(() => {
    if (entityId) {
      loadCandidates(entityId);
      loadHistory(entityId);
      setPendingApplications([]);
      resetSelection();
    } else {
      setDebts([]);
      setCredits([]);
      setHistory([]);
      setPendingApplications([]);
      resetSelection();
    }
  }, [entityId]);

  const loadHistory = async (id) => {
    try {
      const res = await fetchSalesApplicationHistory(id);
      setHistory(res || []);
    } catch (err) {
      console.error(err);
      notify('Error al cargar historial', 'error');
    }
  };

  const loadCandidates = async (id) => {
    try {
      setIsLoading(true);
      const res = await fetchSalesCandidates(id);
      setDebts(res.debts || []);
      setCredits(res.credits || []);
    } catch (err) {
      console.error(err);
      notify('Error al cargar comprobantes', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const resetSelection = () => {
    setSelectedCredit(null);
    setSelectedDebt(null);
    setAmountToApply('');
  };

  const calculateBalances = (currencyFilter) => {
    const creds = credits.filter(c => c.currency === currencyFilter);
    const dbts = debts.filter(d => d.currency === currencyFilter);
    
    let totalCredits = creds.reduce((acc, curr) => acc + curr.available, 0);
    let totalDebts = dbts.reduce((acc, curr) => acc + curr.pending, 0);
    
    pendingApplications.forEach(app => {
      if (app.currency === currencyFilter) {
        totalCredits -= app.amount;
        totalDebts -= app.amount;
      }
    });
    
    return {
      credits: Math.max(0, totalCredits),
      debts: Math.max(0, totalDebts),
      net: totalCredits - totalDebts
    };
  };

  const arsBalances = calculateBalances('ARS');
  const usdBalances = calculateBalances('USD');

  const handleSelectCredit = (credit) => {
    if (selectedCredit?.document_id === credit.document_id) {
      setSelectedCredit(null);
      setAmountToApply('');
    } else {
      setSelectedCredit(credit);
      updateMaxApplicable(credit, selectedDebt);
    }
  };

  const handleSelectDebt = (debt) => {
    if (selectedDebt?.document_id === debt.document_id) {
      setSelectedDebt(null);
      setAmountToApply('');
    } else {
      setSelectedDebt(debt);
      updateMaxApplicable(selectedCredit, debt);
    }
  };

  const updateMaxApplicable = (credit, debt) => {
    if (credit && debt) {
      if (credit.currency !== debt.currency) {
        setAmountToApply('');
        return;
      }
      
      const creditUsed = pendingApplications.filter(a => a.credit_id === credit.document_id).reduce((s, a) => s + a.amount, 0);
      const debtUsed = pendingApplications.filter(a => a.debit_id === debt.document_id).reduce((s, a) => s + a.amount, 0);
      
      const actualAvailable = Math.max(0, credit.available - creditUsed);
      const actualPending = Math.max(0, debt.pending - debtUsed);
      
      const maxApplicable = Math.min(actualAvailable, actualPending);
      setAmountToApply(maxApplicable > 0 ? maxApplicable.toFixed(2) : '');
    }
  };

  useEffect(() => {
    updateMaxApplicable(selectedCredit, selectedDebt);
  }, [pendingApplications]);

  const handleAddApplication = () => {
    if (!selectedCredit || !selectedDebt) return;
    
    if (selectedCredit.currency !== selectedDebt.currency) {
      notify('La aplicación entre monedas distintas no está habilitada.', 'warning');
      return;
    }
    
    const amount = parseFloat(amountToApply);
    if (isNaN(amount) || amount <= 0) {
      notify('Ingrese un importe válido mayor a 0.', 'error');
      return;
    }
    
    const creditUsed = pendingApplications.filter(a => a.credit_id === selectedCredit.document_id).reduce((s, a) => s + a.amount, 0);
    const debtUsed = pendingApplications.filter(a => a.debit_id === selectedDebt.document_id).reduce((s, a) => s + a.amount, 0);
    
    if (amount > (selectedCredit.available - creditUsed + 0.01)) {
      notify('El importe supera el crédito disponible.', 'error');
      return;
    }
    if (amount > (selectedDebt.pending - debtUsed + 0.01)) {
      notify('El importe supera la deuda pendiente.', 'error');
      return;
    }
    
    const newApp = {
      id: Date.now().toString(),
      credit_id: selectedCredit.document_id,
      credit_type: selectedCredit.doc_type,
      credit_number: selectedCredit.number,
      debit_id: selectedDebt.document_id,
      debit_type: selectedDebt.doc_type,
      debit_number: selectedDebt.number,
      amount: amount,
      currency: selectedCredit.currency,
      exchange_rate: selectedCredit.exchange_rate || 1.0
    };
    
    setPendingApplications([...pendingApplications, newApp]);
    resetSelection();
  };

  const handleConfirm = async () => {
    if (pendingApplications.length === 0) return;
    
    setIsSubmitting(true);
    try {
      const payload = {
        entity_id: entityId,
        application_date: applicationDate ? new Date(applicationDate).toISOString() : new Date().toISOString(),
        notes: notes || "Aplicación manual desde pantalla de comprobantes",
        items: pendingApplications.map(app => ({
          credit_document_id: app.credit_id,
          debit_document_id: app.debit_id,
          amount: app.amount,
          currency: app.currency,
          exchange_rate: app.exchange_rate
        }))
      };
      
      await createSalesApplications(payload);
      notify('Aplicaciones confirmadas con éxito.', 'success');
      
      await loadCandidates(entityId);
      await loadHistory(entityId);
      setPendingApplications([]);
      
      // Dispatch broadcast
      const eventData = {
        type: "QUINTAL_APPLICATION_CREATED",
        entityId: entityId,
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
      notify(err.response?.data?.detail || 'Error al confirmar las aplicaciones.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRepairFx = async () => {
    if (!entityId) return;
    try {
      setIsRepairing(true);
      // DRY RUN
      const resDry = await fetch(`${API_URL}/accounting/applications/sales/repair-fx-compensations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: entityId, dry_run: true })
      });
      const dataDry = await resDry.json();
      
      if (!resDry.ok) throw new Error(dataDry.detail || 'Error en validación');

      if (dataDry.pairs_found === 0) {
        notify('No se encontraron FX huérfanas para reparar.', 'info');
        return;
      }

      if (window.confirm(`Se encontraron ${dataDry.pairs_found} pares de ND/NC por diferencia de cambio sin aplicación. ¿Querés repararlos?`)) {
        const resApply = await fetch(`${API_URL}/accounting/applications/sales/repair-fx-compensations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity_id: entityId, dry_run: false })
        });
        if (!resApply.ok) throw new Error('Error al aplicar la reparación');
        
        notify(`Reparación completada. Se generaron ${dataDry.applications_to_create} aplicaciones de compensación.`, 'success');
        await loadCandidates(entityId);
        await loadHistory(entityId);
      }
    } catch (err) {
      console.error(err);
      notify(err.message, 'error');
    } finally {
      setIsRepairing(false);
    }
  };

  const handleVoidApplication = async (applicationId) => {
    if (!window.confirm('Vas a revertir esta aplicación.\n\nEl crédito volverá a quedar disponible y la deuda volverá a quedar pendiente.\n\nSi esta aplicación generó diferencia de cambio, el sistema creará automáticamente el comprobante reverso correspondiente.\n\n¿Confirmar?')) {
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
  };

  const getActualBalance = (doc, isCredit) => {
    const used = pendingApplications.filter(a => (isCredit ? a.credit_id : a.debit_id) === doc.document_id).reduce((s, a) => s + a.amount, 0);
    const balance = isCredit ? doc.available : doc.pending;
    return Math.max(0, balance - used);
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.header}>
        <h1>Aplicación de Comprobantes de Venta</h1>
        <p>Aplicá notas de crédito, anticipos o saldos a favor contra facturas y notas de débito.</p>
      </div>

      <div className={styles.filtersBar}>
        <div className={styles.filterGroup} style={{ width: '300px' }}>
          <label>Cliente</label>
          <Autocomplete
            placeholder="Buscar Cliente..."
            onSearch={async (q) => {
              try {
                const data = await api.get(`/entities/`, {
                  params: {
                    type: "client",
                    q: q || "",
                    limit: 10
                  }
                });
                return Array.isArray(data) ? data : (data.items || []);
              } catch (e) {
                if (e.status === 401) {
                  notify('Sesión vencida o no autorizada. Volvé a iniciar sesión.', 'error');
                } else {
                  console.error("Fetch error", e);
                }
              }
              return [];
            }}
            onSelect={(entity) => setEntityId(entity?.id || null)}
            initialValue={null}
            minChars={0}
          />
        </div>
        <div className={styles.filterGroup}>
          <label>Fecha de aplicación</label>
          <input 
            type="date" 
            value={applicationDate}
            onChange={(e) => setApplicationDate(e.target.value)}
          />
        </div>
        <div className={styles.filterGroup} style={{ flex: 1 }}>
          <label>Observaciones</label>
          <input 
            type="text" 
            placeholder="Ej: Compensación mensual..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className={styles.spacer}></div>
        {entityId && (
          <button 
            className={styles.repairButton}
            onClick={handleRepairFx}
            disabled={isRepairing}
          >
            {isRepairing ? 'Validando...' : 'Reparar FX huérfanas'}
          </button>
        )}
      </div>

      {entityId && (
        <>
          <div className={styles.summarySection}>
            <div className={styles.summaryGroup}>
              <h3>Resumen ARS</h3>
              <div className={styles.cardsContainer}>
                <div className={styles.card}>
                  <p className={styles.cardTitle}>Créditos</p>
                  <p className={`${styles.cardValue} ${styles.valueCredit}`}>$ {formatNumberAR(arsBalances.credits)}</p>
                </div>
                <div className={styles.card}>
                  <p className={styles.cardTitle}>Deudas</p>
                  <p className={`${styles.cardValue} ${styles.valueDebt}`}>$ {formatNumberAR(arsBalances.debts)}</p>
                </div>
                <div className={styles.card}>
                  <p className={styles.cardTitle}>Neto</p>
                  <p className={`${styles.cardValue} ${styles.valueNet}`}>$ {formatNumberAR(arsBalances.net)}</p>
                </div>
              </div>
            </div>

            <div className={styles.summaryGroup}>
              <h3>Resumen USD</h3>
              <div className={styles.cardsContainer}>
                <div className={styles.card}>
                  <p className={styles.cardTitle}>Créditos</p>
                  <p className={`${styles.cardValue} ${styles.valueCredit}`}>U$S {formatNumberAR(usdBalances.credits)}</p>
                </div>
                <div className={styles.card}>
                  <p className={styles.cardTitle}>Deudas</p>
                  <p className={`${styles.cardValue} ${styles.valueDebt}`}>U$S {formatNumberAR(usdBalances.debts)}</p>
                </div>
                <div className={styles.card}>
                  <p className={styles.cardTitle}>Neto</p>
                  <p className={`${styles.cardValue} ${styles.valueNet}`}>U$S {formatNumberAR(usdBalances.net)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.mainLayout}>
            <div className={styles.tableContainerWrapper}>
              <div className={styles.tableHeader}>
                <h2>Créditos disponibles</h2>
              </div>
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Comprobante</th>
                      <th>Mon.</th>
                      <th className={styles.textRight}>Disponible</th>
                      <th className={`${styles.textCenter} ${styles.statusCol}`}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credits.map(row => {
                      const actualBalance = getActualBalance(row, true);
                      if (actualBalance <= 0.01) return null;
                      
                      return (
                        <tr 
                          key={row.document_id} 
                          onClick={() => handleSelectCredit(row)}
                          className={selectedCredit?.document_id === row.document_id ? styles.selected : ''}
                        >
                          <td>{documentTypes[row.doc_type] || row.doc_type}</td>
                          <td className={styles.documentNumberCell} title={row.number}>{row.number}</td>
                          <td>{row.currency}</td>
                          <td className={styles.textRight}><strong>{formatNumberAR(actualBalance)}</strong></td>
                          <td className={`${styles.textCenter} ${styles.statusCol}`}>
                            <span className={`${styles.badge} ${badgeClasses[row.status]}`}>{formatStatus(row.status)}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {credits.length === 0 && !isLoading && (
                      <tr>
                        <td colSpan="7">
                          <div className={styles.emptyState}>
                            No hay créditos disponibles.
                            <p>Las notas de crédito, anticipos o recibos con saldo sin aplicar aparecerán acá.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.tableContainerWrapper}>
              <div className={styles.tableHeader}>
                <h2>Deudas pendientes</h2>
              </div>
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Comprobante</th>
                      <th>Mon.</th>
                      <th className={styles.textRight}>Pendiente</th>
                      <th className={`${styles.textCenter} ${styles.statusCol}`}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debts.map(row => {
                      const actualBalance = getActualBalance(row, false);
                      if (actualBalance <= 0.01) return null;

                      return (
                        <tr 
                          key={row.document_id}
                          onClick={() => handleSelectDebt(row)}
                          className={selectedDebt?.document_id === row.document_id ? styles.selected : ''}
                        >
                          <td>{documentTypes[row.doc_type] || row.doc_type}</td>
                          <td className={styles.documentNumberCell} title={row.number}>{row.number}</td>
                          <td>{row.currency}</td>
                          <td className={styles.textRight}><strong>{formatNumberAR(actualBalance)}</strong></td>
                          <td className={`${styles.textCenter} ${styles.statusCol}`}>
                            <span className={`${styles.badge} ${badgeClasses[row.status]}`}>{formatStatus(row.status)}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {debts.length === 0 && !isLoading && (
                      <tr>
                        <td colSpan="7">
                          <div className={styles.emptyState}>
                            No hay deudas pendientes para este cliente.
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
                <div className={styles.actionPanel}>
            <div className={styles.actionPanelContent} style={{ flexDirection: 'column', gap: '24px' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '24px' }}>
                <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  {selectedCredit ? (
                    <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                      <div style={{ fontWeight: '600', color: '#111827', marginBottom: '8px' }}>Crédito seleccionado:</div>
                      <div><strong style={{ color: '#1e40af' }}>{documentTypes[selectedCredit.doc_type]} {selectedCredit.number}</strong></div>
                      <div>Fecha: {selectedCredit.date?.split('T')[0]}</div>
                      <div>Moneda: {selectedCredit.currency}</div>
                      <div>TC: {selectedCredit.exchange_rate}</div>
                      <div>Total: {selectedCredit.currency} {formatNumberAR(selectedCredit.total)}</div>
                      <div>Aplicado: {selectedCredit.currency} {formatNumberAR(selectedCredit.total - selectedCredit.available)}</div>
                      <div>Disponible: <strong>{selectedCredit.currency} {formatNumberAR(getActualBalance(selectedCredit, true))}</strong></div>
                      <div>Estado: {formatStatus(selectedCredit.status)}</div>
                    </div>
                  ) : (
                    <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>Seleccioná un crédito para aplicar</p>
                  )}
                </div>
                
                <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  {selectedDebt ? (
                    <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                      <div style={{ fontWeight: '600', color: '#111827', marginBottom: '8px' }}>Deuda seleccionada:</div>
                      <div><strong style={{ color: '#1e40af' }}>{documentTypes[selectedDebt.doc_type]} {selectedDebt.number}</strong></div>
                      <div>Fecha: {selectedDebt.date?.split('T')[0]}</div>
                      <div>Moneda: {selectedDebt.currency}</div>
                      <div>TC: {selectedDebt.exchange_rate}</div>
                      <div>Total: {selectedDebt.currency} {formatNumberAR(selectedDebt.total)}</div>
                      <div>Aplicado: {selectedDebt.currency} {formatNumberAR(selectedDebt.total - selectedDebt.pending)}</div>
                      <div>Pendiente: <strong>{selectedDebt.currency} {formatNumberAR(getActualBalance(selectedDebt, false))}</strong></div>
                      <div>Estado: {formatStatus(selectedDebt.status)}</div>
                    </div>
                  ) : (
                    <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>Seleccioná una deuda</p>
                  )}
                </div>
              </div>

              {selectedCredit && selectedDebt && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <div style={{ flex: 1 }}>
                    {selectedCredit.currency !== selectedDebt.currency ? (
                      <p style={{ color: '#dc2626', fontWeight: 500, margin: 0 }}>
                        No se pueden aplicar comprobantes de distinta moneda.
                      </p>
                    ) : (
                      <p className={styles.actionMax} style={{ margin: 0 }}>
                        Máximo aplicable: {formatCurrencySymbol(selectedCredit.currency)} {formatNumberAR(Math.min(getActualBalance(selectedCredit, true), getActualBalance(selectedDebt, false)))}
                      </p>
                    )}
                  </div>
                  <div className={styles.actionForm} style={{ margin: 0 }}>
                    <input 
                      type="number" 
                      step="0.01" 
                      className={styles.amountInput}
                      value={amountToApply}
                      onChange={(e) => setAmountToApply(e.target.value)}
                      disabled={!selectedCredit || !selectedDebt || selectedCredit.currency !== selectedDebt.currency}
                      placeholder="Monto"
                    />
                    <button 
                      className={styles.addButton}
                      onClick={handleAddApplication}
                      disabled={!selectedCredit || !selectedDebt || !amountToApply || parseFloat(amountToApply) <= 0 || selectedCredit.currency !== selectedDebt.currency}
                    >
                      Agregar aplicación
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
            </div>
          </div>

          {pendingApplications.length > 0 && (
            <div className={styles.confirmSection}>
              <div className={styles.tableHeader}>
                <h2>Aplicaciones a confirmar</h2>
              </div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Crédito</th>
                    <th>Deuda</th>
                    <th className={styles.textCenter}>Moneda</th>
                    <th className={styles.textRight}>Importe</th>
                    <th className={styles.textCenter}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApplications.map(app => (
                    <tr key={app.id}>
                      <td>{documentTypes[app.credit_type] || app.credit_type} {app.credit_number}</td>
                      <td>{documentTypes[app.debit_type] || app.debit_type} {app.debit_number}</td>
                      <td className={styles.textCenter}>{app.currency}</td>
                      <td className={styles.textRight}>
                        <strong>{formatCurrencySymbol(app.currency)} {formatNumberAR(app.amount)}</strong>
                      </td>
                      <td className={styles.textCenter}>
                        <button 
                          className={styles.removeButton}
                          onClick={() => handleRemoveApplication(app.id)}
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={styles.confirmActions}>
                <button 
                  className={styles.confirmButton}
                  onClick={handleConfirm}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Procesando...' : 'Confirmar aplicaciones'}
                </button>
              </div>
            </div>
          )}

          {history.length > 0 && (
            <div className={styles.confirmSection} style={{ marginTop: '24px' }}>
              <div className={styles.tableHeader}>
                <h2>Historial de aplicaciones realizadas</h2>
              </div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Crédito aplicado</th>
                    <th>Deuda cancelada</th>
                    <th className={styles.textCenter}>Moneda</th>
                    <th className={styles.textRight}>Importe</th>
                    <th>Observaciones</th>
                    <th className={styles.textCenter}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(app => (
                    <tr key={app.application_id}>
                      <td>{app.date?.split('T')[0]}</td>
                      <td>{documentTypes[app.credit_type] || app.credit_type} {app.credit_number}</td>
                      <td>{documentTypes[app.debit_type] || app.debit_type} {app.debit_number}</td>
                      <td className={styles.textCenter}>{app.currency}</td>
                      <td className={styles.textRight}>
                        <strong>{formatCurrencySymbol(app.currency)} {formatNumberAR(app.amount)}</strong>
                      </td>
                      <td>{app.notes || 'Aplicación manual'}</td>
                      <td className={styles.textCenter}>
                        {app.can_void ? (
                          <button 
                            className={styles.removeButton}
                            onClick={() => handleVoidApplication(app.application_id)}
                          >
                            Revertir
                          </button>
                        ) : (
                          <span 
                            className={styles.badgeClosed} 
                            style={{ fontSize: '11px', backgroundColor: '#f3f4f6', color: '#4b5563', border: '1px solid #d1d5db' }}
                            title="Aplicación automática del sistema. No puede revertirse manualmente."
                          >
                            Sistema
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SalesApplicationsPage;
