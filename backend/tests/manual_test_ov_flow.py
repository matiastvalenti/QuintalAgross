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
        print(f"ERROR {method} {endpoint}: ion {e}")
        sys.exit(1)

def run_test():
    print("--- 1. Fetching Dependencies ---")
    entities = req('GET', '/entities/')
    if not entities:
        print("Creating dummy entity...")
        entity = req('POST', '/entities/', {'name': 'Test Client', 'type': 'client'})
    else:
        entity = entities[0]
    
    warehouses = req('GET', '/warehouses/')
    if not warehouses:
        print("Creating dummy warehouse...")
        warehouse = req('POST', '/warehouses/', {'name': 'Central', 'address': 'Calle 123'})
    else:
        warehouse = warehouses[0]
        
    products = req('GET', '/products/')
    if not products:
        print("Creating dummy product...")
        product = req('POST', '/products/', {'name': 'Soja', 'sku':'SOJA01', 'price': 1000, 'category': 'SEMILLA'})
    else:
        product = products[0]

    print(f"Using Entity: {entity['name']}, Warehouse: {warehouse['name']}, Product: {product['name']}")

    print("\n--- 2. Create Direct Remito (Auto-OV) ---")
    remito_num = f"REM-{int(time.time())}"
    payload = {
        "entity_id": entity['id'],
        "warehouse_id": warehouse['id'],
        "number": remito_num,
        "date": "2026-02-19T00:00:00",
        "lines": [{
            "product_id": product['id'],
            "description": product['name'],
            "qty": 10,
            "unit_price": 100,
            "vat_rate": 0.21
        }]
    }
    
    dn = req('POST', '/delivery-notes/', payload)
    print(f"Created Remito: {dn['number']} (ID: {dn['id']})")
    print(f"Auto-OV Reference: {dn['origin_reference']}")
    
    # assert dn['origin_reference'].startswith("0001-"), "Origin reference mismatch" # Depende de OVs previas
    assert dn['status'] == "DRAFT", "Remito should be DRAFT"
    
    # Check Auto-OV
    ov_id = dn['sales_order_id']
    ov = req('GET', f'/sales-orders/{ov_id}')
    print(f"Fetched Auto-OV: {ov['number']} (Status: {ov['status']})")
    
    assert ov['status'] == "CONFIRMED", f"OV Status should be CONFIRMED, got {ov['status']}"
    assert ov.get('source') == "AUTO_REMITO", f"OV Source should be AUTO_REMITO, got {ov.get('source')}"
    assert len(ov['lines']) == 1
    assert ov['lines'][0]['qty'] == 10
    assert ov['lines'][0]['qty_delivered'] == 0

    print("\n--- 3. Confirm Remito (Stock OUT) ---")
    # Preview
    preview = req('GET', f'/delivery-notes/{dn["id"]}/confirm-preview')
    print("Preview Impact:", preview['impacts'][0]['movement_qty'])
    
    # Confirm
    confirmed_dn = req('POST', f'/delivery-notes/{dn["id"]}/confirm')
    print(f"Confirmed Remito Status: {confirmed_dn['status']}")
    
    # Check OV Status
    ov = req('GET', f'/sales-orders/{ov_id}')
    print(f"OV Status after Delivery: {ov['status']}")
    
    assert ov['status'] == "FULLY_DELIVERED", f"OV should be FULLY_DELIVERED, got {ov['status']}"
    assert ov['lines'][0]['qty_delivered'] == 10

    print("\n--- 4. Create Return Remito ---")
    ret_num = f"RET-{int(time.time())}"
    ret_payload = {
        "warehouse_id": warehouse['id'],
        "number": ret_num,
        "return_source_id": dn['id'],
        "lines": [{
            "source_sales_line_id": ov['lines'][0]['id'],
            "description": product['name'],
            "qty": 5 # Returning 5 of 10
        }]
    }
    
    ret_dn = req('POST', '/delivery-notes/returns', ret_payload)
    print(f"Created Return: {ret_dn['number']}")
    
    print("\n--- 5. Confirm Return (Stock IN) ---")
    confirmed_ret = req('POST', f'/delivery-notes/{ret_dn["id"]}/confirm-return')
    print(f"Confirmed Return Status: {confirmed_ret['status']}")
    
    # Check OV Status
    ov = req('GET', f'/sales-orders/{ov_id}')
    print(f"OV Status after Return: {ov['status']}")
    print(f"OV Line Qty Delivered: {ov['lines'][0]['qty_delivered']}")
    
    assert ov['lines'][0]['qty_delivered'] == 5, "Should have 5 delivered (10 - 5)"
    assert ov['status'] == "PARTIALLY_DELIVERED", f"OV should be PARTIALLY_DELIVERED, got {ov['status']}"

    print("\n✅ TEST PASSED SUCCESSFULLY")

if __name__ == "__main__":
    run_test()
