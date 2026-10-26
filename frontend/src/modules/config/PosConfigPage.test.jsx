import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PosConfigPage from './PosConfigPage';

const { get, put, post, toast } = vi.hoisted(() => ({
  get: vi.fn(), put: vi.fn(), post: vi.fn(), toast: vi.fn()
}));
vi.mock('../../services/api', () => ({ default: { get, put, post, delete: vi.fn() } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: toast }) }));

describe('Puntos de Venta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue([{ id: 7, pv: '0001', name: 'Casa Central', active: true,
      document_configs: [{ document_type: 'OV', last_number: 10 }] }]);
  });

  it('advierte al retroceder una numeración y no guarda si se cancela', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      render(<PosConfigPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
      fireEvent.click(screen.getByRole('button', { name: /Guardar Cambios/i }));
      await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.stringContaining('duplicar numeración')));
      expect(put).not.toHaveBeenCalled();
    } finally { confirm.mockRestore(); }
  });

  it('impide agregar un segundo tipo de comprobante idéntico', async () => {
    render(<PosConfigPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: /Agregar Tipo/i }));
    const selectors = screen.getAllByRole('combobox');
    const usedTypes = selectors.flatMap(el => [...el.options].filter(opt => opt.selected).map(opt => opt.value));
    expect(new Set(usedTypes).size).toBe(usedTypes.length);
  });
});
