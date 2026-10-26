import { describe, expect, it } from 'vitest';
import { linesWithoutSalePrice } from './salesOrderValidation';

describe('Precios obligatorios en Órdenes de Venta', () => {
  it('rechaza líneas con precios ausentes, cero, negativos y no numéricos', () => {
    const lines = [
      { name: 'Glifosato', unit_price: 0 },
      { name: 'Coadyuvante', unit_price: '' },
      { name: 'Otro', unit_price: undefined },
      { name: 'Error', unit_price: -10 },
      { name: 'Sin dato', unit_price: 'NaN' },
      { name: 'Correcto', unit_price: '4.80' },
    ];
    expect(linesWithoutSalePrice(lines).map(item => item.name))
      .toEqual(['Glifosato', 'Coadyuvante', 'Otro', 'Error', 'Sin dato']);
  });

  it('admite precios positivos en ARS o USD, incluyendo fracciones', () => {
    expect(linesWithoutSalePrice([{ unit_price: '0.01' }, { unit_price: 328 }])).toEqual([]);
  });
});
