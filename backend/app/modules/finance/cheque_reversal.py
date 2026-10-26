"""Reglas conservadoras para anulación de comprobantes con cheques.

No restaura automáticamente un cheque depositado/endosado ni da por
cancelado un cheque propio emitido: esos movimientos requieren gestión física.
"""


class CheckCancellationError(ValueError):
    pass


def cancel_receipt_checks(checks):
    """Marca como anulados los cheques aún disponibles del recibo.

    Primero valida todo el lote; si uno ya circuló, no cambia ninguno.
    """
    unavailable = [
        check for check in checks
        if check.estado not in ("EN_CARTERA", "PENDIENTE", "ANULADO")
    ]
    if unavailable:
        numbers = ", ".join(str(check.nro_cheque) for check in unavailable[:5])
        raise CheckCancellationError(
            f"No se puede anular el recibo: el cheque {numbers} ya salió de cartera. "
            "Revertí primero su depósito/endoso o gestioná su devolución."
        )

    for check in checks:
        check.estado = "ANULADO"
    return len(checks)


def ensure_payment_checks_reconciled(items):
    """Evita anular una OP mientras sus cheques sigan en circulación."""
    checks = [
        item for item in items
        if str(getattr(item.type, "value", item.type)).upper() == "CHECK"
    ]
    if checks:
        raise CheckCancellationError(
            "La orden de pago contiene cheques. Antes de anularla se debe "
            "reconciliar la emisión o devolución de cada cheque; "
            "no se puede restaurar cartera automáticamente."
        )
