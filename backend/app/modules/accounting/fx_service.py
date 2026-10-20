from sqlalchemy.orm import Session
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from fastapi import HTTPException
from app.modules.accounting.document_status_service import get_document_usage, recalc_document_status
from app.db import models
from app.modules.accounting.fx_engine import (
    calculate_fx_adjustment,
    InvoiceLine,
    FX_ADJUSTMENT_THRESHOLD_ARS,
)

def generate_fx_adjustment(app_id: str, db: Session, mode: str = "FISCAL"):
    """
    Core service to generate an FX adjustment document for a given Application.
    This logic is shared between manual triggers (router) and automatic ones (mass liquidation).
    mode: "FISCAL" (generates ND/NC with VAT) or "COMPENSATION" (generates internal comp with 0 VAT).
    """
    app = db.query(models.Application).filter(models.Application.id == app_id).first()
    if not app:
        return None

    # 1. Check for existing adjustment
    existing_link = db.query(models.FxAdjustmentLink).filter(
        models.FxAdjustmentLink.source_application_id == app_id
    ).first()
    if existing_link:
        return existing_link

    # Only ARS receipts settling USD sales generate exchange differences.
    to_doc = app.to_document
    receipt = app.from_document
    if (receipt.doc_type != models.DocumentType.RECEIPT or
            receipt.currency != models.CurrencyType.ARS or
            to_doc.currency != models.CurrencyType.USD or
            to_doc.doc_type not in (models.DocumentType.INVOICE, models.DocumentType.DEBIT_NOTE) or
            to_doc.is_exchange_difference):
        return None
    if receipt.entity_id != to_doc.entity_id:
        raise HTTPException(400, "El recibo y la factura deben pertenecer al mismo cliente.")
    if receipt.status == models.DocumentStatus.CANCELLED or to_doc.status == models.DocumentStatus.CANCELLED:
        raise HTTPException(400, "No se pueden aplicar documentos anulados.")
    values = [Decimal(str(v or 0)) for v in (app.amount_applied, app.exchange_rate, to_doc.exchange_rate)]
    if any(not v.is_finite() or v <= 0 for v in values):
        raise HTTPException(400, "El monto y ambos tipos de cambio deben ser positivos y finitos.")
    amount, tc_payment, tc_invoice = values
    cash = (amount * tc_payment).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    # The source application is already flushed; exclude it from available credit.
    other_usage = Decimal(str(get_document_usage(receipt, db))) - Decimal(str(app.amount_applied_ars or 0))
    if other_usage + cash > Decimal(str(receipt.total_amount)) + Decimal('0.02'):
        raise HTTPException(400, "El recibo no alcanza para cubrir la aplicación y su diferencia de cambio.")
    if get_document_usage(to_doc, db) > float(to_doc.total_amount) + 0.000001:
        raise HTTPException(400, "La aplicación supera el saldo pendiente de la factura.")

    # 2. Build preview data
    lines = db.query(models.DocumentLine).filter(
        models.DocumentLine.document_id == to_doc.id
    ).order_by(models.DocumentLine.line_order).all()
    
    invoice_lines = [
        InvoiceLine(
            line_id=l.id,
            description=l.description,
            vat_rate=l.vat_rate,
            net_amount=l.net_amount,
            vat_amount=l.vat_amount,
            total_amount=l.total_amount,
        )
        for l in lines
    ]
    
    result = calculate_fx_adjustment(
        invoice_lines=invoice_lines,
        invoice_total=to_doc.total_amount,
        tc_invoice=to_doc.exchange_rate,
        tc_application=app.exchange_rate,
        amount_applied=app.amount_applied,
        threshold_ars=FX_ADJUSTMENT_THRESHOLD_ARS,
    )
    
    if not result.needs_adjustment:
        if tc_payment != tc_invoice and abs(cash - amount * tc_invoice) >= Decimal('0.01'):
            raise HTTPException(400, "No se pudo calcular la diferencia de cambio con el detalle de la factura.")
        return None

    expected_difference = abs(amount * (tc_payment - tc_invoice)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    if abs(Decimal(str(result.total_ars)) - expected_difference) > Decimal('0.01'):
        raise HTTPException(400, "El detalle de la factura no permite conciliar la diferencia de cambio con su total.")

    # Si es compensación, no tiene impacto fiscal (IVA 0%)
    if mode == "COMPENSATION":
        for idx in range(len(result.lines)):
            result.lines[idx].net_ars += result.lines[idx].vat_ars
            result.lines[idx].vat_ars = 0.0
            result.lines[idx].vat_rate = 0.0

    # 3. Generate Document (ND/NC) in ARS
    doc_type = models.DocumentType.DEBIT_NOTE if result.sign == "ND" else models.DocumentType.CREDIT_NOTE
    sign_label = "ND" if result.sign == "ND" else "NC"
    
    from app.modules.sales import numbering_service

    if mode == "COMPENSATION":
        doc_number = f"COMP-FX-{app_id[:8]}".upper()
        notes = f"Compensación interna CC por diferencia de cambio (TC {to_doc.exchange_rate} -> {app.exchange_rate})"
    else:
        import re
        # Extraer PV de la factura origen
        pv = "0001"
        if to_doc.number:
            parts = to_doc.number.split("-")
            pv_part = parts[-2] if len(parts) >= 2 else parts[0]
            pv_match = re.search(r'\d+', pv_part)
            if pv_match:
                candidate = pv_match.group().zfill(4)
                if len(candidate) == 4 and candidate != "0000":
                    pv = candidate
        

        # Determinar doc_tag correcto (NDA, NDB, etc)
        letter = to_doc.line or "A"
        doc_tag = f"ND{letter}" if result.sign == "ND" else f"NC{letter}"
        
        doc_number = numbering_service.get_next_number(db, pv, doc_tag)
        numbering_service.increment_last_number(db, pv, doc_tag)
        
        notes = f"Ajuste automático por diferencia de cambio (TC {to_doc.exchange_rate} -> {app.exchange_rate}). Recibo: {app.from_document.number} [ID:{app.from_document_id}]"
        
    new_doc = models.Document(
        entity_id=to_doc.entity_id,
        doc_type=doc_type,
        number=doc_number,
        date=datetime.utcnow(),
        currency=models.CurrencyType.ARS,
        exchange_rate=1.0,
        total_amount=result.total_ars,
        total_amount_ars=result.total_ars,
        status=models.DocumentStatus.OPEN,
        line=to_doc.line,
        notes=notes,
        salesperson_id=to_doc.salesperson_id,
        vendedor=to_doc.vendedor,
        cost_center=to_doc.cost_center,           # heredar centro de costos de la factura
        source_invoice_id=to_doc.id,              # trazabilidad con la factura origen
        reason_type=models.DocumentReasonType.EXCHANGE_DIFFERENCE,
        is_exchange_difference=True,
    )
    db.add(new_doc)
    db.flush()

    # 4. Create lines
    for i, line in enumerate(result.lines):
        doc_line = models.DocumentLine(
            document_id=new_doc.id,
            description=line.description,
            qty=1.0,
            unit_price=line.net_ars,
            discount_pct=0.0,
            net_amount=line.net_ars,
            vat_rate=line.vat_rate,
            vat_amount=line.vat_ars,
            total_amount=line.diff_ars_total,
            line_order=i,
        )
        db.add(doc_line)
    
    # 5. Create traceability link
    fx_link = models.FxAdjustmentLink(
        source_application_id=app.id,
        source_document_id=to_doc.id,
        generated_document_id=new_doc.id,
        tc_invoice=result.tc_invoice,
        tc_application=result.tc_application,
        applied_amount_original=result.applied_amount_original,
        diff_total_ars=result.total_ars,
    )
    db.add(fx_link)
    db.flush()
    
    # Split the same cash receipt between principal and adjustment, once.
    if mode == "FISCAL":
        difference = Decimal(str(result.total_ars))
        if new_doc.doc_type == models.DocumentType.DEBIT_NOTE:
            app.amount_applied_ars = float(cash - difference)
            settlement = models.Application(
                from_document_id=receipt.id, to_document_id=new_doc.id,
                amount_applied=float(difference), amount_applied_ars=float(difference),
                exchange_rate=1.0, cost_center=to_doc.cost_center,
            )
        else:
            # NC covers part of the invoice at its historical rate. Together with
            # the receipt it cancels exactly the originally requested USD amount.
            credit_usd = difference / tc_invoice
            app.amount_applied = float(amount - credit_usd)
            app.amount_applied_ars = float(cash)
            settlement = models.Application(
                from_document_id=new_doc.id, to_document_id=to_doc.id,
                amount_applied=float(credit_usd), amount_applied_ars=float(difference),
                exchange_rate=float(tc_invoice), cost_center=to_doc.cost_center,
            )
        db.add(settlement)
        db.flush()
        for document in (receipt, to_doc, new_doc):
            recalc_document_status(document, db)
    return fx_link
