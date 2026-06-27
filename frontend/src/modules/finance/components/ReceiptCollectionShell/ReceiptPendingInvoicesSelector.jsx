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
  onClose,
  onProceed 
}) {
  const [loading, setLoading] = useState(true);
  const [openItems, setOpenItems] = useState([]);
  const [error, setError] = useState(null);
  const [selectedItems, setSelectedItems] = useState({}); 

  useEffect(() => {
    let mounted = true;
    const fetchItems = async () => {
      setLoading(true);
      try {
        const data = await api.get(`/accounting/documents/entities/${entityId}/open-items`);
        if (mounted) {
          const validDocs = data.filter(d => ['INVOICE', 'DEBIT_NOTE'].includes(d.doc_type));
          setOpenItems(validDocs);
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

  const handleSelectAll = () => {
    const newSelected = {};
    openItems.forEach(item => {
      newSelected[item.id] = {
        ...item,
        collection_fx_rate: globalFxRate,
        amount_to_pay: item.remaining
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
          collection_fx_rate: globalFxRate,
          amount_to_pay: item.remaining
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
        collection_fx_rate: globalFxRate,
        amount_to_pay: item.remaining
      };
    }
    setSelectedItems(newSelected);
  };

  const updateItem = (id, field, value) => {
    if (!selectedItems[id]) return;
    const item = { ...selectedItems[id] };
    item[field] = value;

    if (field === 'amount_to_pay') {
      if (value > item.remaining) item.amount_to_pay = item.remaining;
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
    onProceed({ id: entityId, name: entityName }, apps, globalCurrency, globalFxRate);
  };

  const hasSelection = Object.values(selectedItems).some(i => i.amount_to_pay > 0);
  const totalToPay = Object.values(selectedItems).reduce((acc, curr) => {
    let rate = 1;
    if (curr.currency === 'USD' && globalCurrency === 'ARS') {
      rate = curr.collection_fx_rate;
    } else if (curr.currency === 'ARS' && globalCurrency === 'USD') {
      rate = 1 / curr.collection_fx_rate;
    }
    return acc + (curr.amount_to_pay * rate);
  }, 0);

  return (
    <div className={s.container}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h2>Comprobantes pendientes de {entityName}</h2>
        </div>
        <button onClick={onClose} className={s.closeBtn}>
          <X size={20} />
        </button>
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
                    <th>Total</th>
                    <th>Saldo Original</th>
                    <th>Cot. Cobro</th>
                    <th>Saldo Conv.</th>
                    <th>A Pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {openItems.map(item => {
                    const isSelected = !!selectedItems[item.id];
                    const selData = selectedItems[item.id] || { collection_fx_rate: globalFxRate, amount_to_pay: item.remaining };
                    
                    let saldoConv = item.remaining;
                    if (item.currency === 'USD' && globalCurrency === 'ARS') {
                      saldoConv = item.remaining * selData.collection_fx_rate;
                    } else if (item.currency === 'ARS' && globalCurrency === 'USD') {
                      saldoConv = item.remaining / selData.collection_fx_rate;
                    }

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
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {item.currency} {formatNumberAR(item.total_amount)}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                          {item.currency} {formatNumberAR(item.remaining)}
                        </td>
                        <td>
                          <input 
                            type="number"
                            className={s.cellInput}
                            value={selData.collection_fx_rate}
                            onChange={e => updateItem(item.id, 'collection_fx_rate', Number(e.target.value) || 1)}
                            disabled={!isSelected}
                            style={{ width: 80 }}
                          />
                        </td>
                        <td style={{ whiteSpace: 'nowrap', color: '#64748b' }}>
                          {globalCurrency} {formatNumberAR(saldoConv)}
                        </td>
                        <td>
                          <input 
                            type="number"
                            className={s.cellInput}
                            value={selData.amount_to_pay}
                            onChange={e => updateItem(item.id, 'amount_to_pay', Number(e.target.value) || 0)}
                            disabled={!isSelected}
                            max={item.remaining}
                            min={0}
                            style={{ width: 100, fontWeight: 600 }}
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
          <strong>{globalCurrency} {formatNumberAR(totalToPay)}</strong>
        </div>
        <button type="button" className={s.primaryBtn} disabled={!hasSelection} onClick={handleProceed}>
          Transferir al recibo <ArrowRight size={16} style={{ marginLeft: 6 }} />
        </button>
      </div>
    </div>
  );
}
