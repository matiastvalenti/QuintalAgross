import random
from typing import Optional, Dict
from pydantic import BaseModel

class PadronResult(BaseModel):
    cuit: str
    entity_name: str
    perception_rate: float
    retention_rate: float
    jurisdiction: str
    group: Optional[str] = None

    model_config = {
        "from_attributes": True,
        "populate_by_name": True
    }

class PadronService:
    @staticmethod
    def get_rates_for_cuit(cuit: str, jurisdiction: str = "ARBA") -> PadronResult:
        """
        Simula la consulta a los padrones provinciales (ARBA, AGIP, etc.)
        """
        # Limpiar CUIT
        clean_cuit = cuit.replace("-", "").replace(" ", "")
        
        # Simulamos lógica basada en el último número del CUIT
        # En una implementación real, aquí se llamaría a la API de ARBA/AGIP/etc.
        
        last_digit = int(clean_cuit[-1]) if clean_cuit and clean_cuit[-1].isdigit() else 0
        
        # MOCK LOGIC:
        if last_digit % 3 == 0:
            perception = 3.5
            retention = 1.75
        elif last_digit % 2 == 0:
            perception = 1.5
            retention = 0.75
        else:
            perception = 0.0
            retention = 0.0
            
        return PadronResult(
            cuit=clean_cuit,
            entity_name=f"Contribuyente Simulado {clean_cuit}",
            perception_rate=perception,
            retention_rate=retention,
            jurisdiction=jurisdiction,
            group="A" if perception > 2 else "B"
        )

# Instancia global
padron_service = PadronService()
