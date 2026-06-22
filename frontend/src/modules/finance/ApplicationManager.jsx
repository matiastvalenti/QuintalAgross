import { useState, useEffect } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Autocomplete from '../../components/ui/Autocomplete';
import { useToast } from '../../context/ToastContext';
import { API_URL } from '../../config';
import { 
  FileCheck, 
  Link2, 
  Users, 
  ShoppingCart, 
  DollarSign,
  ArrowRightLeft,
  Info,
  CheckCircle,
  Plus,
  X,
  Search,
  Trash2,
  History,
  ExternalLink,
  ArrowDownCircle,
  ArrowUpCircle
} from 'lucide-react';
import { useWindow } from '../../context/WindowContext';
import { 
  openEditFactura, 
  openEditRecibo, 
  openEditPago, 
  openEditRemito, 
  openEditOrdenVenta 
} from '../../utils/openStandaloneWindow';
import t from '../../components/ui/Table.module.css';
import s from './ApplicationManager.module.css';

export default function ApplicationManager() {
  const [activeSegment, setActiveSegment] = useState('commercial'); // 'commercial' or 'commissions'
  const [commercialSubTab, setCommercialSubTab] = useState('financial'); // 'financial' (FA/RE) or 'linked' (OV/RM)
  
  const { showToast } = useToast();

  return (
    <div className={s.pageLayout}>
      <ContentHeader 
        title="Gestión de Aplicaciones"
        subtitle="Administra el flujo de fondos y vinculación de comprobantes de deuda y crédito"
      />
      
      <div className={s.container}>
        <div className={s.sidebar}>
          <div className={s.menuItem + (activeSegment === 'commercial' ? ` ${s.active}` : '')}
               onClick={() => setActiveSegment('commercial')}>
            <ArrowRightLeft size={20} />
            <span>Comprobantes (Compra/Venta)</span>
          </div>
          <div className={s.menuItem + (activeSegment === 'commissions' ? ` ${s.active}` : '')}
               onClick={() => setActiveSegment('commissions')}>
            <Users size={20} />
            <span>Comisionistas</span>
          </div>
        </div>

        <div className={s.content}>
          {activeSegment === 'commercial' ? (
            <CommercialApplication 
              subTab={commercialSubTab} 
              setSubTab={setCommercialSubTab} 
            />
          ) : (
            <CommissionApplication />
          )}
        </div>
      </div>
    </div>
  );
}

function CommercialApplication({ subTab, setSubTab }) {
  const [entity, setEntity] = useState(null);
  
  return (
    <div className={s.segmentContainer}>
      <div className={s.segmentHeader}>
        <div className={s.tabs}>
          <button className={subTab === 'financial' ? s.tabActive : ''} onClick={() => setSubTab('financial')}>
            Aplicación Financiera (Facturas / Cobros)
          </button>
          <button className={subTab === 'linked' ? s.tabActive : ''} onClick={() => setSubTab('linked')}>
            Vínculo de Origen (OV / Remito / Factura)
          </button>
        </div>
        
        <div className={s.entityFilter}>
          <Autocomplete
            placeholder="Buscar Cliente o Proveedor..."
            onSearch={async (q) => {
              try {
                const res = await fetch(`${API_URL}/entities/?q=${encodeURIComponent(q)}&limit=10`);
                if (res.ok) return await res.json();
                console.error("Error search entities", await res.text());
              } catch (e) {
                console.error("Fetch error", e);
              }
              return [];
            }}
            onSelect={setEntity}
            initialValue={entity}
            minChars={0}
          />
        </div>
      </div>

      <div className={s.segmentBody}>
        {!entity ? (
          <div className={s.emptyState}>
            <Info size={48} color="#94a3b8" />
            <p>Seleccione una entidad para comenzar la aplicación</p>
          </div>
        ) : subTab === 'financial' ? (
          <FinancialApplicationTool entity={entity} />
        ) : (
          <OriginLinkTool entity={entity} />
        )}
      </div>
    </div>
  );
}

function FinancialApplicationTool({ entity }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState(null);
  const [selectedDebit, setSelectedDebit] = useState(null);
  const [applyAmount, setApplyAmount] = useState("");
  const [breakdownItem, setBreakdownItem] = useState(null);
  const [forcedRate, setForcedRate] = useState(null);
  const [fxPreview, setFxPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const { openWindow } = useWindow();
  const { showToast } = useToast();

  const handleOpenDoc = (id, number, type) => {
    if (!id) return;
    if (type === 'RECEIPT') {
      openEditRecibo(id, { mode: 'edit', title: `Recibo ${number}` });
    } else if (type === 'PAYMENT') {
      openEditPago(id, { mode: 'edit', title: `Pago ${number}` });
    } else if (type === 'DELIVERY_NOTE') {
      openEditRemito(id, { mode: 'edit', title: `Remito ${number}` });
    } else if (type === 'SALES_ORDER') {
      openEditOrdenVenta(id, { mode: 'edit', title: `Orden Venta ${number}` });
    } else if (type === 'LPG_PRIMARY' || type === 'LPG_SECONDARY') {
      openWindow('grain-settlement', { id, mode: 'edit' }, { title: `${type || 'DOC'} ${number}` });
    } else {
      openEditFactura(id, { mode: 'edit', title: `Factura ${number}` });
    }
  };

  useEffect(() => {
    fetchItems();
    fetchHistory();
    setSelectedCredit(null);
    setSelectedDebit(null);
    setApplyAmount("");
    setForcedRate(null);
  }, [entity]);

  const fetchItems = async () => {
    if (!entity) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/accounting/documents/entities/${entity.id}/open-items`);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (e) {
      showToast("Error al cargar comprobantes pendientes", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    if (!entity) return;
    try {
      const res = await fetch(`${API_URL}/accounting/documents/entities/${entity.id}/applications`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (e) {
      console.error("Error fetching history", e);
    }
  };

  const credits = items.filter(i => ['CREDIT_NOTE', 'PAYMENT', 'RECEIPT', 'PURCHASE_CREDIT_NOTE', 'LPG_PRIMARY'].includes(i.doc_type));
  const debits = items.filter(i => ['INVOICE', 'DEBIT_NOTE', 'PURCHASE_INVOICE', 'LPG_SECONDARY'].includes(i.doc_type));

  const handleApply = async () => {
    if (!selectedCredit || !selectedDebit || !applyAmount) {
      showToast("Seleccione crédito, débito y monto", "warning");
      return;
    }

    try {
      const payload = {
        from_document_id: selectedCredit.id,
        to_document_id: selectedDebit.id,
        amount_applied: parseFloat(applyAmount)
      };

      if (forcedRate) {
        payload.exchange_rate = forcedRate;
      }

      const res = await fetch(`${API_URL}/accounting/documents/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        const app_id = data.id;
        
        // Cargar vista previa de Diferencia de Cambio
        try {
          const fxRes = await fetch(`${API_URL}/accounting/documents/applications/${app_id}/fx-adjustment/preview`);
          if (fxRes.ok) {
            const fxData = await fxRes.json();
            if (fxData.needs_adjustment) {
              setFxPreview({ ...fxData, app_id });
            } else {
              showToast("Aplicación realizada con éxito", "success");
            }
          }
        } catch (e) {
          showToast("Aplicación realizada con éxito", "success");
        }

        setSelectedCredit(null);
        setSelectedDebit(null);
        setApplyAmount("");
        setForcedRate(null);
        fetchItems();
        fetchHistory();
      } else {
        const err = await res.json();
        showToast(err.detail || "Error al aplicar", "error");
      }
    } catch (e) {
      showToast("Error de conexión", "error");
    }
  };

  const handleDeleteApplication = async (appId) => {
    if (!window.confirm("¿Está seguro de eliminar esta aplicación? Se recalcularán los saldos de ambos comprobantes.")) return;
    
    try {
      const res = await fetch(`${API_URL}/accounting/documents/applications/${appId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast("Aplicación eliminada", "success");
        fetchItems();
        fetchHistory();
      } else {
        const err = await res.json();
        showToast(err.detail || "Error al eliminar", "error");
      }
    } catch (e) {
      showToast("Error de conexión", "error");
    }
  };

  const fmt = (v, c) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: c }).format(v);

  const totalCreditsUsd = credits.reduce((acc, c) => acc + (c.currency === 'USD' ? c.remaining : c.remaining / (c.exchange_rate || 1)), 0);
  const totalDebitsUsd = debits.reduce((acc, d) => acc + (d.currency === 'USD' ? d.remaining : d.remaining / (d.exchange_rate || 1)), 0);

  return (
    <div className={s.toolContainer}>
      <div className={s.summaryCards}>
        <div className={s.statCard}>
          <div className={`${s.statIcon}`} style={{ background: '#ecfdf5', color: '#10b981' }}>
            <ArrowDownCircle size={20} />
          </div>
          <div className={s.statInfo}>
            <span className={s.statLabel}>Créditos Disponibles</span>
            <span className={s.statValue}>{fmt(totalCreditsUsd, 'USD')}</span>
          </div>
        </div>
        <div className={s.statCard}>
          <div className={`${s.statIcon}`} style={{ background: '#fef2f2', color: '#ef4444' }}>
            <ArrowUpCircle size={20} />
          </div>
          <div className={s.statInfo}>
            <span className={s.statLabel}>Deudas Pendientes</span>
            <span className={s.statValue}>{fmt(totalDebitsUsd, 'USD')}</span>
          </div>
        </div>
        <div className={s.statCard}>
          <div className={`${s.statIcon}`} style={{ background: '#eff6ff', color: '#3b82f6' }}>
            <DollarSign size={20} />
          </div>
          <div className={s.statInfo}>
            <span className={s.statLabel}>Saldo Neto (USD)</span>
            <span className={s.statValue}>{fmt(totalCreditsUsd - totalDebitsUsd, 'USD')}</span>
          </div>
        </div>
      </div>

      <div className={s.toolSplit}>
        <div className={s.pane}>
          <h4>
            Créditos Disponibles
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>(Recibos, Pagos, NC, LPG Primarias)</span>
          </h4>
          <div className={s.paneContent}>
            {loading ? <p>Cargando...</p> : credits.length === 0 ? <p className={s.emptyMsg}>No hay créditos pendientes</p> : (
              <table className={t.table}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}></th>
                    <th>Fecha</th>
                    <th>Comprobante</th>
                    <th className={t.num}>TC</th>
                    <th className={t.num}>Pendiente</th>
                  </tr>
                </thead>
                <tbody>
                  {credits.map(c => (
                    <tr key={c.id} 
                        className={selectedCredit?.id === c.id ? s.rowSelected : ''}
                        onClick={() => {
                          setSelectedCredit(c);
                          setForcedRate(null);
                          if (selectedDebit) {
                            setApplyAmount(Math.min(c.remaining, selectedDebit.currency === 'USD' ? c.remaining / (c.exchange_rate || 1) : c.remaining).toFixed(2));
                          } else {
                            setApplyAmount(c.remaining.toFixed(2));
                          }
                        }}>
                      <td>
                        {c.payment_items?.length > 0 && (
                          <div className={s.lupitaBtn} title="Desglose de valores" onClick={(e) => {
                            e.stopPropagation();
                            setBreakdownItem(c);
                          }}>
                            <Search size={14} />
                          </div>
                        )}
                      </td>
                      <td>{new Date(c.date).toLocaleDateString()}</td>
                      <td>
                        <span className={s.docLink} onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDoc(c.id, c.number, c.doc_type);
                        }}>
                          {c.number}
                        </span>
                        {forcedRate && selectedCredit?.id === c.id && (
                          <div className={s.forcedBadge}>TC Ajustado</div>
                        )}
                      </td>
                      <td className={t.num} style={{ color: '#64748b' }}>
                        {c.exchange_rate?.toFixed(2) || '1.00'}
                      </td>
                      <td className={t.num} style={{ fontWeight: 600, color: 'var(--success)' }}>
                        {fmt(c.remaining, c.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className={s.pane}>
          <h4>
            Débitos Pendientes
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>(Facturas, ND, LPG Secundarias)</span>
          </h4>
          <div className={s.paneContent}>
            {loading ? <p>Cargando...</p> : debits.length === 0 ? <p className={s.emptyMsg}>No hay deudas pendientes</p> : (
              <table className={t.table}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Comprobante</th>
                    <th className={t.num}>TC</th>
                    <th className={t.num}>Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {debits.map(d => (
                    <tr key={d.id}
                        className={selectedDebit?.id === d.id ? s.rowSelected : ''}
                        onClick={() => {
                          setSelectedDebit(d);
                          setForcedRate(null);
                          // Logic for multi-currency auto-fill
                          if (selectedCredit) {
                            const creditRem = selectedCredit.remaining;
                            if (d.currency === 'USD' && selectedCredit.currency === 'ARS') {
                              const equiv = creditRem / (selectedCredit.exchange_rate || 1);
                              setApplyAmount(Math.min(equiv, d.remaining).toFixed(2));
                            } else {
                              setApplyAmount(Math.min(creditRem, d.remaining).toFixed(2));
                            }
                          } else {
                            setApplyAmount(d.remaining.toFixed(2));
                          }
                        }}>
                      <td>{new Date(d.date).toLocaleDateString()}</td>
                      <td>
                        <span className={s.docLink} onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDoc(d.id, d.number, d.doc_type);
                        }}>
                          {d.number}
                        </span>
                      </td>
                      <td className={t.num} style={{ color: '#64748b' }}>
                        {d.exchange_rate?.toFixed(2) || '1.00'}
                      </td>
                      <td className={t.num} style={{ fontWeight: 600, color: 'var(--danger)' }}>
                        {fmt(d.remaining, d.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className={s.applicationBar}>
        <div className={s.appInfo}>
          {selectedCredit && selectedDebit ? (
            <p>
              Aplicando <strong>{selectedCredit.number}</strong> ({selectedCredit.currency}) 
              a <strong>{selectedDebit.number}</strong> ({selectedDebit.currency})
              {forcedRate && <span> con TC Ajustado: <strong>{forcedRate}</strong></span>}
            </p>
          ) : (
            <p className={s.hint}>Seleccione un crédito y un débito para aplicar</p>
          )}
        </div>
        <div className={s.appActions}>
          <div style={{ width: 140 }}>
            <Input 
              type="number"
              placeholder="Monto"
              value={applyAmount}
              onChange={e => setApplyAmount(e.target.value)}
            />
          </div>
          <Button onClick={handleApply} disabled={!selectedCredit || !selectedDebit || !applyAmount}>
            <CheckCircle size={16} /> Aplicar
          </Button>
        </div>
      </div>

      <div style={{ marginTop: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <History size={18} color="#64748b" />
          <h4 style={{ margin: 0, fontSize: '15px', color: '#334155' }}>Historial de Aplicaciones Recientes</h4>
        </div>
        
        {history.length === 0 ? (
          <div className={s.pane} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
             No hay aplicaciones registradas recientemente para esta entidad
          </div>
        ) : (
          <div className={s.pane}>
            <table className={t.table}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Crédito (Origen)</th>
                  <th>Débito (Destino)</th>
                  <th className={t.num}>Monto Aplicado</th>
                  <th className={t.num}>TC Aplic.</th>
                  <th style={{ width: 80 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {history.map(app => (
                  <tr key={app.id}>
                    <td>{new Date(app.created_at).toLocaleDateString()} {new Date(app.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>
                      <div className={s.docLink} onClick={() => handleOpenDoc(app.from_document_id, app.from_doc_number, app.from_doc_type)}>
                        {app.from_doc_number}
                      </div>
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>{app.from_doc_type}</span>
                    </td>
                    <td>
                      <div className={s.docLink} onClick={() => handleOpenDoc(app.to_document_id, app.to_doc_number, app.to_doc_type)}>
                        {app.to_doc_number}
                      </div>
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>{app.to_doc_type}</span>
                    </td>
                    <td className={t.num} style={{ fontWeight: 600 }}>
                      {fmt(app.amount_applied, app.from_doc_currency || 'USD')}
                    </td>
                    <td className={t.num} style={{ color: '#64748b' }}>
                      {(app.exchange_rate || 1.0).toFixed(2)}
                    </td>
                    <td className={t.num}>
                      <button 
                        className={s.deleteBtn} 
                        onClick={() => handleDeleteApplication(app.id)}
                        title="Eliminar Aplicación"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {breakdownItem && (
        <PaymentBreakdownModal 
          doc={breakdownItem}
          onClose={() => setBreakdownItem(null)}
          onAccept={(totalApplied, avgRate) => {
            setSelectedCredit(breakdownItem);
            setApplyAmount(totalApplied.toFixed(2));
            setForcedRate(avgRate);
            setBreakdownItem(null);
          }}
          targetDoc={selectedDebit}
        />
      )}

      {fxPreview && (
        <FxAdjustmentModal 
          preview={fxPreview}
          onClose={() => setFxPreview(null)}
          onConfirm={async () => {
            try {
              const res = await fetch(`${API_URL}/accounting/documents/applications/${fxPreview.app_id}/fx-adjustment/confirm`, { method: 'POST' });
              if (res.ok) {
                const data = await res.json();
                showToast(`Ajuste ${data.generated_doc_number} generado con éxito`, "success");
                handleOpenDoc(data.generated_document_id, data.generated_doc_number, data.generated_doc_type);
                setFxPreview(null);
              }
            } catch (e) {
              showToast("Error al confirmar ajuste", "error");
            }
          }}
        />
      )}
    </div>
  );
}

function PaymentBreakdownModal({ doc, onClose, onAccept, targetDoc }) {
  const [items, setItems] = useState(doc.payment_items.map(it => ({
    ...it,
    forcedRate: doc.exchange_rate || 1.0,
    selected: true
  })));

  const totalArs = items.reduce((acc, it) => acc + (it.selected ? it.amount : 0), 0);
  
  // Calculate equivalent based on individual rates
  // If target is USD, we calculate it.usd = it.amount / it.forcedRate
  const totalConverted = items.reduce((acc, it) => {
    if (!it.selected) return acc;
    if (targetDoc?.currency === 'USD') {
      return acc + (it.amount / it.forcedRate);
    }
    return acc + it.amount;
  }, 0);

  const avgRate = totalConverted > 0 ? totalArs / totalConverted : (doc.exchange_rate || 1);

  const fmt = (v) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(v);
  const fmtUsd = (v) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' }).format(v);

  return (
    <div className={s.modalBackdrop}>
      <div className={s.modalContent}>
        <div className={s.modalHeader}>
          <h3>Desglose de Pago: {doc.number}</h3>
          <Button variant="ghost" onClick={onClose}><X size={20}/></Button>
        </div>
        <div className={s.modalBody}>
          <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
            Ajuste la cotización de cada ítem de pago para la aplicación. 
            Moneda Origen: <strong>{doc.currency}</strong> | Destino: <strong>{targetDoc?.currency || 'ARS'}</strong>
          </p>
          
          <table className={s.miniTable}>
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th>Medio</th>
                <th>Referencia</th>
                <th className={t.num}>Importe Orig.</th>
                <th className={t.num} style={{ width: 120 }}>Cotización</th>
                <th className={t.num}>Importe Aplic.</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={it.id}>
                  <td>
                    <input type="checkbox" checked={it.selected} onChange={e => {
                      const newItems = [...items];
                      newItems[idx].selected = e.target.checked;
                      setItems(newItems);
                    }} />
                  </td>
                  <td>{it.type}</td>
                  <td>{it.reference_number || it.description}</td>
                  <td className={t.num}>{fmt(it.amount)}</td>
                  <td className={t.num}>
                    <Input 
                      type="number" 
                      value={it.forcedRate} 
                      onChange={e => {
                        const newItems = [...items];
                        newItems[idx].forcedRate = parseFloat(e.target.value) || 1;
                        setItems(newItems);
                      }}
                      style={{ textAlign: 'right', padding: '4px 8px', height: '32px' }}
                    />
                  </td>
                  <td className={t.num} style={{ fontWeight: 600 }}>
                    {targetDoc?.currency === 'USD' ? fmtUsd(it.amount / it.forcedRate) : fmt(it.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ fontWeight: 600, textAlign: 'right', padding: '12px' }}>Totales:</td>
                <td className={t.num} style={{ fontWeight: 600 }}>{fmt(totalArs)}</td>
                <td className={t.num} style={{ fontSize: '11px', color: '#64748b' }}>TC Promedio: {avgRate.toFixed(2)}</td>
                <td className={t.num} style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '15px' }}>
                  {targetDoc?.currency === 'USD' ? fmtUsd(totalConverted) : fmt(totalConverted)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className={s.modalFooter}>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onAccept(totalConverted, avgRate)}>
            Aceptar Aplicación
          </Button>
        </div>
      </div>
    </div>
  );
}

function OriginLinkTool({ entity }) {
  const [dns, setDns] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState('FA');
  const { showToast } = useToast();
  const { openWindow } = useWindow();

  useEffect(() => {
    if (entity) fetchDns();
  }, [entity]);

  const fetchDns = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/sales/delivery-notes/entity/${entity.id}/pending-invoice`);
      if (res.ok) {
        setDns(await res.json());
      }
    } catch (e) {
      showToast("Error al cargar remitos", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleBulkInvoice = async () => {
    if (selectedIds.length === 0) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/sales/delivery-notes/create-invoice-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_note_ids: selectedIds,
          doc_type: selectedDocType
        })
      });

      if (res.ok) {
        const data = await res.json();
        showToast(`Factura ${data.number} generada con éxito`, "success");
        setSelectedIds([]);
        fetchDns();
        // Abrir la factura generada
        openEditFactura(data.id, {
          mode: 'edit',
          title: `Factura ${data.number}`,
          width: 1100,
          height: 700
        });
      } else {
        const err = await res.json();
        showToast(err.detail || "Error al facturar", "error");
      }
    } catch (e) {
      showToast("Error de conexión", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleOpenDoc = (id, number, type) => {
    openWindow('delivery-note', { id, mode: 'edit' }, {
      title: `Remito ${number}`,
      width: 1100,
      height: 700
    });
  };

  return (
    <div className={s.toolContainer}>
      <div className={s.summaryCards}>
        <div className={s.statCard}>
          <div className={`${s.statIcon}`} style={{ background: '#f0f9ff', color: '#0ea5e9' }}>
            <ShoppingCart size={20} />
          </div>
          <div className={s.statInfo}>
            <span className={s.statLabel}>Remitos Pendientes</span>
            <span className={s.statValue}>{dns.length}</span>
          </div>
        </div>
      </div>

      <div className={s.toolSplit}>
        <div className={s.pane} style={{ flex: 1.5 }}>
          <h4>
            Remitos Pendientes
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>(Listos para facturar)</span>
          </h4>
          <div className={s.paneContent}>
            {loading ? <p>Cargando remitos...</p> : dns.length === 0 ? (
              <div className={s.emptyMsg} style={{ padding: '40px' }}>
                <CheckCircle size={32} color="#10b981" style={{ marginBottom: '12px', opacity: 0.5 }} />
                <p>No hay remitos pendientes de facturación para esta entidad.</p>
              </div>
            ) : (
              <table className={t.table}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}></th>
                    <th>Fecha</th>
                    <th>Número</th>
                    <th>Ref. Origen</th>
                    <th className={t.num}>Ítems</th>
                  </tr>
                </thead>
                <tbody>
                  {dns.map(dn => (
                    <tr key={dn.id} 
                        className={selectedIds.includes(dn.id) ? s.rowSelected : ''}
                        onClick={() => handleToggle(dn.id)}>
                      <td>
                        <input type="checkbox" checked={selectedIds.includes(dn.id)} readOnly />
                      </td>
                      <td>{new Date(dn.date).toLocaleDateString()}</td>
                      <td>
                        <span className={s.docLink} onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDoc(dn.id, dn.number, 'DELIVERY_NOTE');
                        }}>
                          {dn.number}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: '#64748b' }}>{dn.origin_reference}</td>
                      <td className={t.num}>
                        <span className={s.countBadge}>{dn.lines?.length || 0}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className={s.pane}>
          <h4>
            Acciones de Facturación
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>(Generar Comprobante)</span>
          </h4>
          <div className={s.paneContent} style={{ padding: '24px' }}>
            {!selectedIds.length ? (
              <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                <ShoppingCart size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
                <p>Seleccione uno o varios remitos para generar la factura consolidada.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ 
                  background: '#f0f9ff', 
                  border: '1px solid #bae6fd', 
                  borderRadius: '12px', 
                  padding: '16px' 
                }}>
                  <h5 style={{ margin: '0 0 8px 0', color: '#0369a1' }}>Resumen de Selección</h5>
                  <p style={{ fontSize: '13px', margin: 0, color: '#0c4a6e' }}>
                    Has seleccionado <strong>{selectedIds.length}</strong> remito(s).
                  </p>
                  <ul style={{ fontSize: '12px', margin: '12px 0 12px 0', paddingLeft: '20px', color: '#0c4a6e', maxHeight: '120px', overflowY: 'auto' }}>
                    {dns.filter(dn => selectedIds.includes(dn.id)).map(dn => (
                      <li key={dn.id}>{dn.number} ({dn.lines?.length} ítems)</li>
                    ))}
                  </ul>
                  <div style={{ borderTop: '1px solid #bae6fd', paddingTop: '12px', marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: '#0369a1' }}>Total Estimado (USD):</span>
                    <span style={{ fontWeight: 800, color: '#0369a1', fontSize: '18px' }}>
                      {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' }).format(
                        dns.filter(dn => selectedIds.includes(dn.id))
                           .reduce((acc, dn) => acc + dn.lines.reduce((lacc, l) => lacc + (l.total_amount || 0), 0), 0)
                      )}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Tipo de Comprobante</label>
                    <select 
                        value={selectedDocType}
                        onChange={e => setSelectedDocType(e.target.value)}
                        style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', background: '#fff', fontSize: '13px' }}
                    >
                        <option value="FA">Factura A</option>
                        <option value="FB">Factura B</option>
                    </select>
                  </div>

                  <Button 
                    variant="primary" 
                    onClick={handleBulkInvoice} 
                    loading={creating}
                    style={{ height: '48px', fontSize: '15px', marginTop: '8px' }}
                  >
                    <FileCheck size={18} style={{ marginRight: '8px' }} />
                    Generar {selectedDocType === 'FA' ? 'Factura de Venta (A)' : 'Factura de Venta (B)'}
                  </Button>
                  
                  <p style={{ fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
                    Se generará una sola factura consolidando todos los ítems de los remitos seleccionados. 
                    El número se asignará automáticamente del próximo disponible para el PV del primer remito.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CommissionApplication() {
  const [salesperson, setSalesperson] = useState(null);
  const [details, setDetails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [commHistory, setCommHistory] = useState([]);
  const { openWindow } = useWindow();
  const { showToast } = useToast();

  useEffect(() => {
    if (salesperson) {
      fetchDetails();
      fetchCommHistory();
    } else {
      setDetails([]);
      setCommHistory([]);
    }
  }, [salesperson]);

  const fetchCommHistory = async () => {
    if (!salesperson) return;
    try {
      const res = await fetch(`${API_URL}/accounting/documents/entities/${salesperson.id}/commissions/history`);
      if (res.ok) {
        const data = await res.json();
        setCommHistory(data || []);
      } else {
        setCommHistory([]);
      }
    } catch (e) {
      console.error("Error fetching commission history", e);
      setCommHistory([]);
    }
  };
   
  const handleDeleteComm = async (id) => {
    if (!window.confirm("¿Está seguro de eliminar esta liquidación de comisión?")) return;
    try {
      const res = await fetch(`${API_URL}/accounting/documents/commissions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast("Liquidación eliminada", "success");
        fetchDetails();
        fetchCommHistory();
      } else {
        const err = await res.json();
        showToast(err.detail || "Error al eliminar", "error");
      }
    } catch (e) {
      showToast("Error de conexión", "error");
    }
  };

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/sales/commissions/detail/${salesperson.id}`);
      if (res.ok) {
        const data = await res.json();
        setDetails(data);
      }
    } catch (e) {
      showToast("Error al cargar detalle de comisiones", "error");
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v) => {
    if (v === null || v === undefined) return "$ 0,00";
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' }).format(v);
  };

  const [selectedPayment, setSelectedPayment] = useState(null);
  const [selectedComm, setSelectedComm] = useState(null);
  const [applyAmount, setApplyAmount] = useState("");

  const handleOpenDoc = (id, number, type) => {
    if (!id) return;
    if (type === 'RECEIPT') {
      openEditRecibo(id, { mode: 'edit', title: `Recibo ${number}` });
    } else if (type === 'PAYMENT') {
      openEditPago(id, { mode: 'edit', title: `Pago ${number}` });
    } else if (type === 'DELIVERY_NOTE') {
      openEditRemito(id, { mode: 'edit', title: `Remito ${number}` });
    } else if (type === 'SALES_ORDER') {
      openEditOrdenVenta(id, { mode: 'edit', title: `Orden Venta ${number}` });
    } else if (type === 'LPG_PRIMARY' || type === 'LPG_SECONDARY') {
      openWindow('grain-settlement', { id, mode: 'edit' }, { title: `${type || 'DOC'} ${number}` });
    } else {
      openEditFactura(id, { mode: 'edit', title: `Factura ${number}` });
    }
  };

  const handleApply = async () => {
    if (!selectedPayment || !selectedComm || !applyAmount) return;
    
    try {
      const res = await fetch(`${API_URL}/sales/commissions/apply-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_doc_id: selectedPayment.doc_id,
          target_doc_id: selectedComm.doc_id,
          amount_usd: parseFloat(applyAmount)
        })
      });

      if (res.ok) {
        showToast("Aplicación de comisión realizada", "success");
        setSelectedPayment(null);
        setSelectedComm(null);
        setApplyAmount("");
        fetchDetails();
        fetchCommHistory();
      } else {
        const err = await res.json();
        showToast(err.detail || "Error al aplicar", "error");
      }
    } catch (e) {
      showToast("Error de conexión", "error");
    }
  };

  const pendingComms = details.filter(d => 
    d.type !== 'PAYMENT' && 
    (d.commission_amount > 0) && 
    !d.is_paid
  );

  const payments = details.filter(d => d.type === 'PAYMENT' && Math.abs(d.commission_amount) > 0.01);

  return (
    <div className={s.segmentContainer}>
      <div className={s.segmentHeader}>
        <h3>Aplicación de Comisiones</h3>
        <div className={s.entityFilter}>
          <Autocomplete
            placeholder="Seleccionar Comisionista..."
            onSearch={async (q) => {
              try {
                const res = await fetch(`${API_URL}/entities/?is_salesperson=true&q=${encodeURIComponent(q)}`);
                if (res.ok) return await res.json();
              } catch (e) {
                console.error("Salesperson search error", e);
              }
              return [];
            }}
            onSelect={setSalesperson}
            initialValue={salesperson}
            minChars={0}
          />
        </div>
      </div>
      
      <div className={s.segmentBody}>
        {!salesperson ? (
          <div className={s.emptyState}>
            <Users size={48} color="#94a3b8" />
            <p>Seleccione un comisionista para ver sus pendientes</p>
          </div>
        ) : (
    <div className={s.toolContainer}>
      <div className={s.summaryCards}>
        <div className={s.statCard}>
          <div className={`${s.statIcon}`} style={{ background: '#ecfdf5', color: '#10b981' }}>
            <ArrowDownCircle size={20} />
          </div>
          <div className={s.statInfo}>
            <span className={s.statLabel}>Pagos/Créditos</span>
            <span className={s.statValue}>{fmt(payments.reduce((acc, p) => acc + Math.abs(p.commission_amount), 0))}</span>
          </div>
        </div>
        <div className={s.statCard}>
          <div className={`${s.statIcon}`} style={{ background: '#fef2f2', color: '#ef4444' }}>
            <ArrowUpCircle size={20} />
          </div>
          <div className={s.statInfo}>
            <span className={s.statLabel}>Comisiones Pend.</span>
            <span className={s.statValue}>{fmt(pendingComms.reduce((acc, c) => acc + c.commission_amount, 0))}</span>
          </div>
        </div>
      </div>

      <div className={s.toolSplit}>
        <div className={s.pane}>
          <h4>
            Pagos Disponibles
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>(Anticipos o Excedentes)</span>
          </h4>
          <div className={s.paneContent}>
                  {loading ? <p>Cargando...</p> : payments.length === 0 ? <p className={s.emptyMsg}>No hay pagos de comisión sin aplicar</p> : (
                    <table className={t.table}>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Ref</th>
                          <th className={t.num}>TC</th>
                          <th className={t.num}>Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map(p => (
                          <tr key={p.doc_id} 
                              className={selectedPayment?.doc_id === p.doc_id ? s.rowSelected : ''}
                              onClick={() => {
                                setSelectedPayment(p);
                                if (selectedComm) {
                                  setApplyAmount(Math.min(Math.abs(p.commission_amount), selectedComm.commission_amount).toFixed(2));
                                } else {
                                  setApplyAmount(Math.abs(p.commission_amount).toFixed(2));
                                }
                              }}>
                            <td>{new Date(p.doc_date).toLocaleDateString()}</td>
                            <td>
                              <span className={s.docLink} onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDoc(p.doc_id, p.doc_number, p.doc_type);
                              }}>
                                {p.doc_number}
                              </span>
                            </td>
                            <td className={t.num} style={{ color: '#64748b' }}>
                              {p.exchange_rate?.toFixed(2) || '1.00'}
                            </td>
                            <td className={t.num} style={{ color: 'var(--success)', fontWeight: 600 }}>
                              {fmt(Math.abs(p.commission_amount))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
              
        <div className={s.pane}>
          <h4>
            Comisiones Pendientes
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>(Comprobantes sin liquidar)</span>
          </h4>
          <div className={s.paneContent}>
                  {loading ? <p>Cargando...</p> : pendingComms.length === 0 ? <p className={s.emptyMsg}>No hay comisiones de venta pendientes</p> : (
                    <table className={t.table}>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Comp.</th>
                          <th>Cliente</th>
                          <th className={t.num}>TC</th>
                          <th className={t.num}>Comisión</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingComms.map(c => (
                          <tr key={c.doc_id}
                              className={selectedComm?.doc_id === c.doc_id ? s.rowSelected : ''}
                              onClick={() => {
                                setSelectedComm(c);
                                if (selectedPayment) {
                                  setApplyAmount(Math.min(Math.abs(selectedPayment.commission_amount), c.commission_amount).toFixed(2));
                                } else {
                                  setApplyAmount(c.commission_amount.toFixed(2));
                                }
                              }}>
                            <td>{new Date(c.doc_date).toLocaleDateString()}</td>
                            <td>
                              <span className={s.docLink} onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDoc(c.doc_id, c.doc_number, c.doc_type);
                              }}>
                                {c.doc_number}
                              </span>
                            </td>
                            <td style={{ fontSize: '11px' }}>{c.entity_name}</td>
                            <td className={t.num} style={{ color: '#64748b' }}>
                              {c.exchange_rate?.toFixed(2) || '1.00'}
                            </td>
                            <td className={t.num} style={{ color: 'var(--danger)', fontWeight: 600 }}>
                              {fmt(c.commission_amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            <div className={s.applicationBar}>
              <div className={s.appInfo}>
                {selectedPayment && selectedComm ? (
                  <p>
                    Aplicando pago <strong>{selectedPayment.doc_number}</strong> a comisión <strong>{selectedComm.doc_number}</strong>
                  </p>
                ) : (
                  <p className={s.hint}>Seleccione un pago y una comisión para aplicar</p>
                )}
              </div>
              <div className={s.appActions}>
                <div style={{ width: 150 }}>
                  <Input 
                    type="number"
                    placeholder="Monto USD"
                    value={applyAmount}
                    onChange={e => setApplyAmount(e.target.value)}
                  />
                </div>
                <Button onClick={handleApply} disabled={!selectedPayment || !selectedComm || !applyAmount}>
                  <CheckCircle size={16} /> Aplicar Comisión
                </Button>
              </div>
            </div>

            <div style={{ marginTop: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <History size={18} color="#64748b" />
                <h4 style={{ margin: 0, fontSize: '15px', color: '#334155' }}>Historial de Liquidaciones</h4>
              </div>
              
              {commHistory.length === 0 ? (
                <div className={s.pane} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                   No hay liquidaciones registradas recientemente para este comisionista
                </div>
              ) : (
                <div className={s.pane}>
                  <table className={t.table}>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Pago (Origen)</th>
                        <th>Venta (Destino)</th>
                        <th className={t.num}>Monto USD</th>
                        <th className={t.num}>TC</th>
                        <th style={{ width: 80 }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commHistory.map(app => (
                        <tr key={app.id}>
                          <td>{new Date(app.date).toLocaleDateString()}</td>
                          <td>
                             <div className={s.docLink} onClick={() => handleOpenDoc(app.source_document_id, app.source_doc_number, app.source_doc_type)}>
                              {app.source_doc_number}
                            </div>
                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>{app.source_doc_type}</span>
                          </td>
                          <td>
                            <div className={s.docLink} onClick={() => handleOpenDoc(app.document_id, app.doc_number, app.doc_type)}>
                              {app.doc_number}
                            </div>
                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>{app.doc_type}</span>
                          </td>
                          <td className={t.num} style={{ fontWeight: 600 }}>
                            {fmt(app.amount_usd)}
                          </td>
                          <td className={t.num} style={{ color: '#64748b' }}>
                            {app.exchange_rate.toFixed(2)}
                          </td>
                          <td className={t.num}>
                            <button 
                              className={s.deleteBtn} 
                              onClick={() => handleDeleteComm(app.id)}
                              title="Eliminar Liquidación"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FxAdjustmentModal({ preview, onClose, onConfirm }) {
  const fmt = (v) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(v);
  const signLabel = preview.sign === 'ND' ? 'Nota de Débito' : 'Nota de Crédito';

  return (
    <div className={s.modalBackdrop} style={{ backdropFilter: 'blur(8px)', zIndex: 3000 }}>
      <div className={s.modalContent} style={{ width: 620, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
        <div className={s.modalHeader} style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ 
              background: preview.sign === 'ND' ? '#fee2e2' : '#dcfce7', 
              color: preview.sign === 'ND' ? '#ef4444' : '#10b981',
              padding: '12px',
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <DollarSign size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>Diferencia de Cambio Detectada</h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#64748b' }}>Se requiere un ajuste contable por variación de TC</p>
            </div>
          </div>
          <Button variant="ghost" onClick={onClose} style={{ borderRadius: '50%', width: 40, height: 40, padding: 0 }}><X size={20}/></Button>
        </div>
        
        <div className={s.modalBody} style={{ padding: '0 24px 24px 24px' }}>
          <div style={{ 
            background: '#f8fafc', 
            border: '1px solid #e2e8f0', 
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '32px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '32px'
          }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>TC Factura</span>
              <p style={{ margin: '4px 0 0 0', fontWeight: 800, fontSize: '24px', color: '#334155' }}>{preview.tc_invoice.toFixed(2)}</p>
            </div>
            <div style={{ textAlign: 'center', borderLeft: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>TC Aplicación</span>
              <p style={{ margin: '4px 0 0 0', fontWeight: 800, fontSize: '24px', color: '#334155' }}>{preview.tc_application.toFixed(2)}</p>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <span style={{ fontSize: '15px', color: '#64748b', fontWeight: 500 }}>Se generará una {signLabel} por</span>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '8px', margin: '8px 0' }}>
              <h2 style={{ 
                margin: 0, 
                fontSize: '48px', 
                fontWeight: 900,
                letterSpacing: '-0.02em',
                color: preview.sign === 'ND' ? '#ef4444' : '#10b981' 
              }}>
                {fmt(preview.total_ars)}
              </h2>
            </div>
            <div style={{ 
                background: preview.sign === 'ND' ? '#fff1f2' : '#f0fdf4',
                padding: '12px 20px',
                borderRadius: '10px',
                fontSize: '13px',
                lineHeight: '1.5',
                color: preview.sign === 'ND' ? '#be123c' : '#15803d',
                display: 'inline-block',
                maxWidth: '90%',
                fontWeight: 500,
                border: `1px solid ${preview.sign === 'ND' ? '#fecdd3' : '#bbf7d0'}`
            }}>
                {preview.reason}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '24px' }}>
            <h5 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#475569', fontWeight: 700 }}>Detalle Impositivo</h5>
            <table className={s.miniTable}>
              <thead>
                <tr>
                  <th>Alícuota IVA</th>
                  <th className={t.num}>Neto Gravado</th>
                  <th className={t.num}>Monto IVA</th>
                  <th className={t.num}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(preview.vat_by_rate).map(([rate, v]) => (
                  <tr key={rate}>
                    <td style={{ fontWeight: 600, color: '#1e293b' }}>{(parseFloat(rate) * 100).toFixed(1)}%</td>
                    <td className={t.num}>{fmt(v.net)}</td>
                    <td className={t.num}>{fmt(v.vat)}</td>
                    <td className={t.num} style={{ fontWeight: 700, color: '#1e293b' }}>{fmt(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={s.modalFooter} style={{ background: '#f8fafc', padding: '24px 32px', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
          <Button variant="ghost" onClick={onClose} style={{ fontWeight: 600 }}>Omitir Ajuste</Button>
          <Button onClick={onConfirm} variant="primary" style={{ minWidth: '240px', fontWeight: 700, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
            Generar y Abrir {preview.sign}
          </Button>
        </div>
      </div>
    </div>
  );
}
