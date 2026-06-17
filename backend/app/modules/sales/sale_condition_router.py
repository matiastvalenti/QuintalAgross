from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.db.models.commercial_models import SaleCondition
from .sale_condition_schemas import SaleConditionCreate, SaleConditionUpdate, SaleCondition as SaleConditionSchema
from app.modules.auth.auth_router import check_permission

router = APIRouter(prefix="/sale-conditions", tags=["sale-conditions"])

@router.get("/", response_model=List[SaleConditionSchema], dependencies=[Depends(check_permission("sales_orders", "view"))])
def read_conditions(db: Session = Depends(get_db)):
    return db.query(SaleCondition).all()

@router.post("/", response_model=SaleConditionSchema, dependencies=[Depends(check_permission("sales_orders", "create"))])
def create_condition(condition: SaleConditionCreate, db: Session = Depends(get_db)):
    db_cond = SaleCondition(**condition.model_dump())
    db.add(db_cond)
    db.commit()
    db.refresh(db_cond)
    return db_cond

@router.put("/{condition_id}", response_model=SaleConditionSchema, dependencies=[Depends(check_permission("sales_orders", "edit"))])
def update_condition(condition_id: str, condition: SaleConditionUpdate, db: Session = Depends(get_db)):
    db_cond = db.query(SaleCondition).filter(SaleCondition.id == condition_id).first()
    if not db_cond:
        raise HTTPException(status_code=404, detail="Condition not found")
    
    update_data = condition.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_cond, key, value)
    
    db.commit()
    db.refresh(db_cond)
    return db_cond

@router.delete("/{condition_id}", dependencies=[Depends(check_permission("sales_orders", "delete"))])
def delete_condition(condition_id: str, db: Session = Depends(get_db)):
    db_cond = db.query(SaleCondition).filter(SaleCondition.id == condition_id).first()
    if not db_cond:
        raise HTTPException(status_code=404, detail="Condition not found")
    
    db.delete(db_cond)
    db.commit()
    return {"ok": True}
