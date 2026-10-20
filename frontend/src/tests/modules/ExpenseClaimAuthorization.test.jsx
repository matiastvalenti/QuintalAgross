import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import ExpenseClaimForm from '../../modules/finance/ExpenseClaimForm';
const state=vi.hoisted(()=>({allow:true,toast:vi.fn()}));
vi.mock('../../context/AuthContext',()=>({useAuth:()=>({can:(module)=>module!=='employee_expense_exceptions'||state.allow})}));
vi.mock('../../context/ToastContext',()=>({useToast:()=>({showToast:state.toast})}));
vi.mock('../../context/WindowContext',()=>({useWindow:()=>({openWindow:vi.fn()})}));
vi.mock('../../context/CostCenterContext',()=>({useCostCenter:()=>({costCenter:1})}));
const claim={id:'c',entity_id:'e',employee_name:'Empleado',title:'Viaje',date:'2026-10-20T00:00:00',currency:'ARS',exchange_rate:1,status:'SUBMITTED',cost_center:1,notes:'',unidad_negocio:'',campana:'',por_cta_orden:false,
 items:[{id:'item-1',date:'2026-10-10T00:00:00',description:'Combustible',amount:121,net_amount:100,vat_rate:.21,vat_amount:21,provider_id:'p',provider_name:'Estación',vehicle_ids:[]}]};
beforeEach(()=>{
 state.allow=true;state.toast.mockReset();
 vi.stubGlobal('fetch',vi.fn(async(url,options)=>({ok:true,json:async()=>options?.method==='PATCH'?{ok:true}:String(url).includes('/expenses/claims/')?claim:String(url).includes('/employee-funds/catalogs')?{employees:[{id:'e',name:'Empleado'}],providers:[{id:'p',name:'Estación'}],accounts:[]}:[]})));
});
afterEach(()=>vi.unstubAllGlobals());
it('sends an explicit per-item exception with a required reason',async()=>{
 render(<ExpenseClaimForm claimId="c" onClose={()=>{}}/>);
 const check=await screen.findByRole('checkbox',{name:/Autorizar sin comprobante: Combustible/});
 fireEvent.click(check);
 fireEvent.click(screen.getByRole('button',{name:'Autorizar excepciones y aprobar rendición'}));
 expect(fetch.mock.calls.filter(([,o])=>o?.method==='PATCH')).toHaveLength(0);
 fireEvent.change(screen.getByLabelText('Motivo de autorización: Combustible'),{target:{value:'Ticket perdido, gasto revisado'}});
 fireEvent.click(screen.getByRole('button',{name:'Autorizar excepciones y aprobar rendición'}));
 await waitFor(()=>expect(fetch.mock.calls.filter(([,o])=>o?.method==='PATCH')).toHaveLength(1));
 const [,options]=fetch.mock.calls.find(([,o])=>o?.method==='PATCH');
 expect(JSON.parse(options.body)).toEqual({without_receipts:[{item_id:'item-1',reason:'Ticket perdido, gasto revisado'}]});
});
it('keeps the exception action hidden from reviewers without its permission',async()=>{
 state.allow=false;render(<ExpenseClaimForm claimId="c" onClose={()=>{}}/>);
 await screen.findByRole('button',{name:'Aprobar y Contabilizar'});
 expect(screen.queryByRole('button',{name:'Autorizar excepciones y aprobar rendición'})).not.toBeInTheDocument();
});
