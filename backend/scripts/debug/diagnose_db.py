from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.db.commercial_models import Product, Category, SubCategory

db = SessionLocal()

print("--- DIAGNÓSTICO DE BASE DE DATOS ---")
cats = db.query(Category).all()
print(f"Categorías (Rubros): {len(cats)}")

for c in cats:
    subs = db.query(SubCategory).filter(SubCategory.category_id == c.id).all()
    print(f"\nRubro: {c.name} (id: {c.id})")
    for s in subs:
        p_count = db.query(Product).filter(Product.subcategory_id == s.id).count()
        print(f"  - Subrubro: {s.name} (id: {s.id}) -> {p_count} artículos")

total_p = db.query(Product).count()
print(f"\nTotal artículos: {total_p}")

db.close()
