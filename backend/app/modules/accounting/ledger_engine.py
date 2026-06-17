from sqlalchemy.orm import Session
from app.db.models.models import Document, JournalEntry, JournalLine, DocumentType, CurrencyType, LedgerSetting
from app.db.models.commercial_models import Product
from datetime import datetime

def get_ledger_setting(db: Session, key: str, default: str) -> str:
    s = db.query(LedgerSetting).filter(LedgerSetting.key == key).first()
    return s.value if s else default

def create_journal_entry_for_document(db: Session, doc: Document):
    """
    Genera (o regenera) el asiento contable para un documento comercial.
    Soporta: Ventas, Compras, Recibos, Pagos y Liquidaciones de Granos.
    """
    # 1. Eliminar asiento previo si existe (para regeneración limpia)
    existing_entry = db.query(JournalEntry).filter(JournalEntry.document_id == doc.id).first()
    if existing_entry:
        db.delete(existing_entry)
        db.flush()
        
    entity = doc.entity
    if not entity:
        return None
        
    def get_setting(key, default):
        return get_ledger_setting(db, key, default)

    def get_payment_account(method):
        if method == "CASH": return get_setting("CASH", "1.1.1.001")
        if method in ["TRANSFER", "DEPOSIT"]: return get_setting("BANK", "1.1.1.002")
        if method == "CHECK": return get_setting("CHECKS_PORTFOLIO", "1.1.1.003")
        if method == "RETENTION": 
            # Si es recibo (cobro), es Activo (crédito fiscal). Si es pago, es Pasivo (deuda fiscal).
            return get_setting("RETENTIONS", "1.1.3.005" if doc.doc_type == DocumentType.RECEIPT else "2.1.2.005")
        return get_setting("OTHER_PAYMENT", "1.1.1.099")

    # Determinar tipo de documento
    is_sales = doc.doc_type in [DocumentType.INVOICE, DocumentType.DEBIT_NOTE, DocumentType.CREDIT_NOTE]
    is_purchase = doc.doc_type in [DocumentType.PURCHASE_INVOICE, DocumentType.PURCHASE_DEBIT_NOTE, DocumentType.PURCHASE_CREDIT_NOTE]
    is_receipt = doc.doc_type == DocumentType.RECEIPT
    is_payment = doc.doc_type == DocumentType.PAYMENT
    is_lpg = doc.doc_type in [DocumentType.LPG_PRIMARY, DocumentType.LPG_SECONDARY]

    if not (is_sales or is_purchase or is_receipt or is_payment or is_lpg):
        return None

    # Monto total en moneda base (ARS)
    rate = doc.exchange_rate or 1.0
    total_doc_ars = float(doc.total_amount or 0.0) * rate
    
    # Crear Cabecera
    entry = JournalEntry(
        document_id=doc.id,
        date=doc.date or datetime.utcnow(),
        description=f"{doc.doc_type} {doc.number} - {entity.name}",
        total_amount=total_doc_ars,
        cost_center=doc.cost_center
    )
    db.add(entry)
    db.flush() 
    
    lines_to_add = []

    # --- LÓGICA POR TIPO DE DOCUMENTO ---

    if is_sales or is_purchase:
        # FACTURACIÓN (Ventas o Compras)
        entity_account = entity.account_code or (get_setting("CLIENTS", "1.1.2.001") if is_sales else get_setting("PROVIDERS", "2.1.1.001"))
        
        # A) Imputación a la Entidad (Deudores/Acreedores)
        if doc.doc_type in [DocumentType.INVOICE, DocumentType.DEBIT_NOTE]:
            lines_to_add.append(JournalLine(entry_id=entry.id, account_code=entity_account, description=f"Cta. Cte. {entity.name}", debit=total_doc_ars, credit=0.0, entity_id=entity.id))
        elif doc.doc_type == DocumentType.CREDIT_NOTE:
            lines_to_add.append(JournalLine(entry_id=entry.id, account_code=entity_account, description=f"NC {entity.name}", debit=0.0, credit=total_doc_ars, entity_id=entity.id))
        elif doc.doc_type in [DocumentType.PURCHASE_INVOICE, DocumentType.PURCHASE_DEBIT_NOTE]:
            lines_to_add.append(JournalLine(entry_id=entry.id, account_code=entity_account, description=f"Deuda {entity.name}", debit=0.0, credit=total_doc_ars, entity_id=entity.id))
        elif doc.doc_type == DocumentType.PURCHASE_CREDIT_NOTE:
            lines_to_add.append(JournalLine(entry_id=entry.id, account_code=entity_account, description=f"NC Prov {entity.name}", debit=total_doc_ars, credit=0.0, entity_id=entity.id))

        # B) Imputación a Contrapartida (Líneas)
        total_vat = 0.0
        for doc_line in doc.lines:
            ln_net = float(doc_line.net_amount or 0.0) * rate
            ln_vat = float(doc_line.vat_amount or 0.0) * rate
            total_vat += ln_vat
            
            acc_code = doc_line.account_code or (get_setting("SALES_GENERIC", "4.1.1.001") if is_sales else get_setting("PURCHASES_GENERIC", "5.1.1.001"))

            if doc.doc_type in [DocumentType.INVOICE, DocumentType.DEBIT_NOTE]:
                lines_to_add.append(JournalLine(entry_id=entry.id, account_code=acc_code, description=doc_line.description, debit=0.0, credit=ln_net))
            elif doc.doc_type == DocumentType.CREDIT_NOTE:
                lines_to_add.append(JournalLine(entry_id=entry.id, account_code=acc_code, description=f"Reversa: {doc_line.description}", debit=ln_net, credit=0.0))
            elif doc.doc_type in [DocumentType.PURCHASE_INVOICE, DocumentType.PURCHASE_DEBIT_NOTE]:
                lines_to_add.append(JournalLine(entry_id=entry.id, account_code=acc_code, description=doc_line.description, debit=ln_net, credit=0.0))
            elif doc.doc_type == DocumentType.PURCHASE_CREDIT_NOTE:
                lines_to_add.append(JournalLine(entry_id=entry.id, account_code=acc_code, description=f"Reversa: {doc_line.description}", debit=0.0, credit=ln_net))

        # C) IVA
        if total_vat > 0:
            if is_sales: 
                vat_acc = get_setting("VAT_DEBIT", "2.1.2.001")
                if doc.doc_type == DocumentType.CREDIT_NOTE:
                    lines_to_add.append(JournalLine(entry_id=entry.id, account_code=vat_acc, description="Reversa IVA DF", debit=total_vat, credit=0.0))
                else:
                    lines_to_add.append(JournalLine(entry_id=entry.id, account_code=vat_acc, description="IVA Débito Fiscal", debit=0.0, credit=total_vat))
            else:
                vat_acc = get_setting("VAT_CREDIT", "1.1.3.001")
                if doc.doc_type == DocumentType.PURCHASE_CREDIT_NOTE:
                    lines_to_add.append(JournalLine(entry_id=entry.id, account_code=vat_acc, description="Reversa IVA CF", debit=0.0, credit=total_vat))
                else:
                    lines_to_add.append(JournalLine(entry_id=entry.id, account_code=vat_acc, description="IVA Crédito Fiscal", debit=total_vat, credit=0.0))

    elif is_receipt or is_payment:
        # COBROS Y PAGOS
        entity_account = entity.account_code or (get_setting("CLIENTS", "1.1.2.001") if is_receipt else get_setting("PROVIDERS", "2.1.1.001"))
        
        if is_receipt:
            lines_to_add.append(JournalLine(entry_id=entry.id, account_code=entity_account, description=f"Cobranza {entity.name}", debit=0.0, credit=total_doc_ars, entity_id=entity.id))
        else:
            lines_to_add.append(JournalLine(entry_id=entry.id, account_code=entity_account, description=f"Pago a {entity.name}", debit=total_doc_ars, credit=0.0, entity_id=entity.id))

        for pay in doc.payments:
            if pay.type == "RETENTION": continue 
            pay_amt_ars = float(pay.amount or 0.0) * rate
            pay_acc = get_payment_account(pay.type)
            if is_receipt:
                lines_to_add.append(JournalLine(entry_id=entry.id, account_code=pay_acc, description=f"Cobro {pay.type}: {pay.description or ''}", debit=pay_amt_ars, credit=0.0))
            else:
                lines_to_add.append(JournalLine(entry_id=entry.id, account_code=pay_acc, description=f"Salida {pay.type}: {pay.description or ''}", debit=0.0, credit=pay_amt_ars))

        for r in (doc.retentions or []):
            r_amt = float(r.amount or 0.0) * rate
            if r_amt > 0:
                r_acc = get_setting(f"RETENTION_{r.tax_name.upper()}", "1.1.3.004" if is_receipt else "2.1.2.004")
                if is_receipt:
                    lines_to_add.append(JournalLine(entry_id=entry.id, account_code=r_acc, description=f"Ret. {r.tax_name} sufrida", debit=r_amt, credit=0.0))
                else:
                    lines_to_add.append(JournalLine(entry_id=entry.id, account_code=r_acc, description=f"Ret. {r.tax_name} practicada", debit=0.0, credit=r_amt))

    elif is_lpg:
        # LIQUIDACIONES DE GRANOS
        entity_account = entity.account_code or (get_setting("CLIENTS", "1.1.2.001") if doc.doc_type == DocumentType.LPG_SECONDARY else get_setting("PROVIDERS", "2.1.1.001"))
        contra_account = get_setting("GRAIN_SALES", "4.1.2.001") if doc.doc_type == DocumentType.LPG_SECONDARY else get_setting("GRAIN_PURCHASES", "5.1.2.001")
        iva_account = get_setting("IVA_CREDIT", "1.1.3.001") if doc.doc_type == DocumentType.LPG_PRIMARY else get_setting("IVA_DEBIT", "2.1.2.001")

        total_items_net = sum(float(l.net_amount or 0) for l in doc.lines) * rate
        total_items_vat = sum(float(l.vat_amount or 0) for l in doc.lines) * rate
        
        if doc.doc_type == DocumentType.LPG_PRIMARY:
            lines_to_add.append(JournalLine(entry_id=entry.id, account_code=contra_account, description=f"Grano s/ {doc.number}", debit=total_items_net, credit=0.0))
            if total_items_vat > 0.01:
                lines_to_add.append(JournalLine(entry_id=entry.id, account_code=iva_account, description=f"IVA s/ {doc.number}", debit=total_items_vat, credit=0.0))
        else:
            lines_to_add.append(JournalLine(entry_id=entry.id, account_code=contra_account, description=f"Venta Grano s/ {doc.number}", debit=0.0, credit=total_items_net))
            if total_items_vat > 0.01:
                lines_to_add.append(JournalLine(entry_id=entry.id, account_code=iva_account, description=f"IVA s/ {doc.number}", debit=0.0, credit=total_items_vat))

        from app.db import grain_models
        settle = db.query(grain_models.GrainSettlement).filter(grain_models.GrainSettlement.document_id == doc.id).first()
        if settle:
            for tax in settle.taxes:
                tax_amt = float(tax.amount or 0) * rate
                if tax_amt <= 0.01: continue
                tax_acc = get_setting(f"GRAIN_TAX_{tax.category.upper()}", "2.1.3.001")
                if doc.doc_type == DocumentType.LPG_PRIMARY:
                     lines_to_add.append(JournalLine(entry_id=entry.id, account_code=tax_acc, description=f"{tax.category} s/ {doc.number}", debit=0.0, credit=tax_amt))
                else:
                     lines_to_add.append(JournalLine(entry_id=entry.id, account_code=tax_acc, description=f"{tax.category} s/ {doc.number}", debit=tax_amt, credit=0.0))

        if doc.doc_type == DocumentType.LPG_PRIMARY:
             lines_to_add.append(JournalLine(entry_id=entry.id, account_code=entity_account, description=f"Liq. Grano {doc.number}", debit=0.0, credit=total_doc_ars, entity_id=entity.id))
        else:
             lines_to_add.append(JournalLine(entry_id=entry.id, account_code=entity_account, description=f"Liq. Grano {doc.number}", debit=total_doc_ars, credit=0.0, entity_id=entity.id))

    # --- FINALIZACIÓN ---
    db.add_all(lines_to_add)
    db.flush()
    return entry
