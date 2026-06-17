import sqlite3
import os

db_path = 'api/sql_app_v2.db'
if not os.path.exists(db_path):
    print(f"Error: {db_path} not found")
    exit()

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

with open('db_dump.txt', 'w') as f:
    f.write("--- DOCUMENTS ---\n")
    cursor.execute("SELECT id, number, doc_type, status, vendedor, salesperson_id FROM documents")
    for row in cursor.fetchall():
        f.write(str(row) + "\n")
        
    f.write("\n--- SALES ORDERS ---\n")
    cursor.execute("SELECT id, number, status, vendedor, salesperson_id FROM sales_orders")
    for row in cursor.fetchall():
        f.write(str(row) + "\n")
        
    f.write("\n--- DELIVERY NOTES ---\n")
    cursor.execute("SELECT id, number, status, vendedor, salesperson_id FROM delivery_notes")
    for row in cursor.fetchall():
        f.write(str(row) + "\n")

conn.close()
print("Done writing to db_dump.txt")
