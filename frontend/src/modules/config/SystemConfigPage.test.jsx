import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SystemConfigPage from './SystemConfigPage';

const { openWindow } = vi.hoisted(() => ({ openWindow: vi.fn() }));
vi.mock('../../context/WindowContext', () => ({
  useWindow: () => ({ openWindow })
}));

describe('Panel de configuración', () => {
  it.each([
    ['Entidades', 'entities-manager', 'config-entities'],
    ['Empleados', 'entities-manager', 'config-employees'],
    ['Depósitos', 'warehouses-manager', 'config-warehouses'],
    ['Bancos', 'bank-config', 'config-banks'],
    ['Puntos de Venta', 'pos-config', 'config-pos'],
    ['Condiciones de Venta', 'sale-conditions', 'config-conditions'],
    ['Flota / Vehículos', 'fleet-manager', 'config-fleet'],
    ['Unidades de Negocio', 'simple-config', 'config-bu'],
    ['Campañas', 'simple-config', 'config-campaigns'],
    ['Usuarios y Permisos', 'users-manager', 'config-users']
  ])('abre %s en ventana interna sin saltar al dashboard', (label, type, singletonKey) => {
    openWindow.mockClear();
    const popup = vi.spyOn(window, 'open').mockImplementation(() => null);
    const push = vi.spyOn(window.history, 'pushState');
    const path = window.location.pathname;
    try {
      render(<SystemConfigPage />);
      fireEvent.click(screen.getByRole('button', { name: `Abrir ${label}` }));
      expect(openWindow).toHaveBeenCalledWith(type, expect.any(Object), expect.objectContaining({ singletonKey }));
      expect(popup).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      expect(window.location.pathname).toBe(path);
    } finally {
      popup.mockRestore();
      push.mockRestore();
    }
  });

  it('abre Empleados en su categoría propia', () => {
    openWindow.mockClear();
    render(<SystemConfigPage />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Abrir Empleados' }), { key: 'Enter' });
    expect(openWindow).toHaveBeenCalledWith(
      'entities-manager',
      { initialType: 'employee' },
      expect.objectContaining({ singletonKey: 'config-employees' })
    );
  });
});
