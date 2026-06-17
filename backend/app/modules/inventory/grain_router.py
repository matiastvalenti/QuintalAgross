from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.db import grain_models, models
from app.modules.inventory import grain_schemas
from datetime import datetime
from app.modules.inventory.grain_notifications import send_settlement_notification
from app.modules.inventory.grain_lpg_engine import LpgEngine
from decimal import Decimal

from typing import List, Optional, Dict, Any
from decimal import Decimal
from app.modules.inventory.grain_lpg_engine import LpgEngine

router = APIRouter(prefix="/grains", tags=["Grains"])

# ─── MASTERS ───

@router.get("/types", response_model=List[grain_schemas.GrainTypeSchema])
def get_grain_types(db: Session = Depends(get_db)):
    types = db.query(grain_models.GrainType).filter(grain_models.GrainType.active == True).all()
    if not types:
        # Auto-initialize some common grains if empty
        defaults = [
            {"name": "Soja", "short_name": "SOJ"},
            {"name": "Maíz", "short_name": "MAI"},
            {"name": "Trigo", "short_name": "TRI"},
            {"name": "Girasol", "short_name": "GIR"},
            {"name": "Cebada", "short_name": "CEB"},
            {"name": "Sorgo", "short_name": "SOR"},
        ]
        for d in defaults:
            db_type = grain_models.GrainType(name=d["name"], short_name=d["short_name"])
            db.add(db_type)
        db.commit()
        types = db.query(grain_models.GrainType).all()
    return types

@router.get("/harvests", response_model=List[grain_schemas.HarvestSchema])
def get_harvests(db: Session = Depends(get_db)):
    harvests = db.query(grain_models.Harvest).all()
    if not harvests:
        # Auto-initialize
        for h in ["23/24", "24/25"]:
            db_h = grain_models.Harvest(name=h, is_current=(h == "24/25"))
            db.add(db_h)
        db.commit()
        harvests = db.query(grain_models.Harvest).all()
    return harvests

# ─── CONTRACTS ───

@router.get("/contracts", response_model=List[grain_schemas.GrainContractSchema])
def get_contracts(entity_id: Optional[str] = None, grain_type_id: Optional[str] = None, status: Optional[str] = None, cost_center: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(grain_models.GrainContract)
    if entity_id:
        query = query.filter(grain_models.GrainContract.entity_id == entity_id)
    if grain_type_id:
        query = query.filter(grain_models.GrainContract.grain_type_id == grain_type_id)
    if status:
        query = query.filter(grain_models.GrainContract.status == status)
    if cost_center:
        query = query.filter(grain_models.GrainContract.cost_center == cost_center)
    
    results = query.order_by(grain_models.GrainContract.date.desc()).all()
    for r in results:
        r.entity_name = r.entity.name
        r.grain_name = r.grain_type.name
        r.harvest_name = r.harvest.name
    return results

@router.post("/contracts", response_model=grain_schemas.GrainContractSchema)
def create_contract(data: grain_schemas.GrainContractCreate, db: Session = Depends(get_db)):
    db_contract = grain_models.GrainContract(**data.model_dump())
    db.add(db_contract)
    db.commit()
    db.refresh(db_contract)
    return db_contract

# ─── MOVEMENTS ───

@router.get("/movements", response_model=List[grain_schemas.GrainMovementSchema])
def get_movements(entity_id: Optional[str] = None, grain_type_id: Optional[str] = None, cost_center: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(grain_models.GrainMovement)
    if entity_id:
        query = query.filter(grain_models.GrainMovement.entity_id == entity_id)
    if grain_type_id:
        query = query.filter(grain_models.GrainMovement.grain_type_id == grain_type_id)
    if cost_center:
        query = query.filter(grain_models.GrainMovement.cost_center == cost_center)
    
    results = query.order_by(grain_models.GrainMovement.date.desc()).all()
    
    # Decorate with names
    for r in results:
        r.entity_name = r.entity.name
        r.grain_name = r.grain_type.name
        r.harvest_name = r.harvest.name
        r.contract_number = r.contract.number if r.contract else None
        
    return results

@router.post("/movements", response_model=grain_schemas.GrainMovementSchema)
def create_movement(data: grain_schemas.GrainMovementCreate, db: Session = Depends(get_db)):
    db_move = grain_models.GrainMovement(**data.model_dump())
    db.add(db_move)
    
    # Si esta vinculado a un contrato, actualizar los kilos entregados
    if data.contract_id:
        contract = db.query(grain_models.GrainContract).get(data.contract_id)
        if contract:
            contract.delivered_kilos = (contract.delivered_kilos or 0) + data.clean_kilos
            
    db.commit()
    db.refresh(db_move)
    return db_move

# ─── SETTLEMENTS (LIQUIDACIONES) ───

@router.post("/settlements/calculate")
def calculate_settlement(
    total_kilos: Decimal,
    price_per_ton: Decimal,
    sisa_status: str = "1",
    has_broker: bool = False,
    include_paritaria: bool = True
):
    """
    Simula el cálculo de una LPG sin guardar nada en la DB.
    Útil para el wizard del frontend.
    """
    return LpgEngine.calculate(
        total_kilos=total_kilos,
        price_per_ton=price_per_ton,
        sisa_status=sisa_status,
        has_broker=has_broker,
        include_paritaria=include_paritaria
    )

@router.get("/settlements", response_model=List[grain_schemas.GrainSettlementSchema])
def get_settlements(
    entity_id: Optional[str] = None, 
    settlement_type: Optional[str] = None,
    grain_type_id: Optional[str] = None,
    cost_center: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(grain_models.GrainSettlement)
    if entity_id:
        query = query.filter(grain_models.GrainSettlement.entity_id == entity_id)
    if settlement_type:
        query = query.filter(grain_models.GrainSettlement.settlement_type == settlement_type)
    if grain_type_id:
        query = query.filter(grain_models.GrainSettlement.grain_type_id == grain_type_id)
    if cost_center:
        query = query.filter(grain_models.GrainSettlement.cost_center == cost_center)
    
    results = query.order_by(grain_models.GrainSettlement.date.desc()).all()
    for r in results:
        r.entity_name = r.entity.name
        r.broker_name = r.broker.name if r.broker else None
        r.grain_name = r.grain_type.name
        
    return results

@router.get("/settlements/by-document/{doc_id}", response_model=grain_schemas.GrainSettlementSchema)
def get_settlement_by_document(doc_id: str, db: Session = Depends(get_db)):
    settle = db.query(grain_models.GrainSettlement).filter(grain_models.GrainSettlement.document_id == doc_id).first()
    if not settle:
        raise HTTPException(status_code=404, detail="Settlement not found")
    
    # Decorate
    settle.entity_name = settle.entity.name
    settle.broker_name = settle.broker.name if settle.broker else None
    settle.grain_name = settle.grain_type.name
    
    return settle

@router.post("/settlements", response_model=grain_schemas.GrainSettlementSchema)
def create_settlement(data: grain_schemas.GrainSettlementCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # 1. Create the Accounting Document
    doc_type = models.DocumentType.LPG_PRIMARY if data.settlement_type == "PRIMARY" else models.DocumentType.LPG_SECONDARY
    
    db_doc = models.Document(
        entity_id=data.entity_id,
        doc_type=doc_type,
        number=data.number,
        date=data.date,
        currency=models.CurrencyType.USD if data.currency == "USD" else models.CurrencyType.ARS,
        exchange_rate=float(data.exchange_rate),
        total_amount=float(data.net_amount),
        total_amount_ars=float(data.net_amount * data.exchange_rate),
        status=models.DocumentStatus.OPEN,
        notes=f"LPG {data.number} - {data.observations or ''}",
        unidad_negocio="Cereales",
        cost_center=data.cost_center,
        campana=db.query(grain_models.Harvest).get(data.harvest_id).name if data.harvest_id else None,
        salesperson_id=data.salesperson_id,
        vendedor=data.vendedor
    )
    db.add(db_doc)
    db.flush()
    
    # Recalcular comisión inicial
    from app.modules.accounting.document_router import _recalc_document_commission
    _recalc_document_commission(db_doc, db)

    
    # 2. Grain Settlement Header
    settle_dict = data.model_dump(exclude={'items', 'taxes', 'movement_ids'})
    
    # AFIP Integration: Generate COE 
    from app.modules.inventory.afip_lpg_service import AfipLpgService
    if not settle_dict.get('coe_number'):
        settle_dict['coe_number'] = AfipLpgService.request_coe(settle_dict)

    db_settle = grain_models.GrainSettlement(
        **settle_dict,
        document_id=db_doc.id,
        status="OPEN"
    )
    db.add(db_settle)
    db.flush()

    # 4. Nested Items (Debits/Credits)
    for i, item in enumerate(data.items):
        db_item = grain_models.GrainSettlementItem(
            **item.model_dump(),
            settlement_id=db_settle.id
        )
        db.add(db_item)
        
        # También creamos líneas en el documento comercial para que tenga trazabilidad de ítems
        doc_line = models.DocumentLine(
            document_id=db_doc.id,
            description=item.description,
            qty=float(item.quantity),
            unit_price=float(item.unit_price),
            net_amount=float(item.subtotal),
            vat_rate=float(item.vat_rate),
            vat_amount=float(item.vat_amount),
            total_amount=float(item.total_amount),
            line_order=i
        )
        db.add(doc_line)
        
    # 5. Nested Taxes
    for tax in data.taxes:
        db_tax = grain_models.GrainSettlementTax(
            **tax.model_dump(),
            settlement_id=db_settle.id
        )
        db.add(db_tax)
        
        # Opcionalmente, registrar estas tasas en el documento como líneas especiales o campos si es necesario
        # Por ahora el ledger engine las levantará de las propiedades del doc si lo ajustamos.
    
    # 6. Link and mark movements
    if data.movement_ids:
        movements = db.query(grain_models.GrainMovement).filter(
            grain_models.GrainMovement.id.in_(data.movement_ids)
        ).all()
        for m in movements:
            m.settled = True
            m.settlement_id = db_settle.id
    
    db.commit()
    db.refresh(db_settle)
    
    # Generar Asiento Contable
    try:
        from app.modules.accounting.ledger_engine import create_journal_entry_for_document
        create_journal_entry_for_document(db, db_doc)
    except Exception as e:
        print(f"Error automátic journalizing LPG: {e}")

    # Enviar notificación por email en segundo plano
    background_tasks.add_task(send_settlement_notification, db, db_settle.id)
    
    return db_settle

@router.get("/summary")
def get_grains_summary(cost_center: Optional[int] = None, db: Session = Depends(get_db)):
    """Summary for grain stock by type (simplified)"""
    from sqlalchemy import func
    
    # Mock stock analysis for now
    # In a real app we'd sum ENTRY - EXIT
    types = db.query(grain_models.GrainType).all()
    summary = []
    for t in types:
        entry_query = db.query(func.sum(grain_models.GrainMovement.clean_kilos)).filter(
            grain_models.GrainMovement.grain_type_id == t.id,
            grain_models.GrainMovement.type == grain_models.GrainMovementType.ENTRY
        )
        if cost_center:
            entry_query = entry_query.filter(grain_models.GrainMovement.cost_center == cost_center)
        entry = entry_query.scalar() or 0
        
        exit_query = db.query(func.sum(grain_models.GrainMovement.clean_kilos)).filter(
            grain_models.GrainMovement.grain_type_id == t.id,
            grain_models.GrainMovement.type == grain_models.GrainMovementType.EXIT
        )
        if cost_center:
            exit_query = exit_query.filter(grain_models.GrainMovement.cost_center == cost_center)
        exit = exit_query.scalar() or 0
        
        pending_query = db.query(func.sum(grain_models.GrainMovement.clean_kilos)).filter(
            grain_models.GrainMovement.grain_type_id == t.id,
            grain_models.GrainMovement.type == grain_models.GrainMovementType.ENTRY,
            grain_models.GrainMovement.settled == False
        )
        if cost_center:
            pending_query = pending_query.filter(grain_models.GrainMovement.cost_center == cost_center)
        pending = pending_query.scalar() or 0
        
        summary.append({
            "grain_type": t.name,
            "stock_tons": float(entry - exit) / 1000,
            "pending_settle_tons": float(pending) / 1000
        })
    return summary

@router.get("/pending-movements")
def get_pending_movements(entity_id: str, grain_type_id: str, harvest_id: str, cost_center: Optional[int] = None, db: Session = Depends(get_db)):
    """Busca movimientos de entrada que no han sido liquidados aún."""
    query = db.query(grain_models.GrainMovement).filter(
        grain_models.GrainMovement.entity_id == entity_id,
        grain_models.GrainMovement.grain_type_id == grain_type_id,
        grain_models.GrainMovement.harvest_id == harvest_id,
        grain_models.GrainMovement.settled == False,
        grain_models.GrainMovement.type == grain_models.GrainMovementType.ENTRY
    )
    if cost_center:
        query = query.filter(grain_models.GrainMovement.cost_center == cost_center)
        
    movements = query.all()
    
    # Decorate with names for the wizard
    for m in movements:
        m.grain_name = m.grain_type.name
        m.harvest_name = m.harvest.name
        m.contract_number = m.contract.number if m.contract else "Sin Contrato"
        
    return movements
    return calc

@router.delete("/settlements/{settlement_id}")
def delete_settlement(settlement_id: str, db: Session = Depends(get_db)):
    """
    Elimina una Liquidación (LPG) y restaura la trazabilidad.
    1. Anula el Documento comercial vinculado.
    2. Revierte la marca de 'liquidado' en los Movimientos de Grano.
    3. Elimina la cabecera de la LPG.
    """
    settle = db.query(grain_models.GrainSettlement).get(settlement_id)
    if not settle:
        raise HTTPException(status_code=404, detail="Settlement not found")
        
    # 1. Movimientos de Grano vinculados -> restaurar a NO liquidados
    movements = db.query(grain_models.GrainMovement).filter(
        grain_models.GrainMovement.settlement_id == settlement_id
    ).all()
    for m in movements:
        m.settled = False
        m.settlement_id = None
        
    # 2. Documento comercial vinculado -> Anular (esto borra asientos también por cascada)
    if settle.document_id:
        doc = db.query(models.Document).get(settle.document_id)
        if doc:
            doc.status = models.DocumentStatus.CANCELLED
            doc.notes = f"{doc.notes} (ANULADO POR ELIMINACIÓN DE LPG)"
            # Borrar asientos contables si existen
            db.query(models.JournalEntry).filter(models.JournalEntry.document_id == doc.id).delete()
            
    # 3. Eliminar LPG (cascada borrará items/tasas)
    db.delete(settle)
    
    db.commit()
    return {"status": "success", "message": "Settlement deleted and movements restored"}
