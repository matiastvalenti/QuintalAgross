/** La OV solo es válida cuando todas las líneas tienen precio de venta positivo. */
export function linesWithoutSalePrice(lines = []) {
  return lines.filter(line => {
    const raw = line?.unit_price;
    if (raw === null || raw === undefined || raw === '') return true;
    const value = Number(raw);
    return !Number.isFinite(value) || value <= 0;
  });
}
