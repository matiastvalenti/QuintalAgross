import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp, DollarSign, Clock, CheckCircle, User,
  ChevronRight, X, Search, Calendar, FilterX, CreditCard,
  FileText, Package, ShoppingBag, RefreshCw, ArrowUpRight,
  BadgeCheck, Hourglass, Banknote, Landmark, Plus, Trash2,
  Wallet, ChevronLeft, Download
} from 'lucide-react';
import { API_URL } from '../../config';
import { useToast } from '../../context/ToastContext';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { useWindow } from '../../context/WindowContext';
import { openEditRecibo } from '../../utils/openStandaloneWindow';
import api from '../../services/api';
import t from '../../components/ui/Table.module.css';
import st from './CommissionReport.module.css';

import jsPDF from 'jspdf';
import 'jspdf-autotable';

const fmt = (n, curr = 'USD') =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: curr,
    minimumFractionDigits: 2
  }).format(n || 0);

export default function CommissionReport({ onClose, isWindow }) {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ startDate: '', endDate: '', salespersonId: '' });
  const [salespeople, setSalespeople] = useState([]);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const { showToast } = useToast();
  const { openWindow } = useWindow();

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/sales/commissions/summary', {
        params: {
          start_date: filters.startDate,
          end_date: filters.endDate,
          salesperson_id: filters.salespersonId
        }
      });
      console.log('commission sellers response', data);
      setSummary(Array.isArray(data) ? data : []);
    } catch (e) {
      showToast('Error al cargar comisiones: ' + (e.message || '').substring(0, 120), 'error');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const fetchDetails = useCallback(async (spId) => {
    setDetailsLoading(true);
    try {
      const data = await api.get(`/sales/commissions/detail/${spId}`, {
        params: {
          start_date: filters.startDate,
          end_date: filters.endDate
        }
      });
      setDetails(data);
    } catch (e) {
      showToast('Error al cargar detalle: ' + (e.message || '').substring(0, 120), 'error');
    } finally {
      setDetailsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    api.get('/entities/', { params: { is_salesperson: true } })
      .then(setSalespeople).catch(() => {});
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  useEffect(() => {
    if (selected) fetchDetails(selected.salesperson_id);
    else setDetails([]);
  }, [selected, fetchDetails]);

  useEffect(() => {
    const handleReceiptChange = () => {
      fetchSummary();
      if (selected) fetchDetails(selected.salesperson_id);
      setSelectedDocs([]);
    };
    window.addEventListener('receipt-changed', handleReceiptChange);
    return () => window.removeEventListener('receipt-changed', handleReceiptChange);
  }, [fetchSummary, fetchDetails, selected]);

  const handleSyncAll = async () => {
    if (!confirm("¿Recalcular todas las comisiones pendientes? Esto actualizará montos según costos actuales.")) return;
    setLoading(true);
    try {
      await api.post('/sales/commissions/sync-all', {});
      showToast("Sincronización completada", "success");
      fetchSummary();
    } catch (e) {
      showToast("Error en sincronización: " + (e.message || ''), "error");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectDoc = (d) => {
    // Si la comisión no está lista (cliente no pagó), prevenimos selección
    if (!d.is_customer_paid && d.commission_amount > d.commission_paid_amount) {
        // Podríamos mostrar un mensaje, pero el checkbox ya estará deshabilitado visualmente
        return;
    }
    
    // Usamos sales_order_id ya que es el identificador persistente en este flujo
    const isSelected = selectedDocs.some(sd => sd.to_document_id === d.sales_order_id);
    if (isSelected) {
      setSelectedDocs(selectedDocs.filter(sd => sd.to_document_id !== d.sales_order_id));
    } else {
      const balance = d.commission_amount - d.commission_paid_amount;
      setSelectedDocs([...selectedDocs, { 
        id: d.sales_order_id,
        to_document_id: d.sales_order_id, 
        number: d.sales_order_number,
        date: d.date,
        remaining: balance,
        currency: d.currency || 'USD',
        amount_applied: balance
      }]);
    }
  };

  const openPaymentWindow = (applications) => {
    const draftId = crypto.randomUUID();
    localStorage.setItem(`receipt_draft_${draftId}`, JSON.stringify({ initialPayments: applications }));

    openNuevoPago({
      draft_id: draftId,
      entityId: selected.salesperson_id,
      title: 'Nueva Orden de Pago',
      width: 1100,
      height: 650
    });
  };

  const openMassPay = () => {
    if (selectedDocs.length === 0) return;
    openPaymentWindow(selectedDocs);
  };

  // Build running balance for detail view (now split)
  const { pendingDetails, paidDetails } = useMemo(() => {
    if (!details || (!details.pending && !details.paid)) return { pendingDetails: [], paidDetails: [] };
    
    const pending = (details.pending || []).sort((a, b) => new Date(a.date) - new Date(b.date));
    const paid = (details.paid || []).sort((a, b) => new Date(a.date) - new Date(b.date));
    
    return { pendingDetails: pending, paidDetails: paid };
  }, [details]);

  const viewDocument = (docId) => {
    if (!docId) return;
    openEditPago(docId, {
      mode: 'edit',
      title: `Pago ${docId}`
    });
  };

  const totalNet = summary.reduce((a, c) => a + c.total_sales_net, 0);
  const totalComm = summary.reduce((a, c) => a + c.total_commission, 0);
  const totalPaid = summary.reduce((a, c) => a + (c.paid_commission || 0), 0);
  const totalPending = totalComm - totalPaid;

  const handleExportCSV = () => {
    const allDocs = [...pendingDetails, ...paidDetails];
    if (allDocs.length === 0) return;
    
    const headers = ['Fecha', 'Pedido', 'Cliente', 'Cobro Cliente %', 'Comisión (USD)', 'Pagado (USD)', 'Saldo (USD)'];
    const rows = allDocs.map(d => {
      const balance = d.commission_amount - d.commission_paid_amount;
      return [
        new Date(d.date).toLocaleDateString('es-AR'),
        d.sales_order_number,
        `"${(d.customer_name || '').replace(/"/g, '""')}"`,
        `${(d.customer_paid_pct || 0).toFixed(1)}%`,
        d.commission_amount.toFixed(2),
        d.commission_paid_amount.toFixed(2),
        balance.toFixed(2)
      ].join(',');
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `comisiones_${selected.salesperson_name}_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    const allDocs = [...pendingDetails, ...paidDetails].sort((a, b) => new Date(a.date) - new Date(b.date));
    if (allDocs.length === 0) return;

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      
      // 1. Corporate Header
      doc.setFillColor(30, 41, 59); // Slate 800
      doc.rect(0, 0, pageWidth, 40, 'F');
      
      doc.setFontSize(22);
      doc.setTextColor(255, 255, 255);
      doc.setFont(undefined, 'bold');
      doc.text("QUINTAL AGROSS", 14, 25);
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text("Liquidación Oficial de Comisiones", 14, 32);
      
      doc.setFontSize(9);
      doc.text(`FECHA DE EMISIÓN: ${new Date().toLocaleDateString('es-AR')}`, pageWidth - 14, 25, { align: 'right' });
      
      // 2. Beneficiary Info
      doc.setTextColor(15, 23, 42); 
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text("BENEFICIARIO", 14, 55);
      doc.setDrawColor(226, 232, 240);
      doc.line(14, 57, 100, 57);
      
      doc.setFontSize(11);
      doc.text(selected.salesperson_name.toUpperCase(), 14, 64);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`ID Interno: ${selected.salesperson_id}`, 14, 69);

      // 3. Financial Summary Box
      const summaryX = pageWidth - 90;
      doc.setFillColor(249, 250, 251);
      doc.roundedRect(summaryX, 48, 76, 32, 2, 2, 'F');
      doc.setDrawColor(209, 213, 219);
      doc.roundedRect(summaryX, 48, 76, 32, 2, 2, 'S');

      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text("TOTALES ACUMULADOS (USD)", summaryX + 5, 54);
      
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(9);
      doc.text("Total Pactado:", summaryX + 5, 61);
      doc.text("Total Liquidado:", summaryX + 5, 67);
      doc.setFont(undefined, 'bold');
      doc.text("SALDO A PAGAR:", summaryX + 5, 74);
      
      doc.setFont(undefined, 'normal');
      doc.text(fmt(selected.total_commission), summaryX + 71, 61, {align: 'right'});
      doc.text(fmt(selected.paid_commission), summaryX + 71, 67, {align: 'right'});
      doc.setTextColor(234, 88, 12); 
      doc.setFontSize(10);
      doc.text(fmt(selected.pending_commission), summaryX + 71, 74, {align: 'right'});

      // 4. Detail Table
      const tableData = allDocs.map(d => [
        new Date(d.date).toLocaleDateString('es-AR'),
        d.sales_order_number,
        d.customer_name || '-',
        `${(d.customer_paid_pct || 0).toFixed(1)}%`,
        d.commission_amount.toFixed(2),
        d.commission_paid_amount.toFixed(2),
        (d.commission_amount - d.commission_paid_amount).toFixed(2)
      ]);

      doc.autoTable({
        startY: 90,
        head: [['FECHA', 'COMPROBANTE', 'CLIENTE', 'COBRADO %', 'PACTADO', 'PAGADO', 'SALDO']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59], fontSize: 8, halign: 'center' },
        styles: { fontSize: 8, cellPadding: 3, textColor: [55, 65, 81] },
        columnStyles: {
            4: { halign: 'right', fontStyle: 'bold' },
            5: { halign: 'right' },
            6: { halign: 'right', textColor: [234, 88, 12], fontStyle: 'bold' }
        },
        alternateRowStyles: { fillColor: [249, 250, 251] }
      });

      // 5. Footer / Signatures
      const finalY = doc.lastAutoTable.finalY + 35;
      if (finalY < 260) {
          doc.setDrawColor(209, 213, 219);
          doc.line(20, finalY, pageWidth/2 - 10, finalY);
          doc.line(pageWidth/2 + 10, finalY, pageWidth - 20, finalY);
          
          doc.setFontSize(8);
          doc.setTextColor(107, 114, 128);
          doc.text("FIRMA DEL COMISIONISTA", (20 + pageWidth/2 - 10)/2, finalY + 5, {align: 'center'});
          doc.text("CONTROL ADMINISTRACIÓN", (pageWidth/2 + 10 + pageWidth - 20)/2, finalY + 5, {align: 'center'});
      }

      doc.save(`Liquidacion_${selected.salesperson_name.replace(/\s+/g, '_')}.pdf`);
      showToast("Documento de liquidación generado", "success");
    } catch (e) {
      console.error(e);
      showToast("Error al generar reporte PDF", "error");
    }
  };


  const renderOrderTable = (items, title, icon, color) => {
    const isPendingTable = title.toLowerCase().includes("pendientes");
    return (
      <div style={{ marginBottom: 40 }}>
          <div style={{ 
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, 
            paddingBottom: 12, borderBottom: `2px solid ${color}30` 
          }}>
              <div style={{ padding: 10, borderRadius: 12, background: `${color}15`, color: color }}>
                  {icon}
              </div>
              <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>{title}</h3>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{items.length} registros identificados</div>
              </div>
              {isPendingTable && items.length > 0 && (
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', background: 'rgba(255,255,255,0.6)', padding: '6px 16px', borderRadius: 20, border: '1px solid rgba(0,0,0,0.05)' }}>
                    SUBTOTAL PENDIENTE: {fmt(items.reduce((acc, curr) => acc + (curr.commission_amount - curr.commission_paid_amount), 0))}
                </div>
              )}
          </div>
          
          <div className={st.tableWrap} style={{ background: 'white', borderRadius: 24, padding: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <table className={t.table}>
                <thead>
                  <tr className={st.headerRow}>
                    <th className={st.checkboxCell} style={{ width: 48, padding: '4px 0 4px 12px' }}>
                      {isPendingTable && items.some(d => d.is_customer_paid) && (
                        <input 
                          type="checkbox" 
                          className={st.checkbox}
                          checked={items.filter(d => d.is_customer_paid).every(d => selectedDocs.some(sd => sd.to_document_id === d.sales_order_id))}
                          onChange={(e) => {
                            const selectable = items.filter(d => d.is_customer_paid);
                            const allSelected = selectable.every(d => selectedDocs.some(sd => sd.to_document_id === d.sales_order_id));
                            if (allSelected) {
                              const selectableIds = selectable.map(d => d.sales_order_id);
                              setSelectedDocs(selectedDocs.filter(sd => !selectableIds.includes(sd.to_document_id)));
                            } else {
                              const newDocs = [...selectedDocs];
                              selectable.forEach(d => {
                                if (!newDocs.some(sd => sd.to_document_id === d.sales_order_id)) {
                                  const balance = d.commission_amount - d.commission_paid_amount;
                                  newDocs.push({
                                    id: d.sales_order_id,
                                    to_document_id: d.sales_order_id, 
                                    number: d.sales_order_number,
                                    date: d.date,
                                    remaining: balance,
                                    currency: d.currency || 'USD',
                                    amount_applied: balance
                                  });
                                }
                              });
                              setSelectedDocs(newDocs);
                            }
                          }}
                        />
                      )}
                    </th>
                    <th style={{ width: 100, fontSize: 10, fontWeight: 800, color: '#94a3b8' }}>FECHA</th>
                    <th style={{ width: 140, fontSize: 10, fontWeight: 800, color: '#94a3b8' }}>PEDIDO</th>
                    <th style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8' }}>ENTIDAD / CLIENTE</th>
                    <th style={{ width: 120, fontSize: 10, fontWeight: 800, color: '#94a3b8', textAlign: 'center' }}>HITO COBRO</th>
                    <th className={st.usdSubHeader} style={{ width: 120 }}>PACTADO</th>
                    <th className={st.usdSubHeader} style={{ width: 120 }}>LIQUIDADO</th>
                    <th className={st.usdSubHeader} style={{ width: 120 }}>SALDO</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={8} className={st.emptyState}>No hay registros en esta sección.</td></tr>
                  ) : items.map((d, idx) => {
                    const balance = d.commission_amount - d.commission_paid_amount;
                    const canPay = d.is_customer_paid;
                    const isSelected = selectedDocs.some(sd => sd.to_document_id === d.sales_order_id);

                    return (
                      <tr key={d.sales_order_id} 
                          className={st.clickableRow} 
                          onClick={() => isPendingTable && canPay && toggleSelectDoc(d)}
                          style={{ cursor: isPendingTable && canPay ? 'pointer' : 'default', background: isSelected ? 'rgba(79, 70, 229, 0.05)' : 'transparent' }}>
                        <td className={st.checkboxCell}>
                          {isPendingTable ? (
                            <input 
                              type="checkbox" 
                              className={st.checkbox}
                              checked={isSelected}
                              disabled={!canPay}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleSelectDoc(d)} 
                            />
                          ) : (
                            <BadgeCheck size={16} color="#10b981" />
                          )}
                        </td>
                        <td className={st.cell} style={{ color: '#64748b', fontWeight: 600 }}>
                          {new Date(d.date).toLocaleDateString('es-AR')}
                        </td>
                        <td className={st.cell} style={{ fontWeight: 800, color: '#0f172a' }}>
                          {d.sales_order_number}
                        </td>
                        <td className={st.cell} style={{ color: '#475569', fontWeight: 700 }}>
                          {d.customer_name}
                        </td>
                        <td className={st.cell} style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                              <span className={`${st.statusTag} ${canPay ? st.ready : st.pending}`}>
                                  {canPay ? 'COBRADO' : 'PENDIENTE'}
                              </span>
                              {canPay && d.customer_payment_ref && (
                                <span style={{ fontSize: 9, color: '#10b981', fontWeight: 700, marginTop: -2, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                                  Ref: {d.customer_payment_ref}
                                </span>
                              )}
                              <div style={{ width: 50, height: 4, background: '#f1f5f9', borderRadius: 10, overflow: 'hidden' }}>
                                  <div style={{ width: `${d.customer_paid_pct}%`, height: '100%', background: canPay ? '#10b981' : '#f59e0b' }} />
                              </div>
                          </div>
                        </td>
                        <td className={`${st.cell} ${st.num} ${st.usdColumn}`}>
                          {fmt(d.commission_amount)}
                        </td>
                        <td className={`${st.cell} ${st.num} ${st.usdColumn} ${st.positive}`} style={{ color: '#10b981' }}>
                          {d.commission_paid_amount > 0 ? (
                             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                <span>{fmt(d.commission_paid_amount)}</span>
                                {d.commission_payment_ref && (
                                    <span 
                                      className={st.paymentLink}
                                      onClick={(e) => { e.stopPropagation(); viewDocument(d.commission_payment_id); }}
                                      title="Ver Comprobante de Pago al Vendedor"
                                    >
                                      OP: {d.commission_payment_ref}
                                    </span>
                                )}
                             </div>
                          ) : (
                            <span style={{ opacity: 0.3 }}>-</span>
                          )}
                        </td>
                        <td className={`${st.cell} ${st.num} ${st.usdColumn} ${balance > 0 ? st.negative : ''}`} style={{ fontWeight: 950, color: balance > 0 ? '#ea580c' : '#10b981' }}>
                          {fmt(balance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          </div>
      </div>
    );
  };


  // ─── DETAIL VIEW (Split Tables) ───
  if (selected) {
    return (
      <div className={st.pageLayout}>
        <div className={st.container}>
          {/* Filter bar / Header */}
          <div className={st.filterBar}>
            <div className={st.filterGroup} style={{ alignItems: 'center' }}>
              <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setSelectedDocs([]); fetchSummary(); }} style={{ padding: '4px 8px' }}>
                <ChevronLeft size={18} />
              </Button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontWeight: 800,
                fontSize: 16, background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                color: 'white', flexShrink: 0
              }}>
                {selected.salesperson_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{selected.salesperson_name}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Detalle de Comisiones por Pedido (USD)</div>
              </div>
            </div>
          </div>
          <div className={st.actions}>
            {selectedDocs.length > 0 && (
              <Button variant="primary" size="sm" onClick={openMassPay}>
                <BadgeCheck size={16} style={{ marginRight: 4 }} /> Liquidar Seleccionadas ({selectedDocs.length})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExportPDF} title="Exportar a PDF" style={{ color: '#ef4444', borderColor: '#ef444430' }}>
              <FileText size={16} /> <span style={{ marginLeft: 6 }}>PDF</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV} title="Exportar a CSV">
              <Download size={16} /> <span style={{ marginLeft: 6 }}>CSV</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchDetails(selected.salesperson_id)} title="Actualizar detalle">
              <RefreshCw size={16} />
            </Button>
          </div>
        </div>

        <div className={st.content}>
          {/* Summary cards - calculated from real-time detail data */}
          {(() => {
            const all = [...pendingDetails, ...paidDetails];
            const totalGen = all.reduce((a, b) => a + (b.commission_amount || 0), 0);
            const totalPaid = all.reduce((a, b) => a + (b.commission_paid_amount || 0), 0);
            const totalPend = totalGen - totalPaid;
            
            return (
              <div className={st.summaryCards}>
                <div className={st.statCard}>
                  <span className={st.statLabel}><DollarSign size={16} /> Comisión Generada (USD)</span>
                  <span className={st.statValue}>{fmt(totalGen)}</span>
                </div>
                <div className={st.statCard}>
                  <span className={st.statLabel}><CheckCircle size={16} /> Liquidado (USD)</span>
                  <span className={`${st.statValue} ${st.positive}`}>{fmt(totalPaid)}</span>
                </div>
                <div className={st.statCard}>
                  <span className={st.statLabel}><Hourglass size={16} /> Saldo por Cobrar (USD)</span>
                  <span className={`${st.statValue} ${totalPend > 0.01 ? st.negative : ''}`}>
                    {fmt(totalPend)}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Render the two tables */}
          {detailsLoading ? (
             <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
                <RefreshCw size={24} className="spin" style={{ marginBottom: 12 }} />
                <div>Cargando detalle de pedidos...</div>
             </div>
          ) : (
            <>
              {renderOrderTable(pendingDetails, "Comisiones Pendientes", <Clock size={20} />, "#f59e0b")}
              {renderOrderTable(paidDetails, "Historial de Liquidaciones (Pagadas)", <CheckCircle size={20} />, "#10b981")}
            </>
          )}
        </div>
      </div>
      </div>
    );
  }

  // ─── SALESPERSON CARDS LIST ───
  return (
    <div className={st.pageLayout}>
      <div className={st.container}>
        {/* Filter bar */}
        <div className={st.filterBar}>
          <div className={st.filterGroup}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <TrendingUp size={20} color="#4F46E5" />
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Comisionistas</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Resúmenes de Cuenta (USD)</div>
              </div>
            </div>
            <div className={st.dateGroup}>
              <Input label="Desde" type="date" value={filters.startDate}
                onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))} />
              <Input label="Hasta" type="date" value={filters.endDate}
                onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))} />
            </div>
            <div style={{ width: 160 }}>
              <Select label="Vendedor" value={filters.salespersonId}
                onChange={e => setFilters(f => ({ ...f, salespersonId: e.target.value }))}>
                <option value="">Todos</option>
                {salespeople.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
              </Select>
            </div>
          </div>
          <div className={st.actions}>
            <Button variant="outline" size="sm" onClick={handleSyncAll} title="Sincronizar Comisiones" style={{ gap: 6, color: '#4F46E5', borderColor: '#4F46E5' }}>
              <RefreshCw size={15} /> Sincronizar
            </Button>
            <Button variant="outline" size="sm" onClick={fetchSummary} title="Actualizar">
              <RefreshCw size={16} />
            </Button>
          </div>
        </div>

        <div className={st.content}>
          {/* Totals row */}
          <div className={st.summaryCards}>
            <div className={st.statCard}>
              <div className={st.statLabel}><TrendingUp size={16} /> Ventas Mód. Comisiones</div>
              <div className={st.statValue}>{fmt(totalNet)}</div>
            </div>
            <div className={st.statCard}>
              <div className={st.statLabel}><DollarSign size={16} /> Comisión Total</div>
              <div className={st.statValue}>{fmt(totalComm)}</div>
            </div>
            <div className={st.statCard}>
              <div className={st.statLabel}><CheckCircle size={16} /> Pagado USD</div>
              <div className={`${st.statValue} ${st.positive}`}>{fmt(totalPaid)}</div>
            </div>
            <div className={st.statCard}>
              <div className={st.statLabel}><Hourglass size={16} /> Pendiente USD</div>
              <div className={`${st.statValue} ${totalPending > 0 ? st.negative : ''}`}>{fmt(totalPending)}</div>
            </div>
          </div>

          {/* Salesperson Cards */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 10, color: '#64748b' }}>
              <RefreshCw size={20} className="spin" /> Cargando...
            </div>
          ) : summary.length === 0 ? (
            <div className={st.emptyState}>
              <div style={{ background: '#f1f5f9', padding: 24, borderRadius: '50%', marginBottom: 16 }}>
                <Wallet size={48} color="#64748b" strokeWidth={1.5} />
              </div>
              <h3 style={{ color: '#1e293b', fontSize: 18, marginBottom: 8 }}>Sin Comisionistas</h3>
              <p style={{ maxWidth: 400 }}>Verificá que las órdenes o remitos tengan un vendedor asignado.</p>
            </div>
          ) : (
            <div className={st.bentoDashboard} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
              {summary.map(item => (
                <div
                  key={item.salesperson_id}
                  onClick={() => setSelected(item)}
                  className={st.personCard}
                >
                  <div className={st.personHeader}>
                    <div className={st.avatar}>
                      {item.salesperson_name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className={st.personName}>{item.salesperson_name}</div>
                      <div className={st.personDocs}>{item.document_count} documentos vinculados</div>
                    </div>
                    <ChevronRight size={20} color="#cbd5e1" />
                  </div>

                  <div className={st.personGrid}>
                    <div>
                      <div className={st.miniLabel}>COMISIÓN USD</div>
                      <div className={st.miniVal} style={{color: '#4F46E5'}}>{fmt(item.total_commission)}</div>
                    </div>
                    <div>
                      <div className={st.miniLabel}>PENDIENTE USD</div>
                      <div className={st.miniVal} style={{color: item.pending_commission > 0 ? '#ea580c' : '#10b981'}}>
                        {fmt(item.pending_commission)}
                      </div>
                    </div>
                  </div>
                  
                  {/* Progress Bar B2 */}
                  <div className={st.cardProgress}>
                    <div 
                      className={st.cardProgressBar} 
                      style={{ width: `${Math.min(100, Math.max(0, (item.paid_commission / item.total_commission) * 100))}%` }} 
                    />
                  </div>
                  <div className={st.progressLabel}>
                    <span>COBRADO: {Math.round((item.paid_commission / item.total_commission) * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
