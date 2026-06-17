from sqlalchemy.orm import Session
from app.db import models
from typing import List
from datetime import datetime

class PerceptionService:
    @staticmethod
    def calculate_perceptions(db: Session, entity_id: str, net_amount: float) -> List[dict]:
        """
        Calcula las percepciones aplicables para una entidad basada en el padrón configurado (entity_perceptions).
        """
        entity = db.query(models.Entity).filter(models.Entity.id == entity_id).first()
        if not entity:
            return []
        
        # Buscar percepciones vigentes en la base de datos de la entidad
        now = datetime.utcnow()
        
        query = db.query(models.EntityPerception).filter(
            models.EntityPerception.entity_id == entity_id
        )
        
        # Filtro de vigencia: si start_date es nulo se asume vigente desde siempre, 
        # lo mismo para end_date.
        perceptions = query.filter(
            (models.EntityPerception.start_date == None) | (models.EntityPerception.start_date <= now),
            (models.EntityPerception.end_date == None) | (models.EntityPerception.end_date >= now)
        ).all()
        
        results = []
        for p in perceptions:
            if p.rate and float(p.rate) > 0:
                amount = round(float(net_amount) * (float(p.rate) / 100.0), 2)
                results.append({
                    "tax_name": p.tax_name,
                    "jurisdiction": p.category or "Nacional",
                    "base_amount": net_amount,
                    "rate": p.rate,
                    "amount": amount
                })
            
        return results
