import pytest
from app.modules.accounting.fx_engine import (
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
            net_amount=357.14,
            vat_amount=37.5,
            total_amount=395.0,
        ),
    ]

def test_no_adjustment_when_same_tc():
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

def test_nd_full_payment():
    """Pago total USD 1000 con TC diferente (Sube TC)."""
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

def test_nc_when_tc_drops():
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
    assert result.total_ars > 0
