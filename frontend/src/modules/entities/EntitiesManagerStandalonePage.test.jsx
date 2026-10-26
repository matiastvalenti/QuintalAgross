import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EntitiesManagerStandalonePage from './EntitiesManagerStandalonePage';

const { openEntitiesManager } = vi.hoisted(() => ({ openEntitiesManager: vi.fn() }));
vi.mock('../../utils/openStandaloneWindow', () => ({ openEntitiesManager }));

describe('Acceso antiguo a Entidades', () => {
  it('redirige al ERP en vez de cargar el editor en una ventana Chrome', () => {
    openEntitiesManager.mockClear();
    render(<EntitiesManagerStandalonePage />);
    expect(openEntitiesManager).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Abriendo Entidades dentro del sistema/)).toBeInTheDocument();
  });
});
