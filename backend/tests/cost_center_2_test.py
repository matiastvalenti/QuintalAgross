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
        
        # Try install if failed
        print("Login failed, trying /auth/install...")
        requests.get(f"{API_URL}/auth/install")
        r = requests.post(url, data=payload)
        if r.status_code == 200:
            return r.json()["access_token"]
            
        print(f"Login failed: {r.status_code} - {r.text}")
        sys.exit(1)
    except Exception as e:
        print(f"Exception: {e}")
        sys.exit(1)

TOKEN = get_token()
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

def req(method, endpoint, data=None, params=None):
    url = f"{API_URL}{endpoint}"
    if method == "GET":
        r = requests.get(url, headers=HEADERS, params=params)
    elif method == "POST":
        r = requests.post(url, json=data, headers=HEADERS)
    elif method == "PUT":
        r = requests.put(url, json=data, headers=HEADERS)
    
    if r.status_code >= 400:
        print(f"ERROR {method} {endpoint}: {r.status_code} - {r.text}")
        return None
    return r.json()

def test_cost_center_2():
    logs = []
    def log(msg):
        print(msg)
        logs.append(msg)
        
    log("=== STARTING Cost Center 2 Full Flow Test ===")
    CC = 2
    
    # 1. Setup Data
    client_name = f"CC2 Test Client {int(time.time())}"
    client = req("POST", "/entities/", {"name": client_name, "type": "client", "code": f"CC2-{int(time.time())}"})
    if not client: 
        log("ERROR: Client not created")
        return
    log(f"Created Client: {client['name']} (ID: {client['id']})")

    # 2. Create Invoice in CC 2
    inv_num = f"FAC-CC2-{int(time.time()) % 100000}"
    inv_payload = {
        "entity_id": client["id"],
        "doc_type": "INVOICE",
        "number": inv_num,
        "date": "2026-03-20T00:00:00",
        "currency": "ARS",
        "total_amount": 1000,
        "exchange_rate": 1.0,
        "cost_center": CC,
        "lines": [{
            "description": "Prueba CC2",
            "qty": 1,
            "unit_price": 826.45,
            "net_amount": 826.45,
            "vat_rate": 0.21,
            "vat_amount": 173.55,
            "total_amount": 1000
        }]
    }
    invoice = req("POST", "/accounting/documents/", inv_payload)
    if not invoice: 
        log("ERROR: Invoice not created")
        return
    log(f"Invoice CC2 Created: {invoice['number']} (ID: {invoice['id']}, CC: {invoice['cost_center']})")
    assert invoice["cost_center"] == CC

    # 3. Verify in reports with cost_center=2
    log("Verifying in VAT Ledger (CC2)...")
    vat_res = req("GET", "/accounting/vat-ledger", params={"month": 3, "year": 2026, "category": "sales", "cost_center": 2})
    found_in_cc2 = any(d["id"] == invoice["id"] for d in (vat_res or []))
    assert found_in_cc2, "Invoice should be in CC2 VAT ledger"
    log("   Found in CC2 VAT ledger.")

    # 4. Verify NOT in reports with cost_center=1
    log("Verifying NOT in VAT Ledger (CC1)...")
    vat_res_cc1 = req("GET", "/accounting/vat-ledger", params={"month": 3, "year": 2026, "category": "sales", "cost_center": 1})
    found_in_cc1 = any(d["id"] == invoice["id"] for d in (vat_res_cc1 or []))
    assert not found_in_cc1, "Invoice should NOT be in CC1 VAT ledger"
    log("   NOT found in CC1 VAT ledger (Correct).")

    # 5. Create Receipt in CC 2
    rec_num = f"REC-CC2-{int(time.time()) % 100000}"
    rec_payload = {
        "entity_id": client["id"],
        "doc_type": "RECEIPT",
        "number": rec_num,
        "date": "2026-03-20T00:00:00",
        "currency": "ARS",
        "total_amount": 1000,
        "exchange_rate": 1.0,
        "cost_center": CC,
        "payments": [{
            "type": "CASH",
            "amount": 1000,
            "description": "Cash CC2"
        }],
        "applications": [{
            "to_document_id": invoice["id"],
            "amount_applied": 1000
        }]
    }
    receipt = req("POST", "/accounting/documents/", rec_payload)
    if not receipt: 
        log("ERROR: Receipt not created")
        return
    log(f"Receipt CC2 Created: {receipt['number']} (ID: {receipt['id']}, CC: {receipt['cost_center']})")
    assert receipt["cost_center"] == CC

    # 6. Verify Ledger Balance CC2
    log("Verifying Ledger Balance (CC2)...")
    ledger_cc2 = req("GET", f"/accounting/ledger/{client['id']}", params={"cost_center": 2})
    balance_cc2 = ledger_cc2[-1]["balance_ars"] if ledger_cc2 else -1
    log(f"   Balance CC2: {balance_cc2}")
    assert abs(balance_cc2) < 0.01

    # 7. Verify Combined View (No CC filter)
    log("Verifying Combined View (VAT ledger without CC filter)...")
    vat_combined = req("GET", "/accounting/vat-ledger", params={"month": 3, "year": 2026, "category": "sales"})
    found_combined = any(d["id"] == invoice["id"] for d in (vat_combined or []))
    assert found_combined, "Invoice should be in combined VAT ledger"
    log("   Found in combined VAT ledger.")

    log("\nCOST CENTER 2 TEST PASSED SUCCESSFULLY")
    
    with open("CC2_LOG_FINAL.txt", "w") as f:
        f.write("\n".join(logs))


if __name__ == "__main__":
    test_cost_center_2()
