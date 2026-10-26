import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import s from './ServiceWorksPage.module.css';

const ACT = { DRONE: 'Dron y aplicaciones', FREIGHT: 'Fletes', OTHER_SERVICES: 'Otros servicios' };
const STATUS = { PLANNED: 'Planificado', IN_PROGRESS: 'En curso', COMPLETED: 'Realizado', CANCELLED: 'Anulado' };
const CAT = { LABOR: 'Personal', FUEL: 'Combustible', REPAIR: 'Reparaciones', OTHER: 'Otros costos' };
const today = () => new Date().toLocaleDateString('en-CA');
const amount = v => Number(v || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const freshWork = () => ({ description: '', date: today(), entity_id: '', farm_id: '', product_id: '', machinery_id: '', vehicle_id: '', activity: 'DRONE', unit: 'HA', quantity: '', unit_price: '', vat_rate: '.21', currency: 'ARS', exchange_rate: 1, cost_center: Number(localStorage.getItem('costCenter') || 1) === 2 ? 2 : 1, status: 'PLANNED', notes: '' });
const freshCost = () => ({ category: 'LABOR', description: '', employee_id: '', account_id: '', unit: 'H', quantity: '', unit_cost: '', currency: 'ARS', exchange_rate: 1, date: today() });
function Select({ label, value, onChange, options, required = true }) {
  return <label>{label}<select required={required} value={value || ''} onChange={e => onChange(e.target.value)}><option value="">Seleccionar…</option>{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>;
}
function Input({ label, field, data, set, type = 'text', ...props }) {
  return <label>{label}<input required type={type} value={data[field] ?? ''} onChange={e => set({ ...data, [field]: e.target.value })} {...props}/></label>;
}
const errorText = e => Array.isArray(e.data?.detail) ? e.data.detail.map(d => d.msg).join('; ') : e.message;
const options = dict => Object.entries(dict).map(([id, name]) => ({ id, name }));

export default function ServiceWorksPage() {
  const [works, setWorks] = useState([]), [catalog, setCatalog] = useState(null);
  const [client, setClient] = useState(''), [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState({}), [detailId, setDetailId] = useState(null);
  const [cost, setCost] = useState(null), [review, setReview] = useState(false);
  const [invoice, setInvoice] = useState({ date: today(), letter: 'A', exchange_rate: '' });
  const [plan, setPlan] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const attempt = useRef(null);
  const detail = works.find(w => w.id === detailId);
  const chosen = works.filter(w => selected[w.id] !== undefined);
  async function load() {
    const [rows, masters] = await Promise.all([api.get('/service-works'), api.get('/service-works/catalogs')]);
    setWorks(rows); setCatalog(masters);
  }
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  async function run(action) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(errorText(e) || 'Revise los datos ingresados'); }
    finally { setBusy(false); }
  }
  async function quote(setter, data) {
    try {
      const q = await api.get(`/accounting/fx/usd?side=sell&date=${data.date}`);
      if (!(Number(q.rate) > 0)) throw new Error('Cotización inválida');
      setter(current => current.date === data.date && current.currency === data.currency && current.exchange_rate === data.exchange_rate ? { ...current, exchange_rate: q.rate } : current);
    } catch {
      // Sin advertencias por cierres bancarios o fallos temporales:
      // el tipo de cambio sigue siendo editable y obligatorio al facturar.
    }
  }
  function currency(setter, data, value) {
    const next = { ...data, currency: value, exchange_rate: value === 'ARS' ? 1 : '' };
    setter(next); if (value === 'USD') quote(setter, next);
  }
  async function saveWork(e) {
    e.preventDefault(); await run(async () => {
      const payload = { ...editing, machinery_id: editing.machinery_id || null, vehicle_id: editing.vehicle_id || null };
      if (editing.id) await api.put(`/service-works/${editing.id}`, payload);
      else await api.post('/service-works', payload);
      setEditing(null); await load(); setNotice('Trabajo guardado');
    });
  }
  async function saveCost(e) {
    e.preventDefault(); await run(async () => {
      const payload = { ...cost, employee_id: cost.employee_id || null };
      if (cost.id) await api.put(`/service-works/${detail.id}/costs/${cost.id}`, payload);
      else await api.post(`/service-works/${detail.id}/costs`, payload);
      setCost(null); await load(); setNotice('Costo guardado');
    });
  }
  function costCategory(value) {
    const prefix = { DRONE: '3', FREIGHT: '4', OTHER_SERVICES: '9' }[detail.activity];
    const suffix = { LABOR: '001', FUEL: '002', REPAIR: '003', OTHER: '099' }[value];
    const account = catalog.accounts.find(a => a.code === `5.1.${prefix}.${suffix}`);
    setCost({ ...cost, category: value, unit: value === 'LABOR' ? 'H' : 'UNIT', employee_id: '', account_id: account?.id || '' });
  }
  async function openReview() {
    if (!chosen.length) return;
    if (chosen.some(w => w.entity_id !== chosen[0].entity_id || w.currency !== chosen[0].currency || w.cost_center !== chosen[0].cost_center)) {
      setError('Seleccione trabajos del mismo cliente, moneda y centro de costos'); return;
    }
    setError(''); setReview(true);
    const data = { ...invoice, exchange_rate: chosen[0].currency === 'ARS' ? 1 : '' };
    setInvoice(data); if (chosen[0].currency === 'USD') await quote(setInvoice, data);
  }
  async function bill(e) {
    e.preventDefault(); await run(async () => {
      const payload = { ...invoice, cost_center: chosen[0].cost_center, items: chosen.map(w => ({ work_id: w.id, quantity: selected[w.id] })) };
      const fingerprint = JSON.stringify(payload);
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID ? crypto.randomUUID() : `service-${Date.now()}-${Math.random().toString(36).slice(2)}` };
      const doc = await api.post('/service-works/invoice', { ...payload, request_key: attempt.current.key });
      setSelected({}); setReview(false); attempt.current = null; await load();
      setNotice(`${doc.is_draft === false ? "Factura interna" : "Borrador"} ${doc.number} creado. No se registró en ARCA.`);
    });
  }
  const activityTotals = Object.keys(ACT).map(key => {
    const rows = works.filter(w => w.activity===key && w.status!=='CANCELLED' && (!client || w.entity_id===client));
    const sum = field => rows.reduce((total,w) => total+Number(w[field] || 0),0);
    return { key, count:rows.length, quoted:sum('quoted_net_ars'), billed:sum('invoiced_net_ars'), costs:sum('costs_ars') };
  });
  const totalNet = chosen.reduce((sum,w) => sum + Number(selected[w.id] || 0)*Number(w.unit_price),0);
  const totalVat = chosen.reduce((sum,w) => sum + Number(selected[w.id] || 0)*Number(w.unit_price)*Number(w.vat_rate),0);
  if (!catalog) return <main className={s.page}>{error ? <p role="alert">{error}</p> : 'Cargando servicios…'}</main>;
  return <main className={s.page}>
    <header className={s.header}><div><h1>Servicios y trabajos</h1><p>Planificación, costos y facturación por hectárea o kilómetro.</p></div><div className={s.actions}>
      <button onClick={() => { setEditing(freshWork()); setError(''); }}>Nuevo trabajo</button>
      <button onClick={() => run(async () => setPlan(await api.get('/service-works/account-plan')))}>Plan de cuentas inicial</button>
    </div></header>
    {error && <p className={s.error} role="alert">{error}</p>}{notice && <p className={s.notice} role="status">{notice}</p>}
    {plan && <section className={s.panel}><h2>Propuesta para revisar con el contador</h2><p>Cuentas separadas para insumos, granos, dron y fletes. Las cuentas existentes conservan su configuración.</p>
      <div className={s.scroll}><table><thead><tr><th>Código</th><th>Nombre propuesto</th><th>Cuenta existente</th></tr></thead><tbody>{plan.map(a => <tr key={a.code}><td>{a.code}</td><td>{a.name}</td><td>{a.existing_name || 'Por agregar'}</td></tr>)}</tbody></table></div>
      <div className={s.actions}><button disabled={busy} onClick={() => run(async () => { const r = await api.post('/service-works/account-plan', {}); await load(); setPlan(await api.get('/service-works/account-plan')); setNotice(`${r.created.length} cuentas agregadas`); })}>Agregar cuentas faltantes</button><button onClick={() => setPlan(null)}>Cerrar propuesta</button></div>
    </section>}
    {editing && <form className={s.panel} onSubmit={saveWork}><h2>{editing.id ? 'Editar trabajo' : 'Nuevo trabajo'}</h2><div className={s.grid}>
      <Input label="Descripción del trabajo" field="description" data={editing} set={setEditing}/><Input label="Fecha" field="date" type="date" data={editing} set={setEditing}/>
      <Select label="Cliente" value={editing.entity_id} onChange={v => setEditing({ ...editing, entity_id:v })} options={catalog.entities.filter(e => ['client','mixed'].includes(e.type))}/>
      <Select label="Campo / establecimiento" value={editing.farm_id} onChange={v => setEditing({ ...editing, farm_id:v })} options={catalog.farms}/>
      <Select label="Actividad" value={editing.activity} onChange={v => setEditing({ ...editing, activity:v })} options={options(ACT)}/>
      <Select label="Servicio del catálogo" value={editing.product_id} onChange={v => setEditing({ ...editing, product_id:v })} options={catalog.products}/>
      <Select required={false} label="Equipo / dron" value={editing.machinery_id} onChange={v => setEditing({ ...editing, machinery_id:v })} options={catalog.machinery}/>
      <Select required={false} label="Vehículo" value={editing.vehicle_id} onChange={v => setEditing({ ...editing, vehicle_id:v })} options={catalog.vehicles}/>
      <Select label="Unidad de cobro" value={editing.unit} onChange={v => setEditing({ ...editing, unit:v })} options={options({ HA:'Hectáreas', KM:'Kilómetros' })}/>
      <Input label="Cantidad del trabajo" field="quantity" type="number" min="0.000001" step="any" data={editing} set={setEditing}/>
      <Input label="Precio neto por unidad" field="unit_price" type="number" min="0" step="any" data={editing} set={setEditing}/>
      <Select label="IVA" value={String(editing.vat_rate)} onChange={v => setEditing({ ...editing, vat_rate:v })} options={options({ '0':'0%', '.105':'10,5%', '.21':'21%', '.27':'27%' })}/>
      <Select label="Moneda" value={editing.currency} onChange={v => currency(setEditing,editing,v)} options={options({ ARS:'Pesos', USD:'USD' })}/>
      <Input label="TC aplicado (ARS por USD)" field="exchange_rate" type="number" min="0.000001" step="any" data={editing} set={setEditing} disabled={editing.currency==='ARS'}/>
      <Select label="Estado del trabajo" value={editing.status} onChange={v => setEditing({ ...editing, status:v })} options={options(STATUS)}/>
      <Select label="Centro de costos" value={String(editing.cost_center)} onChange={v => setEditing({ ...editing, cost_center:Number(v) })} options={options({ '1':'Fiscal', '2':'Interno' })}/>
    </div><label>Observaciones<textarea value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes:e.target.value })}/></label>
      {!catalog.products.length && <p>Primero dé de alta un producto de tipo servicio en el catálogo.</p>}
      <p>Seleccione al menos un equipo o vehículo. Después de guardar puede asignar empleados y cargar sus costos.</p>
      <div className={s.actions}><button disabled={busy}>Guardar trabajo</button><button type="button" onClick={() => setEditing(null)}>Cancelar edición</button></div>
    </form>}
    <section className={s.panel}><div className={s.header}><Select required={false} label="Filtrar cliente" value={client} onChange={setClient} options={catalog.entities.filter(e => ['client','mixed'].includes(e.type))}/><button disabled={busy || !chosen.length} onClick={openReview}>Revisar factura ({chosen.length})</button></div>
      <div className={s.scroll}><table><thead><tr><th>Seleccionar</th><th>Trabajo / cliente</th><th>Actividad</th><th>Estado</th><th>Realizado / previsto</th><th>Facturado</th><th>Pendiente</th><th>A facturar</th><th>Acciones</th></tr></thead><tbody>
        {works.filter(w => !client || w.entity_id===client).map(w => <tr key={w.id}><td><input aria-label={`Seleccionar ${w.description}`} type="checkbox" disabled={w.status==='CANCELLED' || Number(w.pending_quantity)<=0} checked={selected[w.id]!==undefined} onChange={e => { const next={ ...selected }; if(e.target.checked) next[w.id]=w.pending_quantity; else delete next[w.id]; setSelected(next); }}/></td><td><strong>{w.description}</strong><small>{w.entity_name} · {w.farm_name}</small></td><td>{ACT[w.activity]}</td><td>{STATUS[w.status]}</td><td>{amount(w.quantity)} {w.unit}</td><td>{amount(w.invoiced_quantity)}</td><td>{amount(w.pending_quantity)} {w.unit}</td><td>{selected[w.id]!==undefined && <input aria-label={`Cantidad a facturar ${w.description}`} type="number" min="0.000001" max={w.pending_quantity} step="any" value={selected[w.id]} onChange={e => setSelected({ ...selected,[w.id]:e.target.value })}/>}</td><td><button onClick={() => { setDetailId(w.id); setCost(null); }}>Detalle y costos</button><button disabled={Number(w.invoiced_quantity)>0} onClick={() => setEditing({ ...w,date:w.date.slice(0,10),vat_rate:String(Number(w.vat_rate)).replace(/^0\./,'.') })}>Editar</button></td></tr>)}
        {!works.length && <tr><td colSpan="9">Todavía no hay trabajos cargados.</td></tr>}
      </tbody></table></div>
    </section>
    <section className={s.panel}><h2>Resultados por actividad · ARS</h2><p>Los importes usan el TC guardado en cada trabajo, costo o factura. Los borradores están incluidos en lo facturado.</p><div className={s.scroll}><table><thead><tr><th>Actividad</th><th>Trabajos</th><th>Neto previsto</th><th>Neto facturado</th><th>Costos cargados</th><th>Facturado menos costos</th></tr></thead><tbody>{activityTotals.map(a => <tr key={a.key}><td>{ACT[a.key]}</td><td>{a.count}</td><td>{amount(a.quoted)}</td><td>{amount(a.billed)}</td><td>{amount(a.costs)}</td><td>{amount(a.billed-a.costs)}</td></tr>)}</tbody></table></div></section>
    {review && chosen.length>0 && <form className={s.panel} onSubmit={bill}><h2>Revisión del borrador</h2><p>{chosen[0].entity_name} · {chosen[0].currency} · {chosen.length} trabajos. Cada cantidad seleccionada quedará vinculada a esta factura.</p>
      <div className={s.grid}><Input label="Fecha de factura" field="date" type="date" data={invoice} set={setInvoice}/><Select label="Letra" value={invoice.letter} onChange={v => setInvoice({ ...invoice,letter:v })} options={options({ A:'A', B:'B', C:'C', M:'M' })}/><Input label="TC de factura" field="exchange_rate" type="number" min="0.000001" step="any" data={invoice} set={setInvoice} disabled={chosen[0].currency==='ARS'}/></div>
      <p>Neto estimado: {amount(totalNet)} · IVA: {amount(totalVat)} · Total: <strong>{chosen[0].currency} {amount(totalNet+totalVat)}</strong>. El guardado calcula los redondeos definitivos.</p>
      <p>{chosen[0].cost_center===1 ? "Se guardará como borrador y sumará a la cuenta corriente." : "Se guardará como factura interna y sumará a la cuenta corriente."} No se registra en ARCA.</p><div className={s.actions}><button disabled={busy}>{chosen[0].cost_center===1 ? "Crear borrador de factura" : "Guardar factura interna"}</button><button type="button" onClick={() => setReview(false)}>Volver</button></div>
    </form>}
    {detail && <section className={s.panel}><h2>{detail.description}</h2><p>{detail.farm_name} · {detail.machinery_name || detail.vehicle_name} · {detail.currency} {amount(detail.unit_price)} / {detail.unit}</p>
      <div className={s.metrics}><div>Neto previsto ARS<strong>{amount(detail.quoted_net_ars)}</strong></div><div>Facturado neto ARS<strong>{amount(detail.invoiced_net_ars)}</strong></div><div>Costos cargados ARS<strong>{amount(detail.costs_ars)}</strong></div><div>Margen previsto ARS<strong>{amount(detail.estimated_margin_ars)}</strong></div></div>
      <p>Resultado estimado sobre los costos cargados, sin IVA. Los costos del trabajo no generan pagos ni duplican comprobantes de gastos.</p>
      <h3>Empleados y costos</h3><button disabled={detail.status==='CANCELLED'} onClick={() => setCost(freshCost())}>Agregar empleado / costo</button>
      <div className={s.scroll}><table><thead><tr><th>Concepto</th><th>Empleado</th><th>Cálculo</th><th>Costo ARS</th><th>Acciones</th></tr></thead><tbody>{detail.costs.map(c => <tr key={c.id}><td>{CAT[c.category]} · {c.description}</td><td>{c.employee_name || '—'}</td><td>{amount(c.quantity)} {c.unit} × {c.currency} {amount(c.unit_cost)}</td><td>{amount(c.total_ars)}</td><td><button disabled={detail.status==='CANCELLED'} onClick={() => setCost({ ...c,date:c.date.slice(0,10) })}>Editar costo</button><button disabled={busy || detail.status==='CANCELLED'} onClick={() => { if(window.confirm('¿Eliminar este costo del trabajo?')) run(async () => { await api.delete(`/service-works/${detail.id}/costs/${c.id}`); await load(); }); }}>Eliminar costo</button></td></tr>)}</tbody></table></div>
      {cost && <form onSubmit={saveCost}><div className={s.grid}>
        <Select label="Tipo de costo" value={cost.category} onChange={costCategory} options={options(CAT)}/><Input label="Detalle del costo" field="description" data={cost} set={setCost}/>
        <Select required={cost.category==='LABOR'} label="Empleado" value={cost.employee_id} onChange={v => setCost({ ...cost,employee_id:v })} options={catalog.entities.filter(e => e.type==='employee')}/>
        <Select label="Modalidad de costo" value={cost.unit} onChange={v => setCost({ ...cost,unit:v })} options={options(cost.category==='LABOR' ? { H:'Horas',HA:'Hectáreas',KM:'Kilómetros' } : { UNIT:'Unidades / importe único',H:'Horas',HA:'Hectáreas',KM:'Kilómetros' })}/>
        <Input label="Cantidad de costo" field="quantity" type="number" min="0.000001" step="any" data={cost} set={setCost}/><Input label="Tarifa / costo neto unitario" field="unit_cost" type="number" min="0" step="any" data={cost} set={setCost}/>
        <Select label="Cuenta de costo" value={cost.account_id} onChange={v => setCost({ ...cost,account_id:v })} options={catalog.accounts.map(a => ({ ...a,name:`${a.code} · ${a.name}` }))}/>
        <Input label="Fecha del costo" field="date" type="date" data={cost} set={setCost}/><Select label="Moneda del costo" value={cost.currency} onChange={v => currency(setCost,cost,v)} options={options({ ARS:'Pesos',USD:'USD' })}/><Input label="TC del costo" field="exchange_rate" type="number" min="0.000001" step="any" data={cost} set={setCost} disabled={cost.currency==='ARS'}/>
      </div><div className={s.actions}><button disabled={busy}>Guardar costo</button><button type="button" onClick={() => setCost(null)}>Cancelar costo</button></div></form>}
      <h3>Facturas vinculadas</h3>{detail.invoices.map(i => <p key={i.id}>{i.number} · {amount(i.quantity)} {detail.unit} · {i.is_draft ? 'BORRADOR' : 'Registrada'}</p>)}<Link to="/ventas/facturas">Abrir listado de facturas</Link>
    </section>}
  </main>;
}
