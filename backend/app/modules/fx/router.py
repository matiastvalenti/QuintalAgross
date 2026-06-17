from fastapi import APIRouter, HTTPException
import urllib.request
import re
import time
from datetime import datetime
import ssl

router = APIRouter()

# Simple valid cache structure
# Store: { "rate": float, "timestamp": float (epoch) }
_fx_cache = {
    "rate": 0.0,
    "timestamp": 0.0,
    "source": "init"
}

CACHE_DURATION = 3600  # 1 hour in seconds
import json

def fetch_exchange_rate():
    """Fetch BNA Divisas (Wholesale) rate, primarily from dolarapi.com/mayorista."""
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        # Primary source: DolarAPI (Mayorista = BNA Divisa)
        req = urllib.request.Request(
            "https://dolarapi.com/v1/dolares/mayorista",
            headers={"User-Agent": "Mozilla/5.0"}
        )
        with urllib.request.urlopen(req, context=ctx, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            if data and "venta" in data:
                return float(data["venta"]), "dolarapi_mayorista"

    except Exception as e:
        print(f"Error fetching from DolarAPI: {e}")

    # Fallback to scraping BNA (Billete as last resort if Divisa not easily found)
    try:
        req = urllib.request.Request(BNA_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=5) as response:
            html = response.read().decode('utf-8')
            rate_match = re.search(r'<td>D.?lar U\.S\.A.*?</td>.*?<td>.*?</td>.*?<td>(.*?)</td>', html, re.DOTALL | re.IGNORECASE)
            if rate_match:
                rate_str = rate_match.group(1).strip()
                rate_str = re.sub(r'<.*?>', '', rate_str).strip()
                rate_clean = rate_str.replace('.', '').replace(',', '.')
                return float(rate_clean), "bna_scraping_fallback"
    except Exception as e:
        print(f"Error scraping BNA fallback: {e}")

    return 0.0, "failed"

@router.get("/fx/usd")
def get_usd_rate():
    global _fx_cache
    now = time.time()
    
    if _fx_cache["rate"] > 0 and (now - _fx_cache["timestamp"] < CACHE_DURATION):
        return {
            "currency": "USD",
            "rate": _fx_cache["rate"],
            "last_updated": datetime.fromtimestamp(_fx_cache["timestamp"]).isoformat(),
            "source": _fx_cache.get("source", "cache")
        }
    
    rate, source = fetch_exchange_rate()
    
    if rate > 0:
        _fx_cache = {
            "rate": rate,
            "timestamp": now,
            "source": source
        }
    elif _fx_cache["rate"] > 0:
        return {
            "currency": "USD",
            "rate": _fx_cache["rate"],
            "last_updated": datetime.fromtimestamp(_fx_cache["timestamp"]).isoformat(),
            "source": "cache_fallback",
            "warning": "Could not fetch new rate"
        }
    else:
        # Final fallback
        return {
            "currency": "USD",
            "rate": 1050.0, 
            "source": "mock",
            "warning": "Could not fetch rate, using mock"
        }
        
    return {
        "currency": "USD",
        "rate": _fx_cache["rate"],
        "last_updated": datetime.fromtimestamp(_fx_cache["timestamp"]).isoformat(),
        "source": _fx_cache["source"]
    }
