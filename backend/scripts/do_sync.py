import urllib.request
req = urllib.request.Request("http://127.0.0.1:8000/commissions/sync-all", method="POST")
print(urllib.request.urlopen(req).read().decode('utf-8'))
