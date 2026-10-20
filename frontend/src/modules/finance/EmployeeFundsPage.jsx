import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import ExpenseClaimsPage from './ExpenseClaimsPage';
import s from './EmployeeFundsPage.module.css';

const kinds={ADVANCE:'Adelanto para gastos',RETURN:'Devolución del empleado',REIMBURSE:'Reintegro al empleado',FX:'Conversión de moneda',CLAIM:'Rendición aprobada'};
const modules={employee_expenses:'Rendiciones',employee_expenses_all:'Acceso a otros empleados (Ver)',employee_review:'Revisión (Crear: aprobar; Editar: devolver)',employee_funds:'Movimientos de fondos (Crear)',employee_reconciliation:'Cortes (Crear: marcar; Editar: conciliar)'};
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const empty=()=>({kind:'ADVANCE',currency:'ARS',amount:'',exchange_rate:1,date:today(),description:'',treasury_account:'',payment_method:'TRANSFER',cost_center:1});
const errorText=e=>Array.isArray(e.data?.detail)?e.data.detail.map(x=>x.msg).join('; '):e.message;
const fmt=value=>Number(value||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});

export default function EmployeeFundsPage(){
  const {can}=useAuth();
  const [catalog,setCatalog]=useState({employees:[],accounts:[]}),[entity,setEntity]=useState('');
  const [statement,setStatement]=useState(null),[form,setForm]=useState(empty),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [users,setUsers]=useState([]),[selectedUser,setSelectedUser]=useState(''),[employeeLink,setEmployeeLink]=useState(''),[overrides,setOverrides]=useState({});
  const request=useRef(null),generation=useRef(0);
  const [cutForm,setCutForm]=useState({cutoff_date:today(),reason:''}),[resolution,setResolution]=useState('');
  useEffect(()=>{api.get('/employee-funds/catalogs').then(data=>{setCatalog(data);if(data.employees.length===1)setEntity(data.employees[0].id);}).catch(e=>setMessage(errorText(e)));
    if(can('users','view'))api.get('/employee-funds/access').then(setUsers).catch(e=>setMessage(errorText(e)));
  },[]);
  async function refresh(){
    const version=++generation.current;setStatement(null);
    if(!entity)return;
    try{const data=await api.get(`/employee-funds/${entity}`);if(version===generation.current)setStatement(data);}catch(e){setMessage(errorText(e));}
  }
  useEffect(()=>{refresh();},[entity]);
  const field=(name,value)=>setForm(prev=>({...prev,[name]:value}));
  async function save(e){
    e.preventDefault();setBusy(true);setMessage('');
    const data={...form,entity_id:entity,amount:String(form.amount),exchange_rate:String(form.exchange_rate)};
    const signature=JSON.stringify(data);
    if(request.current?.signature!==signature)request.current={signature,key:globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`};
    try{await api.post('/employee-funds/movements',{...data,request_key:request.current.key});request.current=null;setForm(empty());await refresh();setMessage('Movimiento registrado con su asiento contable.');}
    catch(e){setMessage(errorText(e));}finally{setBusy(false);}
  }
  async function saveCut(e){
    e.preventDefault();setBusy(true);setMessage('');
    try{await api.post(`/employee-funds/${entity}/cuts`,cutForm);await refresh();setMessage('Corte provisional registrado. El saldo anterior continúa en la cuenta.');}
    catch(e){setMessage(errorText(e));}finally{setBusy(false);}
  }
  async function resolveCut(e){
    e.preventDefault();setBusy(true);setMessage('');
    try{await api.post(`/employee-funds/${entity}/cuts/${statement.reconciliation.id}/resolve`,{note:resolution});await refresh();setResolution('');setMessage('Conciliación registrada. Los movimientos y saldos se conservan.');}
    catch(e){setMessage(errorText(e));}finally{setBusy(false);}
  }
  function chooseUser(id){const u=users.find(u=>u.id===id);setSelectedUser(id);setEmployeeLink(u?.entity_id||'');setOverrides(u?.permissions||{});}
  async function saveAccess(){setBusy(true);try{
    await api.put(`/employee-funds/access/${selectedUser}`,{entity_id:employeeLink||null});
    await api.put(`/auth/users/${selectedUser}`,{permissions:overrides});
    setUsers(await api.get('/employee-funds/access'));setMessage('Accesos guardados. El usuario debe volver a iniciar sesión para actualizar los botones; el servidor aplica los permisos inmediatamente.');
  }catch(e){setMessage(errorText(e));}finally{setBusy(false);}}
  if(!can('employee_expenses','view'))return <p>No tenés habilitado el acceso a fondos y rendiciones.</p>;
  return <main className={s.page}>
    <h1>Fondos y rendiciones de empleados</h1>
    <p>Saldo positivo: dinero disponible para rendir o devolver. Saldo negativo: importe a reintegrar al empleado. Las rendiciones pendientes se muestran aparte.</p>
    {message&&<p role="status" className={s.notice}>{message}</p>}
    <section className={s.panel}>
      <label>Empleado<select value={entity} onChange={e=>setEntity(e.target.value)}><option value="">Seleccionar</option>{catalog.employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <button onClick={refresh} disabled={!entity||busy}>Actualizar saldo</button>
      {statement&&<div className={s.grid}>{['ARS','USD'].map(currency=><div key={currency}><h2>{currency} {fmt(statement.balances[currency])}</h2><p>Pendiente de aprobar: {fmt(statement.pending[currency])}</p></div>)}</div>}
    </section>
    {statement?.reconciliation&&<section className={s.panel} aria-label="Corte de conciliación">
      <h2>{statement.reconciliation.status==='PENDING'?'Corte pendiente de conciliación':'Corte conciliado'}</h2>
      <p>Desde {statement.reconciliation.cutoff_date}: {statement.reconciliation.reason}</p>
      <p>El corte conserva la deuda o el dinero pendiente de rendir. Los gastos anteriores se incorporan al período de su fecha real cuando se aprueban.</p>
      <div className={s.scroll}><table><thead><tr><th>Moneda</th><th>Saldo anterior actualizado</th><th>Movimientos desde el corte</th><th>Saldo total</th></tr></thead><tbody>
        {['ARS','USD'].map(c=><tr key={c}><td>{c}</td><td>{fmt(statement.reconciliation.before[c])}</td><td>{fmt(statement.reconciliation.since[c])}</td><td>{fmt(statement.balances[c])}</td></tr>)}
      </tbody></table></div>
      {statement.reconciliation.resolution_note&&<p>Última revisión: {statement.reconciliation.resolution_note}</p>}
      {statement.reconciliation.status==='PENDING'&&can('employee_reconciliation','edit')&&<form onSubmit={resolveCut}>
        <label>Resultado de la revisión<input required minLength={3} maxLength={1000} value={resolution} onChange={e=>setResolution(e.target.value)}/></label>
        <button disabled={busy}>Marcar conciliado sin ajustar el saldo</button>
      </form>}
    </section>}
    {entity&&statement&&statement.reconciliation?.status!=='PENDING'&&can('employee_reconciliation','create')&&<form className={s.panel} onSubmit={saveCut}>
      <h2>Marcar un corte provisional</h2>
      <p>Permite seguir registrando movimientos mientras se buscan comprobantes anteriores. No cancela ni pone en cero la cuenta.</p>
      <div className={s.grid}>
        <label>Fecha del corte<input required type="date" value={cutForm.cutoff_date} onChange={e=>setCutForm({...cutForm,cutoff_date:e.target.value})}/></label>
        <label>Motivo del corte<input required minLength={3} maxLength={1000} value={cutForm.reason} onChange={e=>setCutForm({...cutForm,reason:e.target.value})}/></label>
      </div><button disabled={busy}>Registrar corte pendiente</button>
    </form>}
    {entity&&can('employee_funds','create')&&<form onSubmit={save} className={s.panel}>
      <h2>Registrar movimiento</h2><div className={s.grid}>
      <label>Movimiento<select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value,exchange_rate:e.target.value==='FX'?'':form.currency==='ARS'?1:form.exchange_rate})}>{Object.entries(kinds).filter(([k])=>k!=='CLAIM').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label>{form.kind==='FX'?'Moneda de origen':'Moneda'}<select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value,exchange_rate:e.target.value==='USD'||form.kind==='FX'?'':1})}><option>ARS</option><option>USD</option></select></label>
      <label>Importe<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>field('amount',e.target.value)}/></label>
      {(form.currency==='USD'||form.kind==='FX')&&<label>Tipo de cambio (ARS por USD)<input required type="number" min="0.000001" step="0.000001" value={form.exchange_rate} onChange={e=>field('exchange_rate',e.target.value)}/></label>}
      <label>Fecha<input required type="date" value={form.date} onChange={e=>field('date',e.target.value)}/></label>
      <label>Descripción<input required value={form.description} onChange={e=>field('description',e.target.value)}/></label>
      <label>Centro<select value={form.cost_center} onChange={e=>field('cost_center',Number(e.target.value))}><option value="1">1</option><option value="2">2</option></select></label>
      {form.kind!=='FX'&&<><label>Medio<select value={form.payment_method} onChange={e=>field('payment_method',e.target.value)}><option value="TRANSFER">Transferencia</option><option value="CASH">Efectivo (requiere caja abierta)</option></select></label>
      <label>Cuenta de caja/banco<select required value={form.treasury_account} onChange={e=>field('treasury_account',e.target.value)}><option value="">Seleccionar cuenta</option>{catalog.accounts.map(a=><option key={a.id} value={a.code}>{a.code} · {a.name}</option>)}</select></label></>}
      </div>
      {form.kind==='FX'&&<p>Conversión: {fmt(form.amount)} {form.currency} → {fmt(form.currency==='USD'?Number(form.amount)*Number(form.exchange_rate):Number(form.amount)/Number(form.exchange_rate))} {form.currency==='USD'?'ARS':'USD'}. Se registra al guardar, sin modificar movimientos anteriores.</p>}
      <button disabled={busy}>Revisé los datos: registrar movimiento</button>
    </form>}
    {statement&&<section className={s.panel}><h2>Movimientos</h2><div className={s.scroll}><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Importe</th><th>TC</th><th>Conversión</th></tr></thead><tbody>{statement.movements.map(m=><tr key={m.id}><td>{m.date.slice(0,10)}</td><td>{kinds[m.kind]}</td><td>{m.description}</td><td>{fmt(m.amount)} {m.currency}</td><td>{fmt(m.exchange_rate)}</td><td>{m.other_currency?`${fmt(m.other_amount)} ${m.other_currency}`:'—'}</td></tr>)}</tbody></table></div></section>}
    <section className={s.claims}><ExpenseClaimsPage/></section>
    {can('users','edit')&&<details className={s.panel}><summary>Vincular usuarios y configurar permisos individuales</summary>
      <p>Los permisos de perfil se configuran en Usuarios y perfiles. Aquí podés heredarlos, habilitarlos o deshabilitarlos para una persona. Administradores y propietarios conservan acceso completo.</p>
      <div className={s.grid}><label>Usuario<select value={selectedUser} onChange={e=>chooseUser(e.target.value)}><option value="">Seleccionar</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label>Empleado asociado<select value={employeeLink} onChange={e=>setEmployeeLink(e.target.value)}><option value="">Sin asociación</option>{catalog.employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label></div>
      {selectedUser&&<><div className={s.scroll}><table><thead><tr><th>Permiso</th>{['view','create','edit','delete'].map(a=><th key={a}>{({view:'Ver',create:'Crear',edit:'Editar',delete:'Borrar'})[a]}</th>)}</tr></thead><tbody>{Object.entries(modules).map(([key,label])=><tr key={key}><td>{label}</td>{['view','create','edit','delete'].map(action=><td key={action}><select aria-label={`${label} ${action}`} value={overrides[key]?.[action]===undefined?'inherit':String(overrides[key][action])} onChange={e=>{const next={...overrides,[key]:{...overrides[key]}};if(e.target.value==='inherit')delete next[key][action];else next[key][action]=e.target.value==='true';setOverrides(next);}}><option value="inherit">Heredar</option><option value="true">Habilitar</option><option value="false">Deshabilitar</option></select></td>)}</tr>)}</tbody></table></div><button disabled={busy} onClick={saveAccess}>Guardar accesos</button></>}
    </details>}
  </main>;
}
