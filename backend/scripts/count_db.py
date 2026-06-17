import sqlite3
import os

db_path = 'api/sql_app_v2.db'
if not os.path.exists(db_path):
    print("Database not found")
    exit()

conn = sqlite3.connect(db_path)
c = conn.cursor()

def get_count(table):
    c.execute(f"SELECT COUNT(*) FROM {table}")
    return c.fetchone()[0]

def get_with_sp(table):
    c.execute(f"SELECT COUNT(*) FROM {table} WHERE salesperson_id IS NOT NULL OR vendedor IS NOT NULL")
    return c.fetchone()[0]

print(f"Documents: {get_count('documents')} total, {get_with_sp('documents')} with salesperson")
print(f"Sales Orders: {get_count('sales_orders')} total, {get_with_sp('sales_orders')} with salesperson")
print(f"Delivery Notes: {get_count('delivery_notes')} total, {get_with_sp('delivery_notes')} with salesperson")

c.execute("SELECT number, vendedor, salesperson_id FROM documents WHERE vendedor IS NOT NULL OR salesperson_id IS NOT NULL LIMIT 5")
print("Sample Docs:", c.fetchall())

c.execute("SELECT number, vendedor, salesperson_id FROM sales_orders WHERE vendedor IS NOT NULL OR salesperson_id IS NOT NULL LIMIT 5")
print("Sample OVs:", c.fetchall())

conn.close()
