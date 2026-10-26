import pytest

from app.modules.entities.import_utils import (
    clean_cell, normalize_label, format_cuit, parse_tax_category,
)


def test_cuit_normalizes_excel_number_and_formatted_value():
    assert format_cuit(30717400212.0) == "30-71740021-2"
    assert format_cuit("30-71740021-2") == "30-71740021-2"


@pytest.mark.parametrize("invalid", [123, "20-12345", "307174002120", "ABC"])
def test_cuit_invalid_rows_do_not_get_silent_fake_tax_id(invalid):
    with pytest.raises(ValueError):
        format_cuit(invalid)


def test_cuit_missing_is_optional():
    assert format_cuit(None) is None
    assert format_cuit(float("nan")) is None


def test_names_and_headers_can_have_accents():
    assert normalize_label("Razón Social") == "razon social"
    assert normalize_label("C.U.I.T.") == "c u i t"


def test_tax_category_uses_explicit_cell_not_cuit_prefix():
    assert parse_tax_category("Responsable Inscripto") == "RESPONSABLE_INSCRIPTO"
    assert parse_tax_category("MONOTRIBUTISTA") == "MONOTRIBUTO"
    assert parse_tax_category("") is None
    assert parse_tax_category("No consta") is None


def test_empty_excel_cells_are_not_imported_as_nan_text():
    assert clean_cell(float("nan")) == ""
