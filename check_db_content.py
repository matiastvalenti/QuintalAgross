from app.db.session import SessionLocal
from app.db.models.commercial_models import Product
from app.db.models.models import Entity
from app.db.models.auth_models import User, Role

db = SessionLocal()
try:
    products = db.query(Product).limit(5).all()
    print(f"Products found: {len(products)}")
    for p in products:
        print(f" - {p.name}")
        
    entities = db.query(Entity).limit(5).all()
    print(f"\nEntities found: {len(entities)}")
    for e in entities:
        print(f" - {e.name} (Type: {e.type})")
        
    users = db.query(User).all()
    print(f"\nUsers found: {len(users)}")
    for u in users:
        print(f" - {u.email} (Roles: {u.roles})")
        
    roles = db.query(Role).all()
    print(f"\nRoles found: {len(roles)}")
    for r in roles:
        print(f" - {r.name} (Permissions: {r.permissions})")
finally:
    db.close()
