"""
Service for AFIP ARCA Integration (Web Service Factura Electrónica - WSFE)
Reference: https://www.afip.gob.ar/facturaconfluencia/documentos/manual-wsfe-v1-1.pdf
"""
from typing import Dict, Any, List

class AfipWsfeService:
    """
    Adapter for AFIP WSFE.
    In production, this would use a library like 'zeep' for SOAP requests
    and 'cryptography' for signing with WSAA.
    """
    
    @staticmethod
    def authorize_invoice(invoice_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Authorization is unavailable until a real adapter is configured.
        """
        raise RuntimeError("Integración ARCA real no configurada; no se generan CAE simulados")

    @staticmethod
    def get_last_number(pv: str, doc_type: str) -> int:
        """
        No local or random number can stand in for the last authorized ARCA number.
        """
        # Real: Call FECompUltimoAutorizado
        raise RuntimeError("Numeración ARCA no disponible sin conexión real")
