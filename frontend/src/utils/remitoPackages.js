/**
 * Los remitos conservan cantidades en unidades base (kg/L/u.).
 * Los envases son un campo de presentación y nunca deben enviarse como qty.
 */
export function packageFactor(line) {
  const raw = line?._unit_content ?? line?.quantity_per_container ?? line?.package_size ?? 1;
  const factor = Number(raw);
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
}

export function unitsToPackages(units, line) {
  const amount = Number(units);
  return Number.isFinite(amount) ? Number((amount / packageFactor(line)).toFixed(6)) : 0;
}

export function packagesToUnits(packages, line) {
  const amount = Number(packages);
  return Number.isFinite(amount) ? Number((amount * packageFactor(line)).toFixed(6)) : 0;
}

/**
 * Priorizar cantidades expresadas en kg/L. qty_packages sólo se convierte a
 * unidad base cuando ningún campo qty está presente.
 */
export function selectedRemitoUnits(line) {
  const base = line?.qty_to_receive ?? line?.qty_to_remit ?? line?.qty;
  if (base !== null && base !== undefined && base !== "") {
    return Number(base) || 0;
  }
  return packagesToUnits(line?.qty_packages ?? 0, line);
}

export function formatRemitoQuantity(value) {
  return Number(value || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

/**
 * Los módulos reciben alícuotas tanto en fracción (0.21) como en porcentaje (21).
 * Conservar 0% explícito: no sustituirlo por 21%.
 */
export function normalizeRemitoVatRate(rate, fallback = 0.21) {
  if (rate === null || rate === undefined || rate === "") return fallback;
  const value = Number(rate);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value > 1 ? Number((value / 100).toFixed(6)) : value;
}
