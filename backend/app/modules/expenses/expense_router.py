from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError, OperationalError
import os, uuid
from typing import List, Optional
from datetime import datetime
from app.db.session import get_db
from app.db.models.models import (
    ExpenseClaim, ExpenseItem, ExpenseItemVehicle, Entity, EntityType, 
    Document, DocumentType, DocumentLine, DocumentStatus, CurrencyType,
    DocumentVehicleExpense
)
from app.modules.expenses import expense_schemas
from app.modules.auth.auth_router import get_current_user
from app.db.models.employee_fund_models import ClaimFunding
from .access import scope, require, allowed, own_entity
from .funds import approve_claim, audit


router = APIRouter(prefix="/expenses", tags=["Expenses"])


def lock_claim(db,claim):
    db.query(ExpenseClaim).filter_by(id=claim.id).update({ExpenseClaim.updated_at:ExpenseClaim.updated_at},synchronize_session=False)
    db.refresh(claim)


def decorate(db,claim):
    meta=db.get(ClaimFunding,claim.id)
    claim.currency=meta.currency if meta else 'ARS'
    claim.exchange_rate=float(meta.exchange_rate) if meta else 1
    claim.review_note=meta.review_note if meta else None
    claim.employee_name=claim.employee.name if claim.employee else ''
    for item in claim.items: item.vehicle_ids=[v.vehicle_id for v in item.vehicles]
    return claim


def validate_claim_data(db,data,user):
    from app.db.models.models import Vehicle
    from app.db.models.commercial_models import Account
    employee=db.get(Entity,data.entity_id)
    if not employee or employee.type != EntityType.EMPLOYEE:
        raise HTTPException(400,'Seleccione un empleado registrado.')
    for item in data.items:
        if item.attachment_url and '/expenses/receipts/' in item.attachment_url:
            receipt_id=item.attachment_url.rsplit('/expenses/receipts/',1)[1]
            get_receipt(receipt_id,db,user)
        if not item.account_code or not db.query(Account).filter_by(code=item.account_code,active=True).first():
            raise HTTPException(400,'Cada comprobante debe tener una cuenta contable activa.')
        if len(set(item.vehicle_ids))!=len(item.vehicle_ids) or any(not db.get(Vehicle,v) for v in item.vehicle_ids):
            raise HTTPException(400,'Vehículo inexistente o repetido.')

def sync_item_vehicles(db: Session, db_item: ExpenseItem, vehicle_ids: List[str]):
    # Remove old links
    db.query(ExpenseItemVehicle).filter(ExpenseItemVehicle.expense_item_id == db_item.id).delete()
    # Add new ones
    for v_id in vehicle_ids:
        db.add(ExpenseItemVehicle(expense_item_id=db_item.id, vehicle_id=v_id))

@router.post("/claims", response_model=expense_schemas.ExpenseClaimResponse, status_code=201)
def create_expense_claim(data: expense_schemas.ExpenseClaimCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    scope(db,current_user,data.entity_id)
    require(db,current_user,'employee_expenses','create')
    validate_claim_data(db,data,current_user)
    employee = db.query(Entity).filter(Entity.id == data.entity_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    db_claim = ExpenseClaim(
        entity_id=data.entity_id,
        title=data.title,
        date=data.date,
        notes=data.notes,
        unidad_negocio=data.unidad_negocio,
        campana=data.campana,
        por_cta_orden=data.por_cta_orden,
        cost_center=data.cost_center,
        total_amount=sum(item.amount for item in data.items)
    )
    db.add(db_claim)
    db.flush()
    db.add(ClaimFunding(claim_id=db_claim.id,currency=data.currency,exchange_rate=data.exchange_rate))

    for item_data in data.items:
        dict_data = item_data.model_dump()
        vehicle_ids = dict_data.pop("vehicle_ids", [])
        db_item = ExpenseItem(
            claim_id=db_claim.id,
            **dict_data
        )
        db.add(db_item)
        db.flush()
        sync_item_vehicles(db, db_item, vehicle_ids)

    db.commit()
    db.refresh(db_claim)
    return decorate(db,db_claim)

@router.get("/claims", response_model=List[expense_schemas.ExpenseClaimResponse])
def list_expense_claims(employee_id: Optional[str] = None, status: Optional[str] = None, cost_center: Optional[int] = None, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    require(db,current_user,'employee_expenses')
    query = db.query(ExpenseClaim).options(joinedload(ExpenseClaim.employee))
    if not allowed(db,current_user,'employee_expenses_all'):
        own=own_entity(db,current_user)
        if not own: return []
        query=query.filter(ExpenseClaim.entity_id==own)
    if cost_center: query = query.filter(ExpenseClaim.cost_center == cost_center)
    if employee_id: query = query.filter(ExpenseClaim.entity_id == employee_id)
    if status: query = query.filter(ExpenseClaim.status == status)
    claims = query.order_by(ExpenseClaim.date.desc()).all()
    for c in claims:
        c.employee_name = c.employee.name if c.employee else "Unknown"
    return [decorate(db,c) for c in claims]

@router.get("/claims/{claim_id}", response_model=expense_schemas.ExpenseClaimResponse)
def get_expense_claim(claim_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    claim = db.query(ExpenseClaim).options(
        joinedload(ExpenseClaim.employee),
        joinedload(ExpenseClaim.items).joinedload(ExpenseItem.vehicles)
    ).filter(ExpenseClaim.id == claim_id).first()
    
    if not claim: raise HTTPException(status_code=404, detail="Rendición no encontrada")
    scope(db,current_user,claim.entity_id)
    claim.employee_name = claim.employee.name if claim.employee else "Unknown"
    
    # Map vehicle_ids back to response
    for item in claim.items:
        item.vehicle_ids = [v.vehicle_id for v in item.vehicles]
        
    return decorate(db,claim)

@router.put("/claims/{claim_id}", response_model=expense_schemas.ExpenseClaimResponse)
def update_expense_claim(claim_id: str, data: expense_schemas.ExpenseClaimCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_claim = db.query(ExpenseClaim).filter(ExpenseClaim.id == claim_id).first()
    if not db_claim: raise HTTPException(status_code=404, detail="Rendición no encontrada")
    lock_claim(db,db_claim)
    scope(db,current_user,db_claim.entity_id)
    scope(db,current_user,data.entity_id)
    require(db,current_user,'employee_expenses','edit')
    validate_claim_data(db,data,current_user)
    if db_claim.status not in [expense_schemas.ExpenseClaimStatus.DRAFT, expense_schemas.ExpenseClaimStatus.REJECTED]:
        raise HTTPException(status_code=400, detail="No se puede editar una rendición aprobada o pagada")

    meta=db.get(ClaimFunding,claim_id)
    if not meta:
        meta=ClaimFunding(claim_id=claim_id); db.add(meta)
    meta.currency=data.currency; meta.exchange_rate=data.exchange_rate
    db_claim.cost_center=data.cost_center
    db_claim.title = data.title
    db_claim.entity_id = data.entity_id
    db_claim.date = data.date
    db_claim.notes = data.notes
    db_claim.unidad_negocio = data.unidad_negocio
    db_claim.campana = data.campana
    db_claim.por_cta_orden = data.por_cta_orden
    db_claim.total_amount = sum(item.amount for item in data.items)

    # Re-sync items
    for old_item in list(db_claim.items):
        db.delete(old_item)
    db.flush()
    for item_data in data.items:
        dict_data = item_data.model_dump()
        vehicle_ids = dict_data.pop("vehicle_ids", [])
        db_item = ExpenseItem(claim_id=db_claim.id, **dict_data)
        db.add(db_item)
        db.flush()
        sync_item_vehicles(db, db_item, vehicle_ids)

    db.commit()
    db.refresh(db_claim)
    db_claim.employee_name = db_claim.employee.name if db_claim.employee else "Unknown"
    return decorate(db,db_claim)

@router.patch("/claims/{claim_id}/status")
def update_claim_status(claim_id: str, status: expense_schemas.ExpenseClaimStatus, db: Session = Depends(get_db), current_user=Depends(get_current_user), reason: str = ""):
    """Presentar bloquea; solo un revisor puede aprobar o devolver con motivo."""
    claim=db.get(ExpenseClaim,claim_id)
    if not claim: raise HTTPException(404,'Rendición no encontrada')
    scope(db,current_user,claim.entity_id)
    lock_claim(db,claim)
    try:
        if status == expense_schemas.ExpenseClaimStatus.SUBMITTED:
            require(db,current_user,'employee_expenses','edit')
            if claim.status not in (expense_schemas.ExpenseClaimStatus.DRAFT,expense_schemas.ExpenseClaimStatus.REJECTED):
                raise HTTPException(409,'La rendición ya fue presentada.')
            if not claim.items: raise HTTPException(400,'Agregue al menos un comprobante.')
            claim.status=status
        elif status == expense_schemas.ExpenseClaimStatus.REJECTED:
            require(db,current_user,'employee_review','edit')
            if claim.status != expense_schemas.ExpenseClaimStatus.SUBMITTED:
                raise HTTPException(409,'Solo se puede devolver una rendición presentada.')
            if not reason.strip(): raise HTTPException(400,'Indique el motivo de devolución.')
            meta=db.get(ClaimFunding,claim_id)
            if not meta: meta=ClaimFunding(claim_id=claim_id); db.add(meta)
            meta.review_note=reason.strip(); claim.status=status
        elif status == expense_schemas.ExpenseClaimStatus.APPROVED:
            require(db,current_user,'employee_review','create')
            approve_claim(db,claim,current_user)
        else:
            raise HTTPException(400,'Los reintegros se registran desde la cuenta del empleado con su movimiento de caja/banco.')
        audit(db,current_user,'ESTADO',claim_id,f'{status.value}: {reason}')
        db.commit()
        return {'status':'updated','id':claim_id,'new_status':status}
    except (IntegrityError, OperationalError):
        db.rollback(); raise HTTPException(409,'Hubo una operación simultánea. Recargue la rendición antes de reintentar.')
    except ValueError as exc:
        db.rollback(); raise HTTPException(400,str(exc))
    except Exception:
        db.rollback(); raise

@router.delete("/claims/{claim_id}", status_code=204)
def delete_claim(claim_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    claim = db.query(ExpenseClaim).filter(ExpenseClaim.id == claim_id).first()
    if not claim: raise HTTPException(status_code=404, detail="Rendición no encontrada")
    lock_claim(db,claim)
    scope(db,current_user,claim.entity_id)
    require(db,current_user,'employee_expenses','delete')
    if claim.status not in [expense_schemas.ExpenseClaimStatus.DRAFT, expense_schemas.ExpenseClaimStatus.REJECTED]:
        raise HTTPException(status_code=400, detail="No se puede eliminar una rendición aprobada o pagada")
    meta=db.get(ClaimFunding,claim_id)
    if meta: db.delete(meta)
    db.delete(claim); db.commit(); return None


from pathlib import Path
from fastapi.responses import FileResponse
from app.db.models.employee_fund_models import EmployeeReceiptUpload
RECEIPTS_DIR = Path(__file__).resolve().parents[3] / 'private_receipts'

@router.post('/upload-receipt')
async def upload_receipt(file: UploadFile = File(...),db:Session=Depends(get_db),current_user=Depends(get_current_user)):
    """Private receipt upload, accessible only to its owner/reviewers."""
    require(db,current_user,'employee_expenses','create')
    if file.content_type not in ('image/jpeg','image/png','image/webp','application/pdf'):
        raise HTTPException(400,'Adjunte JPG, PNG, WEBP o PDF.')
    content=await file.read(10*1024*1024+1)
    if len(content)>10*1024*1024: raise HTTPException(400,'El archivo supera 10 MB.')
    upload=EmployeeReceiptUpload(user_id=current_user.id,mime_type=file.content_type)
    db.add(upload); db.flush()
    RECEIPTS_DIR.mkdir(parents=True,exist_ok=True)
    path=RECEIPTS_DIR/upload.id
    try:
        path.write_bytes(content); db.commit()
    except Exception:
        db.rollback(); path.unlink(missing_ok=True); raise
    return {'url':f'/expenses/receipts/{upload.id}'}

@router.get('/receipts/{receipt_id}')
def get_receipt(receipt_id:str,db:Session=Depends(get_db),current_user=Depends(get_current_user)):
    require(db,current_user,'employee_expenses')
    row=db.get(EmployeeReceiptUpload,receipt_id)
    if not row: raise HTTPException(404,'Comprobante no encontrado')
    if row.user_id!=current_user.id and not allowed(db,current_user,'employee_expenses_all'):
        reference='/expenses/receipts/'+receipt_id
        linked=db.query(ExpenseItem).join(ExpenseClaim).filter(ExpenseItem.attachment_url.endswith(reference),
            ExpenseClaim.entity_id==own_entity(db,current_user)).first()
        if not linked: raise HTTPException(403,'No puede acceder a este comprobante.')
    path=RECEIPTS_DIR/row.id
    if not path.is_file(): raise HTTPException(404,'Archivo no disponible')
    return FileResponse(path,media_type=row.mime_type,headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})
