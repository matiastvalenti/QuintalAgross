from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from datetime import datetime, date
from typing import List, Optional

from app.db.session import get_db
from app.db.models.models import Document, DocumentType, DocumentStatus, Entity

router = APIRouter(prefix="/reports", tags=["Reports"])

@router.get("/iva")
def get_iva_report(
    db: Session = Depends(get_db),
    report_type: str = Query(..., description="'ventas' or 'compras'"),
    from_date: date = Query(None),
    to_date: date = Query(None)
):
    try:
        if report_type == 'ventas':
            doc_types = [DocumentType.INVOICE, DocumentType.CREDIT_NOTE, DocumentType.DEBIT_NOTE]
        elif report_type == 'compras':
            doc_types = [DocumentType.PURCHASE_INVOICE, DocumentType.PURCHASE_CREDIT_NOTE, DocumentType.PURCHASE_DEBIT_NOTE]
        else:
            raise HTTPException(status_code=400, detail="Invalid report_type. Use 'ventas' or 'compras'.")

        query = db.query(Document).join(Entity, Document.entity_id == Entity.id).filter(
            Document.doc_type.in_(doc_types),
            Document.status != DocumentStatus.CANCELLED
        )

        if from_date:
            query = query.filter(func.date(Document.date) >= from_date)
        if to_date:
            query = query.filter(func.date(Document.date) <= to_date)

        docs = query.order_by(Document.date.asc()).all()

        results = []
        # Para totalizar
        total_net = 0.0
        total_vat = 0.0
        total_other_taxes = 0.0
        total_general = 0.0

        for d in docs:
            # Determinamos el "signo" del documento
            sign = -1 if d.doc_type in [DocumentType.CREDIT_NOTE, DocumentType.PURCHASE_CREDIT_NOTE] else 1
            
            # Sumar líneas con protección ante None
            doc_net = sum((l.net_amount or 0.0) for l in d.lines)
            doc_vat = sum((l.vat_amount or 0.0) for l in d.lines)
            
            # Calcular otros impuestos (por ahora si total > net + vat)
            # asumiendo que el total ya contempla todo
            if getattr(d, 'total_amount_ars', d.total_amount) > 0:
                doc_total = getattr(d, 'total_amount_ars', d.total_amount)
            else:
                doc_total = d.total_amount # Fallback

            doc_other_taxes = max(0.0, float(doc_total) - float(doc_net + doc_vat))

            # Aplicamos signos
            doc_net *= sign
            doc_vat *= sign
            doc_other_taxes *= sign
            doc_total *= sign

            results.append({
                "id": d.id,
                "date": d.date.strftime('%Y-%m-%d'),
                "type": d.doc_type.value,
                "number": d.number,
                "entity_name": d.entity.name if d.entity else "S/D",
                "entity_cuit": d.entity.tax_id if d.entity else "S/D",
                "net_amount": doc_net,
                "vat_amount": doc_vat,
                "other_taxes": doc_other_taxes,
                "total_amount": doc_total
            })

            total_net += doc_net
            total_vat += doc_vat
            total_other_taxes += doc_other_taxes
            total_general += doc_total

        return {
            "items": results,
            "summary": {
                "total_net": total_net,
                "total_vat": total_vat,
                "total_other_taxes": total_other_taxes,
                "total_general": total_general
            }
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
