from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import get_db
from app.db.models.commercial_models import Account
from app.modules.accounting import ledger_schemas
from app.db.models.models import Document, JournalEntry, JournalLine, LedgerSetting
from app.modules.accounting.ledger_engine import create_journal_entry_for_document
from sqlalchemy import and_, func
from datetime import datetime

router = APIRouter(prefix="/accounts-ledger", tags=["ledger"])

@router.get("/", response_model=List[ledger_schemas.AccountResponse])
def get_accounts(db: Session = Depends(get_db)):
    return db.query(Account).order_by(Account.code).all()

@router.post("/", response_model=ledger_schemas.AccountResponse)
def create_account(data: ledger_schemas.AccountCreate, db: Session = Depends(get_db)):
    existing = db.query(Account).filter(Account.code == data.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="El código de cuenta ya existe")
    
    db_account = Account(**data.model_dump())
    db.add(db_account)
    db.commit()
    db.refresh(db_account)
    return db_account

@router.put("/{account_id}", response_model=ledger_schemas.AccountResponse)
def update_account(account_id: str, data: ledger_schemas.AccountUpdate, db: Session = Depends(get_db)):
    db_account = db.query(Account).filter(Account.id == account_id).first()
    if not db_account:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    
    update_data = data.model_dump(exclude_unset=True)
    if "code" in update_data and update_data["code"] != db_account.code:
        existing = db.query(Account).filter(Account.code == update_data["code"]).first()
        if existing:
            raise HTTPException(status_code=400, detail="El nuevo código ya existe")

    for key, value in update_data.items():
        setattr(db_account, key, value)
    
    db.commit()
    db.refresh(db_account)
    return db_account

@router.delete("/{account_id}")
def delete_account(account_id: str, db: Session = Depends(get_db)):
    db_account = db.query(Account).filter(Account.id == account_id).first()
    if not db_account:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    
    # Check if used in products or other places? 
    # For now simple delete.
    db.delete(db_account)
    db.commit()
    return {"ok": True}

@router.post("/journalize/{doc_id}")
def manual_journalize_doc(doc_id: str, db: Session = Depends(get_db)):
    
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Doc not found")
        
    entry = create_journal_entry_for_document(db, doc)
    if not entry:
        raise HTTPException(status_code=400, detail="Document type not supported yet or missing entity")
        
    db.commit()
    return {"ok": True, "entry_id": entry.id, "total": entry.total_amount, "lines": len(entry.lines)}

@router.get("/entries/{doc_id}")
def get_journal_entry_for_doc(doc_id: str, db: Session = Depends(get_db)):
    entry = db.query(JournalEntry).filter(JournalEntry.document_id == doc_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
        
    return {
        "id": entry.id,
        "date": entry.date,
        "description": entry.description,
        "total": entry.total_amount,
        "lines": [
            {
                "account_code": l.account_code,
                "description": l.description,
                "debit": l.debit,
                "credit": l.credit,
            } for l in entry.lines
        ]
    }

@router.get("/entries")
def get_journal_entries(cost_center: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(JournalEntry)
    if cost_center:
        query = query.filter(JournalEntry.cost_center == cost_center)
    entries = query.order_by(JournalEntry.date.desc()).all()
    return [
        {
            "id": e.id,
            "date": e.date,
            "description": e.description,
            "total": e.total_amount,
            "document_id": e.document_id,
            "lines": [
                {
                    "account_code": l.account_code,
                    "description": l.description,
                    "debit": l.debit,
                    "credit": l.credit,
                } for l in e.lines
            ]
        } for e in entries
    ]
@router.get("/report/{account_code}")
def get_account_report(
    account_code: str, 
    from_date: Optional[str] = None, 
    to_date: Optional[str] = None, 
    cost_center: Optional[int] = None,
    db: Session = Depends(get_db)
):
    from app.db.models.models import JournalLine, JournalEntry
    from sqlalchemy import and_
    from datetime import datetime
    
    query = db.query(JournalLine).join(JournalEntry).filter(JournalLine.account_code == account_code)
    
    if from_date:
        query = query.filter(JournalEntry.date >= datetime.fromisoformat(from_date))
    if to_date:
        query = query.filter(JournalEntry.date <= datetime.fromisoformat(to_date))
    if cost_center:
        query = query.filter(JournalEntry.cost_center == cost_center)
        
    lines = query.order_by(JournalEntry.date.asc()).all()
    
    results = []
    running_balance = 0.0
    
    for l in lines:
        running_balance += (l.debit - l.credit)
        results.append({
            "date": l.entry.date,
            "entry_description": l.entry.description,
            "line_description": l.description,
            "debit": l.debit,
            "credit": l.credit,
            "balance": running_balance,
            "entry_id": l.entry_id
        })
    return results

@router.get("/settings")
def get_ledger_settings(db: Session = Depends(get_db)):
    return db.query(LedgerSetting).all()

@router.post("/settings")
def update_ledger_setting(key: str, value: str, description: Optional[str] = None, db: Session = Depends(get_db)):
    s = db.query(LedgerSetting).filter(LedgerSetting.key == key).first()
    if s:
        s.value = value
        if description: s.description = description
    else:
        s = LedgerSetting(key=key, value=value, description=description)
        db.add(s)
    db.commit()
    return {"ok": True}

@router.get("/balance")
def get_balance_report(
    from_date: Optional[str] = None, 
    to_date: Optional[str] = None, 
    cost_center: Optional[int] = None,
    db: Session = Depends(get_db)
):
    from app.db.models.models import JournalLine, JournalEntry
    from app.db.models.commercial_models import Account
    from sqlalchemy import func
    from datetime import datetime
    
    # 1. Obtener todas las cuentas
    accounts = db.query(Account).order_by(Account.code).all()
    
    # 2. Consultar sumas por cuenta
    date_filter = []
    if from_date:
        try:
            date_filter.append(JournalEntry.date >= datetime.fromisoformat(from_date))
        except: pass
    if to_date:
        try:
            date_filter.append(JournalEntry.date <= datetime.fromisoformat(to_date))
        except: pass
    if cost_center:
        date_filter.append(JournalEntry.cost_center == cost_center)
        
    sums_query = db.query(
        JournalLine.account_code,
        func.sum(JournalLine.debit).label("total_debit"),
        func.sum(JournalLine.credit).label("total_credit")
    ).join(JournalEntry)
    
    if date_filter:
        sums_query = sums_query.filter(*date_filter)
        
    sums = sums_query.group_by(JournalLine.account_code).all()
    sums_map = {s.account_code: s for s in sums}
    
    # 3. Armar reporte
    report = []
    for acc in accounts:
        acc_sums = sums_map.get(acc.code)
        debit = float(acc_sums.total_debit or 0.0) if acc_sums else 0.0
        credit = float(acc_sums.total_credit or 0.0) if acc_sums else 0.0
        balance = debit - credit
        
        # Opcional: solo incluir cuentas con movimiento o saldo? 
        if debit != 0 or credit != 0:
            report.append({
                "code": acc.code,
                "name": acc.name,
                "debit": debit,
                "credit": credit,
                "balance": balance
            })
            
    return report
