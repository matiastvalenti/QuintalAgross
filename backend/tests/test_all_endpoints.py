"""
Test completo de todos los endpoints criticos del sistema QuintalAgross.
Verificacion automatica de backend luego del refactor modular.
"""
import requests
import sys
import time
import json

API_URL = "http://localhost:8000"
USER = "tomas_valenti"
PASS = "admin"

PASS_COUNT = 0
FAIL_COUNT = 0
FAILS = []

def get_token():
    r = requests.post(f"{API_URL}/auth/login", data={"username": USER, "password": PASS})
    if r.status_code == 200:
        return r.json()["access_token"]
    print(f"LOGIN FAILED: {r.status_code} {r.text}")
    sys.exit(1)

TOKEN = get_token()
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

def check(name, method, endpoint, expected_status=200, body=None):
    global PASS_COUNT, FAIL_COUNT
    url = f"{API_URL}{endpoint}"
    try:
        if method == "GET":
            r = requests.get(url, headers=HEADERS, timeout=5)
        elif method == "POST":
            r = requests.post(url, json=body, headers=HEADERS, timeout=5)
        elif method == "PUT":
            r = requests.put(url, json=body, headers=HEADERS, timeout=5)
        
        if r.status_code == expected_status:
            PASS_COUNT += 1
            print(f"  PASS  {name} [{method} {endpoint}] -> {r.status_code}")
            return r.json() if r.content else None
        else:
            FAIL_COUNT += 1
            FAILS.append(f"{name}: expected {expected_status} got {r.status_code} - {r.text[:100]}")
            print(f"  FAIL  {name} [{method} {endpoint}] -> {r.status_code} {r.text[:80]}")
            return None
    except Exception as e:
        FAIL_COUNT += 1
        FAILS.append(f"{name}: exception {e}")
        print(f"  ERROR {name} [{method} {endpoint}] -> {e}")
        return None

print("=" * 60)
print("QUINTAL AGROSS - FULL API ENDPOINT TEST")
print("=" * 60)

# --- AUTH ---
print("\n[AUTH]")
check("Login", "POST", "/auth/login", 200)  # already done, just format check
check("Me - current user", "GET", "/auth/me")

# --- DASHBOARD ---
print("\n[DASHBOARD]")
check("Dashboard summary", "GET", "/dashboard/summary")
check("Dashboard sales chart", "GET", "/dashboard/sales-chart")

# --- ENTITIES ---
print("\n[ENTITIES]")
entities = check("List entities", "GET", "/entities/")
check("Entity tax categories", "GET", "/entities/meta/tax-categories")
check("Entity locations", "GET", "/entities/meta/locations")
check("Ageing report clients", "GET", "/entities/reports/ageing?type=client")
if entities and len(entities) > 0:
    eid = entities[0]['id']
    check(f"Get entity detail", "GET", f"/entities/{eid}")

# --- INVENTORY ---
print("\n[INVENTORY]")
products = check("List products", "GET", "/inventory/products/")
warehouses = check("List warehouses", "GET", "/inventory/warehouses/")
check("List rubros", "GET", "/inventory/rubros/")

# --- SALES ---
print("\n[SALES]")
orders = check("List sales orders", "GET", "/sales/sales-orders/")
dns = check("List delivery notes", "GET", "/sales/delivery-notes/")
check("List invoices (doc type)", "GET", "/accounting/documents/?doc_type=INVOICE")
check("Sale conditions", "GET", "/sales/conditions/")

# --- FINANCE ---
print("\n[FINANCE]")
check("Finance rates latest", "GET", "/finance/rates/latest")
check("List receipts (doc type)", "GET", "/accounting/documents/?doc_type=RECEIPT")
check("List payments (doc type)", "GET", "/accounting/documents/?doc_type=PAYMENT")

# --- ACCOUNTING ---
print("\n[ACCOUNTING]")
check("List documents", "GET", "/accounting/documents/")
check("Ledger accounts", "GET", "/accounting/accounts-ledger/")
check("Journal entries", "GET", "/accounting/accounts-ledger/entries")
check("FX positions", "GET", "/accounting/fx/positions")

# --- PURCHASES ---
print("\n[PURCHASES]")
check("List purchase orders", "GET", "/purchases/purchase-orders/")
check("List purchase delivery notes", "GET", "/purchases/delivery-notes/")

# --- CONFIG ---
print("\n[CONFIG]")
check("Config POS", "GET", "/config/pos")

# --- TASKS ---
print("\n[TASKS]")
check("Notifications", "GET", "/tasks/notifications?unread_only=true")

# --- SUMMARY ---
print("\n" + "=" * 60)
print(f"RESULTS: {PASS_COUNT} PASSED, {FAIL_COUNT} FAILED")
print("=" * 60)
if FAILS:
    print("\nFAILED ENDPOINTS:")
    for f in FAILS:
        print(f"  - {f}")
else:
    print("\nALL ENDPOINTS PASSED!")

sys.exit(0 if FAIL_COUNT == 0 else 1)
