from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.models.models import Document, DocumentStatus, DocumentType, Application, CommissionPayment

def is_cancelled_status(status):
    raw = getattr(status, "value", status)
    raw = str(raw or "").upper()
    return raw in ["CANCELLED", "ANULADO", "VOID"]

def get_document_usage(doc: Document, db: Session) -> float:
    """
    Returns the amount of the document that has been 'used' / applied.
    For credits (Receipt, NC), it's the sum of applications emitted + commissions.
    For debts (Invoice, ND), it's the sum of applications received.
    """
    if not doc or is_cancelled_status(doc.status):
        return 0.0

    usage = 0.0
    credit_types = [
        DocumentType.RECEIPT, 
        DocumentType.PAYMENT, 
        DocumentType.CREDIT_NOTE, 
        DocumentType.PURCHASE_CREDIT_NOTE
    ]
    
    is_usd = str(doc.currency) in ("USD", "CurrencyType.USD")
    
    if doc.doc_type in credit_types:
        # Documentos que "entregan" saldo (Recibo, Pago, NC)
        if is_usd:
            # Sumar aplicaciones convertidas a USD (amount_applied_ars / exchange_rate)
            total_applied_fin = db.query(func.sum(Application.amount_applied_ars / func.nullif(Application.exchange_rate, 0))).filter(
                Application.from_document_id == doc.id
            ).scalar() or 0.0
            
            # Sumar comisiones en USD
            total_comm = db.query(func.sum(CommissionPayment.applied_amount)).filter(
                CommissionPayment.source_document_id == doc.id
            ).scalar() or 0.0
            
            usage = float(total_applied_fin) + float(total_comm)
        else:
            # Sumar aplicaciones en ARS (amount_applied_ars)
            total_applied_fin = db.query(func.sum(Application.amount_applied_ars)).filter(
                Application.from_document_id == doc.id
            ).scalar() or 0.0
            
            # Sumar comisiones en ARS
            total_comm = db.query(func.sum(CommissionPayment.amount)).filter(
                CommissionPayment.source_document_id == doc.id
            ).scalar() or 0.0
            
            usage = float(total_applied_fin) + float(total_comm)
    else:
        # Documentos que "reciben" saldo (Factura, ND, Factura Compra)
        total_received_fin = db.query(func.sum(Application.amount_applied)).filter(
            Application.to_document_id == doc.id
        ).scalar() or 0.0
        usage = float(total_received_fin)

    return usage

def get_document_balance_info(doc: Document, db: Session) -> dict:
    """
    Returns balance information for a document, using real applications.
    """
    if not doc or is_cancelled_status(doc.status):
        return {"total": 0.0, "applied": 0.0, "balance": 0.0}
    
    total = float(doc.total_amount or 0)
    usage = get_document_usage(doc, db)
    
    # Avoid floating point negative zero
    balance = max(0.0, total - usage)
    
    return {
        "total": total,
        "applied": usage,
        "balance": balance
    }

def recalc_document_status(doc: Document, db: Session):
    """
    Recalcula el estado de un documento basándose en sus aplicaciones (financieras)
    y, si es un Pago/Recibo, también en sus pagos de comisiones asociados.
    Asegura consistencia de monedas al comparar usage vs total_amount.
    """
    if not doc or is_cancelled_status(doc.status):
        return

    usage = get_document_usage(doc, db)
    total_amount = float(doc.total_amount or 0)
    
    is_usd = str(doc.currency) in ("USD", "CurrencyType.USD")
    TOLERANCE = 0.015 if is_usd else 2.00 # 1.5 centavos USD o 2 pesos ARS
    
    if usage >= (total_amount - TOLERANCE):
        doc.status = DocumentStatus.CLOSED
    elif usage > TOLERANCE:
        doc.status = DocumentStatus.PARTIAL
    else:
        doc.status = DocumentStatus.OPEN
