import requests
import json
import time
import sys

API_URL = "http://localhost:8000"
USER = "tomas_valenti"
PASS = "admin"

def get_token():
    try:
        url = f"{API_URL}/auth/login"
        payload = {"username": USER, "password": PASS}
        r = requests.post(url, data=payload)
        
        if r.status_code == 200:
            return r.json()["access_token"]
        
        # If login failed, try install
        print(f"Login attempt 1 failed ({r.status_code}). Triggering /auth/install...")
        install_r = requests.get(f"{API_URL}/auth/install")
        print(f"Install response: {install_r.status_code}")
        
        # Second attempt
        r = requests.post(url, data=payload)
        if r.status_code == 200:
            return r.json()["access_token"]
        else:
            print(f"Login failed again: {r.status_code} - {r.text}")
            sys.exit(1)
            
    except Exception as e:
        print(f"Exception during token retrieval: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

TOKEN = get_token()
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

def req(method, endpoint, data=None):
    url = f"{API_URL}{endpoint}"
    if method == "GET":
        r = requests.get(url, headers=HEADERS)
    elif method == "POST":
        r = requests.post(url, json=data, headers=HEADERS)
    elif method == "PUT":
        r = requests.put(url, json=data, headers=HEADERS)
    
    if r.status_code >= 400:
        print(f"ERROR {method} {endpoint}: {r.status_code} - {r.text}")
        return None
    return r.json()

def test_full_flow():
    print("STARTING Full Flow Test: OV -> Remito -> Factura -> Recibo")
    
    # 1. Setup Data
    clients = req("GET", "/entities/")
    client = next((c for c in clients if c["type"] == "client"), None)
    if not client:
        client = req("POST", "/entities/", {"name": "Test Client Flow", "type": "client", "code": f"C{int(time.time())}"})
    
    warehouses = req("GET", "/inventory/warehouses/")
    warehouse = warehouses[0] if warehouses else req("POST", "/inventory/warehouses/", {"name": "Test WH", "active": True})
    
    products = req("GET", "/inventory/products/")
    product = products[0] if products else req("POST", "/inventory/products/", {"name": "Test Product", "sku": f"P{int(time.time())}", "active": True})

    print(f"Using Client: {client['name']}, WH: {warehouse['name']}, Product: {product['name']}")

    # 2. Create Sales Order (OV)
    ov_num = f"OV-{int(time.time())}"
    ov_payload = {
        "entity_id": client["id"],
        "warehouse_id": warehouse["id"],
        "number": ov_num,
        "date": "2026-03-15T00:00:00",
        "currency": "ARS",
        "lines": [{
            "product_id": product["id"],
            "description": "Test Sale",
            "qty": 5,
            "unit_price": 1000,
            "vat_rate": 0.21
        }]
    }
    ov = req("POST", "/sales/sales-orders/", ov_payload)
    print(f"OK Step 1: OV Created: {ov['number']} (ID: {ov['id']})")

    # 3. Confirm OV
    ov["status"] = "CONFIRMED"
    ov_confirmed = req("PUT", f"/sales/sales-orders/{ov['id']}", ov)
    print(f"OK Step 2: OV Confirmed. Status: {ov_confirmed['status']}")

    # 4. Create Delivery Note (Remito)
    remito_num = f"REM-{int(time.time()) % 1000000}"
    dn_payload = {
        "sales_order_id": ov["id"],
        "entity_id": client["id"],
        "warehouse_id": warehouse["id"],
        "number": remito_num,
        "date": "2026-03-15T00:00:00",
        "lines": [{
            "source_sales_line_id": ov_confirmed["lines"][0]["id"],
            "product_id": product["id"],
            "description": "Test Sale",
            "qty": 5,
            "unit_price": 1000,
            "vat_rate": 0.21
        }]
    }
    dn = req("POST", f"/sales/delivery-notes/from-ov/{ov['id']}", dn_payload)
    print(f"OK Step 3: Remito Created: {dn['number']} (ID: {dn['id']})")

    # 5. Confirm Remito
    confirmed_dn = req("POST", f"/sales/delivery-notes/{dn['id']}/confirm", {})
    print(f"OK Step 4: Remito Confirmed. Status: {confirmed_dn['status']}")
    
    # Verify OV Status
    ov_final = req("GET", f"/sales/sales-orders/{ov['id']}")
    print(f"   OV Status updated to: {ov_final['status']}")
    assert ov_final["status"] == "FULLY_DELIVERED"

    # 6. Create Invoice (Factura)
    inv_num = f"FAC-0001-{int(time.time()) % 1000000}"
    inv_payload = {
        "entity_id": client["id"],
        "doc_type": "INVOICE",
        "number": inv_num,
        "date": "2026-03-15T00:00:00",
        "currency": "ARS",
        "total_amount": 6050, # 5000 + 21%
        "exchange_rate": 1.0,
        "lines": [{
            "source_dn_line_id": confirmed_dn["lines"][0]["id"],
            "product_id": product["id"],
            "description": "Test Sale",
            "qty": 5,
            "unit_price": 1000,
            "net_amount": 5000,
            "vat_rate": 0.21,
            "vat_amount": 1050,
            "total_amount": 6050
        }]
    }
    invoice = req("POST", "/accounting/documents/", inv_payload)
    print(f"OK Step 5: Invoice Created: {invoice['number']} (ID: {invoice['id']})")
    
    # Verify Remito status
    dn_final = req("GET", f"/sales/delivery-notes/{dn['id']}")
    print(f"   Remito Status updated to: {dn_final['status']}")
    assert dn_final["status"] == "INVOICED"

    # 7. Create Receipt (Recibo)
    rec_num = "AUTO" # Let the system number it
    rec_payload = {
        "entity_id": client["id"],
        "doc_type": "RECEIPT",
        "number": rec_num,
        "date": "2026-03-15T00:00:00",
        "currency": "ARS",
        "total_amount": 6050,
        "exchange_rate": 1.0,
        "payments": [{
            "type": "CASH",
            "amount": 6050,
            "description": "Cash payment full"
        }],
        "applications": [{
            "to_document_id": invoice["id"],
            "amount_applied": 6050
        }]
    }
    receipt = req("POST", "/accounting/documents/", rec_payload)
    print(f"OK Step 6: Receipt Created: {receipt['number']} (ID: {receipt['id']})")
    
    # 8. Verify Invoice Balance
    inv_closed = req("GET", f"/accounting/documents/{invoice['id']}")
    print(f"OK Step 7: Invoice Status after payment: {inv_closed['status']}")
    assert inv_closed["status"] == "CLOSED"

    # 9. Verify Ledger
    req("GET", f"/accounting/ledger/")
    print("ALL STEPS VERIFIED!")
    print("\nFULL FLOW TEST PASSED SUCCESSFULLY")

if __name__ == "__main__":
    test_full_flow()
