import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { full_name: 'Usuario de prueba', roles: ['admin'] },
    can: () => true,
    logout: vi.fn()
  })
}));
vi.mock('../../context/WindowContext', () => ({
  useWindow: () => ({ openWindow: vi.fn() })
}));

function LocationIndicator() {
  const { pathname } = useLocation();
  return <output data-testid="current-route">{pathname}</output>;
}

describe('Navegación de Entidades', () => {
  it('abre Entidades como página interna del ERP, sin popup del navegador', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
        <LocationIndicator />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('Entidades'));
    expect(screen.getByTestId('current-route')).toHaveTextContent('/configuracion/entidades');
  });
});
