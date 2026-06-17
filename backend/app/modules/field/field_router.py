from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.db.models import field_models
from . import field_schemas

router = APIRouter(prefix="/field", tags=["field"])

# --- FARMS ---
@router.post("/farms", response_model=field_schemas.FarmSchema)
def create_farm(data: field_schemas.FarmCreate, db: Session = Depends(get_db)):
    db_farm = field_models.Farm(**data.model_dump())
    db.add(db_farm)
    db.commit()
    db.refresh(db_farm)
    return db_farm

@router.get("/farms", response_model=List[field_schemas.FarmSchema])
def list_farms(db: Session = Depends(get_db)):
    return db.query(field_models.Farm).filter(field_models.Farm.active == True).all()

@router.put("/farms/{farm_id}", response_model=field_schemas.FarmSchema)
def update_farm(farm_id: str, data: field_schemas.FarmCreate, db: Session = Depends(get_db)):
    db_farm = db.query(field_models.Farm).filter(field_models.Farm.id == farm_id).first()
    if not db_farm:
        raise HTTPException(status_code=404, detail="Farm not found")
    for key, value in data.model_dump().items():
        setattr(db_farm, key, value)
    db.commit()
    db.refresh(db_farm)
    return db_farm

@router.delete("/farms/{farm_id}")
def delete_farm(farm_id: str, db: Session = Depends(get_db)):
    db_farm = db.query(field_models.Farm).filter(field_models.Farm.id == farm_id).first()
    if not db_farm:
        raise HTTPException(status_code=404, detail="Farm not found")
    db_farm.active = False
    db.commit()
    return {"status": "success"}

# --- LOTS ---
@router.post("/lots", response_model=field_schemas.LotSchema)
def create_lot(data: field_schemas.LotCreate, db: Session = Depends(get_db)):
    db_lot = field_models.Lot(**data.model_dump())
    db.add(db_lot)
    db.commit()
    db.refresh(db_lot)
    return db_lot

@router.get("/lots", response_model=List[field_schemas.LotSchema])
def list_lots(farm_id: str | None = None, db: Session = Depends(get_db)):
    query = db.query(field_models.Lot).filter(field_models.Lot.active == True)
    if farm_id:
        query = query.filter(field_models.Lot.farm_id == farm_id)
    return query.all()

@router.put("/lots/{lot_id}", response_model=field_schemas.LotSchema)
def update_lot(lot_id: str, data: field_schemas.LotCreate, db: Session = Depends(get_db)):
    db_lot = db.query(field_models.Lot).filter(field_models.Lot.id == lot_id).first()
    if not db_lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    for key, value in data.model_dump().items():
        setattr(db_lot, key, value)
    db.commit()
    db.refresh(db_lot)
    return db_lot

@router.delete("/lots/{lot_id}")
def delete_lot(lot_id: str, db: Session = Depends(get_db)):
    db_lot = db.query(field_models.Lot).filter(field_models.Lot.id == lot_id).first()
    if not db_lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    db_lot.active = False
    db.commit()
    return {"status": "success"}

# --- MACHINERY ---
@router.post("/machinery", response_model=field_schemas.MachinerySchema)
def create_machinery(data: field_schemas.MachineryCreate, db: Session = Depends(get_db)):
    db_mac = field_models.Machinery(**data.model_dump())
    db.add(db_mac)
    db.commit()
    db.refresh(db_mac)
    return db_mac

@router.get("/machinery", response_model=List[field_schemas.MachinerySchema])
def list_machinery(db: Session = Depends(get_db)):
    return db.query(field_models.Machinery).filter(field_models.Machinery.active == True).all()

@router.put("/machinery/{machinery_id}", response_model=field_schemas.MachinerySchema)
def update_machinery(machinery_id: str, data: field_schemas.MachineryCreate, db: Session = Depends(get_db)):
    db_mac = db.query(field_models.Machinery).filter(field_models.Machinery.id == machinery_id).first()
    if not db_mac:
        raise HTTPException(status_code=404, detail="Machinery not found")
    for key, value in data.model_dump().items():
        setattr(db_mac, key, value)
    db.commit()
    db.refresh(db_mac)
    return db_mac

@router.delete("/machinery/{machinery_id}")
def delete_machinery(machinery_id: str, db: Session = Depends(get_db)):
    db_mac = db.query(field_models.Machinery).filter(field_models.Machinery.id == machinery_id).first()
    if not db_mac:
        raise HTTPException(status_code=404, detail="Machinery not found")
    db_mac.active = False
    db.commit()
    return {"status": "success"}

# --- ACTIVITIES ---
@router.post("/activities", response_model=field_schemas.FieldActivitySchema)
def create_activity(data: field_schemas.FieldActivityCreate, db: Session = Depends(get_db)):
    db_act = field_models.FieldActivity(**data.model_dump())
    db.add(db_act)
    db.commit()
    db.refresh(db_act)
    return db_act

@router.get("/activities", response_model=List[field_schemas.FieldActivitySchema])
def list_activities(lot_id: str | None = None, harvest_id: str | None = None, db: Session = Depends(get_db)):
    query = db.query(field_models.FieldActivity)
    if lot_id:
        query = query.filter(field_models.FieldActivity.lot_id == lot_id)
    if harvest_id:
        query = query.filter(field_models.FieldActivity.harvest_id == harvest_id)
    return query.all()

@router.put("/activities/{activity_id}", response_model=field_schemas.FieldActivitySchema)
def update_activity(activity_id: str, data: field_schemas.FieldActivityCreate, db: Session = Depends(get_db)):
    db_act = db.query(field_models.FieldActivity).filter(field_models.FieldActivity.id == activity_id).first()
    if not db_act:
        raise HTTPException(status_code=404, detail="Activity not found")
    for key, value in data.model_dump().items():
        setattr(db_act, key, value)
    db.commit()
    db.refresh(db_act)
    return db_act

@router.delete("/activities/{activity_id}")
def delete_activity(activity_id: str, db: Session = Depends(get_db)):
    db_act = db.query(field_models.FieldActivity).filter(field_models.FieldActivity.id == activity_id).first()
    if not db_act:
        raise HTTPException(status_code=404, detail="Activity not found")
    db.delete(db_act) # Actividades sí se borran físicamente o podrías agregar un active
    db.commit()
    return {"status": "success"}

# --- INPUT USAGE ---
@router.post("/input-usages", response_model=field_schemas.FieldInputUsageSchema)
def create_usage(data: field_schemas.FieldInputUsageCreate, db: Session = Depends(get_db)):
    db_usage = field_models.FieldInputUsage(**data.model_dump())
    db.add(db_usage)
    db.commit()
    db.refresh(db_usage)
    return db_usage

@router.get("/activities/{activity_id}/usages", response_model=List[field_schemas.FieldInputUsageSchema])
def list_activity_usages(activity_id: str, db: Session = Depends(get_db)):
    return db.query(field_models.FieldInputUsage).filter(field_models.FieldInputUsage.activity_id == activity_id).all()

@router.delete("/input-usages/{usage_id}")
def delete_usage(usage_id: str, db: Session = Depends(get_db)):
    db_usage = db.query(field_models.FieldInputUsage).filter(field_models.FieldInputUsage.id == usage_id).first()
    if not db_usage:
        raise HTTPException(status_code=404, detail="Usage record not found")
    db.delete(db_usage)
    db.commit()
    return {"status": "success"}

# --- DASHBOARD ---
from sqlalchemy import func

@router.get("/dashboard/profitability")
def get_profitability_dashboard(harvest_id: str | None = None, db: Session = Depends(get_db)):
    query = db.query(field_models.FieldActivity).filter(field_models.FieldActivity.status == 'COMPLETED')
    if harvest_id:
        query = query.filter(field_models.FieldActivity.harvest_id == harvest_id)
        
    activities = query.all()
    result = []
    
    for act in activities:
        lot = db.query(field_models.Lot).filter(field_models.Lot.id == act.lot_id).first()
        if not lot: continue
            
        usages = db.query(field_models.FieldInputUsage).filter(field_models.FieldInputUsage.activity_id == act.id).all()
        total_cost = sum(float(u.total_cost) for u in usages)
        
        # Calculate revenue if actual_yield is present (mock grain price for now or leave revenue simple)
        # Using a mock price of $300 per TN (0.3 per kg)
        grain_price = 0.3
        actual_yield_kg = float(act.actual_yield or 0)
        revenue_per_ha = actual_yield_kg * grain_price
        total_revenue = revenue_per_ha * float(lot.hectares)
        
        result.append({
            "activity_id": act.id,
            "lot_name": lot.name,
            "hectares": float(lot.hectares),
            "actual_yield": actual_yield_kg,
            "total_cost": total_cost,
            "cost_per_ha": total_cost / float(lot.hectares) if float(lot.hectares) > 0 else 0,
            "total_revenue": total_revenue,
            "margin": total_revenue - total_cost
        })
        
    return result
