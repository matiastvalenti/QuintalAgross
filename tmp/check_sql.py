from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os

DB_PATH = "c:/Users/matia/Cosas/Escritorio/Programacion/Otro/QuintalAgross_Back/backend/sql_app_v2.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

print(f"Checking DB at: {DB_PATH}")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

try:
    sql = "SELECT id, number, sale_condition_id FROM documents WHERE number = '0003-00000001'"
    res = db.execute(sql).fetchone()
    if res:
        print(f"Document ID: {res[0]}")
        print(f"Document Number: {res[1]}")
        sale_cond_id = res[2]
        print(f"Sale Condition ID in DB: {sale_cond_id}")
        if sale_cond_id:
            sql2 = f"SELECT id, description FROM sale_conditions WHERE id = '{sale_cond_id}'"
            res2 = db.execute(sql2).fetchone()
            if res2:
                print(f"Sale Condition in DB: {res2[1]} (ID: {res2[0]})")
            else:
                print(f"Sale Condition ID '{sale_cond_id}' NOT FOUND in sale_conditions table")
                # Show all conditions to see what we have
                print("Available conditions:")
                all_conds = db.execute("SELECT id, description FROM sale_conditions").fetchall()
                for c in all_conds:
                    print(f" - {c[0]}: {c[1]}")
        else:
            print("Document has NULL sale_condition_id")
    else:
        print("Document number '0003-00000001' not found in documents table")
        # Show some documents to see the format
        print("Latest documents in DB:")
        latest = db.execute("SELECT number, doc_type FROM documents ORDER BY created_at DESC LIMIT 5").fetchall()
        for l in latest:
            print(f" - {l[0]} ({l[1]})")
finally:
    db.close()
