import React, { useState, useEffect } from 'react';
import { Loader2, ArrowRight, CheckSquare, Square, RefreshCcw, X } from 'lucide-react';
import api from '../../../../services/api';
import { formatNumberAR, formatDocumentType } from '../../../../utils/formatters';
import s from './ReceiptPendingInvoicesSelector.module.css';

export default function ReceiptPendingInvoicesSelector({ 
  entityId, 
  entityName, 
  globalCurrency = 'ARS', 
  globalFxRate = 1,
  initialSelected = [],
  onClose,
  onProceed 
}) {
  const [loading, setLoading] = useState(true);
  const [openItems, setOpenItems] = useState([]);
  const [error, setError] = useState(null);
  const [selectedItems, setSelectedItems] = useState({}); 
  
  const [modalCurrency, setModalCurrency] = useState(globalCurrency);
  const [modalFxRate, setModalFxRate] = useState(globalFxRate);

  useEffect(() => {
    let mounted = true;
    const fetchItems = async () => {
      setLoading(true);
      try {
        const data = await api.get(`/accounting/documents/entities/${entityId}/open-items`);
        if (mounted) {
          const validDocs = data.filter(d => ['INVOICE', 'DEBIT_NOTE'].includes(d.doc_type));
          setOpenItems(validDocs);
          
          if (initialSelected && initialSelected.length > 0) {
            const newSelected = {};
            initialSelected.forEach(sel => {
              const matchedDoc = validDocs.find(d => d.id === sel.to_document_id);
              if (matchedDoc) {
                newSelected[matchedDoc.id] = {
                  ...matchedDoc,
                  collection_fx_rate: sel.collection_exchange_rate || globalFxRate,
                  amount_to_pay: sel.amount_applied || matchedDoc.remaining
                };
              }
            });
            setSelectedItems(newSelected);
          }
        }
      } catch (e) {
        console.error("Error fetching open items", e);
        if (mounted) setError("No se pudieron cargar los comprobantes pendientes.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    if (entityId) {
      fetchItems();
    }
    return () => { mounted = false; };
  }, [entityId]);

  const getInitialAmountToPay = (item, fx) => {
    let amt = item.remaining;
    if (item.currency === 'USD' && modalCurrency === 'ARS') amt = item.remaining * fx;
    if (item.currency === 'ARS' && modalCurrency === 'USD') amt = item.remaining / fx;
    return amt;
  };

  const handleSelectAll = () => {
    const newSelected = {};
    openItems.forEach(item => {
      newSelected[item.id] = {
        ...item,
        collection_fx_rate: modalFxRate,
        amount_to_pay: getInitialAmountToPay(item, modalFxRate)
      };
    });
    setSelectedItems(newSelected);
  };

  const handleSelectNone = () => {
    setSelectedItems({});
  };

  const handleSelectInvert = () => {
    const newSelected = {};
    openItems.forEach(item => {
      if (!selectedItems[item.id]) {
        newSelected[item.id] = {
          ...item,
          collection_fx_rate: modalFxRate,
          amount_to_pay: getInitialAmountToPay(item, modalFxRate)
        };
      }
    });
    setSelectedItems(newSelected);
  };

  const toggleItem = (item) => {
    const newSelected = { ...selectedItems };
    if (newSelected[item.id]) {
      delete newSelected[item.id];
    } else {
      newSelected[item.id] = {
        ...item,
        collection_fx_rate: modalFxRate,
        amount_to_pay: getInitialAmountToPay(item, modalFxRate)
      };
    }
    setSelectedItems(newSelected);
  };

  const updateItem = (id, field, value) => {
    if (!selectedItems[id]) return;
    const item = { ...selectedItems[id] };
    item[field] = value;

    if (field === 'amount_to_pay') {
      const originalItem = openItems.find(i => i.id === id);
      let maxAllowed = originalItem?.remaining || 0;
      if (originalItem) {
        if (originalItem.currency === 'USD' && modalCurrency === 'ARS') {
           maxAllowed = originalItem.remaining * (item.collection_fx_rate || modalFxRate || 1);
        } else if (originalItem.currency === 'ARS' && modalCurrency === 'USD') {
           maxAllowed = originalItem.remaining / (item.collection_fx_rate || modalFxRate || 1);
        }
      }
      if (value > maxAllowed) item.amount_to_pay = maxAllowed;
      if (value < 0) item.amount_to_pay = 0;
    }

    setSelectedItems({ ...selectedItems, [id]: item });
  };

  const handleProceed = () => {
    const apps = Object.values(selectedItems).filter(i => i.amount_to_pay > 0).map(item => ({
      to_document_id: item.id,
      document_type: item.doc_type,
      number: item.number,
      date: item.date,
      currency: item.currency,
      original_exchange_rate: item.exchange_rate,
      collection_exchange_rate: item.collection_fx_rate,
      pending_amount: item.remaining,
      amount_applied: item.amount_to_pay
    }));
    
    if (apps.length === 0) return;
    
    // We pass the entity we already have, plus the apps
    // Assuming the parent handles the apps directly
    onProceed({ id: entityId, name: entityName }, apps, modalCurrency, modalFxRate);
  };

  const hasSelection = Object.values(selectedItems).some(i => i.amount_to_pay > 0);
  const totalToPay = Object.values(selectedItems).reduce((acc, curr) => {
    let rate = 1;
    if (curr.currency === 'USD' && modalCurrency === 'ARS') {
      rate = curr.collection_fx_rate || modalFxRate;
    } else if (curr.currency === 'ARS' && modalCurrency === 'USD') {
      rate = 1 / (curr.collection_fx_rate || modalFxRate || 1);
    }
    return acc + (curr.amount_to_pay * rate);
  }, 0);

  const handleCurrencyChange = (e) => {
    const newCurr = e.target.value;
    setModalCurrency(newCurr);
    
    // Recalculate amount_to_pay for existing selected items
    const newSelected = {};
    Object.keys(selectedItems).forEach(id => {
      const item = selectedItems[id];
      const originalItem = openItems.find(i => i.id === id);
      if (originalItem) {
        let amt = originalItem.remaining;
        if (originalItem.currency === 'USD' && newCurr === 'ARS') amt = originalItem.remaining * item.collection_fx_rate;
        if (originalItem.currency === 'ARS' && newCurr === 'USD') amt = originalItem.remaining / item.collection_fx_rate;
        
        // Calculate max allowed in the new currency to cap the old value
        let maxAllowed = amt; 
        
        // If the user previously edited amount_to_pay in the old currency, we might want to convert it
        // But for simplicity, we just reset it to the max allowed (remaining balance) when they switch currency.
        newSelected[id] = {
          ...item,
          amount_to_pay: maxAllowed
        };
      }
    });
    setSelectedItems(newSelected);
  };

  const handleGlobalFxChange = (e) => {
    const newFx = Number(e.target.value);
    setModalFxRate(newFx);

    const newSelected = {};
    Object.keys(selectedItems).forEach(id => {
      const item = selectedItems[id];
      const originalItem = openItems.find(i => i.id === id);
      if (originalItem) {
        let amt = originalItem.remaining;
        if (originalItem.currency === 'USD' && modalCurrency === 'ARS') amt = originalItem.remaining * newFx;
        if (originalItem.currency === 'ARS' && modalCurrency === 'USD') amt = originalItem.remaining / newFx;
        
        newSelected[id] = {
          ...item,
          collection_fx_rate: newFx,
          amount_to_pay: amt
        };
      }
    });
    setSelectedItems(newSelected);
  };

  return (
    <div className={s.container}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h2>Comprobantes pendientes de {entityName}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 500, color: '#475569' }}>Cobrar en:</span>
              <select value={modalCurrency} onChange={handleCurrencyChange} style={{ height: '32px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0 8px', outline: 'none', background: 'white' }}>
                  <option value="ARS">Pesos</option>
                  <option value="USD">Dólares</option>
              </select>
          </div>
          {modalCurrency === 'ARS' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: '#475569' }}>TC Cobro:</span>
                  <input 
                      type="number" 
                      value={modalFxRate} 
                      onChange={handleGlobalFxChange}
                      style={{ height: '32px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0 8px', outline: 'none', width: '90px' }}
                  />
              </div>
          )}
          <div style={{ width: '1px', height: '24px', background: '#cbd5e1', margin: '0 8px' }}></div>
          <button onClick={onClose} className={s.closeBtn}>
            <X size={20} />
          </button>
        </div>
      </div>

      <div className={s.listArea}>
        {loading ? (
          <div className={s.emptyState}>
            <Loader2 className={s.spinner} size={32} />
            <p>Buscando comprobantes...</p>
          </div>
        ) : error ? (
          <div className={s.emptyState}>
            <p style={{ color: 'var(--danger)' }}>{error}</p>
          </div>
        ) : openItems.length === 0 ? (
          <div className={s.emptyState}>
            <CheckSquare size={48} color="#16a34a" />
            <p>El cliente no tiene comprobantes pendientes.</p>
          </div>
        ) : (
          <div className={s.tableContainer}>
            <div className={s.tableActions}>
              <button type="button" onClick={handleSelectAll}>Todos</button>
              <button type="button" onClick={handleSelectNone}>Ninguno</button>
              <button type="button" onClick={handleSelectInvert}>Invertir</button>
            </div>
            
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className={s.table}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    <th style={{ width: 40 }}></th>
                    <th>Comprobante</th>
                    <th>Fecha</th>
                    <th>Total Orig.</th>
                    <th>Pendiente</th>
                    <th>TC Factura</th>
                    {modalCurrency === 'ARS' && <th>Pend. Histórico</th>}
                    {modalCurrency === 'ARS' && <th>TC Cobro</th>}
                    {modalCurrency === 'ARS' && <th>Pend. Convertido</th>}
                    <th>A Pagar ({modalCurrency === 'ARS' ? '$' : 'u$s'})</th>
                  </tr>
                </thead>
                <tbody>
                  {openItems.map(item => {
                    const isSelected = !!selectedItems[item.id];
                    
                    const tcFact = item.exchange_rate || item.fx_rate || 1;
                    
                    let saldoHist = item.remaining;
                    if (item.currency === 'USD') saldoHist = item.remaining * tcFact;
                    
                    let saldoConv = item.remaining;
                    if (item.currency === 'USD' && modalCurrency === 'ARS') {
                      saldoConv = item.remaining * (selectedItems[item.id]?.collection_fx_rate || modalFxRate || 1);
                    } else if (item.currency === 'ARS' && modalCurrency === 'USD') {
                      saldoConv = item.remaining / (selectedItems[item.id]?.collection_fx_rate || modalFxRate || 1);
                    }

                    const selData = selectedItems[item.id] || { 
                      collection_fx_rate: modalFxRate, 
                      amount_to_pay: saldoConv 
                    };

                    return (
                      <tr key={item.id} className={isSelected ? s.rowSelected : ''}>
                        <td onClick={() => toggleItem(item)} style={{ cursor: 'pointer', textAlign: 'center' }}>
                          {isSelected ? <CheckSquare size={18} color="#2563eb" /> : <Square size={18} color="#94a3b8" />}
                        </td>
                        <td>
                          <div style={{ fontWeight: 500, color: 'var(--text)' }}>{formatDocumentType(item.doc_type)} {item.number}</div>
                        </td>
                        <td>
                          {item.date ? new Date(item.date).toLocaleDateString('es-AR') : '-'}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', color: '#64748b' }}>
                          {item.currency === 'USD' ? `u$s ${formatNumberAR(item.total_amount)}` : `$ ${formatNumberAR(item.total_amount)}`}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                          {item.currency === 'USD' ? `u$s ${formatNumberAR(item.remaining)}` : `$ ${formatNumberAR(item.remaining)}`}
                        </td>
                        <td style={{ color: '#64748b' }}>
                          {item.currency === 'USD' ? formatNumberAR(tcFact) : '-'}
                        </td>
                        
                        {modalCurrency === 'ARS' && (
                          <>
                            <td style={{ whiteSpace: 'nowrap', color: '#64748b' }}>
                              {item.currency === 'USD' ? `$ ${formatNumberAR(saldoHist)}` : '-'}
                            </td>
                            <td>
                              <input 
                                type="number"
                                className={s.cellInput}
                                value={selData.collection_fx_rate}
                                onChange={e => updateItem(item.id, 'collection_fx_rate', Number(e.target.value) || 1)}
                                disabled={!isSelected || (item.currency === modalCurrency)}
                                style={{ width: 80, opacity: (item.currency === modalCurrency) ? 0.4 : 1 }}
                              />
                            </td>
                            <td style={{ whiteSpace: 'nowrap', fontWeight: 500, color: '#0f172a' }}>
                              $ {formatNumberAR(saldoConv)}
                            </td>
                          </>
                        )}
                        <td>
                          <input 
                            type="number"
                            className={s.cellInput}
                            value={selData.amount_to_pay}
                            onChange={e => updateItem(item.id, 'amount_to_pay', Number(e.target.value) || 0)}
                            disabled={!isSelected}
                            max={saldoConv}
                            min={0}
                            style={{ width: 100, fontWeight: 600, borderColor: isSelected ? '#3b82f6' : '#cbd5e1' }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className={s.footer}>
        <div className={s.footerSummary}>
          <span>Total Seleccionado:</span>
          <strong>{modalCurrency === 'ARS' ? '$' : 'u$s'} {formatNumberAR(totalToPay)}</strong>
        </div>
        <button type="button" className={s.primaryBtn} disabled={!hasSelection} onClick={handleProceed}>
          Transferir al recibo <ArrowRight size={16} style={{ marginLeft: 6 }} />
        </button>
      </div>
    </div>
  );
}
