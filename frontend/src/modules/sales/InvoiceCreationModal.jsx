import React, { useState, useEffect } from 'react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { ShoppingBag, Search, FileText, Package, AlertCircle } from 'lucide-react';
import api from '../../services/api';
import { openNuevaFactura } from '../../utils/openStandaloneWindow';

export default function InvoiceCreationModal({ open, onClose }) {
  const [step, setStep] = useState(1); // 1: Select Type, 2: Select OV (Master-Detail)
  
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingOrder, setLoadingOrder] = useState(false);
  
  const [selectedOrder, setSelectedOrder] = useState(null);
  
  // State to track selection and input quantities
  // Format: { [lineId]: { selected: boolean, qty_to_invoice: number } }
  const [lineStates, setLineStates] = useState({});

  useEffect(() => {
    if (open && step === 2) {
      fetchOrders();
    } else if (!open) {
      setStep(1);
      setOrders([]);
      setSelectedOrder(null);
      setLineStates({});
      setSearchTerm('');
      setError(null);
    }
  }, [open, step]);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/sales/sales-orders/');
      const pendingOrders = data.filter(ov => 
        ov.status !== 'CANCELLED' && 
        ov.status !== 'INVOICED'
      );
      setOrders(pendingOrders);
    } catch (err) {
      console.error("Error fetching orders:", err);
      setError("Error al cargar órdenes de venta");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOrder = async (ov) => {
    setLoadingOrder(true);
    setSelectedOrder({ id: ov.id, number: ov.number, entity: ov.entity, currency: ov.currency, lines: [] });
    setLineStates({});
    
    try {
      const data = await api.get(`/sales/sales-orders/${ov.id}`);
      setSelectedOrder(data);
      
      const newLineStates = {};
      (data.lines || []).forEach(l => {
          const factor = l.qty_packages && l.qty_packages > 0 && l.qty > 0
            ? l.qty / l.qty_packages
            : (l.product?.quantity_per_container ? parseFloat(l.product.quantity_per_container) : (l.package_size ? parseFloat(l.package_size) : 1));
          const orderedPkgs = factor > 1 ? l.qty / factor : l.qty;
          const invoicedPkgs = factor > 1 ? (l.qty_invoiced || 0) / factor : (l.qty_invoiced || 0);
          const pendingPkgs = Math.max(0, orderedPkgs - invoicedPkgs);
          if (pendingPkgs > 0) {
              newLineStates[l.id] = {
                  selected: true,
                  qty_to_invoice: pendingPkgs,
                  _factor: factor
              };
          }
      });
      setLineStates(newLineStates);
    } catch (err) {
      console.error("Error al cargar el detalle de la OV:", err);
    } finally {
      setLoadingOrder(false);
    }
  };

  const updateLineState = (lineId, field, value) => {
    setLineStates(prev => {
        const current = prev[lineId] || { selected: false, qty_to_invoice: 0 };
        return {
            ...prev,
            [lineId]: { ...current, [field]: value }
        };
    });
  };

  const handleConfirm = () => {
    // Generate draft
    const linesToSave = [];
    selectedOrder.lines.forEach(l => {
        const state = lineStates[l.id];
        if (state && state.selected && state.qty_to_invoice > 0) {
            const factor = state._factor || 1;
            const qtyPkgs = state.qty_to_invoice;
            const qtyUnits = qtyPkgs * factor;
            linesToSave.push({
                source_sales_line_id: l.id,
                product_id: l.product_id,
                product_name: l.product?.name || l.description || 'Sin descripción',
                qty_to_invoice: qtyUnits,
                qty_packages: qtyPkgs,
                package_size: factor,
                package_unit: l.product?.container?.unit?.short_name || l.package_unit || 'u',
                unit_price: l.unit_price,
                vat_rate: l.vat_rate || 0.21,
                _unit_content: factor,
                _unit_label: l.product?.container?.unit?.short_name || l.package_unit || 'u',
                _container_name: l.product?.container?.name || 'Unidad',
                _account_code: l.product?.sales_account_code || null,
            });
        }
    });

    if (linesToSave.length === 0) return;

    const draftId = Date.now().toString();
    const draft = {
      sourceType: "sales-order",
      salesOrderId: selectedOrder.id,
      salesOrderNumber: selectedOrder.number,
      customerName: selectedOrder.entity?.name || selectedOrder.entity_name || selectedOrder.customer_name,
      pointOfSale: selectedOrder.point_of_sale || "0001",
      currency: selectedOrder.currency || "ARS",
      exchangeRate: selectedOrder.exchange_rate || 1,
      paymentCondition: selectedOrder.sale_condition_id || "",
      sellerId: selectedOrder.salesperson_id || "",
      costCenter: selectedOrder.cost_center || "1",
      lines: linesToSave
    };

    console.log("Draft factura generado", draftId, draft);
    localStorage.setItem(`invoice_draft_${draftId}`, JSON.stringify(draft));

    onClose();
    openNuevaFactura({ draft_id: draftId });
  };

  const filteredOrders = orders.filter(ov => 
    ov.number.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (ov.entity && ov.entity.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const isConfirmDisabled = !selectedOrder || Object.values(lineStates).filter(s => s.selected && s.qty_to_invoice > 0).length === 0;

  return (
    <Modal 
      open={open} 
      onClose={onClose} 
      title={step === 1 ? "Nueva Factura" : null}
      wide={step === 2}
      noPadding={step === 2}
      style={step === 2 ? { maxWidth: 1150 } : { maxWidth: 500 }}
    >
      {step === 1 && (
        <div style={{ padding: '0 24px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ color: '#64748b', marginBottom: 8 }}>¿Cómo deseas crear la factura?</p>
            
            <button 
              onClick={() => { onClose(); openNuevaFactura(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#94a3b8'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
            >
              <div style={{ background: '#e2e8f0', padding: 12, borderRadius: 10, color: '#475569' }}>
                <FileText size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 800, color: '#1e293b', fontSize: 15 }}>Factura Manual</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Crear una factura en blanco, sin vinculaciones previas.</div>
              </div>
            </button>

            <button 
              onClick={() => setStep(2)}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#22c55e'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#bbf7d0'}
            >
              <div style={{ background: '#dcfce7', padding: 12, borderRadius: 10, color: '#16a34a' }}>
                <ShoppingBag size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 800, color: '#1e293b', fontSize: 15 }}>Desde Orden de Venta</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Facturar líneas pendientes de una orden de venta.</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          
          <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
             <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1e293b', display: 'flex', justifyContent: 'space-between' }}>
                 <span>Nueva Factura</span>
                 <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: '#94a3b8' }}>✕</button>
             </h2>
             <p style={{ margin: '4px 0 12px', fontSize: 13, color: '#64748b' }}>Seleccioná la Orden de Venta y luego los productos a facturar</p>
             <div style={{ position: 'relative', maxWidth: 400 }}>
                <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input 
                   type="text"
                   placeholder="Buscador..."
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                   style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none' }}
                />
             </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', flex: 1, minHeight: 0 }}>
             
             <div style={{ borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', overflowY: 'auto', padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                    ÓRDENES DE VENTA
                </div>
                
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Buscando órdenes...</div>
                ) : error ? (
                    <div style={{ padding: 20, textAlign: 'center', color: '#ef4444', background: '#fef2f2', borderRadius: 8, fontSize: 13 }}>{error}</div>
                ) : orders.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
                       <AlertCircle size={32} style={{ opacity: 0.5, marginBottom: 12 }} />
                       <div>No hay órdenes con productos pendientes de facturar.</div>
                    </div>
                ) : filteredOrders.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No se encontraron resultados.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                       {filteredOrders.map(ov => {
                           const isSelected = selectedOrder?.id === ov.id;
                           return (
                               <div 
                                   key={ov.id}
                                   onClick={() => handleSelectOrder(ov)}
                                   style={{
                                       padding: '12px 16px',
                                       borderRadius: 12,
                                       border: `2px solid ${isSelected ? '#24389c' : '#f1f5f9'}`,
                                       background: isSelected ? '#eff3ff' : '#fff',
                                       cursor: 'pointer',
                                       transition: 'all 0.15s'
                                   }}
                               >
                                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                       <div style={{ fontSize: 14, fontWeight: 800, color: isSelected ? '#24389c' : '#1e293b' }}>
                                           #{ov.number}
                                       </div>
                                       <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
                                           {new Date(ov.date).toLocaleDateString()}
                                       </div>
                                   </div>
                                   <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                                       {ov.entity?.name || ov.entity_name || ov.customer_name || 'S/D'}
                                   </div>
                                   {isSelected && ov.lines && (
                                       <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', marginTop: 8 }}>
                                           {ov.lines.filter(l => l.qty - (l.qty_invoiced || 0) > 0).length} ítems pendientes
                                       </div>
                                   )}
                               </div>
                           );
                       })}
                    </div>
                )}
             </div>

             <div style={{ backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                    PRODUCTOS A FACTURAR
                    {selectedOrder && (
                        <span style={{ color: '#1e293b', marginLeft: 8 }}>
                            OV {selectedOrder.number} &middot; {selectedOrder.entity?.name || selectedOrder.entity_name || selectedOrder.customer_name || 'S/D'}
                        </span>
                    )}
                </div>

                {!selectedOrder ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}>
                       <Package size={48} style={{ marginBottom: 16 }} />
                       <div style={{ fontSize: 14, fontWeight: 600 }}>Seleccioná una Orden de Venta</div>
                       <div style={{ fontSize: 12, marginTop: 4 }}>Para ver los productos disponibles</div>
                    </div>
                ) : loadingOrder ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                       <div style={{ fontSize: 13, fontWeight: 600 }}>Cargando productos...</div>
                    </div>
                ) : (!selectedOrder.lines || selectedOrder.lines.length === 0) ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ef4444', opacity: 0.8 }}>
                       <AlertCircle size={32} style={{ marginBottom: 12 }} />
                       <div style={{ fontSize: 13, fontWeight: 600 }}>La orden no tiene productos facturables</div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                       
                       {/* Mini ficha OV */}
                       <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 8 }}>
                           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 12 }}>
                               <div>
                                   <div style={{ color: '#64748b', fontWeight: 600 }}>Cliente</div>
                                   <div style={{ color: '#1e293b', fontWeight: 800, marginTop: 2 }}>{selectedOrder.entity?.name || selectedOrder.entity_name || selectedOrder.customer_name || 'S/D'}</div>
                               </div>
                               <div>
                                   <div style={{ color: '#64748b', fontWeight: 600 }}>Fecha OV</div>
                                   <div style={{ color: '#1e293b', fontWeight: 800, marginTop: 2 }}>{new Date(selectedOrder.date).toLocaleDateString()}</div>
                               </div>
                               <div>
                                   <div style={{ color: '#64748b', fontWeight: 600 }}>Condición</div>
                                   <div style={{ color: '#1e293b', fontWeight: 800, marginTop: 2 }}>{selectedOrder.sale_condition_id || 'S/D'}</div>
                               </div>
                               <div>
                                   <div style={{ color: '#64748b', fontWeight: 600 }}>Moneda</div>
                                   <div style={{ color: '#1e293b', fontWeight: 800, marginTop: 2 }}>{selectedOrder.currency}</div>
                               </div>
                           </div>
                       </div>

                       {selectedOrder.lines.filter(l => l.qty - (l.qty_invoiced || 0) > 0).map(line => {
                            const state = lineStates[line.id] || { selected: false, qty_to_invoice: 0, _factor: 1 };
                            
                            const factor = state._factor || (line.qty_packages && line.qty_packages > 0 && line.qty > 0
                              ? line.qty / line.qty_packages
                              : (line.product?.quantity_per_container ? parseFloat(line.product.quantity_per_container) : (line.package_size ? parseFloat(line.package_size) : 1)));
                            const unit = line.product?.container?.unit?.short_name || line.package_unit || 'LT';
                            const productName = line.product?.name || line.description || 'Sin descripción';
                            
                            const orderedPkgs = factor > 1 ? line.qty / factor : line.qty;
                            const invoicedPkgs = factor > 1 ? (line.qty_invoiced || 0) / factor : (line.qty_invoiced || 0);
                            const pendingPkgs = Math.max(0, orderedPkgs - invoicedPkgs);
                            
                            const equivalentText = factor <= 1 ? '1 unidad' : `${factor} ${unit} c/u`;
                            
                            return (
                                <div 
                                    key={line.id}
                                    style={{
                                        padding: '16px',
                                        borderRadius: 12,
                                        border: `1.5px solid ${state.selected ? '#3b82f6' : '#e2e8f0'}`,
                                        background: state.selected ? '#eff6ff' : '#fff',
                                        transition: 'all 0.15s',
                                        opacity: state.selected ? 1 : 0.7
                                    }}
                                >
                                    {/* Header Card */}
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                        <div 
                                             style={{ marginTop: 2, cursor: 'pointer' }}
                                             onClick={() => updateLineState(line.id, 'selected', !state.selected)}
                                        >
                                            <input 
                                                 type="checkbox" 
                                                 checked={state.selected} 
                                                 onChange={(e) => updateLineState(line.id, 'selected', e.target.checked)}
                                                 style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#3b82f6' }}
                                             />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 14, fontWeight: 800, color: state.selected ? '#1e293b' : '#475569' }}>
                                                {productName}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                                Equivalencia: <b>{equivalentText}</b>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                             <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>PRECIO</div>
                                             <div style={{ fontSize: 13, fontWeight: 900, color: '#24389c' }}>{selectedOrder.currency} {line.unit_price}</div>
                                        </div>
                                    </div>

                                    {/* Body Card */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
                                         <div>
                                             <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Pedido OV:</div>
                                             <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginTop: 4 }}>
                                                 {orderedPkgs} envases = {line.qty} {unit}
                                             </div>
                                         </div>
                                         <div>
                                             <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Ya facturado:</div>
                                             <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginTop: 4 }}>
                                                 {invoicedPkgs} envases = {line.qty_invoiced || 0} {unit}
                                             </div>
                                         </div>
                                         <div>
                                             <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Pendiente:</div>
                                             <div style={{ fontSize: 12, fontWeight: 800, color: '#ea580c', marginTop: 4 }}>
                                                 {pendingPkgs} envases = {(pendingPkgs * factor).toFixed(0)} {unit}
                                             </div>
                                         </div>
                                         <div style={{ background: '#dbeafe', padding: '8px 12px', borderRadius: 8, marginTop: -8 }}>
                                             <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 800 }}>Facturar ahora:</div>
                                             <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                                 <input 
                                                     type="number"
                                                     min="0"
                                                     max={pendingPkgs}
                                                     value={state.qty_to_invoice === 0 ? '' : state.qty_to_invoice}
                                                     onChange={(e) => {
                                                         let val = parseFloat(e.target.value) || 0;
                                                         if (val < 0) val = 0;
                                                         if (val > pendingPkgs) val = pendingPkgs;
                                                         updateLineState(line.id, 'qty_to_invoice', val);
                                                     }}
                                                     disabled={!state.selected}
                                                     style={{ width: 44, padding: '4px', borderRadius: 6, border: '1px solid #bfdbfe', textAlign: 'center', fontSize: 12, fontWeight: 800 }}
                                                 />
                                                 <span style={{ fontSize: 11, fontWeight: 700, color: '#1e40af' }}>
                                                     env = {(state.qty_to_invoice * factor).toFixed(0)} {unit}
                                                 </span>
                                             </div>
                                         </div>
                                    </div>
                                </div>
                            );
                       })}
                    </div>
                )}
             </div>
          </div>

          <div style={{ padding: '16px 24px', background: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
             <Button variant="outline" onClick={() => setStep(1)}>
                Volver
             </Button>
             <Button 
                variant="primary" 
                onClick={handleConfirm}
                disabled={isConfirmDisabled}
             >
                Crear Factura con Selección
             </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
