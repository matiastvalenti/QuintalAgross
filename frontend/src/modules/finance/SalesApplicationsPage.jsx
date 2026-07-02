import React, { useState, useEffect } from 'react';
import { fetchSalesCandidates, createSalesApplications, fetchSalesApplicationHistory, voidSalesApplication } from '../../services/AccountingService';
import Autocomplete from '../../components/ui/Autocomplete';
import Modal from '../../components/ui/Modal';
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
  const [exchangeRate, setExchangeRate] = useState('');
  const [isApplyingMax, setIsApplyingMax] = useState(false);
  
  const [pendingApplications, setPendingApplications] = useState([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  
  const [confirmModalData, setConfirmModalData] = useState(null);
  const [voidModalData, setVoidModalData] = useState(null);
  const [repairModalData, setRepairModalData] = useState(null);

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
      setExchangeRate('');
    } else {
      setSelectedCredit(credit);
      updateMaxApplicable(credit, selectedDebt);
    }
  };

  const handleSelectDebt = (debt) => {
    if (selectedDebt?.document_id === debt.document_id) {
      setSelectedDebt(null);
      setAmountToApply('');
      setExchangeRate('');
    } else {
      setSelectedDebt(debt);
      updateMaxApplicable(selectedCredit, debt);
    }
  };

  const updateMaxApplicable = (credit, debt) => {
    if (credit && debt) {
      if (credit.currency !== debt.currency) {
        setAmountToApply('');
        if (credit.exchange_rate > 1) {
          setExchangeRate(credit.exchange_rate);
        } else {
          setExchangeRate('');
        }
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

  const handleApplyFull = () => {
    if (!selectedCredit || !selectedDebt) return;
    const debtPend = getActualBalance(selectedDebt, false);
    setAmountToApply(debtPend.toFixed(2));
    setIsApplyingMax(false);
  };

  const handleApplyMax = () => {
    if (!selectedCredit || !selectedDebt) return;
    if (selectedCredit.currency === 'ARS' && selectedDebt.currency === 'USD') {
      const tc = parseFloat(exchangeRate) || parseFloat(selectedDebt.exchange_rate) || 1;
      const creditDisp = getActualBalance(selectedCredit, true);
      const maxUsd = creditDisp / tc;
      const debtPend = getActualBalance(selectedDebt, false);
      if (maxUsd < debtPend) {
        setAmountToApply(maxUsd.toFixed(8));
        setIsApplyingMax(true);
      } else {
        setAmountToApply(debtPend.toFixed(2));
        setIsApplyingMax(false);
      }
    } else {
      handleApplyFull();
    }
  };

  const handleAddApplication = () => {
    if (!selectedCredit || !selectedDebt) return;
    
    if (pendingApplications.length >= 1) {
      notify("Ya hay una aplicación pendiente. Confirmala o quitála antes de agregar otra.", "warning");
      return;
    }
    
    const amount = parseFloat(amountToApply);
    if (isNaN(amount) || amount <= 0) {
      notify('Ingrese un importe válido mayor a 0.', 'error');
      return;
    }
    
    const isCrossCurrency = selectedCredit.currency !== selectedDebt.currency;
    const tc = isCrossCurrency ? parseFloat(exchangeRate) : 1;
    
    if (isCrossCurrency && (isNaN(tc) || tc <= 1)) {
      notify('Ingresá un tipo de cambio válido para aplicar pesos contra dólares.', 'error');
      return;
    }
    
    const actualAvailable = getActualBalance(selectedCredit, true);
    let creditAmountConsumed = amount; // default same currency
    let finalApplyMaxCredit = isApplyingMax;
    if (isCrossCurrency) {
      if (selectedCredit.currency === 'ARS' && selectedDebt.currency === 'USD') {
        const calculatedConsumed = amount * tc;
        const diff = calculatedConsumed - actualAvailable;
        if (isApplyingMax || (diff > 0 && diff <= 2.00)) {
          creditAmountConsumed = actualAvailable;
          finalApplyMaxCredit = true;
        } else {
          creditAmountConsumed = calculatedConsumed;
        }
      } else {
        notify('La aplicación USD a ARS no está implementada.', 'error');
        return;
      }
    }
    
    if (creditAmountConsumed > (actualAvailable + 2.00)) {
      if (isCrossCurrency) {
        const missing = creditAmountConsumed - actualAvailable;
        const maxUsd = actualAvailable / tc;
        notify(`El crédito seleccionado no alcanza para aplicar U$S ${amount}. Faltan $${missing.toFixed(2)}. Máximo posible: U$S ${maxUsd.toFixed(2)}.`, 'error');
      } else {
        notify('El importe a aplicar supera el crédito disponible.', 'error');
      }
      return;
    }
    
    const actualPending = getActualBalance(selectedDebt, false);
    if (amount > (actualPending + 0.01)) {
      notify('El importe a aplicar supera la deuda pendiente.', 'error');
      return;
    }
    
    // Check if it generates FX difference
    let fx_estimated = 0;
    if (isCrossCurrency && tc !== parseFloat(selectedDebt.exchange_rate)) {
      const tc_historico = parseFloat(selectedDebt.exchange_rate) || tc;
      fx_estimated = (tc - tc_historico) * amount;
    }
    
    const newApp = {
      id: Date.now().toString(),
      credit_id: selectedCredit.document_id,
      credit_type: selectedCredit.doc_type,
      credit_number: selectedCredit.number,
      credit_currency: selectedCredit.currency,
      debit_id: selectedDebt.document_id,
      debit_type: selectedDebt.doc_type,
      debit_number: selectedDebt.number,
      debit_currency: selectedDebt.currency,
      currency: selectedDebt.currency, // Application amount is in debit's currency
      amount: amount,
      amount_applied_ars: creditAmountConsumed,
      exchange_rate: isCrossCurrency ? tc : 1.0,
      is_cross_currency: isCrossCurrency,
      fx_estimated: fx_estimated,
      tc_historico: parseFloat(selectedDebt.exchange_rate) || tc,
      tc_credito: parseFloat(selectedCredit.exchange_rate) || 1.0,
      apply_max_credit: finalApplyMaxCredit
    };
    
    setPendingApplications([...pendingApplications, newApp]);
    setAmountToApply('');
    setIsApplyingMax(false);
    resetSelection();
  };

  const handleConfirm = () => {
    if (pendingApplications.length === 0) return;
    
    if (pendingApplications.some(app => app.is_cross_currency)) {
      setShowConfirmModal(true);
    } else {
      submitApplications();
    }
  };

  const submitApplications = async () => {
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
          exchange_rate: app.exchange_rate,
          apply_max_credit: app.apply_max_credit || false
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
      const balanceEvent = {
        type: "QUINTAL_ACCOUNT_BALANCE_CHANGED",
        entityId: entityId,
        timestamp: Date.now()
      };
      if (window.opener) {
        window.opener.postMessage(eventData, "*");
        window.opener.postMessage(balanceEvent, "*");
      }
      const bc = new BroadcastChannel("quintal-documents");
      bc.postMessage(eventData);
      bc.postMessage(balanceEvent);
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

      setRepairModalData(dataDry);
    } catch (err) {
      console.error(err);
      notify(err.message, 'error');
    } finally {
      setIsRepairing(false);
    }
  };

    const confirmRepairFx = async () => {
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

  const handleVoidApplication = async (applicationId) => {
    setVoidModalData(applicationId);
  };
    
  const confirmVoidApplication = async () => {
    if (!voidModalData) return;
    setIsLoading(true);
    try {
      await voidSalesApplication(voidModalData);
      notify('Aplicación revertida con éxito.', 'success');
      const eventData = {
        type: "QUINTAL_APPLICATION_REVERTED",
        entityId: entityId,
        applicationId: voidModalData,
        timestamp: Date.now()
      };
      const balanceEvent = {
        type: "QUINTAL_ACCOUNT_BALANCE_CHANGED",
        entityId: entityId,
        timestamp: Date.now()
      };
      if (window.opener) {
        window.opener.postMessage(eventData, "*");
        window.opener.postMessage(balanceEvent, "*");
      }
      try {
        const bc = new BroadcastChannel("quintal-documents");
        bc.postMessage(eventData);
        bc.postMessage(balanceEvent);
        bc.close();
      } catch (err) {
        console.error(err);
      }
      await loadCandidates(entityId);
      await loadHistory(entityId);
    } catch (err) {
      notify(err.response?.data?.detail || 'Error al revertir la aplicación.', 'error');
    } finally {
      setIsLoading(false);
      setVoidModalData(null);
    }
  };

  const getActualBalance = (doc, isCredit) => {
    const used = pendingApplications.filter(a => (isCredit ? a.credit_id : a.debit_id) === doc.document_id).reduce((s, a) => s + a.amount, 0);
    const balance = isCredit ? doc.available : doc.pending;
    return Math.max(0, balance - used);
  };

  return (
    <div className={styles.pageContainer}>
      <header className={styles.pageHeader}>
        <h1>Aplicación de Comprobantes de Venta</h1>
        <p>Aplicá notas de crédito, anticipos o saldos a favor contra facturas y notas de débito.</p>
      </header>

      <section className={styles.filtersCard}>
        <div className={styles.filterGroup}>
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
          <label>Fecha aplicación</label>
          <input 
            type="date" 
            className={styles.filterInput}
            value={applicationDate}
            onChange={(e) => setApplicationDate(e.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <label>Observaciones</label>
          <input 
            type="text" 
            className={styles.filterInput}
            placeholder="Ej: Compensación..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {entityId ? (
          <button 
            className={styles.repairButton}
            onClick={handleRepairFx}
            disabled={isRepairing}
          >
            {isRepairing ? 'Validando...' : 'Reparar FX huérfanas'}
          </button>
        ) : <div></div>}
      </section>

      {entityId && (
        <>
          <section className={styles.summaryRow}>
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
          </section>

          <section className={styles.workspaceGrid}>
            <div className={styles.leftWorkspace}>
              <div className={styles.tableCard}>
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

            <div className={styles.tableCard}>
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
            </div>
          </div>
          <aside className={styles.sidePanel}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Simulación de aplicación</div>
          {selectedCredit || selectedDebt ? (
            <div className={styles.sidePanelContent}>
              <div className={styles.selectedPairGrid}>
                {selectedCredit ? (
                  <div className={styles.miniDocCard}>
                    <div className={styles.miniDocCardTitle}>Crédito</div>
                    <div className={styles.miniDocCardNumber}>{documentTypes[selectedCredit.doc_type]} {selectedCredit.number}</div>
                    <div className={styles.miniDocCardMeta}>Disp. {selectedCredit.currency} {formatNumberAR(getActualBalance(selectedCredit, true))}</div>
                  </div>
                ) : <div className={styles.miniDocCard} style={{opacity: 0.5}}>Seleccionar crédito...</div>}
                
                {selectedDebt ? (
                  <div className={styles.miniDocCard}>
                    <div className={styles.miniDocCardTitle}>Deuda</div>
                    <div className={styles.miniDocCardNumber}>{documentTypes[selectedDebt.doc_type]} {selectedDebt.number}</div>
                    <div className={styles.miniDocCardMeta}>Pend. {selectedDebt.currency} {formatNumberAR(getActualBalance(selectedDebt, false))}</div>
                  </div>
                ) : <div className={styles.miniDocCard} style={{opacity: 0.5}}>Seleccionar deuda...</div>}
              </div>

              {selectedCredit && selectedDebt && (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  
                  {selectedCredit.currency !== selectedDebt.currency && (
                    <div className={styles.inputGrid}>
                      <div className={styles.inputGroup}>
                        <label>TC Histórico</label>
                        <input type="text" className={styles.compactInput} value={selectedDebt.exchange_rate || 1.0} readOnly />
                      </div>
                      <div className={styles.inputGroup}>
                        <label>TC Aplicación</label>
                        <input type="number" step="0.01" className={styles.compactInput} value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} />
                      </div>
                      
                      <div className={`${styles.inputGroup} ${styles.fullWidthInput}`}>
                        <label>Importe USD</label>
                        <input 
                          type="number" 
                          step="any" 
                          className={styles.compactInput}
                          value={amountToApply}
                          onChange={(e) => {
                            setAmountToApply(e.target.value);
                            setIsApplyingMax(false);
                          }}
                          placeholder="Ej: 228,010825"
                        />
                      </div>
                    </div>
                  )}

                  {selectedCredit.currency === selectedDebt.currency && (
                    <div className={styles.inputGrid}>
                      <div className={`${styles.inputGroup} ${styles.fullWidthInput}`}>
                        <label>Importe a aplicar {selectedDebt.currency}</label>
                        <input 
                          type="number" 
                          step="0.01" 
                          className={styles.compactInput}
                          value={amountToApply}
                          onChange={(e) => {
                            setAmountToApply(e.target.value);
                            setIsApplyingMax(false);
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {selectedCredit.currency !== selectedDebt.currency && exchangeRate > 0 && (
                    <div className={styles.metricsBox}>
                      {(() => {
                        const tc_historico = parseFloat(selectedDebt.exchange_rate) || 1.0;
                        const tc = parseFloat(exchangeRate);
                        const isSimulation = !amountToApply;
                        const creditAvailable = getActualBalance(selectedCredit, true);
                        const debtPending = getActualBalance(selectedDebt, false);
                        const maxUsd = creditAvailable / tc;
                        const calcAmount = isSimulation ? Math.min(maxUsd, debtPending) : parseFloat(amountToApply);
                        const diff = (tc - tc_historico) * calcAmount;
                        
                        const arsNecesarios = calcAmount * tc;
                        const isCrossCurrency = selectedCredit.currency === 'ARS' && selectedDebt.currency === 'USD';
                        const hasInsufficientCredit = !isSimulation && isCrossCurrency && arsNecesarios > (creditAvailable + 0.02);
                        const missingAmount = arsNecesarios - creditAvailable;
                        
                        return (
                          <>
                            <div className={styles.metricsTitle}>Resultado {isSimulation ? '(Simulación)' : ''}</div>
                            <div className={styles.metricRow}>
                              <span>Cubre factura</span>
                              <span style={{ fontWeight: 600 }}>U$S {formatNumberAR(calcAmount)}</span>
                            </div>
                            <div className={styles.metricRow}>
                              <span>Consume crédito</span>
                              <span>$ {formatNumberAR(arsNecesarios)}</span>
                            </div>
                            
                            {hasInsufficientCredit ? (
                              <div className={styles.validationBox}>
                                <div style={{ fontWeight: 700, marginBottom: '4px' }}>No alcanza el crédito disponible para cancelar toda la deuda.</div>
                                <div className={styles.metricRow} style={{ padding: '0' }}><span>Necesitás</span> <span className={styles.errorMetric}>$ {formatNumberAR(arsNecesarios)}</span></div>
                                <div className={styles.metricRow} style={{ padding: '0' }}><span>Disponible</span> <span style={{ color: '#166534', fontWeight: 600 }}>$ {formatNumberAR(creditAvailable)}</span></div>
                                <div className={styles.metricRow} style={{ padding: '0' }}><span>Faltan</span> <span className={styles.errorMetric}>$ {formatNumberAR(missingAmount)}</span></div>
                                <div style={{ marginTop: '4px', fontWeight: 600, color: '#374151' }}>Máximo aplicable: U$S {formatNumberAR(maxUsd)}</div>
                              </div>
                            ) : (
                              <div className={styles.metricRow}>
                                <span>Queda factura</span>
                                <span>U$S {formatNumberAR(Math.max(0, debtPending - calcAmount))}</span>
                              </div>
                            )}
                            
                            <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '6px', paddingTop: '6px' }}>
                              <div className={styles.metricsTitle}>Diferencia de cambio</div>
                              {hasInsufficientCredit ? (
                                <div style={{ color: '#991b1b', fontSize: '12.5px' }}>No se puede confirmar porque el crédito no alcanza.</div>
                              ) : diff > 0.01 ? (
                                <>
                                  <div style={{ color: '#b45309', fontWeight: 700, fontSize: '12px' }}>Generará ND-FX</div>
                                  <div className={styles.metricRow}>
                                    <span>Base</span>
                                    <span>$ {formatNumberAR(diff)}</span>
                                  </div>
                                  <div className={styles.metricRow}>
                                    <span>IVA</span>
                                    <span>$ {formatNumberAR(diff * 0.21)}</span>
                                  </div>
                                  <div className={styles.metricRow}>
                                    <span style={{ fontWeight: 600 }}>Total</span>
                                    <span style={{ fontWeight: 600 }}>$ {formatNumberAR(diff * 1.21)}</span>
                                  </div>
                                  <span className={styles.fxBadge}>IVA pendiente</span>
                                </>
                              ) : diff < -0.01 ? (
                                <>
                                  <div style={{ color: '#166534', fontWeight: 700, fontSize: '12px' }}>Generará NC-FX</div>
                                  <div className={styles.metricRow}>
                                    <span>Base</span>
                                    <span>$ {formatNumberAR(Math.abs(diff))}</span>
                                  </div>
                                  <span className={styles.fxBadge} style={{ background: '#dcfce7', color: '#166534' }}>IVA pendiente</span>
                                </>
                              ) : (
                                <>
                                  <div style={{ color: '#6b7280', fontSize: '12.5px' }}>Sin diferencia de cambio</div>
                                  <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>TC aplicación igual al TC histórico</div>
                                </>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {selectedCredit.currency !== selectedDebt.currency && exchangeRate > 0 && (
                    <div className={styles.finalSummaryBox}>
                      {(() => {
                        const tc_historico = parseFloat(selectedDebt.exchange_rate) || 1.0;
                        const tc = parseFloat(exchangeRate);
                        const isSimulation = !amountToApply;
                        const creditAvailable = getActualBalance(selectedCredit, true);
                        const debtPending = getActualBalance(selectedDebt, false);
                        const maxUsd = creditAvailable / tc;
                        const calcAmount = isSimulation ? Math.min(maxUsd, debtPending) : parseFloat(amountToApply);
                        const diff = (tc - tc_historico) * calcAmount;

                        return (
                          <>
                            <div className={styles.metricsTitle}>Resumen final</div>
                            <div className={styles.metricRow}>
                              <span>Factura quedará pendiente</span>
                              <span>U$S {formatNumberAR(Math.max(0, debtPending - calcAmount))}</span>
                            </div>
                            <div className={styles.metricRow}>
                              <span>Crédito quedará disponible</span>
                              <span>$ {formatNumberAR(Math.max(0, creditAvailable - (calcAmount * tc)))}</span>
                            </div>
                            {diff > 0.01 ? (
                              <>
                                <div className={styles.metricRow}>
                                  <span>ND-FX</span>
                                  <span>Se genera</span>
                                </div>
                                <div className={styles.metricRow}>
                                  <span>IVA de ND-FX</span>
                                  <span>Pendiente</span>
                                </div>
                              </>
                            ) : diff < -0.01 ? (
                              <>
                                <div className={styles.metricRow}>
                                  <span>NC-FX</span>
                                  <span>Se genera</span>
                                </div>
                                <div className={styles.metricRow}>
                                  <span>IVA de NC-FX</span>
                                  <span>Pendiente</span>
                                </div>
                              </>
                            ) : (
                              <div className={styles.metricRow}>
                                <span>Documento FX</span>
                                <span>No genera</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {(() => {
                    const isCrossCurrency = selectedCredit.currency === 'ARS' && selectedDebt.currency === 'USD';
                    const tc = parseFloat(exchangeRate) || 1;
                    const calcAmount = parseFloat(amountToApply) || 0;
                    const creditAvailable = getActualBalance(selectedCredit, true);
                    const arsNecesarios = calcAmount * tc;
                    const hasInsufficientCredit = !!amountToApply && isCrossCurrency && arsNecesarios > (creditAvailable + 0.02);
                    
                    return (
                      <div className={styles.panelActions}>
                        <div className={styles.quickActions}>
                          <button className={styles.secondaryButton} onClick={handleApplyMax}>Aplicar máximo</button>
                          <button className={styles.secondaryButton} onClick={handleApplyFull}>Cancelar deuda</button>
                        </div>
                        <button className={styles.primaryButton} onClick={handleAddApplication} disabled={hasInsufficientCredit}>
                          Agregar a confirmación
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ) : (
            <div className={styles.emptyPanelState}>Seleccioná un crédito o deuda para comenzar</div>
          )}
          {pendingApplications.length > 0 && (
            <section className={styles.pendingApplicationsCard}>
              <div className={styles.pendingApplicationsHeader}>
                <h2 className={styles.pendingApplicationsTitle}>Aplicación a confirmar</h2>
                <button className={styles.confirmButton} onClick={handleConfirm} disabled={isSubmitting}>
                  {isSubmitting ? 'Confirmando...' : 'Confirmar aplicación'}
                </button>
              </div>
              <div>
                {pendingApplications.map(app => (
                  <div className={styles.pendingApplicationItem} key={app.id}>
                    <div>
                      <div className={styles.pendingApplicationMovement}>
                        {documentTypes[app.credit_type] || app.credit_type} {app.credit_number} → {documentTypes[app.debit_type] || app.debit_type} {app.debit_number}
                      </div>
                      <div className={styles.pendingApplicationDetails}>
                        <div><strong>Cancela:</strong> {formatCurrencySymbol(app.debit_currency || app.currency)} {formatNumberAR(app.amount)}</div>
                        <div><strong>Consume:</strong> {formatCurrencySymbol(app.credit_currency || 'ARS')} {formatNumberAR(app.amount_applied_ars)}</div>
                        
                        {app.fx_estimated > 0 && (() => {
                          const extractPV = (num) => {
                            if (!num) return '0001';
                            const parts = num.split('-');
                            const pvPart = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
                            const match = pvPart.match(/\d+/);
                            return match ? match[0].padStart(4, '0') : '0001';
                          };
                          const pv = extractPV(app.debit_number);
                          return (
                            <>
                              <div style={{ gridColumn: '1 / -1', marginTop: '6px' }}>
                                <span className={styles.fxPreviewBadge}>Generará: ND-FX {pv}-próximo</span>
                              </div>
                              <div><strong>Base:</strong> ${formatNumberAR(Math.abs(app.fx_estimated))}</div>
                              <div><strong>IVA pendiente:</strong> ${formatNumberAR(Math.abs(app.fx_estimated) * 0.21)}</div>
                            </>
                          );
                        })()}
                        {app.fx_estimated < 0 && (() => {
                          const extractPV = (num) => {
                            if (!num) return '0001';
                            const parts = num.split('-');
                            const pvPart = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
                            const match = pvPart.match(/\d+/);
                            return match ? match[0].padStart(4, '0') : '0001';
                          };
                          const pv = extractPV(app.debit_number);
                          return (
                            <>
                              <div style={{ gridColumn: '1 / -1', marginTop: '6px' }}>
                                <span className={styles.fxPreviewBadge} style={{ background: '#dcfce7', color: '#15803d' }}>Generará: NC-FX {pv}-próximo</span>
                              </div>
                              <div><strong>Base:</strong> ${formatNumberAR(Math.abs(app.fx_estimated))}</div>
                              <div><strong>IVA pendiente:</strong> ${formatNumberAR(Math.abs(app.fx_estimated) * 0.21)}</div>
                            </>
                          );
                        })()}
                        {app.is_cross_currency && Math.abs(app.fx_estimated) <= 0.01 && (
                          <div style={{ gridColumn: '1 / -1', marginTop: '6px', color: '#64748b' }}>
                            <strong>FX:</strong> No genera
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <button className={styles.removeButton} onClick={() => {
                        setPendingApplications(pendingApplications.filter(a => a.id !== app.id));
                      }}>Quitar</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </section>

      {history.length > 0 && (
        <div className={styles.historyCard}>
          <div className={styles.tableHeader} style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
            <h2 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>Historial de aplicaciones realizadas</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              Aplicaciones manuales, compensaciones automáticas y reversas FX del cliente seleccionado.
            </p>
          </div>
          <div className={styles.historyScroll}>
            <table className={styles.historyTable}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Movimiento</th>
                  <th>Aplicado</th>
                  <th>Diferencia / FX</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {history.map(app => {
                  const isCrossCurrency = app.amount_applied_ars && app.currency === 'USD';
                  const isSystem = !app.can_void;
                  
                  return (
                    <tr key={app.application_id}>
                      <td style={{ color: '#475569' }}>{app.date?.split('T')[0]}</td>
                      <td>
                        <div className={styles.historyMovement}>
                          <div className={styles.historyDocLine} style={{ color: '#059669' }}>
                            {documentTypes[app.credit_type] || app.credit_type} {app.credit_number}
                          </div>
                          <div className={styles.historyArrowLine}>
                            → {documentTypes[app.debit_type] || app.debit_type} {app.debit_number}
                          </div>
                          {isSystem && (
                            <div style={{ marginTop: '2px' }}>
                              <span className={styles.systemBadge}>Sistema</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>
                          {formatCurrencySymbol(app.currency)} {formatNumberAR(app.amount)}
                        </div>
                        {isCrossCurrency && (
                          <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '2px' }}>
                            $ {formatNumberAR(app.amount_applied_ars)}
                          </div>
                        )}
                      </td>
                      <td>
                        {isSystem ? (
                          <div style={{ fontSize: '12.5px', color: '#475569' }}>
                            <div style={{ fontWeight: 600 }}>Compensación FX</div>
                            <div>ND-FX ↔ NC-FX</div>
                          </div>
                        ) : isCrossCurrency ? (
                          <div style={{ fontSize: '12.5px' }}>
                            {app.fx_note_number ? (
                              <>
                                <div style={{ fontWeight: 600, color: '#0f172a' }}>
                                  FX: {app.fx_note_type === 'DEBIT_NOTE' ? 'ND-FX' : 'NC-FX'} {app.fx_note_number}
                                </div>
                                <div style={{ color: '#475569' }}>
                                  Base aplicada: $ {formatNumberAR(app.fx_amount / 1.21)}
                                </div>
                                <div style={{ color: '#475569' }}>
                                  IVA pendiente: $ {formatNumberAR((app.fx_amount / 1.21) * 0.21)}
                                </div>
                              </>
                            ) : (
                              <>
                                <div style={{ fontWeight: 600, color: '#0f172a' }}>ND/NC-FX generada</div>
                                <div style={{ color: '#475569' }}>TC aplicación: {formatNumberAR(app.exchange_rate)}</div>
                              </>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '12.5px' }}>Sin FX</span>
                        )}
                      </td>
                      <td>
                        {app.can_void ? (
                          <span className={styles.badge} style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 8px', fontSize: '11.5px', fontWeight: 600 }}>Manual</span>
                        ) : (
                          <span className={styles.badge} style={{ background: '#f3f4f6', color: '#475569', padding: '4px 8px', fontSize: '11.5px', fontWeight: 600 }}>Sistema</span>
                        )}
                      </td>
                      <td>
                        {app.can_void ? (
                          <button 
                            className={styles.dangerGhostButton}
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                            onClick={() => handleVoidApplication(app.application_id)}
                          >
                            Revertir
                          </button>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '12.5px' }}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )}

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
      
      <Modal 
        open={showConfirmModal} 
        onClose={() => setShowConfirmModal(false)} 
        style={{ maxWidth: '620px' }}
        title={
          <div className={styles.modalHeaderContent}>
            <span>Confirmar aplicación entre monedas</span>
            {(() => {
              const app = pendingApplications.find(a => a.is_cross_currency);
              if (!app) return null;
              if (app.fx_estimated > 0.01) {
                return <span className={styles.fxTypeBadge}>Generará ND-FX</span>;
              } else if (app.fx_estimated < -0.01) {
                return <span className={styles.fxTypeBadge} style={{ background: '#dcfce7', color: '#15803d' }}>Generará NC-FX</span>;
              } else {
                return <span className={styles.fxTypeBadge} style={{ background: '#f1f5f9', color: '#475569' }}>Sin diferencia</span>;
              }
            })()}
          </div>
        }
      >
        <div className={styles.confirmModalBody}>
          {(() => {
            const app = pendingApplications.find(a => a.is_cross_currency);
            if (!app) return null;
            
            const baseDiff = Math.abs(app.fx_estimated);
            const ivaDiff = baseDiff * 0.21;
            const totalDiff = baseDiff + ivaDiff;
            const isNd = app.fx_estimated > 0;
            
            return (
              <div>
                <div className={styles.modalMovement}>
                  {documentTypes[app.credit_type] || app.credit_type} {app.credit_number}  →  {documentTypes[app.debit_type] || app.debit_type} {app.debit_number}
                </div>
                
                <div className={styles.confirmSection}>
                  <div className={styles.confirmSectionTitle}>Tipo de cambio</div>
                  <div className={styles.confirmRow}>
                    <span>TC factura</span>
                    <strong>{formatNumberAR(app.tc_historico)}</strong>
                  </div>
                  <div className={styles.confirmRow}>
                    <span>TC crédito</span>
                    <strong>{formatNumberAR(app.tc_credito)}</strong>
                  </div>
                  <div className={styles.confirmRow}>
                    <span>TC aplicación</span>
                    <strong>{formatNumberAR(app.exchange_rate)}</strong>
                  </div>
                </div>

                <div className={styles.confirmSection}>
                  <div className={styles.confirmSectionTitle}>Aplicación</div>
                  <div className={styles.confirmRow}>
                    <span>Cancelará factura</span>
                    <strong>U$S {formatNumberAR(app.amount)}</strong>
                  </div>
                  <div className={styles.confirmRow}>
                    <span>Consumirá crédito</span>
                    <strong>$ {formatNumberAR(app.amount_applied_ars)}</strong>
                  </div>
                </div>

                {baseDiff > 0.01 && (
                  <div className={styles.confirmSection}>
                    <div className={styles.confirmSectionTitle}>Diferencia de cambio</div>
                    <div className={styles.confirmRow}>
                      <span>Base {isNd ? 'ND-FX' : 'NC-FX'}</span>
                      <strong>$ {formatNumberAR(baseDiff)}</strong>
                    </div>
                    <div className={styles.confirmRow}>
                      <span>IVA estimado</span>
                      <strong>$ {formatNumberAR(ivaDiff)}</strong>
                    </div>
                    <div className={`${styles.confirmRow} ${styles.totalRow}`}>
                      <span>Total {isNd ? 'ND-FX' : 'NC-FX'}</span>
                      <strong>$ {formatNumberAR(totalDiff)}</strong>
                    </div>
                  </div>
                )}

                {baseDiff > 0.01 ? (
                  <div className={styles.confirmNotice}>
                    {isNd ? (
                      "La ND-FX quedará parcialmente aplicada: base cubierta, IVA pendiente."
                    ) : (
                      "La NC-FX se generará por diferencia de cambio según el TC aplicado."
                    )}
                  </div>
                ) : (
                  app.is_cross_currency && (
                    <div className={styles.confirmNotice} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569' }}>
                      La aplicación no genera diferencia de cambio debido a que el TC de aplicación coincide con el TC histórico de la factura.
                    </div>
                  )
                )}

                <div className={styles.modalActions}>
                  <button className={styles.modalCancelButton} onClick={() => setShowConfirmModal(false)}>
                    Cancelar
                  </button>
                  <button className={styles.modalConfirmButton} onClick={() => {
                    setShowConfirmModal(false);
                    submitApplications();
                  }} disabled={isSubmitting}>
                    {isSubmitting ? 'Confirmando...' : 'Confirmar aplicación'}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </Modal>
    </div>
  );
};

export default SalesApplicationsPage;
