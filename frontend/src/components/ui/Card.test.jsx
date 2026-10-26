import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Card from './Card';

describe('Card compartida', () => {
  it('respeta tamaños y acciones solicitadas por cada formulario', () => {
    render(
      <Card title="Editar Depósito" style={{ flex: 1, overflow: 'hidden' }} headerActions={<button>Cancelar</button>}>
        <p>Formulario</p>
      </Card>
    );
    const card = screen.getByText('Editar Depósito').closest('div[class*="card"]');
    expect(card.style.overflow).toBe('hidden');
    expect(card.style.flex).toBe('1');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });
});
