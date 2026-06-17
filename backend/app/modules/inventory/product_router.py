"""CRUD básico de productos."""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from sqlalchemy.orm import Session, joinedload
from app.db.session import get_db
from app.db.models.commercial_models import (
    Product, SubCategory, SalesOrderLine, DeliveryNoteLine, 
    StockItem, StockMovement, PurchaseOrderLine, Container, TaxType
)
from app.db.models.models import DocumentLine
from app.modules.inventory import product_schemas
from app.modules.auth.auth_router import check_permission
import enum

router = APIRouter(prefix="/products", tags=["Products"])


@router.post("/", response_model=product_schemas.ProductResponse, status_code=201, dependencies=[Depends(check_permission("products", "create"))])
def create_product(data: product_schemas.ProductCreate, db: Session = Depends(get_db)):
    # Verificar SKU único si se proporciona
    if data.sku:
        existing = db.query(Product).filter(Product.sku == data.sku).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"SKU '{data.sku}' ya existe")

    product_data = data.model_dump()
    # Si es servicio, limpiar stock_account_code (opcional, lógica de negocio)
    if data.is_service:
        product_data["stock_account_code"] = None

    db_product = Product(**product_data)
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product


@router.get("/", response_model=List[product_schemas.ProductResponse], dependencies=[Depends(check_permission("products", "view"))])
def list_products(
    # Filtros
    category_id: Optional[str] = None, # Filter by Rubro
    subcategory_id: Optional[str] = None, 
    active: Optional[bool] = None,
    warehouse_id: Optional[str] = None, # Filtro por depósito
    search: Optional[str] = Query(None, alias="q"),
    sort_by: str = "name", # name, sku, stock
    sort_dir: str = "asc", # asc, desc
    
    db: Session = Depends(get_db),
):
    q = db.query(Product).options(
        joinedload(Product.container).joinedload(Container.unit),
        joinedload(Product.tax_type)
    )
    
    # Joins for filtering by category (rubro)
    if category_id:
        q = q.join(Product.subcategory).filter(SubCategory.category_id == category_id)
        
    if subcategory_id:
        q = q.filter(Product.subcategory_id == subcategory_id)
        
    if active is not None:
        q = q.filter(Product.active == active)
        
    if search:
        # Search by Name, SKU, or Active Principle
        search_term = f"%{search}%"
        q = q.filter(
            (Product.name.ilike(search_term)) | 
            (Product.sku.ilike(search_term)) |
            (Product.active_principle.ilike(search_term))
        )

    # Sorting base query (only for name/sku for now, stock requires post-processing or subqueries)
    if sort_by == "name":
        q = q.order_by(Product.name.desc() if sort_dir == "desc" else Product.name.asc())
    elif sort_by == "sku":
        q = q.order_by(Product.sku.desc() if sort_dir == "desc" else Product.sku.asc())
        
    from sqlalchemy import func, case, select
    from app.db.models.commercial_models import StockMovement, StockItem

    # Subconsultas para evitar el N+1 y mejorar la velocidad
    in_sub = db.query(
        StockItem.product_id,
        func.sum(StockMovement.qty).label("in_qty")
    ).join(StockMovement).filter(StockMovement.qty > 0)
    if warehouse_id:
        in_sub = in_sub.filter(StockItem.warehouse_id == warehouse_id)
    in_sub = in_sub.group_by(StockItem.product_id).subquery()

    out_sub = db.query(
        StockItem.product_id,
        func.sum(StockMovement.qty).label("out_qty")
    ).join(StockMovement).filter(StockMovement.qty < 0)
    if warehouse_id:
        out_sub = out_sub.filter(StockItem.warehouse_id == warehouse_id)
    out_sub = out_sub.group_by(StockItem.product_id).subquery()

    stock_sub = db.query(
        StockItem.product_id,
        func.sum(StockItem.qty_on_hand).label("total_stock"),
        func.sum(StockItem.qty_reserved).label("total_reserved")
    )
    if warehouse_id:
        stock_sub = stock_sub.filter(StockItem.warehouse_id == warehouse_id)
    stock_sub = stock_sub.group_by(StockItem.product_id).subquery()

    # Combinamos la query principal con las subconsultas
    q = q.outerjoin(in_sub, Product.id == in_sub.c.product_id)\
         .outerjoin(out_sub, Product.id == out_sub.c.product_id)\
         .outerjoin(stock_sub, Product.id == stock_sub.c.product_id)

    # Añadimos los campos a la selección
    q = q.add_columns(
        func.coalesce(in_sub.c.in_qty, 0).label("in_qty"),
        func.coalesce(func.abs(out_sub.c.out_qty), 0).label("out_qty"),
        func.coalesce(stock_sub.c.total_stock, 0).label("total_stock"),
        func.coalesce(stock_sub.c.total_reserved, 0).label("total_reserved")
    )

    # Ordenamiento: Priorizar productos con movimiento (entradas + salidas > 0)
    # y luego aplicar el ordenamiento seleccionado
    order_by_activity = case(
        (func.coalesce(in_sub.c.in_qty, 0) + func.coalesce(out_sub.c.out_qty, 0) != 0, 0),
        else_=1
    )

    if sort_by == "name":
        col = Product.name
    elif sort_by == "sku":
        col = Product.sku
    elif sort_by == "stock":
        col = func.coalesce(stock_sub.c.total_stock, 0)
    else:
        col = Product.name

    sort_expr = col.desc() if sort_dir == "desc" else col.asc()
    
    # El orden principal es 'con movimiento primero', luego el elegido por el usuario
    results = q.order_by(order_by_activity, sort_expr).all()
    
    # Procesar resultados (SQLAlchemy devuelve tuplas [Product, in_qty, out_qty, total_stock] por el add_columns)
    final_products = []
    for row in results:
        p = row[0]
        p.in_qty = row[1]
        p.out_qty = row[2]
        p.total_stock = row[3]
        p.total_reserved = row[4]
        p.total_available = p.total_stock - p.total_reserved
        final_products.append(p)
        
    return final_products


@router.get("/{product_id}", response_model=product_schemas.ProductResponse, dependencies=[Depends(check_permission("products", "view"))])
def get_product(product_id: str, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return product

@router.get("/{product_id}/movements")
def get_product_movements(product_id: str, db: Session = Depends(get_db)):
    movements = db.query(StockMovement).join(StockItem).filter(
        StockItem.product_id == product_id
    ).order_by(StockMovement.created_at.desc()).all()
    
    result = []
    for m in movements:
        result.append({
            "id": m.id,
            "date": m.created_at,
            "type": m.movement_type.value,
            "qty": float(m.qty),
            "reference_type": m.reference_type,
            "reference_id": m.reference_id,
            "notes": m.notes,
            "warehouse_name": m.stock_item.warehouse.name if m.stock_item and m.stock_item.warehouse else None
        })
    return result


@router.post("/sync-movements", tags=["Admin"])
def sync_missing_movements(db: Session = Depends(get_db)):
    # Find all confirmed/dispatched/invoiced delivery notes and their lines
    from app.db.models.commercial_models import DeliveryNote, DeliveryNoteLine, StockItem, StockMovement, StockMovementType, DeliveryNoteStatus
    from decimal import Decimal
    
    dns = db.query(DeliveryNote).filter(
        DeliveryNote.status.in_([DeliveryNoteStatus.DISPATCHED, DeliveryNoteStatus.PARTIAL, DeliveryNoteStatus.INVOICED])
    ).all()
    
    count = 0
    for dn in dns:
        for line in dn.lines:
            if not line.product_id: continue
            
            # Check if movement exists for this dn line
            exists = db.query(StockMovement).filter(
                StockMovement.reference_id == dn.id,
                StockMovement.reference_type.in_(["DELIVERY_NOTE", "RETURN"])
            ).first()
            
            if not exists:
                # Need to generate missing movement
                item = db.query(StockItem).filter(
                    StockItem.product_id == line.product_id,
                    StockItem.warehouse_id == dn.warehouse_id
                ).first()
                if not item:
                    item = StockItem(product_id=line.product_id, warehouse_id=dn.warehouse_id, qty_on_hand=0)
                    db.add(item)
                    db.flush()
                
                is_sale = dn.note_type == "SALE"
                is_return = dn.delivery_type == "RETURN"
                should_add = (not is_sale and not is_return) or (is_sale and is_return)
                
                qty = line.qty
                m_type = StockMovementType.IN if should_add else StockMovementType.OUT
                mq = qty if should_add else -qty
                
                mov = StockMovement(
                    stock_item_id=item.id,
                    movement_type=m_type,
                    qty=mq,
                    reference_type="RETURN" if is_return else "DELIVERY_NOTE",
                    reference_id=dn.id,
                    notes=f"Auto-sync from Delivery Note {dn.number}"
                )
                db.add(mov)
                count += 1
                
    db.commit()
    return {"status": "ok", "synced_movements": count}


@router.put("/{product_id}", response_model=product_schemas.ProductResponse, dependencies=[Depends(check_permission("products", "edit"))])
def update_product(product_id: str, data: product_schemas.ProductUpdate, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    update_data = data.model_dump(exclude_unset=True)

    # Validar SKU único si se cambia
    if "sku" in update_data and update_data["sku"]:
        existing = db.query(Product).filter(
            Product.sku == update_data["sku"],
            Product.id != product_id,
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"SKU '{update_data['sku']}' ya existe")

    # Si se marca como servicio, limpiar stock_account_code
    if update_data.get("is_service"):
        update_data["stock_account_code"] = None

    for key, value in update_data.items():
        setattr(product, key, value)

    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=204, dependencies=[Depends(check_permission("products", "delete"))])
def delete_product(product_id: str, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    
    # ── Check for dependencies ──
    links = []
    
    # 1. Sales Orders
    sales_lines = db.query(SalesOrderLine).filter(SalesOrderLine.product_id == product_id).all()
    for line in sales_lines:
        links.append(f"Orden de Venta {line.order.number if line.order else 'Desconocida'}")
        
    # 2. Delivery Notes (Remitos)
    dn_lines = db.query(DeliveryNoteLine).filter(DeliveryNoteLine.product_id == product_id).all()
    for line in dn_lines:
        links.append(f"Remito {line.delivery_note.number if line.delivery_note else 'Desconocido'}")
        
    # 3. Stock with balance
    stock_items = db.query(StockItem).filter(
        StockItem.product_id == product_id, 
        (StockItem.qty_on_hand != 0) | (StockItem.qty_reserved != 0)
    ).all()
    if stock_items:
        links.append(f"Stock remanente o reservado en {len(stock_items)} depósito(s)")

    # 4. Stock Movements (Audit Trail)
    # Note: StockMovement links to StockItem, which links to Product
    movements_count = db.query(StockMovement).join(StockItem).filter(StockItem.product_id == product_id).count()
    if movements_count > 0:
        links.append(f"Historial de movimientos: {movements_count} registros registrados")

    # 5. Purchase Orders
    po_lines = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.product_id == product_id).all()
    for line in po_lines:
        links.append(f"Orden de Compra {line.order.number if line.order else 'Desconocida'}")

    # 6. Invoices / Documents
    doc_lines = db.query(DocumentLine).filter(DocumentLine.product_id == product_id).all()
    for line in doc_lines:
        links.append(f"Documento (Factura/NC/ND) {line.document.number if line.document else 'Desconocido'}")
        
    if links:
        # If there are links, block deletion and report them
        report = "; ".join(links[:15]) # Limit report string length
        if len(links) > 15:
            report += f" ... y {len(links) - 15} más"
            
        raise HTTPException(
            status_code=400, 
            detail={
                "message": "No se puede eliminar el artículo porque tiene transacciones vinculadas.",
                "links": links
            }
        )

    db.delete(product)
    db.commit()
