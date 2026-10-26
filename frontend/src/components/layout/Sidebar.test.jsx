import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';

const { openWindow } = vi.hoisted(() => ({ openWindow: vi.fn() }));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { full_name: 'Usuario de prueba', roles: ['admin'] },
    can: () => true,
    logout: vi.fn()
  })
}));
vi.mock('../../context/WindowContext', () => ({
  useWindow: () => ({ openWindow })
}));

function LocationIndicator() {
  const { pathname } = useLocation();
  return <output data-testid="current-route">{pathname}</output>;
}

describe('Navegación de Entidades', () => {
  it('abre Entidades como ventana del ERP en la pestaña actual, sin popup de Chrome', () => {
    openWindow.mockClear();
    const popup = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      render(
        <MemoryRouter initialEntries={['/']}>
          <Sidebar />
          <LocationIndicator />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByText('Entidades'));
      expect(openWindow).toHaveBeenCalledWith(
        'entities-manager',
        {},
        expect.objectContaining({ singletonKey: 'config-entities', width: 1280 })
      );
      expect(screen.getByTestId('current-route')).toHaveTextContent('/');
      expect(popup).not.toHaveBeenCalled();
    } finally {
      popup.mockRestore();
    }
  });

  it.each([
    ['Flota (Vehículos)', 'fleet-manager', 'config-fleet'],
    ['Usuarios y Perfiles', 'users-manager', 'config-users'],
    ['Auditoría de Sistema', 'audit-logs', 'config-audit']
  ])('abre %s en el ERP y no en Chrome', (label, type, singletonKey) => {
    openWindow.mockClear();
    const popup = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      render(
        <MemoryRouter initialEntries={['/']}>
          <Sidebar />
          <LocationIndicator />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByText(label));
      expect(openWindow).toHaveBeenCalledWith(type, {}, expect.objectContaining({ singletonKey }));
      expect(screen.getByTestId('current-route')).toHaveTextContent('/');
      expect(popup).not.toHaveBeenCalled();
    } finally {
      popup.mockRestore();
    }
  });
});
