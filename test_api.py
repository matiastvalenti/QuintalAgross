import requests

API_URL = "http://localhost:8000/api/v1" # Adjust if prefix is different

def test_search():
    try:
        # We need a token if there is auth
        # But let's try some public ones first
        
        # Test price comparison (should work as per screenshot)
        res = requests.get(f"{API_URL}/purchases/price-comparison/")
        print(f"Price Comparison Status: {res.status_code}")
        if res.status_code == 200:
            data = res.json()
            print(f"Results: {len(data)}")
            if len(data) > 0:
                 print(f"First result: {data[0]['product_name']}")
        
        # Test product search (should fail/empty as per screenshot)
        res = requests.get(f"{API_URL}/inventory/products/?q=2,4")
        print(f"\nProduct Search Status: {res.status_code}")
        print(f"Response: {res.text[:200]}")
        
    except Exception as e:
        print(f"Connection error: {e}")

if __name__ == "__main__":
    test_search()
