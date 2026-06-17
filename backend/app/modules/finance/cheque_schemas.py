from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime

class ChequeOut(BaseModel):
    id: int
    banco: Optional[str] = "S/D"
    nro_cheque: Optional[str] = "S/N"
    tipo: Optional[str] = None
    importe: Optional[float] = None
    moneda: Optional[str] = None
    f_pago: Optional[date] = None
    f_vencimiento: Optional[date] = None
    cliente_dador: Optional[str] = None
    cuit_emisor: Optional[str] = ""
    beneficiario: Optional[str] = None
    
    entregado_a: Optional[str] = None
    fecha_entrega: Optional[date] = None
    nro_orden_pago: Optional[str] = None
    
    notas: Optional[str] = None
    
    rechazado: Optional[bool] = False
    nd_realizada: Optional[bool] = False
    nd_diferida: Optional[bool] = False
    nd_diferida_notas: Optional[str] = None
    estado: Optional[str] = "EN_CARTERA"
    updated_at: Optional[datetime] = None
    
    # New traceability fields
    entity_id: Optional[str] = None
    source_document_id: Optional[str] = None
    endorsee_id: Optional[str] = None
    endorsement_date: Optional[datetime] = None

    model_config = {
        "from_attributes": True,
        "populate_by_name": True
    }

class ChequeUpdate(BaseModel):
    estado: Optional[str] = None
    rechazado: Optional[bool] = None
    nd_realizada: Optional[bool] = None
    nd_diferida: Optional[bool] = None
    nd_diferida_notas: Optional[str] = None
    entregado_a: Optional[str] = None
    fecha_entrega: Optional[date] = None
    nro_orden_pago: Optional[str] = None
    notas: Optional[str] = None
    cliente_dador: Optional[str] = None
    entity_id: Optional[str] = None
    endorsee_id: Optional[str] = None

class NdDiferidaBulk(BaseModel):
    cheque_ids: List[int]
    nd_diferida: bool = True
    nd_diferida_notas: Optional[str] = None

class ChequeAction(BaseModel):
    cheque_ids: List[int]
    action_date: date = date.today()
    entity_id: Optional[str] = None # For endorsement
    bank_account_id: Optional[str] = None # For deposit
    notes: Optional[str] = None

class ChequeRejection(BaseModel):
    reason: str = "Rechazo Bancario"
    create_nd: bool = True
    nd_expenses: float = 0.0 # Gastos adicionales de ND


class ChequeClear(BaseModel):
    create_nd: bool = False
    nd_expenses: float = 0.0
    reason: str = "Gastos de Acreditación"

class AttachmentOut(BaseModel):
    id: int
    cheque_id: int
    filename: str
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    uploaded_at: datetime
    
    model_config = {
        "from_attributes": True,
        "populate_by_name": True
    }
