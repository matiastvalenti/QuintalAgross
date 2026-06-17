from sqlalchemy.orm import Session
from app.db import models
from app.db.models.models import Document, DocumentLine, DocumentType, DocumentStatus, CurrencyType
from .document_router import _log_history
from app.modules.sales import numbering_service
from datetime import datetime
from typing import Optional

def generate_interest_debit_note(receipt_id: str, amount: float, db: Session, notes: Optional[str] = None) -> Document:
    """
    Genera una Nota de Débito vinculada a un recibo por concepto de intereses.
    """
    receipt = db.query(Document).filter(Document.id == receipt_id).first()
    if not receipt:
        raise ValueError("Receipt not found")
        
    entity = receipt.entity
    if not entity:
        raise ValueError("Entity not found for receipt")
        
    # 1. Determinar número de comprobante
    # Por ahora hardcoded PV 0001 (o el del recibo si es posible)
    pv = receipt.number.split("-")[0] if "-" in receipt.number else "0001"
    full_number = numbering_service.get_next_number(db, pv, "NDA") # Default to NDA for interests
    
    # 2. Crear cabecera de ND
    dn = Document(
        entity_id=entity.id,
        doc_type=DocumentType.DEBIT_NOTE,
        number=full_number,
        date=datetime.utcnow(),
        currency=receipt.currency,
        exchange_rate=receipt.exchange_rate,
        total_amount=amount,
        total_amount_ars=amount * receipt.exchange_rate if receipt.currency == CurrencyType.USD else amount,
        status=DocumentStatus.OPEN,
        notes=notes or f"Intereses por pago diferido (Recibo {receipt.number})",
        created_by="Sistema"
    )
    db.add(dn)
    db.flush()
    
    # 3. Crear línea de interés
    # El interés suele llevar IVA 21%. 
    # Si amount es el TOTAL, debemos desglosar el neto.
    # Pero para no complicar el cálculo inverso, asumimos que 'amount' es el NETO y le sumamos IVA?
    # O asumimos que 'amount' es el TOTAL (Final). 
    # Vamos a asumir que 'amount' es el TOTAL sugerido.
    
    net = amount / 1.21
    vat = amount - net
    
    line = DocumentLine(
        document_id=dn.id,
        description=f"Intereses financieros por pago diferido - Ref {receipt.number}",
        qty=1,
        unit_price=net,
        net_amount=net,
        vat_rate=0.21,
        vat_amount=vat,
        total_amount=amount,
        line_order=0
    )
    db.add(line)
    
    # 4. Log
    _log_history(db, dn.id, "CREACION", f"ND generada automáticamente por intereses de Recibo {receipt.number}", user="Sistema")
    _log_history(db, receipt.id, "VINCULO", f"Se generó ND {full_number} por intereses", user="Sistema")
    
    # 5. Incrementar contador
    pv_code = full_number.split("-")[0]
    numbering_service.increment_last_number(db, pv_code, "NDA")
    
    return dn
