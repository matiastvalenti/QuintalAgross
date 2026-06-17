from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.db.models.commercial_models import Category, SubCategory, Product
from app.modules.inventory import product_schemas

router = APIRouter(prefix="/rubros", tags=["Rubros"])

# ── Categories (Rubros) ──
@router.get("/", response_model=List[product_schemas.Category])
def list_categories(active_only: bool = Query(False), db: Session = Depends(get_db)):
    q = db.query(Category)
    if active_only:
        q = q.filter(Category.active == True)
    return q.order_by(Category.name).all()

@router.post("/", response_model=product_schemas.Category)
def create_category(data: product_schemas.CategoryCreate, db: Session = Depends(get_db)):
    # Check if a category with the same name already exists
    exists = db.query(Category).filter(Category.name.ilike(data.name)).first()
    if exists:
        raise HTTPException(status_code=400, detail=f"El rubro '{data.name}' ya existe.")
    
    new_cat = Category(name=data.name, active=data.active)
    db.add(new_cat)
    db.commit()
    db.refresh(new_cat)
    return new_cat

@router.patch("/{category_id}", response_model=product_schemas.Category)
def update_category(category_id: str, data: product_schemas.CategoryCreate, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Rubro no encontrado")
    
    # Optional: Check if name already exists elsewhere
    if data.name.lower() != cat.name.lower():
        exists = db.query(Category).filter(Category.name.ilike(data.name)).first()
        if exists:
            raise HTTPException(status_code=400, detail=f"El rubro '{data.name}' ya existe.")
    
    cat.name = data.name
    cat.active = data.active
    db.commit()
    db.refresh(cat)
    return cat

@router.delete("/{category_id}")
def delete_category(category_id: str, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Rubro no encontrado")
    
    # Safety Check: Subcategories
    if cat.subcategories:
        raise HTTPException(status_code=400, detail="No se puede eliminar un rubro que tiene subrubros asociados.")
    
    db.delete(cat)
    db.commit()
    return {"ok": True}

# ── SubCategories (Subrubros) ──
@router.get("/{category_id}/subcategories", response_model=List[product_schemas.SubCategory])
def list_subcategories(category_id: str, active_only: bool = Query(False), db: Session = Depends(get_db)):
    q = db.query(SubCategory).filter(SubCategory.category_id == category_id)
    if active_only:
        q = q.filter(SubCategory.active == True)
    return q.order_by(SubCategory.name).all()

@router.post("/{category_id}/subcategories", response_model=product_schemas.SubCategory)
def create_subcategory(category_id: str, data: product_schemas.SubCategoryCreate, db: Session = Depends(get_db)):
    # Check if parent exists
    parent = db.query(Category).filter(Category.id == category_id).first()
    if not parent:
        raise HTTPException(status_code=404, detail="El rubro padre no existe.")

    # Check for duplicate in the same category
    exists = db.query(SubCategory).filter(
        SubCategory.category_id == category_id,
        SubCategory.name.ilike(data.name)
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail=f"El subrubro '{data.name}' ya existe en este rubro.")

    new_sub = SubCategory(
        category_id=category_id,
        name=data.name,
        active=data.active
    )
    db.add(new_sub)
    db.commit()
    db.refresh(new_sub)
    return new_sub

@router.patch("/subcategories/{subcategory_id}", response_model=product_schemas.SubCategory)
def update_subcategory(subcategory_id: str, data: product_schemas.SubCategoryCreate, db: Session = Depends(get_db)):
    sub = db.query(SubCategory).filter(SubCategory.id == subcategory_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subrubro no encontrado")
    
    # Check duplicate in same category
    if data.name.lower() != sub.name.lower():
        exists = db.query(SubCategory).filter(
            SubCategory.category_id == sub.category_id,
            SubCategory.name.ilike(data.name)
        ).first()
        if exists:
            raise HTTPException(status_code=400, detail=f"El subrubro '{data.name}' ya existe en este rubro.")
    
    sub.name = data.name
    sub.active = data.active
    db.commit()
    db.refresh(sub)
    return sub

@router.delete("/subcategories/{subcategory_id}")
def delete_subcategory(subcategory_id: str, db: Session = Depends(get_db)):
    sub = db.query(SubCategory).filter(SubCategory.id == subcategory_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subrubro no encontrado")
    
    # Safety Check: Products
    product_exists = db.query(Product).filter(Product.subcategory_id == subcategory_id).first()
    if product_exists:
        raise HTTPException(status_code=400, detail="No se puede eliminar un subrubro que tiene productos asociados.")
    
    db.delete(sub)
    db.commit()
    return {"ok": True}
