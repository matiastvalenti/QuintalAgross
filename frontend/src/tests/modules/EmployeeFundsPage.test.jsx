import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EmployeeFundsPage from '../../modules/finance/EmployeeFundsPage';
import api from '../../services/api';
vi.mock('../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
vi.mock('../../context/AuthContext',()=>({useAuth:()=>({can:(module)=>module!=='users'})}));
vi.mock('../../modules/finance/ExpenseClaimsPage',()=>({default:()=>null}));
beforeEach(()=>{vi.resetAllMocks();api.get.mockImplementation(url=>Promise.resolve(url.endsWith('catalogs')?{employees:[{id:'e',name:'Empleado'}],accounts:[]}:{balances:{ARS:0,USD:100},pending:{ARS:70,USD:0},movements:[]}));});
describe('Employee funds',()=>{
 it('previews a conversion and reuses the idempotency key after a network error',async()=>{
  api.post.mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce({id:'op'});
  render(<EmployeeFundsPage/>);
  await screen.findByText('USD 100,00');
  fireEvent.change(screen.getByLabelText('Movimiento'),{target:{value:'FX'}});
  fireEvent.change(screen.getByLabelText('Moneda de origen'),{target:{value:'USD'}});
  fireEvent.change(screen.getByLabelText('Importe'),{target:{value:'50'}});
  fireEvent.change(screen.getByLabelText('Tipo de cambio (ARS por USD)'),{target:{value:'1200'}});
  fireEvent.change(screen.getByLabelText('Descripción'),{target:{value:'Cambio para combustible'}});
  expect(screen.getByText(/60.000,00 ARS/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Revisé los datos: registrar movimiento'}));
  await screen.findByText('Sin conexión');
  expect(api.post.mock.calls[0][1]).toMatchObject({kind:'FX',currency:'USD',amount:'50',exchange_rate:'1200',entity_id:'e'});
  const key=api.post.mock.calls[0][1].request_key;
  fireEvent.click(screen.getByRole('button',{name:'Revisé los datos: registrar movimiento'}));
  await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(2));
  expect(api.post.mock.calls[1][1].request_key).toBe(key);
 });
});
