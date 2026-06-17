import urllib.request
import urllib.error

try:
    with urllib.request.urlopen("http://localhost:8000/commissions/test_error") as r:
        print("OK", r.read().decode())
except urllib.error.HTTPError as e:
    print("HTTP ERROR", e.code)
    print(e.read().decode())
except Exception as e:
    print("OTHER ERROR")
    print(e)
