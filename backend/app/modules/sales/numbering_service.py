from sqlalchemy.orm import Session
from app.db.models.commercial_models import PointOfSale, PosDocumentConfig, SalesOrder, DeliveryNote, PurchaseOrder
from app.db.models.models import Document

def _get_max_from_db(db: Session, pv_code: str, doc_type: str) -> int:
    """Busca el último número real en la tabla correspondiente."""
    mapping = {
        'OV': SalesOrder,
        'RE': DeliveryNote,
        'RM': DeliveryNote,
        'REMITO': DeliveryNote,
        'OC': PurchaseOrder,
        'FA': Document,
        'FB': Document,
        'FC': Document,
        'FM': Document,
        'FCEA': Document,
        'FCEB': Document,
        'NCA': Document,
        'NCB': Document,
        'NCC': Document,
        'NCM': Document,
        'NDA': Document,
        'NDB': Document,
        'NDC': Document,
        'NDM': Document,
        'RECIBO': Document,
        'PAGO': Document,
        'ORDEN_PAGO': Document
    }
    model = mapping.get(doc_type)
    if not model:
        return 0
    
    # Filter by prefix and type if it's Document
    q = db.query(model).filter(model.number.like(f"{pv_code}-%"))
    
    # We NO LONGER filter by doc_type/line here. 
    # Since the 'documents' table has a UNIQUE constraint on the 'number' column, 
    # we must ensure the generated number is unique across ALL document types 
    # (FA, FB, RECIBO, PAGO, etc.) for this PV.
        
    last = q.order_by(model.number.desc()).first()
    if last:
        try:
            return int(last.number.split("-")[-1])
        except (ValueError, IndexError):
            pass
    return 0

def get_next_number(db: Session, pv_code: str, doc_type: str) -> str:
    """
    Calcula el próximo número correlativo.
    Usa el mayor entre PosDocumentConfig.last_number y el máximo real en la DB.
    """
    config_last = 0
    # Normalización para búsqueda de configuración
    lookup_tags = [doc_type]
    if doc_type in ['RE', 'RM', 'REMITO']: lookup_tags = ['RE', 'RM', 'REMITO']
    if doc_type == 'ORDEN_PAGO': lookup_tags.append('PAGO')
    if doc_type == 'PAGO': lookup_tags.append('ORDEN_PAGO')
    if doc_type == 'RECIBO': lookup_tags.append('RECEIPT') # Por si acaso
    
    # Buscar directamente la configuración que coincida con el tipo de doc y cuyo POS tenga el código pv_code
    cfg = db.query(PosDocumentConfig).join(PointOfSale).filter(
        PointOfSale.pv == pv_code,
        PosDocumentConfig.document_type.in_(lookup_tags)
    ).first()
    
    if cfg:
        config_last = cfg.last_number

    db_last = _get_max_from_db(db, pv_code, doc_type)
    next_seq = max(config_last, db_last) + 1
    return f"{pv_code}-{next_seq:08d}"

def increment_last_number(db: Session, pv_code: str, doc_type: str):
    """Incrementa el contador en la tabla de configuración con bloqueo de fila."""
    lookup_tags = [doc_type]
    if doc_type in ['RE', 'RM', 'REMITO']: lookup_tags = ['RE', 'RM', 'REMITO']
    if doc_type == 'ORDEN_PAGO': lookup_tags.append('PAGO')
    if doc_type == 'PAGO': lookup_tags.append('ORDEN_PAGO')

    cfg = db.query(PosDocumentConfig).join(PointOfSale).filter(
        PointOfSale.pv == pv_code,
        PosDocumentConfig.document_type.in_(lookup_tags)
    ).with_for_update().first()
    if cfg:
        cfg.last_number += 1
        db.flush()
        return True
    return False
