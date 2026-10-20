"""Read the BNA divisas table without substituting billete or another provider."""
from datetime import datetime
from decimal import Decimal, InvalidOperation
from html import unescape
import re

BNA_URL = 'https://www.bna.com.ar/Personas'


def _text(value):
    return unescape(re.sub(r'<[^>]+>', '', value)).strip()


def _rate(value):
    text = _text(value)
    # BNA publishes divisas with a decimal dot; also accept comma decimal notation.
    if ',' in text:
        text = text.replace('.', '').replace(',', '.')
    try:
        rate = Decimal(text)
    except InvalidOperation as exc:
        raise ValueError('Cotización BNA inválida') from exc
    if not rate.is_finite() or rate <= 0:
        raise ValueError('La cotización BNA debe ser positiva y finita')
    return float(rate)


def parse_bna_divisas(html):
    section = re.search(r'<div\b[^>]*\bid=[\"\x27]divisas[\"\x27][^>]*>(.*?)</table>',
                        html, re.I | re.S)
    if not section:
        raise ValueError('No se encontró la tabla de divisas del BNA')
    table = section.group(1)
    date_match = re.search(r'<th\b[^>]*class=[\"\x27][^\"\x27]*fechaCot[^\"\x27]*[\"\x27][^>]*>(.*?)</th>', table, re.I | re.S)
    if not date_match:
        raise ValueError('La cotización BNA no tiene fecha verificable')
    quote_date = datetime.strptime(_text(date_match.group(1)), '%d/%m/%Y').date().isoformat()
    for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>', table, re.I | re.S):
        cells = re.findall(r'<td\b[^>]*>(.*?)</td>', row, re.I | re.S)
        if len(cells) >= 3 and re.fullmatch(r'D[oó]lar\s+U\.?S\.?A\.?', _text(cells[0]), re.I):
            return {'buy': _rate(cells[1]), 'sell': _rate(cells[2]),
                    'quote_date': quote_date, 'source': 'bna_divisas', 'source_url': BNA_URL}
    raise ValueError('No se encontró el dólar en la tabla de divisas del BNA')
