from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import get_db
from app.db.models.commercial_models import Unit, Container, TaxType
from app.modules.inventory import product_schemas

router = APIRouter(prefix="/catalogs", tags=["Catalogs"])

# ── Units ──
@router.get("/units", response_model=List[product_schemas.Unit])
def list_units(db: Session = Depends(get_db)):
    return db.query(Unit).all()

# ── Tax Types ──
@router.get("/tax-types", response_model=List[product_schemas.TaxType])
def list_tax_types(db: Session = Depends(get_db)):
    return db.query(TaxType).filter(TaxType.active == True).all()

# ── Containers ──
@router.get("/containers", response_model=List[product_schemas.Container])
def list_containers(db: Session = Depends(get_db)):
    return db.query(Container).all()

@router.post("/containers", response_model=product_schemas.Container)
def create_container(data: product_schemas.Container, db: Session = Depends(get_db)):
    exists = db.query(Container).filter(Container.name == data.name).first()
    if exists:
        raise HTTPException(status_code=400, detail="Container already exists")
    
    new_container = Container(
        name=data.name,
        capacity=data.capacity,
        unit_id=data.unit_id
    )
    db.add(new_container)
    db.commit()
    db.refresh(new_container)
    return new_container
