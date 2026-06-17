import { useState, useEffect, useRef } from 'react';
import { X, Save, Plus, Trash2, ChevronRight, Printer, RefreshCw } from 'lucide-react';
import { API_URL } from '../../../config';
import { useToast } from '../../../context/ToastContext';
import { useWindow } from '../../../context/WindowContext';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import s from './GrainSettlementModal.module.css';
import { useNavigate } from 'react-router-dom';
import { navigateToError } from '../../../utils/errorNavigation';
import api from '../../../services/api';

const TABS = [
  { id: 'items', label: 'Items' },
  { id: 'percepciones', label: 'Percepciones' },
  { id: 'retenciones', label: 'Retenciones' },
  { id: 'gastos', label: 'Gastos' },
  { id: 'percep_gastos', label: 'Percep. s/Gastos' },
  { id: 'coes', label: 'COEs asociados' },
  { id: 'vencimientos', label: 'Vencimientos' },
  { id: 'reg_elect', label: 'Reg. Electrónica' }
];

const fmt = (val, cur = 'ARS') => {
    const f = new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: cur === 'ARS' ? 'ARS' : 'USD',
        minimumFractionDigits: 2
    }).format(val || 0);
    return f;
};

export default function GrainSettlementModal(props) {
  const { 
    onClose, 
    onSuccess, 
    initialType = 'PRIMARY',
    windowId,
    id: editingDocId // If opened from CC, it passes the Document ID
  } = props;

  const { showToast } = useToast();
  const { closeWindow } = useWindow(); // Access window controls
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('items');
  const [itemType, setItemType] = useState('DEBITO');
  
  const [entities, setEntities] = useState([]);
  const [grains, setGrains] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [loading, setLoading] = useState(false);

  // Use a ref to track if we've already loaded the editing data
  const hasLoadedRef = useRef(false);

  const [form, setForm] = useState({
    entity_id: '',
    broker_id: '',
    grain_type_id: '',
    harvest_id: '',
    number: '',
    coe_number: '',
    date: new Date().toISOString().split('T')[0],
    input_date: new Date().toISOString().split('T')[0],
    settlement_type: initialType,
    currency: 'ARS',
    exchange_rate: '1396.00',
    cost_center: localStorage.getItem('costCenter') || '1',
    business_unit: '',
    sisa_status: '',
    price_pacted: '',
    grade: '',
    grade_value: '',
    factor: '',
    contract_number: '',
    jurisdiction_origin: '',
    jurisdiction_destination: '',
    price_per_ton: '0',
    observations: '',
    movement_ids: [],
    items: [],
    perceptions: [],
    retenciones: [], // Matches DB if needed, but the state uses 'retentions'
    retentions: [],
    expenses: []
  });

  const [pendings, setPendings] = useState([]);
  const [showMovementsPicker, setShowMovementsPicker] = useState(false);

  const handleClose = () => {
    if (windowId) closeWindow(windowId);
    if (onClose) onClose();
  };

  useEffect(() => {
    async function loadMasters() {
      try {
        const [entities, grains, harvests] = await Promise.all([
          api.get('/entities'),
          api.get('/grains/types'),
          api.get('/grains/harvests')
        ]);
        setEntities(entities);
        setGrains(grains);
        setHarvests(harvests);
      } catch (e) {
        console.error(e);
        navigateToError(navigate, {
          title: 'Error Cargando Maestros',
          message: 'No se pudieron obtener los datos base para la liquidación.',
          cause: e.message,
          status: 500
        });
      }
    }
    loadMasters();
  }, [navigate]);

  useEffect(() => {
    if (editingDocId && !hasLoadedRef.current) {
      fetchSettlement();
    }
  }, [editingDocId]);

  const fetchSettlement = async () => {
    setLoading(true);
    try {
      const data = await api.get(`/grains/settlements/by-document/${editingDocId}`);
      // Separate items and taxes
      const items = data.items || [];
      const perceptions = data.taxes?.filter(t => t.tax_type === 'PERCEPTION') || [];
      const retentions = data.taxes?.filter(t => t.tax_type === 'RETENTION') || [];
      const expenses = data.taxes?.filter(t => t.tax_type === 'EXPENSE') || [];

      setForm({
        ...data,
        date: data.date.split('T')[0],
        input_date: data.input_date.split('T')[0],
        items: items.map(i => ({ ...i, _tempId: Math.random().toString(36).substring(2, 9) })),
        perceptions: perceptions.map(i => ({ ...i, _tempId: Math.random().toString(36).substring(2, 9) })),
        retentions: retentions.map(i => ({ ...i, _tempId: Math.random().toString(36).substring(2, 9) })),
        expenses: expenses.map(i => ({ ...i, _tempId: Math.random().toString(36).substring(2, 9) }))
      });
      hasLoadedRef.current = true;
    } catch (e) {
      showToast("Error al cargar liquidación", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchPendings = async () => {
    if (!form.entity_id || !form.grain_type_id || !form.harvest_id) {
        showToast("Seleccione Productor, Grano y Campaña primero", "warning");
        return;
    }
    setLoading(true);
    try {
        const data = await api.get('/grains/pending-movements', {
            entity_id: form.entity_id,
            grain_type_id: form.grain_type_id,
            harvest_id: form.harvest_id
        });
        setPendings(data);
        setShowMovementsPicker(true);
    } catch (e) {
        showToast("Error al buscar movimientos", "error");
    } finally {
        setLoading(false);
    }
  };

  const handleApplyMovements = (selectedIds) => {
    const selectedMoves = pendings.filter(p => selectedIds.includes(p.id));
    const totalNet = selectedMoves.reduce((acc, m) => acc + parseFloat(m.clean_kilos || 0), 0);
    
    setForm(f => ({
        ...f,
        total_kilos: totalNet,
        movement_ids: selectedIds
    }));
    setShowMovementsPicker(false);
    showToast(`${selectedMoves.length} movimientos vinculados. Use 'Calcular' para generar los importes.`, "success");
  };

  const handleCalculate = async () => {
      if (!form.total_kilos || !form.price_per_ton) {
          showToast("Se requieren Kilos y Precio por Tonelada para calcular", "warning");
          return;
      }
      setLoading(true);
      try {
          const params = {
            total_kilos: form.total_kilos,
            price_per_ton: form.price_per_ton,
            sisa_status: form.sisa_status || '1',
            has_broker: !!form.broker_id
          };
          const data = await api.post('/grains/settlements/calculate', null, { params });
          setForm(f => ({
              ...f,
              gross_amount: data.gross_amount,
              vat_amount: data.vat_amount,
              perceptions_amount: data.perceptions_amount,
              retentions_amount: data.retentions_amount,
              expenses_amount: data.expenses_amount,
              net_amount: data.net_amount,
              items: data.items.map(i => ({ ...i, _tempId: Math.random().toString(36).substring(2, 9) })),
              perceptions: data.taxes.filter(t => t.tax_type === 'PERCEPTION').map(i => ({ ...i, _tempId: Math.random().toString(36).substring(2, 9) })),
              retentions: data.taxes.filter(t => t.tax_type === 'RETENTION').map(i => ({ ...i, _tempId: Math.random().toString(36).substring(2, 9) })),
              expenses: data.taxes.filter(t => t.tax_type === 'EXPENSE').map(i => ({ ...i, _tempId: Math.random().toString(36).substring(2, 9) }))
          }));
          showToast("Cálculo automático completado", "success");
      } catch (e) {
          showToast("Error en el cálculo automático", "error");
      } finally {
          setLoading(false);
      }
  };

  const addItem = () => {
    const newItem = {
      _tempId: Math.random().toString(36).substring(2, 9),
      line_type: itemType,
      activity: '',
      movement: 'Fisico',
      account_code: '',
      description: '',
      quantity: 0,
      unit_price: 0,
      subtotal: 0,
      vat_rate: 0,
      vat_amount: 0,
      total_amount: 0
    };
    setForm(f => ({ ...f, items: [...f.items, newItem] }));
  };

  const addTax = (type) => {
    const newTax = {
      _tempId: Math.random().toString(36).substring(2, 9),
      tax_type: type, 
      category: '',
      jurisdiction: '',
      base_amount: 0,
      rate: 0,
      amount: 0
    };
    if (type === 'PERCEPTION') setForm(f => ({ ...f, perceptions: [...f.perceptions, newTax] }));
    if (type === 'RETENTION') setForm(f => ({ ...f, retentions: [...f.retentions, newTax] }));
    if (type === 'EXPENSE') setForm(f => ({ ...f, expenses: [...f.expenses, newTax] }));
  };

  const updateItem = (tempId, field, value) => {
    const newItems = form.items.map(item => {
        if (item._tempId !== tempId) return item;
        const newItem = { ...item, [field]: value };
        if (['quantity', 'unit_price', 'vat_rate'].includes(field)) {
            const q = parseFloat(newItem.quantity || 0);
            const p = parseFloat(newItem.unit_price || 0);
            const v = parseFloat(newItem.vat_rate || 0);
            newItem.subtotal = q * p;
            newItem.vat_amount = (q * p * v) / 100;
            newItem.total_amount = (q * p) + newItem.vat_amount;
        }
        return newItem;
    });
    setForm(f => ({ ...f, items: newItems }));
  };

  const updateTax = (listName, tempId, field, value) => {
    const newList = form[listName].map(tax => {
        if (tax._tempId !== tempId) return tax;
        const newTax = { ...tax, [field]: value };
        if (field === 'rate' || field === 'base_amount') {
            newTax.amount = (parseFloat(newTax.base_amount || 0) * parseFloat(newTax.rate || 0)) / 100;
        }
        return newTax;
    });
    setForm(f => ({ ...f, [listName]: newList }));
  };

  const totals = {
    subtotal: form.items.reduce((acc, i) => acc + (i.line_type === 'DEBITO' ? i.subtotal : -i.subtotal), 0),
    vat: form.items.reduce((acc, i) => acc + (i.line_type === 'DEBITO' ? i.vat_amount : -i.vat_amount), 0),
    perceptions: form.perceptions.reduce((acc, p) => acc + parseFloat(p.amount || 0), 0),
    retentions: form.retentions.reduce((acc, r) => acc + parseFloat(r.amount || 0), 0),
    expenses: form.expenses.reduce((acc, e) => acc + parseFloat(e.amount || 0), 0),
    net: 0 
  };
  totals.net = totals.subtotal + totals.vat + totals.perceptions - totals.retentions - totals.expenses;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        total_kilos: parseFloat(form.total_kilos),
        price_per_ton: parseFloat(form.price_per_ton),
        exchange_rate: parseFloat(form.exchange_rate || 1),
        cost_center: parseInt(form.cost_center || '1'),
        gross_amount: totals.subtotal,
        vat_amount: totals.vat,
        perceptions_amount: totals.perceptions,
        retentions_amount: totals.retentions,
        expenses_amount: totals.expenses,
        net_amount: totals.net,
        items: form.items.map(i => ({...i, line_type: i.line_type === 'DEBITO' ? 'DEBIT' : 'CREDIT'})),
        taxes: [
            ...form.perceptions.map(p => ({...p, tax_type: 'PERCEPTION'})),
            ...form.retentions.map(r => ({...r, tax_type: 'RETENTION'})),
            ...form.expenses.map(e => ({...e, tax_type: 'EXPENSE'}))
        ]
      };

      await api.post('/grains/settlements', payload);

      showToast("LPG registrada correctamente", "success");
      onSuccess();
      onClose();
    } catch (e) {
      showToast(e.message || "Error al crear liquidación", "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!editingDocId) return;
    try {
      showToast('Generando PDF...', 'info');
      const blob = await api.get(`/accounting/documents/${editingDocId}/pdf`, null, { responseType: 'blob' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Liquidacion_${form.number || editingDocId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast('PDF descargado', 'success');
    } catch (err) {
      showToast('Error al descargar PDF', 'error');
    }
  };

  return (
    <div className={s.overlay}>
      <div className={s.modal}>
        <header className={s.header}>
          <div className={s.modalHeader}>
            <div className={s.headerMain}>
              <div className={s.iconCircleHeader}>
                 <Package size={24} color="var(--primary)" />
              </div>
              <div className={s.headerTexts}>
                 <h2 className={s.modalTitle}>
                   {editingDocId ? 'Detalle de' : 'Nueva'} {form.settlement_type === 'PRIMARY' ? 'LPG' : 'LSG'}
                   <span className={s.badgeType}>{form.settlement_type === 'PRIMARY' ? 'PRIMARIA' : 'SECUNDARIA'}</span>
                 </h2>
                 <p className={s.modalSubtitle}>Gestión profesional de liquidación de granos</p>
              </div>
            </div>
            
            <button className={s.closeBtn} onClick={handleClose}>
              <X size={20} />
            </button>
          </div>
        </header>

        <form onSubmit={handleSubmit} className={s.mainForm}>
          <div className={s.headerGrid}>
             <div className={s.field}>
                <label>Fecha Imput.</label>
                <Input type="date" value={form.input_date} onChange={e => setForm({...form, input_date: e.target.value})} />
             </div>
             <div className={s.field}>
                <label>Fecha Comprob.</label>
                <Input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
             </div>
             <div className={s.field} style={{flex: 2}}>
                <label>Proveedor</label>
                <Select required value={form.entity_id} onChange={e => setForm({...form, entity_id: e.target.value})}>
                   <option value="">Seleccionar...</option>
                   {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </Select>
             </div>
             <div className={s.field}>
                <label>Tipo Comprobante</label>
                <Select value={form.settlement_type} onChange={e => setForm({...form, settlement_type: e.target.value})}>
                   <option value="PRIMARY">Liq. Primaria de Granos</option>
                   <option value="SECONDARY">Liq. Secundaria de Granos</option>
                </Select>
             </div>
             <div className={s.field}>
                <label>Número - COE</label>
                <div style={{display: 'flex', gap: 4}}>
                   <Input value={form.number} onChange={e => setForm({...form, number: e.target.value})} placeholder="3301" style={{width: 60}} />
                   <Input value={form.coe_number} onChange={e => setForm({...form, coe_number: e.target.value})} placeholder="00000000" />
                </div>
             </div>
          </div>

          <div className={s.headerGrid} style={{marginTop: 8}}>
             <div className={s.field}>
                <label>Moneda</label>
                <Select value={form.currency} onChange={e => setForm({...form, currency: e.target.value})} style={{width: 100}}>
                   <option value="ARS">Peso</option>
                   <option value="USD">Dólar</option>
                </Select>
             </div>
             <div className={s.field}>
                <label>Cotización</label>
                <Input value={form.exchange_rate} onChange={e => setForm({...form, exchange_rate: e.target.value})} style={{width: 100}} />
             </div>
             <div className={s.field} style={{flex: 1}}>
                <label>Observaciones</label>
                <Input value={form.observations} onChange={e => setForm({...form, observations: e.target.value})} />
             </div>
          </div>

          <div className={s.headerGrid} style={{marginTop: 8}}>
             <div className={s.field}>
                <label>Canje</label>
                <Select readOnly style={{width: 80}}><option>Total</option></Select>
             </div>
             <div className={s.field}>
                <label>SISA</label>
                <Input value={form.sisa_status} onChange={e => setForm({...form, sisa_status: e.target.value})} style={{width: 100}} />
             </div>
             <div className={s.field}>
                <label>Precio Ton.</label>
                <Input value={form.price_per_ton} onChange={e => setForm({...form, price_per_ton: e.target.value})} style={{width: 100}} />
             </div>
             <div className={s.field}>
                <label>Grano</label>
                <Select required value={form.grain_type_id} onChange={e => setForm({...form, grain_type_id: e.target.value})}>
                   <option value="">Seleccionar...</option>
                   {grains.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </Select>
             </div>
             <div className={s.field}>
                <label>Campaña</label>
                <Select required value={form.harvest_id} onChange={e => setForm({...form, harvest_id: e.target.value})}>
                   <option value="">Seleccionar...</option>
                   {harvests.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </Select>
             </div>
              <div className={s.field}>
                 <label>Corredor</label>
                 <Select value={form.broker_id} onChange={e => setForm({...form, broker_id: e.target.value})}>
                    <option value="">(Sin corredor)</option>
                    {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                 </Select>
              </div>
              <div className={s.field} style={{justifyContent: 'flex-end', display: 'flex', gap: 8}}>
                 <Button type="button" variant="outline" size="sm" onClick={fetchPendings} style={{marginTop: 22, color: 'var(--primary)', borderColor: 'var(--primary)'}}>
                    <ChevronRight size={16}/> Cargar Movimientos
                 </Button>
                 <Button type="button" variant="primary" size="sm" onClick={handleCalculate} style={{marginTop: 22}}>
                    <RefreshCw size={16}/> Calcular
                 </Button>
              </div>
           </div>

          <div className={s.tabsContainer}>
             <div className={s.tabBar}>
                {TABS.map(t => (
                   <button 
                     key={t.id} 
                     type="button"
                     className={`${s.tabBtn} ${activeTab === t.id ? s.activeTab : ''}`}
                     onClick={() => setActiveTab(t.id)}
                   >
                     {t.label}
                   </button>
                ))}
             </div>

             <div className={s.tabContent}>
                {activeTab === 'items' && (
                   <div className={s.itemsLayout}>
                      <div className={s.subTabContainer}>
                         <div className={s.subTabBar}>
                            <button 
                              type="button" 
                              className={`${s.subTabBtn} ${itemType === 'DEBITO' ? s.activeSubTab : ''}`} 
                              onClick={() => setItemType('DEBITO')}
                            >
                               DÉBITOS
                            </button>
                            <button 
                              type="button" 
                              className={`${s.subTabBtn} ${itemType === 'CREDITOS' ? s.activeSubTab : ''}`} 
                              onClick={() => setItemType('CREDITOS')}
                            >
                               CRÉDITOS
                            </button>
                         </div>
                         
                         <div className={s.gridContainer}>
                            <table className={s.itemTable}>
                               <thead>
                                  <tr>
                                     <th>Actividad</th>
                                     <th>Detalle</th>
                                     <th>Cantidad</th>
                                     <th>Precio Unit</th>
                                     <th>Subtotal</th>
                                     <th>% IVA</th>
                                     <th>IVA</th>
                                     <th>Importe</th>
                                     <th style={{width: 30}}></th>
                                  </tr>
                               </thead>
                               <tbody>
                                  {form.items.filter(i => i.line_type === itemType).map((item, idx) => (
                                        <tr key={item._tempId || idx}>
                                           <td><Input value={item.activity} onChange={e => updateItem(item._tempId, 'activity', e.target.value)} size="small" /></td>
                                           <td><Input value={item.description} onChange={e => updateItem(item._tempId, 'description', e.target.value)} size="small" /></td>
                                           <td><Input type="number" value={item.quantity} onChange={e => updateItem(item._tempId, 'quantity', e.target.value)} size="small" /></td>
                                           <td><Input type="number" value={item.unit_price} onChange={e => updateItem(item._tempId, 'unit_price', e.target.value)} size="small" /></td>
                                           <td className={s.readonlyVal}>{item.subtotal.toFixed(2)}</td>
                                           <td><Input type="number" value={item.vat_rate} onChange={e => updateItem(item._tempId, 'vat_rate', e.target.value)} size="small" style={{width: 50}} /></td>
                                           <td className={s.readonlyVal}>{item.vat_amount.toFixed(2)}</td>
                                           <td className={s.readonlyVal} style={{fontWeight: 700}}>{item.total_amount.toFixed(2)}</td>
                                           <td><button type="button" className={s.delBtn} onClick={() => {
                                              const newItems = form.items.filter(i => i._tempId !== item._tempId);
                                              setForm({...form, items: newItems});
                                           }}><Trash2 size={12}/></button></td>
                                        </tr>
                                  ))}
                                  <tr>
                                     <td colSpan={9}>
                                        <button type="button" className={s.addRowBtn} onClick={addItem}>
                                           <Plus size={14}/> Click para agregar un nuevo renglón a {itemType === 'DEBITO' ? 'Débitos' : 'Créditos'}
                                        </button>
                                     </td>
                                  </tr>
                               </tbody>
                            </table>
                            <div className={s.tabFooter}>
                               <span className={s.totalVal}>Total {itemType === 'DEBITO' ? 'Débitos' : 'Créditos'}: {fmt(form.items.filter(i => i.line_type === itemType).reduce((a,c) => a+c.total_amount, 0), form.currency)}</span>
                            </div>
                         </div>
                      </div>
                   </div>
                )}
                {activeTab === 'percepciones' && (
                   <div className={s.gridContainer}>
                      <table className={s.itemTable}>
                         <thead>
                            <tr><th>Impuesto / Categoría</th><th>Jurisdicción</th><th>Base Imponible</th><th>Alicuota %</th><th>Importe</th><th style={{width: 30}}></th></tr>
                         </thead>
                         <tbody>
                            {form.perceptions.map((p, idx) => (
                               <tr key={p._tempId || idx}>
                                  <td><Input value={p.category} onChange={e => updateTax('perceptions', p._tempId, 'category', e.target.value)} size="small" /></td>
                                  <td><Input value={p.jurisdiction} onChange={e => updateTax('perceptions', p._tempId, 'jurisdiction', e.target.value)} size="small" /></td>
                                  <td><Input type="number" value={p.base_amount} onChange={e => updateTax('perceptions', p._tempId, 'base_amount', e.target.value)} size="small" /></td>
                                  <td><Input type="number" value={p.rate} onChange={e => updateTax('perceptions', p._tempId, 'rate', e.target.value)} size="small" /></td>
                                  <td className={s.readonlyVal}>{p.amount.toFixed(2)}</td>
                                  <td><button type="button" className={s.delBtn} onClick={() => setForm(f => ({...f, perceptions: f.perceptions.filter(x => x._tempId !== p._tempId)}))}><Trash2 size={12}/></button></td>
                               </tr>
                            ))}
                            <tr><td colSpan={6}><button type="button" className={s.addRowBtn} onClick={() => addTax('PERCEPTION')}><Plus size={14}/> Agregar Percepción</button></td></tr>
                         </tbody>
                      </table>
                   </div>
                )}
                {activeTab === 'retenciones' && (
                   <div className={s.gridContainer}>
                      <table className={s.itemTable}>
                         <thead>
                            <tr><th>Tipo / Categoría</th><th>Jurisdicción</th><th>Base Imponible</th><th>Alicuota %</th><th>Importe</th><th style={{width: 30}}></th></tr>
                         </thead>
                         <tbody>
                            {form.retentions.map((r, idx) => (
                               <tr key={r._tempId || idx}>
                                  <td><Input value={r.category} onChange={e => updateTax('retentions', r._tempId, 'category', e.target.value)} size="small" /></td>
                                  <td><Input value={r.jurisdiction} onChange={e => updateTax('retentions', r._tempId, 'jurisdiction', e.target.value)} size="small" /></td>
                                  <td><Input type="number" value={r.base_amount} onChange={e => updateTax('retentions', r._tempId, 'base_amount', e.target.value)} size="small" /></td>
                                  <td><Input type="number" value={r.rate} onChange={e => updateTax('retentions', r._tempId, 'rate', e.target.value)} size="small" /></td>
                                  <td className={s.readonlyVal}>{r.amount.toFixed(2)}</td>
                                  <td><button type="button" className={s.delBtn} onClick={() => setForm(f => ({...f, retentions: f.retentions.filter(x => x._tempId !== r._tempId)}))}><Trash2 size={12}/></button></td>
                               </tr>
                            ))}
                            <tr><td colSpan={6}><button type="button" className={s.addRowBtn} onClick={() => addTax('RETENTION')}><Plus size={14}/> Agregar Retención</button></td></tr>
                         </tbody>
                      </table>
                   </div>
                )}
                {activeTab === 'gastos' && (
                   <div className={s.gridContainer}>
                      <table className={s.itemTable}>
                         <thead>
                            <tr><th>Gasto / Concepto</th><th>Cuenta Contable</th><th>Cantidad</th><th>Precio</th><th>IVA %</th><th>Importe</th><th style={{width: 30}}></th></tr>
                         </thead>
                         <tbody>
                            {form.expenses.map((ex, idx) => (
                               <tr key={ex._tempId || idx}>
                                  <td><Input value={ex.category} onChange={e => updateTax('expenses', ex._tempId, 'category', e.target.value)} size="small" /></td>
                                  <td><Input value={ex.jurisdiction} placeholder="Cuenta..." onChange={e => updateTax('expenses', ex._tempId, 'jurisdiction', e.target.value)} size="small" /></td>
                                  <td><Input type="number" value={ex.base_amount} onChange={e => updateTax('expenses', ex._tempId, 'base_amount', e.target.value)} size="small" /></td>
                                  <td><Input type="number" value={ex.rate} onChange={e => updateTax('expenses', ex._tempId, 'rate', e.target.value)} size="small" /></td>
                                  <td><Input value="10.5" readOnly size="small" style={{width: 40}} /></td>
                                  <td className={s.readonlyVal}>{(ex.base_amount * ex.rate).toFixed(2)}</td>
                                  <td><button type="button" className={s.delBtn} onClick={() => setForm(f => ({...f, expenses: f.expenses.filter(x => x._tempId !== ex._tempId)}))}><Trash2 size={12}/></button></td>
                               </tr>
                            ))}
                            <tr><td colSpan={7}><button type="button" className={s.addRowBtn} onClick={() => addTax('EXPENSE')}><Plus size={14}/> Agregar Gasto</button></td></tr>
                         </tbody>
                      </table>
                   </div>
                )}
                {!['items', 'percepciones', 'retenciones', 'gastos'].includes(activeTab) && <div className={s.emptyTab}>Sección {activeTab} en desarrollo.</div>}
             </div>
          </div>

          <footer className={s.modalFooter}>
             <div className={s.footerTotals}>
                <div className={s.totalGroup}>
                   <label>Subtotal items</label>
                   <div className={s.totalBox}>{totals.subtotal.toFixed(2)}</div>
                </div>
                <div className={s.totalGroup}>
                   <label>IVA s/items</label>
                   <div className={s.totalBox}>{totals.vat.toFixed(2)}</div>
                </div>
                <div className={s.totalGroup}>
                   <label>Percepciones</label>
                   <div className={s.totalBox}>{totals.perceptions.toFixed(2)}</div>
                </div>
                <div className={s.totalGroup}>
                   <label>Retenciones</label>
                   <div className={s.totalBox}>{totals.retentions.toFixed(2)}</div>
                </div>
                <div className={s.totalGroup}>
                   <label>Subtotal gastos</label>
                   <div className={s.totalBox}>{totals.expenses.toFixed(2)}</div>
                </div>
                <div className={s.totalGroup} style={{marginLeft: 'auto'}}>
                   <label style={{color: '#4f46e5', fontWeight: 900}}>Importe Total</label>
                   <div className={`${s.totalBox} ${s.totalHighlight}`}>{totals.net.toFixed(2)}</div>
                </div>
             </div>
             <div className={s.actionRow}>
                 {editingDocId ? (
                   <>
                    <Button variant="outline" type="button" onClick={handlePrint}>
                      <Printer size={18} /> Imprimir PDF
                    </Button>
                    <Button variant="outline" type="button" onClick={onClose}>Cerrar</Button>
                   </>
                 ) : (
                    <>
                      <Button variant="outline" type="button" onClick={onClose}>Cancelar</Button>
                      <Button variant="primary" onClick={handleSubmit} loading={loading}>
                        <Save size={18} /> Guardar Liquidación
                      </Button>
                    </>
                 )}
             </div>
          </footer>
        </form>
      </div>
      
      {showMovementsPicker && (
          <div className={s.pickerOverlay}>
              <div className={s.pickerModal}>
                  <div className={s.pickerHeader}>
                      <h3>Vincular Movimientos Pendientes</h3>
                      <button onClick={() => setShowMovementsPicker(false)}><X size={18}/></button>
                  </div>
                  <div className={s.pickerBody}>
                      <p>Seleccione los movimientos para incluir en esta liquidación:</p>
                      <table className={s.pickerTable}>
                          <thead>
                              <tr>
                                  <th><Input type="checkbox" onChange={(e) => {
                                      if (e.target.checked) setForm(f => ({...f, movement_ids: pendings.map(p => p.id)}));
                                      else setForm(f => ({...f, movement_ids: []}));
                                  }} /></th>
                                  <th>Fecha</th>
                                  <th>CPE / Ticket</th>
                                  <th>Kilos Netos</th>
                                  <th>Cosecha</th>
                                  <th>Contrato</th>
                              </tr>
                          </thead>
                          <tbody>
                              {pendings.map(p => (
                                  <tr key={p.id}>
                                      <td>
                                          <input 
                                            type="checkbox" 
                                            checked={form.movement_ids.includes(p.id)} 
                                            onChange={(e) => {
                                                if (e.target.checked) setForm(f => ({...f, movement_ids: [...f.movement_ids, p.id]}));
                                                else setForm(f => ({...f, movement_ids: f.movement_ids.filter(id => id !== p.id)}));
                                            }}
                                          />
                                      </td>
                                      <td>{new Date(p.date).toLocaleDateString()}</td>
                                      <td>{p.cpe_number || p.ticket_number}</td>
                                      <td style={{fontWeight: 700}}>{parseFloat(p.clean_kilos).toLocaleString()} kg</td>
                                      <td>{p.harvest_name}</td>
                                      <td>{p.contract_number}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
                  <footer className={s.pickerFooter}>
                      <Button variant="outline" onClick={() => setShowMovementsPicker(false)}>Cancelar</Button>
                      <Button variant="primary" onClick={() => handleApplyMovements(form.movement_ids)}>
                          Cargar {form.movement_ids.length} Movimientos
                      </Button>
                  </footer>
              </div>
          </div>
      )}
    </div>
  );
}
