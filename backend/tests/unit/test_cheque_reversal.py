from types import SimpleNamespace
import pytest

from app.modules.finance.cheque_reversal import (
    CheckCancellationError,
    cancel_receipt_checks,
    ensure_payment_checks_reconciled,
)


def cheque(numero, estado):
    return SimpleNamespace(nro_cheque=numero, estado=estado)


def test_receipt_cancellation_removes_available_checks_from_portfolio():
    checks = [cheque("CH-01", "EN_CARTERA"), cheque("CH-02", "PENDIENTE")]
    assert cancel_receipt_checks(checks) == 2
    assert [check.estado for check in checks] == ["ANULADO", "ANULADO"]


def test_receipt_cancellation_is_atomic_when_check_was_endorsed():
    checks = [cheque("CH-01", "EN_CARTERA"), cheque("CH-02", "ENDOSADO")]
    with pytest.raises(CheckCancellationError, match="CH-02"):
        cancel_receipt_checks(checks)
    assert [check.estado for check in checks] == ["EN_CARTERA", "ENDOSADO"]


def test_receipt_cancellation_does_not_undo_a_deposit():
    with pytest.raises(CheckCancellationError, match="CH-03"):
        cancel_receipt_checks([cheque("CH-03", "DEPOSITADO")])


def test_payment_with_checks_requires_reconciliation_before_annulling():
    with pytest.raises(CheckCancellationError, match="contiene cheques"):
        ensure_payment_checks_reconciled([
            SimpleNamespace(type="TRANSFER"),
            SimpleNamespace(type="CHECK"),
        ])


def test_payment_without_checks_can_be_annulled():
    ensure_payment_checks_reconciled([SimpleNamespace(type="CASH")])
