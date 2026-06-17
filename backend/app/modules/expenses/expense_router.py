from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile
from sqlalchemy.orm import Session, joinedload
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

router = APIRouter(prefix="/expenses", tags=["Expenses"])

def sync_item_vehicles(db: Session, db_item: ExpenseItem, vehicle_ids: List[str]):
    # Remove old links
    db.query(ExpenseItemVehicle).filter(ExpenseItemVehicle.expense_item_id == db_item.id).delete()
    # Add new ones
    for v_id in vehicle_ids:
        db.add(ExpenseItemVehicle(expense_item_id=db_item.id, vehicle_id=v_id))

@router.post("/claims", response_model=expense_schemas.ExpenseClaimResponse, status_code=201)
def create_expense_claim(data: expense_schemas.ExpenseClaimCreate, db: Session = Depends(get_db)):
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
    return db_claim

@router.get("/claims", response_model=List[expense_schemas.ExpenseClaimResponse])
def list_expense_claims(employee_id: Optional[str] = None, status: Optional[str] = None, cost_center: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(ExpenseClaim).options(joinedload(ExpenseClaim.employee))
    if cost_center: query = query.filter(ExpenseClaim.cost_center == cost_center)
    if employee_id: query = query.filter(ExpenseClaim.entity_id == employee_id)
    if status: query = query.filter(ExpenseClaim.status == status)
    claims = query.order_by(ExpenseClaim.date.desc()).all()
    for c in claims:
        c.employee_name = c.employee.name if c.employee else "Unknown"
    return claims

@router.get("/claims/{claim_id}", response_model=expense_schemas.ExpenseClaimResponse)
def get_expense_claim(claim_id: str, db: Session = Depends(get_db)):
    claim = db.query(ExpenseClaim).options(
        joinedload(ExpenseClaim.employee),
        joinedload(ExpenseClaim.items).joinedload(ExpenseItem.vehicles)
    ).filter(ExpenseClaim.id == claim_id).first()
    
    if not claim: raise HTTPException(status_code=404, detail="Rendición no encontrada")
    claim.employee_name = claim.employee.name if claim.employee else "Unknown"
    
    # Map vehicle_ids back to response
    for item in claim.items:
        item.vehicle_ids = [v.vehicle_id for v in item.vehicles]
        
    return claim

@router.put("/claims/{claim_id}", response_model=expense_schemas.ExpenseClaimResponse)
def update_expense_claim(claim_id: str, data: expense_schemas.ExpenseClaimCreate, db: Session = Depends(get_db)):
    db_claim = db.query(ExpenseClaim).filter(ExpenseClaim.id == claim_id).first()
    if not db_claim: raise HTTPException(status_code=404, detail="Rendición no encontrada")
    if db_claim.status in [expense_schemas.ExpenseClaimStatus.APPROVED, expense_schemas.ExpenseClaimStatus.REIMBURSED]:
        raise HTTPException(status_code=400, detail="No se puede editar una rendición aprobada o pagada")

    db_claim.title = data.title
    db_claim.entity_id = data.entity_id
    db_claim.date = data.date
    db_claim.notes = data.notes
    db_claim.unidad_negocio = data.unidad_negocio
    db_claim.campana = data.campana
    db_claim.por_cta_orden = data.por_cta_orden
    db_claim.total_amount = sum(item.amount for item in data.items)

    # Re-sync items
    db.query(ExpenseItem).filter(ExpenseItem.claim_id == claim_id).delete()
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
    return db_claim

@router.patch("/claims/{claim_id}/status")
def update_claim_status(claim_id: str, status: expense_schemas.ExpenseClaimStatus, db: Session = Depends(get_db)):
    claim = db.query(ExpenseClaim).options(
        joinedload(ExpenseClaim.items).joinedload(ExpenseItem.vehicles)
    ).filter(ExpenseClaim.id == claim_id).first()
    if not claim: raise HTTPException(status_code=404, detail="Rendición no encontrada")
    
    if status == expense_schemas.ExpenseClaimStatus.APPROVED and claim.status != expense_schemas.ExpenseClaimStatus.APPROVED:
        employee = db.query(Entity).filter(Entity.id == claim.entity_id).first()
        if not employee: raise HTTPException(status_code=400, detail="Empleado no encontrado")
        total_reimbursement = 0.0
        
        for item in claim.items:
            # 1. Create Purchase Invoice for Store (if provider info exists)
            ptax = item.provider_tax_id or ""
            clean_cuit = ptax.replace("-", "").strip()
            
            provider = None
            if item.provider_id:
                provider = db.query(Entity).filter(Entity.id == item.provider_id).first()
            if not provider and clean_cuit:
                provider = db.query(Entity).filter(Entity.tax_id.like(f"%{clean_cuit}%")).first()
            
            if provider or clean_cuit or item.provider_name:
                if not provider:
                    provider = Entity(id=str(uuid.uuid4()), name=item.provider_name or f"PROV CUIT {clean_cuit}", tax_id=clean_cuit, type=EntityType.PROVIDER)
                    db.add(provider); db.flush()
                
                pi_id = str(uuid.uuid4())
                pi_doc = Document(
                    id=pi_id, entity_id=provider.id, doc_type=DocumentType.PURCHASE_INVOICE,
                    number=item.invoice_number or f"TKT-{uuid.uuid4().hex[:6].upper()}",
                    date=item.date, total_amount=item.amount, total_amount_ars=item.amount,
                    line=item.line, # Use extracted line A/B/C
                    status=DocumentStatus.CLOSED, notes=f"Rendición: {claim.title} - Pagado por {employee.name}",
                    unidad_negocio=claim.unidad_negocio,
                    campana=claim.campana,
                    por_cta_orden=claim.por_cta_orden,
                    cost_center=claim.cost_center
                )
                db.add(pi_doc); db.flush()
                
                line_account = item.account_code or f"2.EXPENSE.{item.category.upper() if item.category else 'OTHER'}"
                db.add(DocumentLine(
                    id=str(uuid.uuid4()), document_id=pi_id, description=item.description,
                    qty=1.0, unit_price=item.net_amount or item.amount, net_amount=item.net_amount or item.amount,
                    vat_rate=item.vat_rate, vat_amount=item.vat_amount, 
                    total_amount=item.amount, account_code=line_account
                ))
                
                # Link vehicles
                item_vehicles = item.vehicles
                if item_vehicles:
                    perc = 100.0 / len(item_vehicles)
                    for iv in item_vehicles:
                        db.add(DocumentVehicleExpense(
                            document_id=pi_id, vehicle_id=iv.vehicle_id, amount=item.amount / len(item_vehicles), percentage=perc
                        ))
                
                # 2. Balancing Payment
                db.add(Document(
                    id=str(uuid.uuid4()), entity_id=provider.id, doc_type=DocumentType.PAYMENT,
                    number=f"PAGO-RND-{uuid.uuid4().hex[:6].upper()}",
                    date=item.date, total_amount=item.amount, total_amount_ars=item.amount,
                    status=DocumentStatus.CLOSED, notes=f"Cancelado por rindi: {claim.title}. Pagado por {employee.name}",
                    cost_center=claim.cost_center
                ))
                item.generated_doc_id = pi_id
            
            total_reimbursement += item.amount
            
        # 3. Final Debt Document
        debt_doc_id = str(uuid.uuid4())
        debt_doc = Document(
            id=debt_doc_id, entity_id=employee.id, doc_type=DocumentType.PURCHASE_INVOICE,
            number=f"REND-{uuid.uuid4().hex[:6].upper()}", date=claim.date,
            total_amount=total_reimbursement, total_amount_ars=total_reimbursement,
            status=DocumentStatus.OPEN, notes=f"Deuda por rendición: {claim.title}",
            cost_center=claim.cost_center
        )
        db.add(debt_doc); db.flush()
        db.add(DocumentLine(
            id=str(uuid.uuid4()), document_id=debt_doc_id, description=f"Rendición: {claim.title}",
            qty=1.0, unit_price=total_reimbursement, net_amount=total_reimbursement,
            vat_rate=0.0, vat_amount=0.0, total_amount=total_reimbursement, account_code="2.VARIOUS"
        ))
        claim.reimbursement_doc_id = debt_doc_id

    claim.status = status
    if status == expense_schemas.ExpenseClaimStatus.REIMBURSED:
        claim.reimbursed_at = datetime.utcnow()
        if claim.reimbursement_doc_id:
            debt = db.query(Document).filter(Document.id == claim.reimbursement_doc_id).first()
            if debt: debt.status = DocumentStatus.CLOSED
        
    db.commit()
    return {"status": "updated", "id": claim_id, "new_status": status}

@router.delete("/claims/{claim_id}", status_code=204)
def delete_claim(claim_id: str, db: Session = Depends(get_db)):
    claim = db.query(ExpenseClaim).filter(ExpenseClaim.id == claim_id).first()
    if not claim: raise HTTPException(status_code=404, detail="Rendición no encontrada")
    if claim.status in [expense_schemas.ExpenseClaimStatus.APPROVED, expense_schemas.ExpenseClaimStatus.REIMBURSED]:
        raise HTTPException(status_code=400, detail="No se puede eliminar una rendición aprobada o pagada")
    db.delete(claim); db.commit(); return None

@router.post("/upload-receipt")
async def upload_receipt(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"): raise HTTPException(status_code=400, detail="Solo imágenes")
    file_ext = os.path.splitext(file.filename)[1]
    filename = f"{uuid.uuid4()}{file_ext}"
    path = os.path.join("uploads", filename)
    if not os.path.exists("uploads"): os.makedirs("uploads")
    with open(path, "wb") as buffer: buffer.write(await file.read())
    return {"url": f"/uploads/{filename}"}
