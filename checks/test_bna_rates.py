"""No network requests: distinguish divisas from billetes and reject invented rates."""
import sys
from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.modules.fx.bna_rates import parse_bna_divisas
from app.modules.fx import router

HTML = '''<div id="billetes"><table><tr><td>Dolar U.S.A</td><td>990,00</td><td>999,00</td></tr></table></div>
<div id="divisas"><table><th class="fechaCot">19/10/2026</th>
<tr><td class="tit">Dolar U.S.A</td><td>1500.2500</td><td>1503.5000</td></tr></table></div>'''


def test_uses_only_divisas_and_preserves_decimal_dot():
    quote = parse_bna_divisas(HTML)
    assert quote['buy'] == 1500.25
    assert quote['sell'] == 1503.5
    assert quote['quote_date'] == '2026-10-19'
    assert quote['source'] == 'bna_divisas'


@pytest.mark.parametrize('value', ['NaN', 'Infinity', '-1', '0'])
def test_rejects_invalid_rate(value):
    with pytest.raises(ValueError):
        parse_bna_divisas(HTML.replace('1503.5000', value))


def test_does_not_substitute_billetes():
    with pytest.raises(ValueError):
        parse_bna_divisas(HTML.split('<div id="divisas">')[0])


def test_unavailable_source_does_not_return_mock_or_stale_value(monkeypatch):
    monkeypatch.setattr(router, '_fx_cache', {'quote_date':'2026-01-01', 'timestamp':0, 'rate':1050})
    def fail():
        raise OSError('offline')
    monkeypatch.setattr(router, 'fetch_exchange_rate', fail)
    with pytest.raises(HTTPException) as exc:
        router.get_usd_rate()
    assert exc.value.status_code == 503


def test_side_cache_and_historical_date(monkeypatch):
    today = datetime.now(ZoneInfo('America/Argentina/Buenos_Aires')).date()
    yesterday = today - timedelta(days=1)
    quote = {**parse_bna_divisas(HTML), 'quote_date':yesterday.isoformat()}
    monkeypatch.setattr(router, '_fx_cache', {})
    monkeypatch.setattr(router, 'fetch_exchange_rate', lambda: quote)
    result = router.get_usd_rate(date=today, side='buy')
    assert result['rate'] == 1500.25
    assert yesterday.isoformat() in result['warning']
    assert router.get_usd_rate(date=yesterday)['rate'] == 1503.5
    with pytest.raises(HTTPException) as exc:
        router.get_usd_rate(date=today-timedelta(days=20))
    assert exc.value.status_code == 422
