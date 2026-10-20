import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import ServiceWorksPage from '../../modules/services/ServiceWorksPage';
import api from '../../services/api';
vi.mock('../../services/api');
const work = { id:'w',description:'Aplicación norte',entity_id:'c',entity_name:'Cliente',farm_name:'Campo',activity:'DRONE',status:'COMPLETED',unit:'HA',quantity:100,invoiced_quantity:0,pending_quantity:100,unit_price:10,vat_rate:.21,currency:'ARS',cost_center:1,costs:[],invoices:[],date:'2026-10-20',quoted_net_ars:1000,costs_ars:0 };
const catalogs = { entities:[{id:'c',name:'Cliente',type:'client'},{id:'e',name:'Operario',type:'employee'}],farms:[],machinery:[],vehicles:[],products:[],accounts:[{id:'a',code:'5.1.3.001',name:'Personal'}] };
beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockImplementation(url => Promise.resolve(url.includes('catalogs') ? catalogs : [work]));
});
describe('Service works', () => {
  it('sends the partial quantity and reuses the request key after a network failure', async () => {
    api.post.mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce({id:'invoice',number:'BOR-SERV-1'});
    render(<MemoryRouter><ServiceWorksPage/></MemoryRouter>);
    fireEvent.click(await screen.findByLabelText('Seleccionar Aplicación norte'));
    fireEvent.change(screen.getByLabelText('Cantidad a facturar Aplicación norte'),{target:{value:'25.5'}});
    fireEvent.click(screen.getByRole('button',{name:'Revisar factura (1)'}));
    fireEvent.click(screen.getByRole('button',{name:'Crear borrador de factura'}));
    await screen.findByRole('alert');
    expect(api.post.mock.calls[0][1].items).toEqual([{work_id:'w',quantity:'25.5'}]);
    const key=api.post.mock.calls[0][1].request_key;
    fireEvent.click(screen.getByRole('button',{name:'Crear borrador de factura'}));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post.mock.calls[1][1].request_key).toBe(key);
    expect(await screen.findByRole('status')).toHaveTextContent('No se registró en ARCA');
  });
  it('lets the operator choose an employee cost per kilometer', async () => {
    api.post.mockResolvedValue({});
    render(<MemoryRouter><ServiceWorksPage/></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button',{name:'Detalle y costos'}));
    fireEvent.click(screen.getByRole('button',{name:'Agregar empleado / costo'}));
    fireEvent.change(screen.getByLabelText('Detalle del costo'),{target:{value:'Tarea de operario'}});
    fireEvent.change(screen.getByLabelText('Empleado'),{target:{value:'e'}});
    fireEvent.change(screen.getByLabelText('Modalidad de costo'),{target:{value:'KM'}});
    fireEvent.change(screen.getByLabelText('Cantidad de costo'),{target:{value:'80'}});
    fireEvent.change(screen.getByLabelText('Tarifa / costo neto unitario'),{target:{value:'50'}});
    fireEvent.change(screen.getByLabelText('Cuenta de costo'),{target:{value:'a'}});
    fireEvent.click(screen.getByRole('button',{name:'Guardar costo'}));
    await waitFor(() => expect(api.post).toHaveBeenCalledOnce());
    expect(api.post.mock.calls[0]).toEqual(['/service-works/w/costs',expect.objectContaining({employee_id:'e',unit:'KM',quantity:'80',unit_cost:'50'})]);
  });
});
