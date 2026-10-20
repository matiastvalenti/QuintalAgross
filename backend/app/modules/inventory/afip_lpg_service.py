"""
Unconfigured adapter for AFIP LPG Integration (Liquidación Primaria de Granos)
In a real-world scenario, this would use pyafipws or zeep to connect to WSCTG (Web Service de Certificación de Trámites de Granos)
and obtain a COE (Código de Operación Electrónica).
"""
from typing import Dict, Any

class AfipLpgService:
    @staticmethod
    def request_coe(settlement_data: Dict[str, Any]) -> str:
        """
        La autorización real requiere una integración configurada y una acción manual.
        """
        raise RuntimeError("Integración ARCA de granos no configurada; no se generan COE simulados")
