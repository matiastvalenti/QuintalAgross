import sqlite3
import json

db_path = 'api/sql_app_v2.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

def fetch_data(query):
    cursor.execute(query)
    columns = [description[0] for description in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]

results = {}

# Query docs
results['docs'] = fetch_data("SELECT id, number, salesperson_id, vendedor, doc_type, status, commission_amount FROM documents WHERE salesperson_id IS NOT NULL OR vendedor IS NOT NULL LIMIT 20")

# Query remitos
results['remitos'] = fetch_data("SELECT id, number, salesperson_id, vendedor, status, commission_amount FROM delivery_notes WHERE salesperson_id IS NOT NULL OR vendedor IS NOT NULL LIMIT 20")

# Query OVs
results['ovs'] = fetch_data("SELECT id, number, salesperson_id, vendedor, status, commission_amount FROM sales_orders WHERE salesperson_id IS NOT NULL OR vendedor IS NOT NULL LIMIT 20")

with open('debug_commissions_out.json', 'w') as f:
    json.dump(results, f, indent=2)

conn.close()
print("FINISHED QUERY")
