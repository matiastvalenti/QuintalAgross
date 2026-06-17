import sqlite3

db_path = 'api/sql_app_v2.db'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
c = conn.cursor()

def check_sales_flow():
    print("--- SALES FLOW CHECK ---")
    
    # Check OVs
    print("\n[Sales Orders]")
    c.execute("SELECT id, number, status, vendedor, salesperson_id FROM sales_orders")
    ovs = c.fetchall()
    for row in ovs:
        print(dict(row))
        ov_id = row['id']
        
        # Check DNs for this OV
        print(f"  -> Linked Delivery Notes for OV {row['number']}:")
        c.execute("SELECT id, number, status, vendedor, salesperson_id, sales_order_id FROM delivery_notes WHERE sales_order_id = ?", (ov_id,))
        dns = c.fetchall()
        for dn in dns:
            print(f"    {dict(dn)}")
            dn_id = dn['id']
            
            # Check Invoices for this DN
            print(f"    -> Linked Documents (Invoices) for DN {dn['number']}:")
            c.execute("""
                SELECT d.id, d.number, d.vendedor, d.salesperson_id, d.status 
                FROM documents d
                JOIN invoice_delivery_note_links l ON d.id = l.document_id
                WHERE l.delivery_note_id = ?
            """, (dn_id,))
            docs = c.fetchall()
            for doc in docs:
                print(f"      {dict(doc)}")

    # Check orphan documents
    print("\n[Orphan / All Documents]")
    c.execute("SELECT id, number, vendedor, salesperson_id, status FROM documents")
    for doc in c.fetchall():
        print(dict(doc))

    print("\n[Salespeople Entities]")
    c.execute("SELECT id, name, is_salesperson FROM entities WHERE is_salesperson = 1 OR name LIKE '%RAMIREZ%'")
    for ent in c.fetchall():
        print(dict(ent))

check_sales_flow()
conn.close()
