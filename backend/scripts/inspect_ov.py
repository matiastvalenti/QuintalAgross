import sqlite3
import json

db_path = 'api/sql_app_v2.db'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
c = conn.cursor()

def dump_ov(number):
    print(f"--- OV: {number} ---")
    c.execute("SELECT * FROM sales_orders WHERE number = ?", (number,))
    ov = c.fetchone()
    if not ov:
        # Try full number
        c.execute("SELECT * FROM sales_orders WHERE number LIKE ?", (f"%{number}%",))
        ov = c.fetchone()
    
    if ov:
        ov_dict = dict(ov)
        print(json.dumps(ov_dict, indent=2, default=str))
        
        # Check DNs
        print("\n--- Linked DNs ---")
        c.execute("SELECT * FROM delivery_notes WHERE sales_order_id = ?", (ov_dict['id'],))
        dns = c.fetchall()
        for dn in dns:
            print(dict(dn))
            
        # Check Salesperson Entity
        if ov_dict['salesperson_id']:
            print("\n--- Salesperson Entity ---")
            c.execute("SELECT name, is_salesperson FROM entities WHERE id = ?", (ov_dict['salesperson_id'],))
            ent = c.fetchone()
            if ent: print(dict(ent))
    else:
        print("OV not found")

dump_ov("0003-00000002")

# Also list all OVs to see what names are in 'vendedor'
print("\n--- All OVs Sample ---")
c.execute("SELECT number, status, vendedor, salesperson_id, total_amount FROM sales_orders LIMIT 10")
for row in c.fetchall():
    print(dict(row))

# List all Salespeople
print("\n--- All Salespeople entities ---")
c.execute("SELECT id, name FROM entities WHERE is_salesperson = 1")
for row in c.fetchall():
    print(dict(row))

conn.close()
