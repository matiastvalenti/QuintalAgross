/**
 * Utilitarios para formateo de números de documentos (PV-Número).
 */

export const padPV = (pv) => {
  if (!pv) return "0001";
  return pv.toString().padStart(4, "0");
};

export const padNumber = (num) => {
  if (!num) return "";
  return num.toString().padStart(8, "0");
};

export const splitFullNumber = (fullNumber) => {
  if (!fullNumber || !fullNumber.includes("-")) {
    return { pv: "0001", num: fullNumber || "" };
  }
  const [pv, num] = fullNumber.split("-");
  return { pv: padPV(pv), num: padNumber(num) };
};

export const joinFullNumber = (pv, num) => {
  return `${padPV(pv)}-${padNumber(num)}`;
};

export const formatCurrency = (val) => {
  if (val === undefined || val === null) return "$ 0,00";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(val);
};

export const getInitials = (name) => {
  if (!name) return "QA";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  const first = parts[0][0];
  const last = parts[parts.length - 1][0];
  return (first + last).toUpperCase();
};

/**
 * Universal formatter for financial data
 */
export const fmt = (val, type = 'ARS') => {
    if (val === undefined || val === null) return type === 'date' ? '-' : '$ 0,00';
    
    if (type === 'date') {
        const d = new Date(val);
        if (isNaN(d.getTime())) return val; // Fallback if not a real date
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    const currency = type === 'USD' ? 'USD' : 'ARS';
    const symbol = currency === 'USD' ? 'u$s ' : '$ ';
    
    try {
        const formatted = new Intl.NumberFormat('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(Math.abs(val));
        
        return (val < 0 ? '- ' : '') + symbol + formatted;
    } catch (e) {
        return val;
    }
};
