from typing import Optional, Dict, Any

def calculate_line_totals(
    qty_packages: Optional[float] = None,
    package_size: Optional[float] = None,
    fallback_qty: float = 1.0,
    unit_price: float = 0.0,
    discount_pct: float = 0.0,
    vat_rate: float = 0.21
) -> Dict[str, Any]:
    """
    Calcula los totales de una línea comercial teniendo en cuenta 
    si el producto se vende en envases o no.
    
    qty_packages: La cantidad de bultos/envases ingresada por el usuario.
    package_size: El tamaño del envase (ej. 20 litros).
    fallback_qty: La cantidad normal si no es un producto envasado.
    
    Devuelve un diccionario con todos los campos calculados, listo para 
    ser asignado a un modelo de Base de Datos.
    """
    
    # Contrato: fallback_qty ya esta expresada en unidades fisicas (LT/KG/UNI).
    # Solo convertir cuando qty_packages fue suministrado explicitamente, incluso para envases fraccionarios.
    size = float(package_size) if package_size is not None else None
    if size is not None and size > 0:
        if qty_packages is not None:
            used_qty_packages = float(qty_packages)
            total_units = used_qty_packages * size
        else:
            total_units = float(fallback_qty) if fallback_qty else 0.0
            used_qty_packages = round(total_units / size, 6)
        used_package_size = size
    else:
        total_units = float(fallback_qty) if fallback_qty else 0.0
        used_qty_packages = None
        used_package_size = None

    gross_amount = total_units * float(unit_price)
    discount_amount = gross_amount * (float(discount_pct) / 100.0)
    net_amount = gross_amount - discount_amount
    vat_amount = net_amount * float(vat_rate)
    total_amount = net_amount + vat_amount

    return {
        "qty_packages": used_qty_packages,
        "package_size": used_package_size,
        "qty": round(total_units, 6),
        "unit_price": round(float(unit_price), 2),
        "discount_pct": round(float(discount_pct), 2),
        "vat_rate": round(float(vat_rate), 4),
        "net_amount": round(net_amount, 2),
        "vat_amount": round(vat_amount, 2),
        "total_amount": round(total_amount, 2)
    }
