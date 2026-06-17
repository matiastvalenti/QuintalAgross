from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from app.db.session import get_db
from app.db.models.models import Entity, Document, Vehicle
from app.db.models.commercial_models import Product
from datetime import datetime

router = APIRouter(prefix="/search", tags=["search"])

@router.get("/global")
def global_search(q: str = Query(...), db: Session = Depends(get_db)):
    results = []
    
    if len(q) < 2:
        return results

    query_str = f"%{q}%"

    # 1. Search Entities (Clients/Providers/Employees)
    entities = db.query(Entity).filter(
        or_(
            Entity.name.ilike(query_str),
            Entity.tax_id.ilike(query_str),
            Entity.code.ilike(query_str)
        )
    ).limit(6).all()
    
    for e in entities:
        type_label = str(e.type.value if hasattr(e.type, "value") else e.type).upper()
        results.append({
            "type": "entity",
            "id": e.id,
            "label": e.name,
            "sublabel": f"CUIT: {e.tax_id or 'S/D'} · {type_label}",
            "route": f"/contabilidad/cuenta-corriente/{e.id}",
            "icon": "Users"
        })

    # 2. Search Documents (Invoices, Receipts, etc)
    docs = db.query(Document).options(joinedload(Document.entity)).filter(
        or_(
            Document.number.ilike(query_str),
            Document.cae.ilike(query_str)
        )
    ).order_by(Document.date.desc()).limit(8).all()
    
    for d in docs:
        dtype = str(d.doc_type.value if hasattr(d.doc_type, "value") else d.doc_type)
        results.append({
            "type": "document",
            "id": d.id,
            "label": f"{dtype} #{d.number}",
            "sublabel": f"{d.entity.name if d.entity else 'S/D'} · {d.date.strftime('%d/%m/%Y')}",
            "route": "/ventas/facturas" if "INVOICE" in dtype else "/finanzas/recibos",
            "icon": "FileText"
        })

    # 3. Search Products
    products = db.query(Product).filter(
        or_(
            Product.name.ilike(query_str),
            Product.sku.ilike(query_str)
        )
    ).limit(6).all()
    
    for p in products:
        results.append({
            "type": "product",
            "id": p.id,
            "label": p.name,
            "sublabel": f"SKU: {p.sku or 'S/D'} · {p.subcategory.name if p.subcategory else 'Sin rubro'}",
            "route": "/inventario/articulos",
            "icon": "Package"
        })

    # 4. Search Vehicles (Fleet)
    vehicles = db.query(Vehicle).filter(
        or_(
            Vehicle.name.ilike(query_str),
            Vehicle.plate.ilike(query_str)
        )
    ).limit(4).all()

    for v in vehicles:
        results.append({
            "type": "vehicle",
            "id": v.id,
            "label": v.name,
            "sublabel": f"Patente: {v.plate or 'S/D'} · {str(v.type.value if hasattr(v.type, 'value') else v.type).upper()}",
            "route": "/configuracion/flota",
            "icon": "Truck"
        })

    return results
