import sqlite3
import uuid
from datetime import datetime

db_path = 'api/sql_app_v2.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()

# 1. Find a salesperson ID
c.execute("SELECT id, name FROM entities WHERE is_salesperson = 1 LIMIT 1")
sp = c.fetchone()
if not sp:
    print("No salesperson found in entities. Creating one...")
    sp_id = str(uuid.uuid4())
    c.execute("INSERT INTO entities (id, name, is_salesperson, commission_pct) VALUES (?, ?, ?, ?)", (sp_id, "TEST VENDEDOR", 1, 5.0))
    sp_name = "TEST VENDEDOR"
else:
    sp_id, sp_name = sp
    print(f"Using salesperson: {sp_name} ({sp_id})")

# 2. Find a warehouse
c.execute("SELECT id FROM warehouses LIMIT 1")
wh = c.fetchone()
wh_id = wh[0] if wh else "wh-1"

# 3. Create a dummy Sales Order
ov_id = str(uuid.uuid4())
c.execute("""
    INSERT INTO sales_orders 
    (id, number, date, entity_id, warehouse_id, status, vendedor, salesperson_id, total_amount, currency)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""", (ov_id, "OV-TEST-999", datetime.now().isoformat(), sp_id, wh_id, 'CONFIRMED', sp_name, sp_id, 1000.0, 'ARS'))

# 4. Create a dummy line for the SO
line_id = str(uuid.uuid4())
c.execute("""
    INSERT INTO sales_order_lines
    (id, order_id, product_id, description, qty, unit_price, net_amount, vat_amount, total_amount, total_cost, margin_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""", (line_id, ov_id, "prod-1", "Test Product", 1, 1000.0, 1000.0, 210.0, 1210.0, 500.0, 500.0))

conn.commit()
conn.close()
print(f"Successfully injected test Sales Order for {sp_name}")
