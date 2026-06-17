import sqlite3
import os

db_path = 'api/sql_app_v2.db'
with open('db_count_results.txt', 'w') as f:
    if not os.path.exists(db_path):
        f.write("Database not found\n")
        exit()

    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    tables = ['documents', 'sales_orders', 'delivery_notes']
    for t in tables:
        c.execute(f"SELECT COUNT(*) FROM {t}")
        total = c.fetchone()[0]
        c.execute(f"SELECT COUNT(*) FROM {t} WHERE salesperson_id IS NOT NULL OR vendedor IS NOT NULL")
        with_sp = c.fetchone()[0]
        f.write(f"{t}: total={total}, with_sp={with_sp}\n")
        
        c.execute(f"SELECT id, number, status, vendedor, salesperson_id FROM {t} WHERE (vendedor IS NOT NULL OR salesperson_id IS NOT NULL) LIMIT 10")
        f.write(f"Sample {t}: {c.fetchall()}\n\n")

    conn.close()
    f.write("Done\n")
