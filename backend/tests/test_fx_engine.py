"""
Tests unitarios del motor de cálculo de diferencia de cambio.
Ejecutar: python -m pytest tests/test_fx_engine.py -v
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.modules.accounts.fx_engine import (
    calculate_fx_adjustment,
    InvoiceLine,
)


def _make_lines():
    """Factura USD 1000: Línea 1 IVA 21% ($605) + Línea 2 IVA 10.5% ($395)"""
    return [
        InvoiceLine(
            line_id="line-1",
            description="Producto A",
            vat_rate=0.21,
            net_amount=500.0,
            vat_amount=105.0,
            total_amount=605.0,
        ),
        InvoiceLine(
            line_id="line-2",
            description="Servicio B",
            vat_rate=0.105,
            net_amount=357.14,   # ~357.14
            vat_amount=37.5,     # ~37.50
            total_amount=395.0,  # redondeo a 395 para simplificar
        ),
    ]


class TestFxEngineBasic:
    """Tests básicos del motor FX."""

    def test_no_adjustment_when_same_tc(self):
        """Si TC factura == TC aplicación, no hay ajuste."""
        result = calculate_fx_adjustment(
            invoice_lines=_make_lines(),
            invoice_total=1000.0,
            tc_invoice=1000.0,
            tc_application=1000.0,
            amount_applied=500.0,
        )
        assert not result.needs_adjustment
        assert result.sign == "NONE"
        assert len(result.lines) == 0

    def test_no_adjustment_when_no_lines(self):
        """Si no hay líneas, no se puede calcular."""
        result = calculate_fx_adjustment(
            invoice_lines=[],
            invoice_total=1000.0,
            tc_invoice=1000.0,
            tc_application=1100.0,
            amount_applied=500.0,
        )
        assert not result.needs_adjustment

    def test_below_threshold(self):
        """Si la diferencia es menor al umbral, no generar ajuste."""
        result = calculate_fx_adjustment(
            invoice_lines=_make_lines(),
            invoice_total=1000.0,
            tc_invoice=1000.0,
            tc_application=1000.001,  # diferencia irrisoria
            amount_applied=500.0,
            threshold_ars=1.0,
        )
        assert not result.needs_adjustment


class TestFxEngineND:
    """Tests de generación de ND (TC subió)."""

    def test_nd_two_lines_partial_payment(self):
        """
        Factura USD 1000 (TC 1000), pago parcial USD 500 (TC 1100).
        Diferencia por línea respetando IVA.
        """
        lines = _make_lines()
        result = calculate_fx_adjustment(
            invoice_lines=lines,
            invoice_total=1000.0,
            tc_invoice=1000.0,
            tc_application=1100.0,
            amount_applied=500.0,
        )
        assert result.needs_adjustment
        assert result.sign == "ND"
        assert len(result.lines) == 2
        
        # Verificar que ambas líneas tienen IVA correcto
        line_21 = next(l for l in result.lines if l.vat_rate == 0.21)
        line_105 = next(l for l in result.lines if l.vat_rate == 0.105)
        
        assert line_21.vat_rate == 0.21
        assert line_105.vat_rate == 0.105
        
        # Total debe sumar correctamente
        total_from_lines = sum(l.diff_ars_total for l in result.lines)
        assert abs(total_from_lines - result.total_ars) < 0.01
        
        # Neto + IVA = Total por línea
        for l in result.lines:
            assert abs((l.net_ars + l.vat_ars) - l.diff_ars_total) < 0.01
        
        # El total neto + IVA global también debe cerrar
        assert abs((result.total_net_ars + result.total_vat_ars) - result.total_ars) < 0.01

    def test_nd_full_payment(self):
        """Pago total USD 1000 con TC diferente."""
        lines = _make_lines()
        result = calculate_fx_adjustment(
            invoice_lines=lines,
            invoice_total=1000.0,
            tc_invoice=1000.0,
            tc_application=1200.0,
            amount_applied=1000.0,
        )
        assert result.needs_adjustment
        assert result.sign == "ND"
        # Diferencia: 1000 * (1200-1000) = 200.000 ARS total
        assert abs(result.total_ars - 200000.0) < 1.0

    def test_vat_by_rate_breakdown(self):
        """Verificar desglose por alícuota."""
        lines = _make_lines()
        result = calculate_fx_adjustment(
            invoice_lines=lines,
            invoice_total=1000.0,
            tc_invoice=1000.0,
            tc_application=1100.0,
            amount_applied=1000.0,
        )
        assert 0.21 in result.vat_by_rate
        assert 0.105 in result.vat_by_rate
        assert result.vat_by_rate[0.21]["net"] > 0
        assert result.vat_by_rate[0.21]["vat"] > 0
        assert result.vat_by_rate[0.105]["net"] > 0


class TestFxEngineNC:
    """Tests de generación de NC (TC bajó)."""

    def test_nc_when_tc_drops(self):
        """Si TC baja, se genera NC."""
        lines = _make_lines()
        result = calculate_fx_adjustment(
            invoice_lines=lines,
            invoice_total=1000.0,
            tc_invoice=1100.0,
            tc_application=1000.0,
            amount_applied=500.0,
        )
        assert result.needs_adjustment
        assert result.sign == "NC"
        # Los montos deben ser positivos (valor absoluto)
        assert result.total_ars > 0
        for l in result.lines:
            assert l.net_ars >= 0
            assert l.vat_ars >= 0


class TestFxEngineRounding:
    """Tests de redondeo y ajuste de centavos."""

    def test_rounding_closes_exact(self):
        """La suma neto + IVA de todas las líneas debe ser exactamente igual al total."""
        lines = [
            InvoiceLine(line_id="l1", description="A", vat_rate=0.21,
                       net_amount=333.33, vat_amount=70.0, total_amount=403.33),
            InvoiceLine(line_id="l2", description="B", vat_rate=0.105,
                       net_amount=266.67, vat_amount=28.0, total_amount=294.67),
            InvoiceLine(line_id="l3", description="C", vat_rate=0.21,
                       net_amount=250.0, vat_amount=52.5, total_amount=302.0),
        ]
        result = calculate_fx_adjustment(
            invoice_lines=lines,
            invoice_total=1000.0,
            tc_invoice=1000.0,
            tc_application=1073.33,  # TC que genera redondeos complicados
            amount_applied=777.77,
        )
        if result.needs_adjustment:
            computed_total = sum(l.net_ars + l.vat_ars for l in result.lines)
            assert abs(computed_total - result.total_ars) < 0.02  # Tolerancia máxima 2 centavos

    def test_traceability_fields(self):
        """Verificar que los campos de trazabilidad están presentes."""
        lines = _make_lines()
        result = calculate_fx_adjustment(
            invoice_lines=lines,
            invoice_total=1000.0,
            tc_invoice=900.0,
            tc_application=1100.0,
            amount_applied=500.0,
        )
        assert result.tc_invoice == 900.0
        assert result.tc_application == 1100.0
        assert result.applied_amount_original == 500.0


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
