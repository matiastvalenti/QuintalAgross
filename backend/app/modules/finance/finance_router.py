from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel

from app.db.session import get_db
from app.db.models.finance_models import Cheque
from app.modules.auth.auth_router import check_permission
from . import cheque_schemas

router = APIRouter(prefix="/finance", tags=["finance"])

class ChequeResponse(BaseModel):
    id: int
    banco: str
    nro_cheque: str
    importe: float
    moneda: Optional[str]
    f_pago: Optional[datetime]
    estado: str
    cliente_dador: Optional[str]
    entregado_a: Optional[str]
    
    model_config = {
        "from_attributes": True,
        "populate_by_name": True
    }

@router.get("/cheques", response_model=List[ChequeResponse], dependencies=[Depends(check_permission("finance", "view"))])
def get_cheques(
    estado: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(Cheque)
    if estado:
        query = query.filter(Cheque.estado == estado)
    return query.all()

@router.post("/cheques/{cheque_id}/deposit", dependencies=[Depends(check_permission("finance", "edit"))])
def deposit_cheque(cheque_id: int, db: Session = Depends(get_db)):
    cheque = db.query(Cheque).filter(Cheque.id == cheque_id).first()
    if not cheque:
        raise HTTPException(status_code=404, detail="Cheque no encontrado")
    
    if cheque.estado != "EN_CARTERA":
        raise HTTPException(status_code=400, detail=f"Solo se pueden depositar cheques en cartera. Estado actual: {cheque.estado}")
    
    cheque.estado = "DEPOSITADO"
    db.commit()
    return {"status": "ok", "message": f"Cheque {cheque.nro_cheque} marcado como depositado"}

@router.post("/cheques/{cheque_id}/reject", dependencies=[Depends(check_permission("finance", "edit"))])
def reject_cheque(cheque_id: int, db: Session = Depends(get_db)):
    cheque = db.query(Cheque).filter(Cheque.id == cheque_id).first()
    if not cheque:
        raise HTTPException(status_code=404, detail="Cheque no encontrado")
    
    cheque.estado = "RECHAZADO"
    cheque.rechazado = True
    db.commit()
    return {"status": "ok", "message": f"Cheque {cheque.nro_cheque} marcado como rechazado"}
