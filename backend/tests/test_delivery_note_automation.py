import urllib.request
import json
import sys
import time

API_URL = "http://localhost:8000"

def req(method, endpoint, data=None):
    url = f"{API_URL}{endpoint}"
    if data:
        data_bytes = json.dumps(data).encode('utf-8')
        headers = {'Content-Type': 'application/json'}
    else:
        data_bytes = None
        headers = {}
    
    req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as res:
            if res.status == 204:
                return None
            return json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print(f"ERROR {method} {endpoint}: {e.code} - {e.read().decode('utf-8')}")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR {method} {endpoint}: {e}")
        sys.exit(1)

def run_test():
    print("--- 1. Fetching Dependencies ---")
    entities = req('GET', '/entities/')
    entity = entities[0] if entities else req('POST', '/entities/', {'name': 'Test Client', 'type': 'client'})
    
    warehouses = req('GET', '/inventory/warehouses/')
    warehouse = warehouses[0] if warehouses else req('POST', '/inventory/warehouses/', {'name': 'Central', 'address': 'Calle 123'})
        
    products = req('GET', '/inventory/products/')
    product = products[0] if products else req('POST', '/inventory/products/', {'name': 'Soja', 'sku':'SOJA-AUTO-TEST', 'price': 1000, 'category': 'SEMILLA'})

    print(f"Using Entity: {entity['name']}, Warehouse: {warehouse['name']}, Product: {product['name']}")

    print("\n--- 2. Create Direct Remito with Auto-Confirmation ---")
    remito_num = f"REM-AUTO-{int(time.time())}"
    payload = {
        "entity_id": entity['id'],
        "warehouse_id": warehouse['id'],
        "number": remito_num,
        "date": "2026-02-19T00:00:00Z",
        "confirm_now": True,
        "lines": [{
            "description": product['name'],
            "product_id": product['id'],
            "qty": 10,
            "unit_price": 100,
            "vat_rate": 0.21
        }]
    }
    
    dn = req('POST', '/sales/delivery-notes/', payload)
    print(f"Created Remito: {dn['number']} (Status: {dn['status']})")
    
    assert dn['status'] == "DISPATCHED", f"Remito should be DISPATCHED, got {dn['status']}"
    
    # Check Auto-OV
    ov_id = dn['sales_order_id']
    ov = req('GET', f'/sales/sales-orders/{ov_id}')
    print(f"Fetched Auto-OV: {ov['number']} (Status: {ov['status']})")
    
    assert ov['status'] == "FULLY_DELIVERED", f"OV Status should be FULLY_DELIVERED, got {ov['status']}"
    assert ov['lines'][0]['qty_delivered'] == 10

    print("\n--- 3. Create Remito from OV with Auto-Confirmation ---")
    # First create an OV
    ov_payload = {
        "entity_id": entity['id'],
        "number": f"OV-TEST-{int(time.time())}",
        "date": "2026-02-19T00:00:00Z",
        "lines": [{
            "product_id": product['id'],
            "description": product['name'],
            "qty": 20,
            "unit_price": 110,
            "vat_rate": 0.21
        }]
    }
    new_ov = req('POST', '/sales/sales-orders/', ov_payload)
    print(f"Created manual OV: {new_ov['number']}")

    # Create Remito from this OV
    dn_from_ov_payload = {
        "warehouse_id": warehouse['id'],
        "number": f"REM-FROM-OV-{int(time.time())}",
        "confirm_now": True,
        "lines": [{
            "source_sales_line_id": new_ov['lines'][0]['id'],
            "description": product['name'],
            "qty": 20
        }]
    }
    
    dn_ov = req('POST', f"/sales/delivery-notes/from-ov/{new_ov['id']}", dn_from_ov_payload)
    print(f"Created Remito from OV: {dn_ov['number']} (Status: {dn_ov['status']})")
    
    assert dn_ov['status'] == "DISPATCHED", f"Remito should be DISPATCHED, got {dn_ov['status']}"
    
    # Check OV Status
    updated_ov = req('GET', f"/sales/sales-orders/{new_ov['id']}")
    print(f"OV Status after Remito: {updated_ov['status']}")
    assert updated_ov['status'] == "FULLY_DELIVERED"

    print("\n✅ AUTOMATION TEST PASSED SUCCESSFULLY")

if __name__ == "__main__":
    run_test()
