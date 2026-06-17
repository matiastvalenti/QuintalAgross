from fastapi import APIRouter, Depends, UploadFile, File, Request, Response, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime
import tempfile
import hashlib
from pathlib import Path
import json

from app.db.session import get_db
from app.db import commercial_models, finance_models
from . import cheque_schemas
from .excel_import import import_excel_to_db
from .excel_export import export_cheques_to_excel
from .pdf_export import export_cheques_to_pdf
from .alerts import run_alerts
from .reports import generate_stock_report, generate_custom_report, generate_rejected_report

router = APIRouter(prefix="/cheques", tags=["cheques"])

@router.post("/import-excel")
async def import_excel(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not (file.filename.endswith(".xls") or file.filename.endswith(".xlsx")):
        raise HTTPException(status_code=400, detail="Subí un Excel .xls o .xlsx")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp) / file.filename
        content = await file.read()
        tmp_path.write_bytes(content)
        result = import_excel_to_db(db, str(tmp_path))
        return result

@router.post("/alerts/run")
def trigger_alerts(db: Session = Depends(get_db)):
    """Manually trigger daily alerts"""
    return run_alerts(db)

@router.post("/reports/stock")
def report_stock(db: Session = Depends(get_db)):
    """Trigger Stock Report Email"""
    return generate_stock_report(db)

@router.post("/reports/rejected")
def report_rejected(db: Session = Depends(get_db)):
    """Trigger Rejected Report Email"""
    return generate_rejected_report(db)

@router.get("/summary", dependencies=[Depends(get_db)])
def get_cheques_summary(db: Session = Depends(get_db)):
    """Resumen de valores en cartera agrupados por moneda."""
    results = db.query(
        finance_models.Cheque.moneda,
        func.sum(finance_models.Cheque.importe).label("total"),
        func.count(finance_models.Cheque.id).label("cantidad")
    ).filter(finance_models.Cheque.estado.in_(["EN_CARTERA", "PENDIENTE"])).group_by(finance_models.Cheque.moneda).all()
    
    return [
        {"moneda": r.moneda, "total": float(r.total or 0), "cantidad": r.cantidad}
        for r in results
    ]

@router.get("/", response_model=List[cheque_schemas.ChequeOut])
def list_cheques(
    request: Request,
    status: Optional[str] = None,
    banco: Optional[str] = None,
    cuit: Optional[str] = None,
    cliente: Optional[str] = None,
    nro_cheque: Optional[str] = None,
    cost_center: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(finance_models.Cheque)
    if cost_center:
        query = query.filter(finance_models.Cheque.cost_center == cost_center)
    if status:
        target_status = status.upper()
        if target_status == "EN_CARTERA":
            query = query.filter(finance_models.Cheque.estado.in_(["EN_CARTERA", "PENDIENTE"]))
        else:
            query = query.filter(finance_models.Cheque.estado == target_status)
    if banco:
        query = query.filter(finance_models.Cheque.banco.ilike(f"%{banco}%"))
    if cuit:
        query = query.filter(finance_models.Cheque.cuit_emisor.ilike(f"%{cuit}%"))
    if cliente:
        query = query.filter(finance_models.Cheque.cliente_dador.ilike(f"%{cliente}%"))
    if nro_cheque:
        query = query.filter(finance_models.Cheque.nro_cheque.ilike(f"%{nro_cheque}%"))
        
    rows = query.order_by(finance_models.Cheque.updated_at.desc()).limit(2000).all()
    # Simple list return
    return rows

@router.get("/nd-diferida", response_model=List[cheque_schemas.ChequeOut])
def list_nd_diferida(db: Session = Depends(get_db)):
    """Listado de cheques con ND postergada para hacer en el futuro."""
    return db.query(finance_models.Cheque).filter(
        finance_models.Cheque.nd_diferida == True
    ).order_by(finance_models.Cheque.f_pago.asc()).all()

@router.post("/nd-diferida/bulk")
def bulk_nd_diferida(payload: cheque_schemas.NdDiferidaBulk, db: Session = Depends(get_db)):
    """Marcar/desmarcar en masa cheques como ND diferida."""
    cheques = db.query(finance_models.Cheque).filter(
        finance_models.Cheque.id.in_(payload.cheque_ids)
    ).all()
    for ch in cheques:
        ch.nd_diferida = payload.nd_diferida
        if payload.nd_diferida_notas is not None:
            ch.nd_diferida_notas = payload.nd_diferida_notas
    db.commit()
    return {"ok": True, "count": len(cheques), "nd_diferida": payload.nd_diferida}

@router.patch("/{cheque_id}", response_model=cheque_schemas.ChequeOut)
def update_cheque(cheque_id: int, payload: cheque_schemas.ChequeUpdate, db: Session = Depends(get_db)):
    ch = db.query(finance_models.Cheque).filter(finance_models.Cheque.id == cheque_id).one_or_none()
    if not ch:
        raise HTTPException(status_code=404, detail="Cheque no encontrado")
    
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "estado":
            setattr(ch, key, value.upper().strip())
        else:
            setattr(ch, key, value)
            
    if ch.rechazado and ch.estado == "EN_CARTERA":
        ch.estado = "RECHAZADO"

    db.commit()
    db.refresh(ch)
    return ch

@router.post("/endorse")
def endorse_cheques(action: cheque_schemas.ChequeAction, db: Session = Depends(get_db)):
    """Endosar cheques de la cartera a un proveedor."""
    cheques = db.query(finance_models.Cheque).filter(finance_models.Cheque.id.in_(action.cheque_ids)).all()
    for ch in cheques:
        if ch.estado not in ["EN_CARTERA", "PENDIENTE"]:
            raise HTTPException(status_code=400, detail=f"El cheque #{ch.nro_cheque} no está en cartera (Estado: {ch.estado})")
        
        ch.estado = "ENDOSADO"
        ch.endorsee_id = action.entity_id
        ch.endorsement_date = datetime.combine(action.action_date, datetime.min.time())
        ch.entregado_a = action.notes or "Endosado via Batch"
        
    db.commit()
    return {"ok": True, "count": len(cheques)}

@router.post("/deposit")
def deposit_cheques(action: cheque_schemas.ChequeAction, db: Session = Depends(get_db)):
    """Depositar cheques de la cartera en un banco."""
    cheques = db.query(finance_models.Cheque).filter(finance_models.Cheque.id.in_(action.cheque_ids)).all()
    for ch in cheques:
        if ch.estado != "EN_CARTERA":
            raise HTTPException(status_code=400, detail=f"El cheque #{ch.nro_cheque} no está en cartera")
        
        ch.estado = "DEPOSITADO"
        # Aquí se podría vincular a una CashPosition (Banco)
        
    db.commit()
    return {"ok": True, "count": len(cheques)}

@router.post("/{cheque_id}/reject")
def reject_cheque(cheque_id: int, rej: cheque_schemas.ChequeRejection, db: Session = Depends(get_db)):
    """Rechazar un cheque y opcionalmente generar Nota de Débito."""
    ch = db.query(finance_models.Cheque).filter(finance_models.Cheque.id == cheque_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="Cheque no encontrado")
        
    if ch.estado == "RECHAZADO":
        raise HTTPException(status_code=400, detail="El cheque ya se encuentra rechazado")

    ch.estado = "RECHAZADO"
    ch.rechazado = True
    ch.notas = f"{ch.notas or ''} | Rechazo: {rej.reason}".strip()
    
    nd_id = None
    if rej.create_nd and ch.entity_id:
        from app.modules.sales import numbering_service
        from app.db import models
        
        # Logic for ND Generation
        pv = "0001"
        line_type = "A" # Default
        ent = db.query(models.Entity).filter(models.Entity.id == ch.entity_id).first()
        if ent and ent.tax_category != "Responsable Inscripto":
            line_type = "B"
            
        doc_type_code = f"ND{line_type}"
        next_num = numbering_service.get_next_number(db, pv, doc_type_code)
        
        new_nd = models.Document(
            entity_id=ch.entity_id,
            doc_type=models.DocumentType.DEBIT_NOTE,
            number=next_num,
            date=datetime.now(),
            currency=ch.moneda or "ARS",
            exchange_rate=1.0,
            total_amount=float(ch.importe or 0) + rej.nd_expenses,
            total_amount_ars=float(ch.importe or 0) + rej.nd_expenses,
            status=models.DocumentStatus.OPEN,
            line=line_type,
            notes=f"ND automatizada por rechazo de Cheque #{ch.nro_cheque} ({rej.reason})",
            created_by="Sistema"
        )
        db.add(new_nd)
        db.flush()
        
        # Line for check principal
        db.add(models.DocumentLine(
            document_id=new_nd.id,
            description=f"Rechazo Cheque #{ch.nro_cheque} - {ch.banco}",
            qty=1.0,
            unit_price=float(ch.importe or 0),
            net_amount=float(ch.importe or 0),
            vat_rate=0.0,
            vat_amount=0.0,
            total_amount=float(ch.importe or 0),
            line_order=0
        ))
        
        # Line for expenses if any
        if rej.nd_expenses > 0:
            vat_amt = rej.nd_expenses * 0.21
            db.add(models.DocumentLine(
                document_id=new_nd.id,
                description="Gastos Administrativos / Bancarios por Rechazo",
                qty=1.0,
                unit_price=rej.nd_expenses,
                net_amount=rej.nd_expenses,
                vat_rate=0.21,
                vat_amount=vat_amt,
                total_amount=rej.nd_expenses + vat_amt,
                line_order=1
            ))
            new_nd.total_amount += vat_amt
            new_nd.total_amount_ars += vat_amt
            
        numbering_service.increment_last_number(db, pv, doc_type_code)
        ch.nd_realizada = True
        nd_id = new_nd.id

    db.commit()
    return {"ok": True, "status": "RECHAZADO", "nd_id": nd_id}

@router.post("/{cheque_id}/clear")
def clear_cheque(cheque_id: int, clear_data: Optional[cheque_schemas.ChequeClear] = None, db: Session = Depends(get_db)):
    """Marcar cheque como acreditado/cobrado y opcionalmente generar ND por gastos."""
    ch = db.query(finance_models.Cheque).filter(finance_models.Cheque.id == cheque_id).first()
    if not ch: raise HTTPException(status_code=404, detail="Cheque no encontrado")
    
    if ch.estado not in ["DEPOSITADO", "EN_CARTERA", "COBRADO"]:
        raise HTTPException(status_code=400, detail="Solo se pueden cobrar cheques en cartera o depositados")
        
    ch.estado = "COBRADO"
    
    nd_id = None
    if clear_data and clear_data.create_nd and ch.entity_id and clear_data.nd_expenses > 0:
        from app.modules.sales import numbering_service
        from app.db import models
        
        pv = "0001"
        line_type = "A"
        ent = db.query(models.Entity).filter(models.Entity.id == ch.entity_id).first()
        if ent and ent.tax_category != "Responsable Inscripto":
            line_type = "B"
            
        doc_type_code = f"ND{line_type}"
        next_num = numbering_service.get_next_number(db, pv, doc_type_code)
        
        vat_amt = clear_data.nd_expenses * 0.21
        total_nd = clear_data.nd_expenses + vat_amt
        
        new_nd = models.Document(
            entity_id=ch.entity_id,
            doc_type=models.DocumentType.DEBIT_NOTE,
            number=next_num,
            date=datetime.now(),
            currency=ch.moneda or "ARS",
            exchange_rate=1.0,
            total_amount=total_nd,
            total_amount_ars=total_nd,
            status=models.DocumentStatus.OPEN,
            line=line_type,
            notes=f"ND por {clear_data.reason} - Cheque #{ch.nro_cheque}",
            created_by="Sistema"
        )
        db.add(new_nd)
        db.flush()
        
        db.add(models.DocumentLine(
            document_id=new_nd.id,
            description=f"{clear_data.reason} Cheque #{ch.nro_cheque} - {ch.banco}",
            qty=1.0,
            unit_price=clear_data.nd_expenses,
            net_amount=clear_data.nd_expenses,
            vat_rate=0.21,
            vat_amount=vat_amt,
            total_amount=total_nd,
            line_order=0
        ))
        
        numbering_service.increment_last_number(db, pv, doc_type_code)
        nd_id = new_nd.id
        ch.notas = f"{ch.notas or ''} | {clear_data.reason} (ND: {next_num})".strip()

    db.commit()
    return {"ok": True, "nd_id": nd_id}

@router.get("/export/excel")
def export_excel(
    status: Optional[str] = None,
    banco: Optional[str] = None,
    cuit: Optional[str] = None,
    cliente: Optional[str] = None,
    nro_cheque: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(finance_models.Cheque)
    if status:
        query = query.filter(finance_models.Cheque.estado == status.upper())
    if banco:
        query = query.filter(finance_models.Cheque.banco.ilike(f"%{banco}%"))
    if cuit:
        query = query.filter(finance_models.Cheque.cuit_emisor.ilike(f"%{cuit}%"))
    if cliente:
        query = query.filter(finance_models.Cheque.cliente_dador.ilike(f"%{cliente}%"))
    if nro_cheque:
        query = query.filter(finance_models.Cheque.nro_cheque.ilike(f"%{nro_cheque}%"))
    
    cheques = query.order_by(finance_models.Cheque.updated_at.desc()).limit(2000).all()
    excel_file = export_cheques_to_excel(cheques)
    filename = f"cheques_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return Response(
        content=excel_file.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/export/pdf")
def export_pdf(
    status: Optional[str] = None,
    banco: Optional[str] = None,
    cuit: Optional[str] = None,
    cliente: Optional[str] = None,
    nro_cheque: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(finance_models.Cheque)
    if status:
        query = query.filter(finance_models.Cheque.estado == status.upper())
    if banco:
        query = query.filter(finance_models.Cheque.banco.ilike(f"%{banco}%"))
    if cuit:
        query = query.filter(finance_models.Cheque.cuit_emisor.ilike(f"%{cuit}%"))
    if cliente:
        query = query.filter(finance_models.Cheque.cliente_dador.ilike(f"%{cliente}%"))
    if nro_cheque:
        query = query.filter(finance_models.Cheque.nro_cheque.ilike(f"%{nro_cheque}%"))
    
    cheques = query.order_by(finance_models.Cheque.updated_at.desc()).limit(2000).all()
    pdf_file = export_cheques_to_pdf(cheques)
    filename = f"cheques_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    
    return Response(
        content=pdf_file.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
