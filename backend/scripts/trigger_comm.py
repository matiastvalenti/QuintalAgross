import requests
import time

# Wait for server to be ready
time.sleep(3)

try:
    print("Calling /commissions/summary...")
    r = requests.get("http://127.0.0.1:8000/commissions/summary", timeout=15)
    print(f"Status: {r.status_code}")
    if r.status_code != 200:
        print(f"Body: {r.text[:1000]}")
    else:
        print(f"Data count: {len(r.json())}")
except Exception as e:
    print(f"Request error: {e}")
