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
    
    # Si hay package_size > 1 (leído del producto), la cantidad ingresada
    # es en realidad la cantidad de envases (qty_packages).
    # Nota: package_size = 1 es el default y equivale a "sin envase".
    if package_size is not None and float(package_size) > 1:
        if qty_packages is None or float(qty_packages) == 0:
            # El frontend no envió qty_packages: tomamos la qty enviada como "qty_packages"
            qty_packages = float(fallback_qty) if fallback_qty else 0.0
            
        total_units = float(qty_packages) * float(package_size)
        used_qty_packages = float(qty_packages)
        used_package_size = float(package_size)
    else:
        # Sin envase (o product sin package_size configurado)
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
        "qty": round(total_units, 2),
        "unit_price": round(float(unit_price), 2),
        "discount_pct": round(float(discount_pct), 2),
        "vat_rate": round(float(vat_rate), 4),
        "net_amount": round(net_amount, 2),
        "vat_amount": round(vat_amount, 2),
        "total_amount": round(total_amount, 2)
    }
