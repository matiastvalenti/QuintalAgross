"""Regresiones del contrato comercial: envases y cantidades de stock."""
import pytest

from app.utils.pricing import calculate_line_totals


def test_two_fractional_containers_preserve_base_quantity():
    result = calculate_line_totals(
        qty_packages=2,
        package_size=0.35,
        fallback_qty=99,
        unit_price=328,
        vat_rate=0.21,
    )
    assert result["qty_packages"] == 2
    assert result["package_size"] == 0.35
    assert result["qty"] == pytest.approx(0.7)
    assert result["net_amount"] == pytest.approx(229.6)


def test_partial_container_preserves_three_decimal_kg_precision():
    result = calculate_line_totals(
        qty_packages=0.3,
        package_size=0.35,
        fallback_qty=0,
        unit_price=328,
    )
    assert result["qty"] == pytest.approx(0.105)
    assert result["qty_packages"] == pytest.approx(0.3)


def test_missing_container_count_does_not_multiply_stock_quantity():
    result = calculate_line_totals(
        qty_packages=None,
        package_size=20,
        fallback_qty=1.4,
        unit_price=4.8,
    )
    assert result["qty"] == pytest.approx(1.4)
    assert result["qty_packages"] == pytest.approx(0.07)


def test_unit_product_and_missing_presentation():
    one = calculate_line_totals(qty_packages=3, package_size=1, fallback_qty=0)
    normal = calculate_line_totals(qty_packages=None, package_size=None, fallback_qty=3)
    assert one["qty"] == 3
    assert normal["qty"] == 3
