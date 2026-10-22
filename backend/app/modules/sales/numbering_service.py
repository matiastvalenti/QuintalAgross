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
    
    if model == Document:
        from app.db.models.models import DocumentType
        if doc_type.startswith('FA') or doc_type.startswith('FB') or doc_type.startswith('FC') or doc_type.startswith('FM') or doc_type.startswith('FCE'):
            q = q.filter(model.doc_type == DocumentType.INVOICE)
        elif doc_type.startswith('NC'):
            q = q.filter(model.doc_type == DocumentType.CREDIT_NOTE)
        elif doc_type.startswith('ND'):
            q = q.filter(model.doc_type == DocumentType.DEBIT_NOTE)
        elif doc_type == 'RECIBO':
            q = q.filter(model.doc_type == DocumentType.RECEIPT)
        elif doc_type == 'PAGO' or doc_type == 'ORDEN_PAGO':
            q = q.filter(model.doc_type == DocumentType.PAYMENT)
            
        if len(doc_type) >= 3 and doc_type[:2] in ('FA', 'NC', 'ND', 'FC', 'FB'):
            # It's NCA, NDB, etc. The last letter is usually the line.
            line = doc_type[-1]
            if line in ['A', 'B', 'C', 'M']:
                q = q.filter(model.line == line)
        elif len(doc_type) >= 2 and doc_type[:2] in ('FA', 'FB', 'FC', 'FM'):
            line = doc_type[-1]
            if line in ['A', 'B', 'C', 'M']:
                q = q.filter(model.line == line)

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
        if not cfg.pos.active:
            raise ValueError(
                f"El punto de venta {pv_code} está inactivo y no puede emitir nuevos comprobantes."
            )
        db_last = _get_max_from_db(db, pv_code, doc_type)
        cfg.last_number = max(cfg.last_number, db_last) + 1
        db.flush()
        return True
    return False


def reserve_next_number(db: Session, pv_code: str, doc_type: str) -> str:
    """Reserva un correlativo en la transacción ACTUAL (no hace commit).

    El llamador debe guardar el documento y confirmar o revertir la misma sesión.
    Las consultas de vista previa deben seguir usando get_next_number().
    """
    from sqlalchemy import update, func, case, select

    pv_code = str(pv_code).strip().zfill(4)
    aliases = [doc_type]
    if doc_type in ("RE", "RM", "REMITO"):
        aliases = ["RE", "RM", "REMITO"]
    elif doc_type in ("PAGO", "ORDEN_PAGO"):
        aliases = ["PAGO", "ORDEN_PAGO"]
    elif doc_type == "RECIBO":
        aliases = ["RECIBO", "RECEIPT"]

    # Este SELECT es informativo; la serialización real sucede en el UPDATE.
    pos = db.query(PointOfSale).filter(PointOfSale.pv == pv_code).one_or_none()
    if pos is None:
        raise ValueError(f"No existe el punto de venta {pv_code}")
    if not pos.active:
        raise ValueError(f"El punto de venta {pv_code} está inactivo")

    configs = db.query(PosDocumentConfig).filter(
        PosDocumentConfig.pos_id == pos.id,
        PosDocumentConfig.document_type.in_(aliases),
    ).order_by(PosDocumentConfig.document_type).all()
    if len(configs) != 1:
        raise ValueError(
            f"Debe existir una única configuración para {doc_type} en PV {pv_code}; "
            f"se encontraron {len(configs)}"
        )
    cfg = configs[0]
    historic_max = _get_max_from_db(db, pv_code, doc_type)

    # UPDATE ... RETURNING obtiene un valor único aun con emisores simultáneos.
    # max() es función escalar de SQLite con dos argumentos.
    stmt = (
        update(PosDocumentConfig)
        .where(PosDocumentConfig.id == cfg.id)
        .values(last_number=func.max(PosDocumentConfig.last_number, historic_max) + 1)
        .returning(PosDocumentConfig.last_number)
    )
    reserved = db.execute(stmt).scalar_one()
    # Evitar que una instancia ORM precargada reescriba el contador reservado.
    db.expire(cfg, ["last_number"])
    return f"{pv_code}-{reserved:08d}"
