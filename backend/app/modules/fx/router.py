from fastapi import APIRouter, HTTPException
import urllib.request
import time
from datetime import datetime, date as Date
from typing import Literal
from zoneinfo import ZoneInfo
from .bna_rates import BNA_URL, parse_bna_divisas
import logging
import ssl

router = APIRouter()

# Cache of verified BNA buy/sell rates, publication date and fetch timestamp.
_fx_cache = {
    "rate": 0.0,
    "timestamp": 0.0,
    "source": "init"
}

CACHE_DURATION = 3600  # 1 hour in seconds

def fetch_exchange_rate():
    """Fetch published BNA divisas; fail explicitly if the source is unavailable."""
    request = urllib.request.Request(BNA_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, context=ssl.create_default_context(), timeout=10) as response:
        return parse_bna_divisas(response.read().decode('utf-8'))

@router.get("/fx/usd")
def get_usd_rate(date: Date | None = None, side: Literal["buy", "sell"] = "sell"):
    """Return latest published divisas and its date; never invent a historical rate."""
    global _fx_cache
    today = datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).date()
    now = time.time()
    if not (_fx_cache.get("quote_date") and now - _fx_cache["timestamp"] < CACHE_DURATION):
        try:
            quote = fetch_exchange_rate()
            if Date.fromisoformat(quote["quote_date"]) > today:
                raise ValueError("La fuente devolvió una fecha futura")
            _fx_cache = {**quote, "timestamp": now}
        except Exception:
            logging.getLogger(__name__).warning("No se pudo obtener BNA divisas", exc_info=True)
            raise HTTPException(status_code=503, detail="No se pudo obtener BNA divisas. Ingrese y verifique la cotización manualmente.")
    if date and date != today and date.isoformat() != _fx_cache["quote_date"]:
        raise HTTPException(status_code=422, detail="No hay cotización BNA verificada para esa fecha. Ingrese la cotización histórica manualmente.")
    result = {
        "currency": "USD", "rate": _fx_cache[side], "side": side,
        "buy": _fx_cache["buy"], "sell": _fx_cache["sell"],
        "quote_date": _fx_cache["quote_date"], "source": _fx_cache["source"],
        "source_url": BNA_URL,
        "last_updated": datetime.fromtimestamp(_fx_cache["timestamp"], ZoneInfo("America/Argentina/Buenos_Aires")).isoformat(),
    }
    return result
