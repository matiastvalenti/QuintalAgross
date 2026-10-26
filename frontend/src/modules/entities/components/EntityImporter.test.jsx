import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EntityImporter from './EntityImporter';

vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

afterEach(() => vi.unstubAllGlobals());

describe('Importación de clientes con vista previa', () => {
    it('no guarda registros al seleccionar un archivo: primero pide previsualizar y luego confirmar', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                stats: { created: 1, updated: 0, merged: 0, skipped: 0, errors: [], warnings: [] },
                preview: [{ name: 'CLIENTE REAL DE PRUEBA', tax_id: '30-71740021-2', type: 'client', action: 'create' }]
            })
        });
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('localStorage', { getItem: () => 'token-de-test' });
        render(<EntityImporter initialType="client" onCancel={() => {}} />);
        fireEvent.change(screen.getByLabelText('Archivo Excel'), {
            target: { files: [new File(['contenido'], 'clientes.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] }
        });
        expect(fetchMock).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('Ver vista previa'));
        await screen.findByText('CLIENTE REAL DE PRUEBA · 30-71740021-2');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toContain('dry_run=true');
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token-de-test');
        fireEvent.click(screen.getByText('Confirmar importación'));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        expect(fetchMock.mock.calls[1][0]).toContain('dry_run=false');
    });
});
