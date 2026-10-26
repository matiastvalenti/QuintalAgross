"""Normalizadores conservadores para importar entidades desde listados legados."""
import math
import re
import unicodedata


def clean_cell(value):
    if value is None:
        return ""
    if isinstance(value, float):
        if math.isnan(value):
            return ""
        if value.is_integer():
            return str(int(value))
    raw = str(value).strip()
    if raw.casefold() in ("nan", "none", "<na>"):
        return ""
    return raw


def normalize_label(value):
    value = unicodedata.normalize("NFKD", clean_cell(value))
    value = "".join(char for char in value if not unicodedata.combining(char))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", value.casefold()).split())


def format_cuit(value):
    raw = clean_cell(value)
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    if len(digits) != 11:
        raise ValueError("El CUIT debe tener 11 dígitos")
    return f"{digits[:2]}-{digits[2:10]}-{digits[10:]}"


TAX_CATEGORIES = {
    "responsable inscripto": "RESPONSABLE_INSCRIPTO",
    "resp inscripto": "RESPONSABLE_INSCRIPTO",
    "ri": "RESPONSABLE_INSCRIPTO",
    "monotributista": "MONOTRIBUTO",
    "monotributo": "MONOTRIBUTO",
    "responsable monotributo": "MONOTRIBUTO",
    "exento": "EXENTO",
    "consumidor final": "CONSUMIDOR_FINAL",
    "sujeto no categorizado": "SUJETO_NO_CATEGORIZADO",
    "exterior": "EXTERIOR",
}


def parse_tax_category(value):
    normalized = normalize_label(value)
    return TAX_CATEGORIES.get(normalized)
