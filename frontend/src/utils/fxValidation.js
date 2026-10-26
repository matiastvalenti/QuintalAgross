/**
 * Una cotización USD/ARS no puede ser 0, 1, NaN ni un valor infinito.
 * No se inventan cotizaciones cuando Banco Nación no responde.
 */
export const isValidUsdRate = value => {
  if (value === null || value === undefined || String(value).trim() === "") return false;
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 1;
};
