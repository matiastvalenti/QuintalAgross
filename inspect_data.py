from app.db.session import SessionLocal
from app.db.models.commercial_models import Product
from app.db.models.models import Entity

db = SessionLocal()
try:
    print("--- PRODUCTS ---")
    prods = db.query(Product).all()
    for p in prods:
        print(f"Name: {p.name}, Active: {p.active}, SKU: {p.sku}")
        
    print("\n--- ENTITIES ---")
    ents = db.query(Entity).all()
    for e in ents:
        print(f"Name: {e.name}, Type: {e.type}")
finally:
    db.close()
