from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
from app.db.session import get_db
from app.db.models.models import Vehicle, Document, ExpenseItem, ExpenseItemVehicle, DocumentVehicleExpense
from sqlalchemy import func
from . import vehicle_schemas

router = APIRouter(prefix="/vehicles", tags=["logistics"])

@router.get("/", response_model=List[dict])
def list_vehicles(active_only: bool = False, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None, db: Session = Depends(get_db)):
    from datetime import datetime as dt
    query = db.query(Vehicle)
    if active_only:
        query = query.filter(Vehicle.active == True)
    
    vehicles = query.order_by(Vehicle.name).all()
    results = []
    
    for v in vehicles:
        # Sum from ExpenseItems (Tickets)
        expense_sum = db.query(func.sum(ExpenseItem.amount)).join(ExpenseItemVehicle).filter(
            ExpenseItemVehicle.vehicle_id == v.id
        )
        if start_date: expense_sum = expense_sum.filter(ExpenseItem.date >= start_date)
        if end_date: expense_sum = expense_sum.filter(ExpenseItem.date <= end_date)
        total_tickets = expense_sum.scalar() or 0
        
        # Sum from Documents (Purchase Invoices imputed to vehicle)
        doc_expense_sum = db.query(func.sum(DocumentVehicleExpense.amount)).join(Document).filter(
            DocumentVehicleExpense.vehicle_id == v.id
        )
        if start_date: doc_expense_sum = doc_expense_sum.filter(Document.date >= start_date)
        if end_date: doc_expense_sum = doc_expense_sum.filter(Document.date <= end_date)
        total_docs = doc_expense_sum.scalar() or 0
        
        # Direct link in Document (simplest case)
        direct_doc_sum = db.query(func.sum(Document.total_amount_ars)).filter(
            Document.vehicle_id == v.id
        )
        if start_date: direct_doc_sum = direct_doc_sum.filter(Document.date >= start_date)
        if end_date: direct_doc_sum = direct_doc_sum.filter(Document.date <= end_date)
        total_direct = direct_doc_sum.scalar() or 0
        
        results.append({
            "id": v.id,
            "name": v.name,
            "plate": v.plate,
            "type": v.type,
            "driver_name": v.driver_name,
            "driver_id": v.driver_id,
            "active": v.active,
            "notes": v.notes,
            "total_expenses": float(total_tickets + total_docs + total_direct)
        })
        
    return results

@router.get("/{vehicle_id}", response_model=vehicle_schemas.VehicleResponse)
def get_vehicle(vehicle_id: str, db: Session = Depends(get_db)):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    return vehicle

@router.post("/", response_model=vehicle_schemas.VehicleResponse)
def create_vehicle(vehicle_in: vehicle_schemas.VehicleCreate, db: Session = Depends(get_db)):
    vehicle = Vehicle(**vehicle_in.model_dump())
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle

@router.put("/{vehicle_id}", response_model=vehicle_schemas.VehicleResponse)
def update_vehicle(vehicle_id: str, vehicle_in: vehicle_schemas.VehicleUpdate, db: Session = Depends(get_db)):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    
    update_data = vehicle_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(vehicle, field, value)
    
    db.commit()
    db.refresh(vehicle)
    return vehicle

@router.get("/{vehicle_id}/expenses", response_model=List[dict])
def get_vehicle_expenses(vehicle_id: str, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None, db: Session = Depends(get_db)):
    # Tickets from ExpenseItems
    tickets = db.query(ExpenseItem).join(ExpenseItemVehicle).filter(
        ExpenseItemVehicle.vehicle_id == vehicle_id
    )
    if start_date: tickets = tickets.filter(ExpenseItem.date >= start_date)
    if end_date: tickets = tickets.filter(ExpenseItem.date <= end_date)
    
    # Documents (Direct or via DocumentVehicleExpense)
    docs = db.query(Document).outerjoin(DocumentVehicleExpense).filter(
        (Document.vehicle_id == vehicle_id) | (DocumentVehicleExpense.vehicle_id == vehicle_id)
    )
    if start_date: docs = docs.filter(Document.date >= start_date)
    if end_date: docs = docs.filter(Document.date <= end_date)
    
    results = []
    for t in tickets.all():
        results.append({
            "date": t.date,
            "description": t.description,
            "amount": t.amount,
            "category": t.category,
            "type": "Ticket"
        })
    for d in docs.all():
        # If it's partial expense, we should find the specific amount
        amount = d.total_amount_ars
        if d.vehicle_id != vehicle_id:
            # It came from DocumentVehicleExpense
            ve = db.query(DocumentVehicleExpense).filter(
                DocumentVehicleExpense.document_id == d.id,
                DocumentVehicleExpense.vehicle_id == vehicle_id
            ).first()
            if ve: amount = ve.amount

        results.append({
            "date": d.date,
            "description": f"{d.doc_type} {d.number}",
            "amount": amount,
            "category": "Compra",
            "type": "Factura"
        })
        
    return sorted(results, key=lambda x: x['date'], reverse=True)

@router.delete("/{vehicle_id}")
def delete_vehicle(vehicle_id: str, db: Session = Depends(get_db)):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    
    # Soft delete? For now hard delete if not linked, otherwise we might need check dependencies
    # As per user request, we want to keep history, so maybe just deactivate?
    vehicle.active = False
    db.commit()
    return {"detail": "Vehículo desactivado"}
