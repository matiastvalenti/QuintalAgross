from fastapi import APIRouter
import json

router = APIRouter(prefix="/config", tags=["Config"])

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.db.models.commercial_models import PointOfSale, PosDocumentConfig
from app.modules import pos_schemas, config_schemas

router = APIRouter(prefix="/config", tags=["Config"])

@router.get("/pos", response_model=List[pos_schemas.PointOfSaleResponse])
def get_points_of_sale(db: Session = Depends(get_db)):
    """Lista todos los puntos de venta configurados."""
    return db.query(PointOfSale).all()

@router.post("/pos", response_model=pos_schemas.PointOfSaleResponse, status_code=201)
def create_pos(data: pos_schemas.PointOfSaleCreate, db: Session = Depends(get_db)):
    
    db_pos = PointOfSale(pv=data.pv, name=data.name, active=data.active)
    db.add(db_pos)
    db.flush()
    
    for cfg in data.document_configs:
        db_cfg = PosDocumentConfig(
            pos_id=db_pos.id,
            document_type=cfg.document_type,
            last_number=cfg.last_number
        )
        db.add(db_cfg)
    
    db.commit()
    db.refresh(db_pos)
    return db_pos

@router.put("/pos/{pos_id}", response_model=pos_schemas.PointOfSaleResponse)
def update_pos(pos_id: str, data: pos_schemas.PointOfSaleUpdate, db: Session = Depends(get_db)):
    db_pos = db.query(PointOfSale).filter(PointOfSale.id == pos_id).first()
    if not db_pos:
        raise HTTPException(status_code=404, detail="Punto de venta no encontrado.")
    
    if data.pv: db_pos.pv = data.pv
    if data.name: db_pos.name = data.name
    if data.active is not None: db_pos.active = data.active
    
    if data.document_configs is not None:
        # Reemplazar configuraciones
        db.query(PosDocumentConfig).filter(PosDocumentConfig.pos_id == pos_id).delete()
        for cfg in data.document_configs:
            db_cfg = PosDocumentConfig(
                pos_id=db_pos.id,
                document_type=cfg.document_type,
                last_number=cfg.last_number
            )
            db.add(db_cfg)
            
    db.commit()
    db.refresh(db_pos)
    return db_pos

@router.delete("/pos/{pos_id}")
def delete_pos(pos_id: str, db: Session = Depends(get_db)):
    db_pos = db.query(PointOfSale).filter(PointOfSale.id == pos_id).first()
    if not db_pos:
        raise HTTPException(status_code=404, detail="Punto de venta no encontrado.")
    
    db.delete(db_pos)
    db.commit()
    return {"ok": True}

@router.get("/pos/next-number")
def get_pos_next_number(pv: str, doc_type: str, db: Session = Depends(get_db)):
    """Calcula el próximo número para un PV y tipo de documento específicos."""
    from app.modules.sales import numbering_service
    next_full = numbering_service.get_next_number(db, pv, doc_type)
    next_seq = next_full.split("-")[-1] if "-" in next_full else next_full
    return {
        "pv": pv,
        "doc_type": doc_type,
        "next_number": next_seq,
        "full_number": next_full
    }

# --- Business Units ---
@router.get("/business-units", response_model=List[config_schemas.BusinessUnitResponse])
def get_business_units(db: Session = Depends(get_db)):
    from app.db.models.commercial_models import BusinessUnit
    return db.query(BusinessUnit).filter(BusinessUnit.active == True).all()

@router.post("/business-units", response_model=config_schemas.BusinessUnitResponse)
def create_business_unit(data: config_schemas.ConfigCreate, db: Session = Depends(get_db)):
    from app.db.models.commercial_models import BusinessUnit
    db_item = BusinessUnit(name=data.name, active=data.active)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

@router.put("/business-units/{item_id}", response_model=config_schemas.BusinessUnitResponse)
def update_business_unit(item_id: str, data: config_schemas.ConfigUpdate, db: Session = Depends(get_db)):
    from app.db.models.commercial_models import BusinessUnit
    db_item = db.query(BusinessUnit).filter(BusinessUnit.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="No encontrado")
    if data.name is not None: db_item.name = data.name
    if data.active is not None: db_item.active = data.active
    db.commit()
    db.refresh(db_item)
    return db_item

@router.delete("/business-units/{item_id}")
def delete_business_unit(item_id: str, db: Session = Depends(get_db)):
    from app.db.models.commercial_models import BusinessUnit, SalesOrder
    from app.db.models.models import Entity
    db_item = db.query(BusinessUnit).filter(BusinessUnit.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="No encontrado")
    
    # Verificación de vínculos (por nombre, ya que se guardan como string en otros modelos actualmente)
    in_orders = db.query(SalesOrder).filter(SalesOrder.business_unit == db_item.name).first()
    in_entities = db.query(Entity).filter(Entity.business_unit == db_item.name).first()
    
    if in_orders or in_entities:
        raise HTTPException(status_code=400, detail="No se puede eliminar: la Unidad de Negocio tiene registros vinculados.")
    
    db.delete(db_item)
    db.commit()
    return {"ok": True}

# --- Campaigns ---
@router.get("/campaigns", response_model=List[config_schemas.CampaignResponse])
def get_campaigns(db: Session = Depends(get_db)):
    from app.db.models.commercial_models import Campaign
    return db.query(Campaign).filter(Campaign.active == True).all()

@router.post("/campaigns", response_model=config_schemas.CampaignResponse)
def create_campaign(data: config_schemas.ConfigCreate, db: Session = Depends(get_db)):
    from app.db.models.commercial_models import Campaign
    db_item = Campaign(name=data.name, active=data.active)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item
@router.put("/campaigns/{item_id}", response_model=config_schemas.CampaignResponse)
def update_campaign(item_id: str, data: config_schemas.ConfigUpdate, db: Session = Depends(get_db)):
    from app.db.models.commercial_models import Campaign
    db_item = db.query(Campaign).filter(Campaign.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="No encontrado")
    if data.name is not None: db_item.name = data.name
    if data.active is not None: db_item.active = data.active
    db.commit()
    db.refresh(db_item)
    return db_item

@router.delete("/campaigns/{item_id}")
def delete_campaign(item_id: str, db: Session = Depends(get_db)):
    from app.db.models.commercial_models import Campaign, SalesOrder
    db_item = db.query(Campaign).filter(Campaign.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="No encontrado")
    
    # Por ahora las campañas no tienen Fks fuertes o campos string tan claros en otros modelos, 
    # pero chequeamos consistencia si el modelo crece.
    db.delete(db_item)
    db.commit()
    return {"ok": True}

# --- PDF Design Configurations ---
@router.get("/pdf/{config_key}", response_model=config_schemas.PDFConfigResponse)
def get_pdf_config(config_key: str, db: Session = Depends(get_db)):
    from app.db.models.commercial_models import PDFConfig
    item = db.query(PDFConfig).filter(PDFConfig.config_key == config_key).first()
    if not item:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")
    return {
        "config_key": item.config_key,
        "positions": json.loads(item.positions),
        "updated_at": item.updated_at
    }

@router.post("/pdf/{config_key}", response_model=config_schemas.PDFConfigResponse)
def save_pdf_config(config_key: str, data: config_schemas.PDFConfigUpdate, db: Session = Depends(get_db)):
    from app.db.models.commercial_models import PDFConfig
    item = db.query(PDFConfig).filter(PDFConfig.config_key == config_key).first()
    if not item:
        item = PDFConfig(config_key=config_key, positions="{}")
        db.add(item)
    
    item.positions = json.dumps(data.positions)
    db.commit()
    db.refresh(item)
    return {
        "config_key": item.config_key,
        "positions": json.loads(item.positions),
        "updated_at": item.updated_at
    }

# --- Banks ---
@router.get("/banks", response_model=List[config_schemas.BankResponse])
def get_banks(db: Session = Depends(get_db)):
    from app.db.models.commercial_models import Bank
    return db.query(Bank).filter(Bank.active == True).order_by(Bank.name).all()

@router.post("/banks", response_model=config_schemas.BankResponse)
def create_bank(data: config_schemas.ConfigCreate, db: Session = Depends(get_db)):
    from app.db.models.commercial_models import Bank
    db_item = Bank(name=data.name, active=data.active, tax_id=data.tax_id)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

@router.put("/banks/{item_id}", response_model=config_schemas.BankResponse)
def update_bank(item_id: str, data: config_schemas.ConfigUpdate, db: Session = Depends(get_db)):
    from app.db.models.commercial_models import Bank
    db_item = db.query(Bank).filter(Bank.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="No encontrado")
    if data.name is not None: db_item.name = data.name
    if data.tax_id is not None: db_item.tax_id = data.tax_id
    if data.active is not None: db_item.active = data.active
    db.commit()
    db.refresh(db_item)
    return db_item

@router.delete("/banks/{item_id}")
def delete_bank(item_id: str, db: Session = Depends(get_db)):
    from app.db.models.commercial_models import Bank
    db_item = db.query(Bank).filter(Bank.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="No encontrado")
    
    db.delete(db_item)
    db.commit()
    return {"ok": True}
