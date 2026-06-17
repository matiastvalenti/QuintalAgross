import requests
try:
    r = requests.get('http://localhost:8000/commissions/summary')
    print(f"Status: {r.status_code}")
    print(r.text)
except Exception as e:
    print(f"Error: {e}")
