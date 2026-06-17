import sys
sys.path.append('api')
from app.db.session import SessionLocal, engine
from sqlalchemy import text

db = SessionLocal()
try:
    print("Columns in 'cheques' table:")
    res = db.execute(text("PRAGMA table_info(cheques)"))
    for r in res:
        print(f"Name: {r[1]}, Type: {r[2]}, NotNull: {r[3]}, Default: {r[4]}")
        
    print("\nSample values for critical fields:")
    res = db.execute(text("SELECT id, banco, nro_cheque, estado, rechazado, nd_realizada, updated_at FROM cheques LIMIT 5"))
    for r in res:
        print(r)
        
except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
