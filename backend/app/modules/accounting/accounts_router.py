from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.db.models.commercial_models import Account
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError

router = APIRouter(prefix="/accounts", tags=["accounting accounts"])

class AccountBase(BaseModel):
    code: str
    name: str
    active: bool = True

class AccountCreate(AccountBase):
    pass

class AccountUpdate(BaseModel):
    code: str = None
    name: str = None
    active: bool = None

class AccountResponse(AccountBase):
    id: str
    class Config:
        from_attributes = True

@router.get("", response_model=List[AccountResponse])
def get_accounts(db: Session = Depends(get_db)):
    return db.query(Account).order_by(Account.code).all()

@router.post("", response_model=AccountResponse)
def create_account(acc: AccountCreate, db: Session = Depends(get_db)):
    try:
        db_acc = Account(**acc.dict())
        db.add(db_acc)
        db.commit()
        db.refresh(db_acc)
        return db_acc
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="El código de cuenta ya existe")

@router.put("/{acc_id}", response_model=AccountResponse)
def update_account(acc_id: str, acc: AccountUpdate, db: Session = Depends(get_db)):
    db_acc = db.query(Account).filter(Account.id == acc_id).first()
    if not db_acc:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    
    update_data = acc.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_acc, key, value)
        
    try:
        db.commit()
        db.refresh(db_acc)
        return db_acc
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="El código de cuenta ya existe")

@router.delete("/{acc_id}")
def delete_account(acc_id: str, db: Session = Depends(get_db)):
    db_acc = db.query(Account).filter(Account.id == acc_id).first()
    if not db_acc:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    
    db.delete(db_acc)
    db.commit()
    return {"status": "ok"}
