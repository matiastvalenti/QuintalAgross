import sqlite3
import os

try:
    db_path = os.path.abspath('sql_app_v2.db')
    print('Checking DB:', db_path)
    
    conn = sqlite3.connect(db_path, timeout=5)
    
    # 1. Add column if not exists
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(sales_orders)")
    cols = [r[1] for r in cursor.fetchall()]
    print("Existing cols:", cols)
    
    if "sale_condition_id" not in cols:
        print("Adding sale_condition_id...")
        conn.execute("ALTER TABLE sales_orders ADD COLUMN sale_condition_id VARCHAR;")
        conn.commit()
        print("Column Added!")
    else:
        print("Column already exists!")
    
    conn.close()
except Exception as e:
    print("ERROR:", e)
