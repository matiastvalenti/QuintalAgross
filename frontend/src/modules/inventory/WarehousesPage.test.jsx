import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WarehousesPage from './WarehousesPage';

const { get, put, post, toast } = vi.hoisted(() => ({
  get: vi.fn(), put: vi.fn(), post: vi.fn(), toast: vi.fn()
}));
vi.mock('../../services/api', () => ({ default: { get, put, post, delete: vi.fn() } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock('../../components/ui/AccountSelector', () => ({ default: () => <div data-testid="account-selector" /> }));

describe('Depósitos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue([{ id: 5, name: 'Depósito Central', code: 'DEP1', address: 'Paraná',
      active: true, ownership: 'PROPIO', low_stock_control: 'WARNING',
      no_stock_control: 'WARNING', account_code: '' }]);
    put.mockResolvedValue({});
  });

  it('edita un depósito existente mediante PUT, sin crear otro mediante POST', async () => {
    render(<WarehousesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar depósito Depósito Central' }));
    expect(screen.getByText('Editar Depósito')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nombre del Depósito'), { target: { value: 'Depósito Norte' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/inventory/warehouses/5',
      expect.objectContaining({ name: 'Depósito Norte', code: 'DEP1' })));
    expect(post).not.toHaveBeenCalled();
  });

  it('filtra depósitos sin modificar los registros', async () => {
    render(<WarehousesPage />);
    expect(await screen.findByText('Depósito Central')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar depósitos' }), { target: { value: 'inexistente' } });
    expect(screen.getByText('Sin coincidencias')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
