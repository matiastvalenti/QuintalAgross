import sys
import os
sys.path.append(os.path.join(os.getcwd(), "api"))
from app.db.session import SessionLocal
from app.db.auth_models import User
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

db = SessionLocal()
try:
    user = db.query(User).filter(User.username == "admin").first()
    if not user:
        user = db.query(User).filter(User.email == "comercial@quintalagross.ar").first()
    
    if user:
        user.hashed_password = pwd_context.hash("admin")
        user.active = True
        db.commit()
        print(f"Password reset for user: {user.username or user.email}")
    else:
        print("Admin user not found in DB.")
finally:
    db.close()
