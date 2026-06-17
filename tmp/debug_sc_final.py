import sqlite3
import os

DB_PATH = "backend/sql_app_v2.db"
if not os.path.exists(DB_PATH):
    print("DB not found at " + os.path.abspath(DB_PATH))
    exit(1)

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# 1. Check Document
print("Checking Document 0003-00000001:")
cursor.execute("SELECT id, number, sale_condition_id, due_date FROM documents WHERE number = '0003-00000001'")
row = cursor.fetchone()
if row:
    print(f"ID: {row[0]}")
    print(f"Number: {row[1]}")
    print(f"SC_ID: '{row[2]}'")
    print(f"Due Date: {row[3]}")
    
    if row[2]:
        cursor.execute("SELECT id, description FROM sale_conditions WHERE id = ?", (row[2],))
        sc_row = cursor.fetchone()
        if sc_row:
            print(f"Found SC in DB: {sc_row[1]} (ID: {sc_row[0]})")
        else:
            print(f"SC ID '{row[2]}' NOT FOUND in sale_conditions table")
else:
    print("Document NOT FOUND")

# 2. Check all SC
print("\nAll Sale Conditions:")
cursor.execute("SELECT id, description FROM sale_conditions")
for r in cursor.fetchall():
    print(f" - ID: '{r[0]}' | DESC: '{r[1]}'")

conn.close()
