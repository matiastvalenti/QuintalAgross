import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StockMovementEditor from '../../modules/inventory/StockMovementEditor';
import api from '../../services/api';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../services/api');
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));

describe('StockMovementEditor', () => {
  it('saves fractions without optional lot fields and displays negative stock warnings', async () => {
    api.get.mockImplementation(url => Promise.resolve(url.includes('products')
      ? [{ id: 'p', name: 'Producto prueba' }]
      : [{ id: 'a', name: 'Depósito prueba' }]));
    api.post.mockResolvedValue({ id: 'm', warnings: [{
      product_name: 'Producto prueba', warehouse_name: 'Depósito prueba', resulting_qty: -0.5,
    }] });
    const onSave = vi.fn();
    render(<StockMovementEditor onSave={onSave} />);
    const option = await screen.findByRole('option', { name: 'Producto prueba' });
    fireEvent.change(option.parentElement, { target: { value: 'p' } });
    fireEvent.change(screen.getByPlaceholderText('Cant'), { target: { value: '0.5' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '0.025' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar ítem' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Movimiento' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(api.post.mock.calls[0][1].lines[0]).toMatchObject({
      qty: '0.5', container_qty: '0.025', expiry_date: null, batch: null,
    });
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('Stock negativo: Producto prueba en Depósito prueba: -0.5'),
      'warning', 10000,
    );
  });
});
