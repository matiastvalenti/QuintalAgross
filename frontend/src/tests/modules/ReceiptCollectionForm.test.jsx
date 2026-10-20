import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import ReceiptCollectionForm from '../../modules/finance/ReceiptCollectionForm';
import api from '../../services/api';

vi.mock('../../services/api');
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../modules/finance/components/ReceiptCollectionShell/ReceiptPendingInvoicesSelector', () => ({ default: () => null }));

const invoice = { id: 'invoice', entity_id: 'client', entity_name: 'Cliente de prueba',
  number: 'FC-PRUEBA', currency: 'USD', total_amount: 1000, pending_amount: 1000, exchange_rate: 1000 };

describe('ReceiptCollectionForm FX', () => {
  it('converts the invoice pending USD to ARS exactly once', async () => {
    api.get.mockImplementation(url => Promise.resolve(url.includes('/fx/usd') ? { rate: 1100 } : []));
    render(<MemoryRouter><ReceiptCollectionForm source="invoice" initialInvoice={invoice} /></MemoryRouter>);
    await screen.findByText(/FC-PRUEBA/);
    await waitFor(() => expect(screen.getByDisplayValue('1100000')).toBeInTheDocument());
    expect(screen.queryByDisplayValue('1210000000')).not.toBeInTheDocument();
  });

  it('groups the generated debit note into its original collection when reopening a receipt', async () => {
    api.get.mockImplementation(url => Promise.resolve(url.includes('/fx/usd') ? { rate: 1100 } : []));
    const initialData = { entity_id: 'client', entity_name: 'Cliente de prueba', currency: 'ARS',
      exchange_rate: 1100, number: 'REC-PRUEBA', status: 'CLOSED', payments: [],
      applied_to: [
        { to_document_id:'invoice', to_document_number:'FC-PRUEBA', to_document_currency:'USD',
          to_document_exchange_rate:1000, exchange_rate:1100, amount_applied:1000,
          fx_settled_amount:1000, is_system_fx:false },
        { to_document_id:'note', to_document_number:'ND-AUTOMATICA', to_document_currency:'ARS',
          exchange_rate:1, amount_applied:100000, is_system_fx:true },
      ] };
    render(<MemoryRouter><ReceiptCollectionForm mode="view" initialData={initialData} /></MemoryRouter>);
    await screen.findByText(/FC-PRUEBA/);
    expect(screen.queryByText(/ND-AUTOMATICA/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/1\.100\.000,00/).length).toBeGreaterThan(0);
  });
});
