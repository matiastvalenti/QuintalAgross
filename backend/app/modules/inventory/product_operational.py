"""Validación de habilitación operativa de productos."""
from fastapi import HTTPException
from app.db.models.commercial_models import Product


def require_operational_product(db, product_id):
    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Producto no encontrado"
        )

    if not product.active or not product.operational_enabled:
        raise HTTPException(
            status_code=400,
            detail=f"Producto no habilitado: {product.name}"
        )

    return product
