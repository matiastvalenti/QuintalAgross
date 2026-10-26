import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import EntitiesTable from './EntitiesTable';

const { openWindow } = vi.hoisted(() => ({ openWindow: vi.fn() }));
vi.mock('../../../context/WindowContext', () => ({ useWindow: () => ({ openWindow }) }));

const records = [
    { id: 1, code: 'C-2', name: 'ZETA', type: 'client', tax_id: '30-12345678-0', city: 'Paraná', state: 'Entre Ríos' },
    { id: 2, code: 'C-10', name: 'ALFA', type: 'mixed', tax_id: '', city: '', state: '' },
    { id: 3, code: 'C-12', name: 'BETA', type: 'client', tax_id: '30-12345679-1', city: 'Rosario', state: 'Santa Fe' }
];

const props = {
    entities: records,
    loading: false,
    error: '',
    selectedType: 'client',
    searchQuery: '',
    onSearch: vi.fn(),
    onSelect: vi.fn(),
    onNew: vi.fn(),
    onImport: vi.fn(),
    onRefresh: vi.fn()
};

describe('Padrón de entidades', () => {
    it('ordena por nombre y permite filtrar fichas incompletas', () => {
        render(<EntitiesTable {...props} />);
        const rows = screen.getAllByRole('row').slice(1);
        expect(within(rows[0]).getByText('ALFA')).toBeInTheDocument();
        expect(within(rows[1]).getByText('BETA')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Fichas incompletas/i }));
        expect(screen.getByText('ALFA')).toBeInTheDocument();
        expect(screen.queryByText('BETA')).not.toBeInTheDocument();
        expect(screen.queryByText('ZETA')).not.toBeInTheDocument();
    });

    it('abre ficha 360 y cuenta corriente como ventanas internas', () => {
        openWindow.mockClear();
        render(<EntitiesTable {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Ficha 360 de ALFA' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cuenta corriente de ALFA' }));
        expect(openWindow).toHaveBeenNthCalledWith(1, 'entity-dashboard', { entityId: 2 }, expect.objectContaining({ singletonKey: 'entity-dashboard-2' }));
        expect(openWindow).toHaveBeenNthCalledWith(2, 'statement-page', { entityId: 2 }, expect.objectContaining({ singletonKey: 'entity-statement-2' }));
    });

    it('permite crear entidades y limpiar una búsqueda sin borrar registros', () => {
        const onSearch = vi.fn();
        const onNew = vi.fn();
        render(<EntitiesTable {...props} searchQuery="ZETA" onSearch={onSearch} onNew={onNew} />);
        fireEvent.click(screen.getByRole('button', { name: /Nuevo cliente/i }));
        expect(onNew).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
        expect(onSearch).toHaveBeenCalledWith('');
    });
});
