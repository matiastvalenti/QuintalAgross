/**
 * Las cantidades de la orden y del remito se almacenan en unidad base (LT/KG/UN).
 * La cantidad de envases es solo una presentación para la interfaz.
 */
export function getContainerSize(line) {
  const raw = line?.product?.quantity_per_container
    ?? line?.quantity_per_container
    ?? line?._unit_content
    ?? line?.package_size
    ?? 1;
  const factor = Number(raw);
  return Number.isFinite(factor) && factor > 0 ? factor : NaN;
}

export function getPendingUnits(line, fulfilledField) {
  const ordered = Number(line?.qty ?? 0);
  const fulfilled = Number(line?.[fulfilledField] ?? 0);
  if (!Number.isFinite(ordered) || !Number.isFinite(fulfilled)) return NaN;
  return Math.max(0, ordered - fulfilled);
}

export function getPendingContainers(line, fulfilledField) {
  const factor = getContainerSize(line);
  const pending = getPendingUnits(line, fulfilledField);
  if (!Number.isFinite(factor) || !Number.isFinite(pending)) return 0;
  return Number((pending / factor).toFixed(6));
}

export function validateDocumentSelection(lines, packageQuantities, fulfilledField) {
  for (const line of lines) {
    const packages = Number(packageQuantities[line.id] ?? 0);
    if (!Number.isFinite(packages) || packages < 0) {
      return { valid: false, reason: 'Cantidad de envases inválida' };
    }
    if (packages === 0) continue;
    const factor = getContainerSize(line);
    const pending = getPendingUnits(line, fulfilledField);
    if (!Number.isFinite(factor) || !Number.isFinite(pending)) {
      return { valid: false, reason: 'Presentación o cantidad pendiente inválida' };
    }
    if (packages * factor > pending + 0.000001) {
      const description = line.description || line.product_name || line.name || 'producto';
      return { valid: false, reason: `La cantidad supera el pendiente de ${description}` };
    }
  }
  return { valid: true, reason: null };
}
