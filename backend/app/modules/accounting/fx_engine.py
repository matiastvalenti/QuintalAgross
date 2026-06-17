"""
Motor de cálculo de diferencia de cambio por ítem con IVA.

Este módulo es puro (sin dependencia de FastAPI/SQLAlchemy) para facilitar testing.
Recibe datos crudos y devuelve el resultado del cálculo.
"""
from dataclasses import dataclass, field
from typing import List, Optional

# Umbral mínimo en ARS para generar ND/NC.
# Si abs(diff_total) < este valor, no se genera ajuste.
FX_ADJUSTMENT_THRESHOLD_ARS = 1.0


@dataclass
class InvoiceLine:
    """Línea de factura como input para el cálculo."""
    line_id: str
    description: str
    vat_rate: float       # 0.21, 0.105, 0.27, 0.0
    net_amount: float     # Neto sin IVA (en moneda del doc)
    vat_amount: float     # IVA (en moneda del doc)
    total_amount: float   # net + vat (en moneda del doc)


@dataclass
class FxAdjustmentLine:
    """Línea del ajuste generado (siempre en ARS)."""
    invoice_line_id: str
    description: str
    vat_rate: float
    applied_original_currency: float  # Monto aplicado a esta línea (moneda doc)
    ars_at_invoice_rate: float        # applied * TC factura
    ars_at_application_rate: float    # applied * TC aplicación
    diff_ars_total: float             # ars_app - ars_inv
    net_ars: float                    # neto del ajuste
    vat_ars: float                    # IVA del ajuste


@dataclass
class FxPreviewResult:
    """Resultado completo del cálculo de diferencia de cambio."""
    needs_adjustment: bool
    sign: str  # "ND", "NC", "NONE"
    lines: List[FxAdjustmentLine] = field(default_factory=list)
    total_net_ars: float = 0.0
    total_vat_ars: float = 0.0
    total_ars: float = 0.0
    vat_by_rate: dict = field(default_factory=dict)  # {0.21: {net, vat, total}, ...}
    reason: str = ""
    tc_invoice: float = 0.0
    tc_application: float = 0.0
    applied_amount_original: float = 0.0


def calculate_fx_adjustment(
    invoice_lines: List[InvoiceLine],
    invoice_total: float,
    tc_invoice: float,
    tc_application: float,
    amount_applied: float,
    threshold_ars: float = FX_ADJUSTMENT_THRESHOLD_ARS,
) -> FxPreviewResult:
    """
    Calcula la diferencia de cambio por ítem respetando alícuota IVA.
    
    Args:
        invoice_lines: Líneas de la factura original
        invoice_total: Total de la factura (en moneda original)
        tc_invoice: Tipo de cambio al momento de la factura
        tc_application: Tipo de cambio al momento de la aplicación/pago
        amount_applied: Monto aplicado (en moneda del documento)
        threshold_ars: Umbral mínimo para generar ajuste (en ARS)
    
    Returns:
        FxPreviewResult con el desglose del ajuste
    """
    result = FxPreviewResult(
        needs_adjustment=False,
        sign="NONE",
        tc_invoice=tc_invoice,
        tc_application=tc_application,
        applied_amount_original=amount_applied,
    )
    
    # Si TC son iguales, no hay diferencia
    if tc_invoice == tc_application:
        result.reason = "TC factura y TC aplicación son iguales. Sin ajuste."
        return result
    
    # Si no hay líneas, no podemos calcular por ítem
    if not invoice_lines:
        result.reason = "La factura no tiene líneas de detalle. No se puede calcular ajuste por ítem."
        return result
    
    if invoice_total == 0:
        result.reason = "Total de factura es 0. Sin ajuste."
        return result
    
    # ── Calcular diferencia por línea ──
    adjustment_lines: List[FxAdjustmentLine] = []
    raw_diffs: List[float] = []  # diff_total sin redondear para ajuste de centavos
    
    for line in invoice_lines:
        # Proporción de esta línea sobre el total de la factura
        proportion = line.total_amount / invoice_total
        applied_to_line = amount_applied * proportion
        
        # Equivalencias ARS
        ars_at_invoice = applied_to_line * tc_invoice
        ars_at_app = applied_to_line * tc_application
        diff_total = ars_at_app - ars_at_invoice
        
        raw_diffs.append(diff_total)
        
        # Descomponer en neto + IVA respetando la alícuota
        if line.vat_rate > 0:
            net_diff = round(diff_total / (1 + line.vat_rate), 2)
            vat_diff = round(diff_total - net_diff, 2)
        else:
            net_diff = round(diff_total, 2)
            vat_diff = 0.0
        
        adj_line = FxAdjustmentLine(
            invoice_line_id=line.line_id,
            description=f"Dif. TC - {line.description}",
            vat_rate=line.vat_rate,
            applied_original_currency=round(applied_to_line, 2),
            ars_at_invoice_rate=round(ars_at_invoice, 2),
            ars_at_application_rate=round(ars_at_app, 2),
            diff_ars_total=round(diff_total, 2),
            net_ars=net_diff,
            vat_ars=vat_diff,
        )
        adjustment_lines.append(adj_line)
    
    # ── Calcular total bruto de la diferencia ──
    gross_diff = sum(raw_diffs)
    
    # ── Verificar umbral ──
    if abs(gross_diff) < threshold_ars:
        result.reason = (
            f"Diferencia total ({round(gross_diff, 2)} ARS) menor al umbral "
            f"({threshold_ars} ARS). Sin ajuste."
        )
        return result
    
    # ── Ajuste de centavos ──
    # El total esperado redondeado
    expected_total = round(gross_diff, 2)
    # Sumar lo que tenemos redondeado línea a línea
    current_total = sum(l.net_ars + l.vat_ars for l in adjustment_lines)
    cent_diff = round(expected_total - current_total, 2)
    
    if cent_diff != 0 and adjustment_lines:
        # Ajustar en la línea de mayor neto absoluto
        target_idx = max(range(len(adjustment_lines)), key=lambda i: abs(adjustment_lines[i].net_ars))
        adjustment_lines[target_idx].net_ars = round(
            adjustment_lines[target_idx].net_ars + cent_diff, 2
        )
        # Recalcular diff_ars_total de esa línea
        adjustment_lines[target_idx].diff_ars_total = round(
            adjustment_lines[target_idx].net_ars + adjustment_lines[target_idx].vat_ars, 2
        )
    
    # ── Determinar signo ──
    # Si diff > 0: el pago fue "más caro" en ARS → ND (aumentó el costo)
    # Si diff < 0: el pago fue "más barato" → NC (disminuyó)
    if expected_total > 0:
        sign = "ND"
    else:
        sign = "NC"
        # Para la ND/NC, los montos van en valor absoluto
        for l in adjustment_lines:
            l.diff_ars_total = abs(l.diff_ars_total)
            l.net_ars = abs(l.net_ars)
            l.vat_ars = abs(l.vat_ars)
    
    # ── Agrupar IVA por alícuota ──
    vat_by_rate: dict = {}
    for l in adjustment_lines:
        rate_key = l.vat_rate
        if rate_key not in vat_by_rate:
            vat_by_rate[rate_key] = {"net": 0.0, "vat": 0.0, "total": 0.0}
        vat_by_rate[rate_key]["net"] = round(vat_by_rate[rate_key]["net"] + l.net_ars, 2)
        vat_by_rate[rate_key]["vat"] = round(vat_by_rate[rate_key]["vat"] + l.vat_ars, 2)
        vat_by_rate[rate_key]["total"] = round(vat_by_rate[rate_key]["total"] + l.diff_ars_total, 2)
    
    total_net = round(sum(l.net_ars for l in adjustment_lines), 2)
    total_vat = round(sum(l.vat_ars for l in adjustment_lines), 2)
    total = round(total_net + total_vat, 2)
    
    tc_dir = "subió" if tc_application > tc_invoice else "bajó"
    result.needs_adjustment = True
    result.sign = sign
    result.lines = adjustment_lines
    result.total_net_ars = total_net
    result.total_vat_ars = total_vat
    result.total_ars = total
    result.vat_by_rate = vat_by_rate
    result.reason = (
        f"TC {tc_dir} de {tc_invoice} a {tc_application}. "
        f"Diferencia de cambio: {sign} por ${total} ARS "
        f"(Neto: ${total_net}, IVA: ${total_vat})."
    )
    
    return result
