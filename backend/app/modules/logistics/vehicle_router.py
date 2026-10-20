from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
from app.db.session import get_db
from app.db.models.models import Vehicle, Document, ExpenseItem, ExpenseItemVehicle, DocumentVehicleExpense
from .vehicle_expenses import vehicle_expenses, money
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
        expenses = vehicle_expenses(db, v.id, start_date, end_date)
        total = sum((money(row['amount']) for row in expenses), money(0))

        results.append({
            "id": v.id,
            "name": v.name,
            "plate": v.plate,
            "type": v.type,
            "driver_name": v.driver_name,
            "driver_id": v.driver_id,
            "active": v.active,
            "notes": v.notes,
            "insurance_due": v.insurance_due,
            "vtv_due": v.vtv_due,
            "total_expenses": float(total)
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
    """Gastos por comprobante, sin duplicados y sin imputar a trabajos."""
    if not db.get(Vehicle, vehicle_id):
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    return vehicle_expenses(db, vehicle_id, start_date, end_date)


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
