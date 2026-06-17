"""
Router de Libros de IVA - Fase 5 T5.1.2 / T5.1.3
Genera los Libros de IVA Ventas y Compras y exporta en formato ARCA/AFIP
"""
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime
from typing import Optional
import csv
import io

from app.db.session import get_db
from app.db.models.models import Document, DocumentLine, DocumentType, Entity
from app.modules.auth.auth_router import check_permission

router = APIRouter(prefix="/iva", tags=["iva"])

# Tipos de comprobante ARCA:
# 01 = Factura A, 06 = Factura B, 11 = Factura C
# 02 = ND A, 07 = ND B, 03 = NC A, 08 = NC B
AFIP_DOC_TYPE_CODE = {
    "INVOICE": "01",           # Factura (detect A/B/C from entity tax_category)
    "DEBIT_NOTE": "02",
    "CREDIT_NOTE": "03",
    "PURCHASE_INVOICE": "01",
    "PURCHASE_DEBIT_NOTE": "02",
    "PURCHASE_CREDIT_NOTE": "03",
}

AFIP_VAT_CODES = {
    0.0:   "3",   # Exento
    0.105: "4",   # 10.5%
    0.21:  "5",   # 21%
    0.27:  "6",   # 27%
}

def _get_vat_code(rate: float) -> str:
    """Mapea tasa de IVA a código ARCA"""
    # Round to avoid float comparison issues
    rounded = round(float(rate), 3)
    return AFIP_VAT_CODES.get(rounded, "5")  # Default 21%

def _get_comprobante_code(doc: Document) -> str:
    """Determina letra del comprobante según categoría impositiva del cliente"""
    entity = doc.entity
    if not entity:
        return "B"
    cat = (entity.tax_category or "").upper()
    if cat == "RESPONSABLE_INSCRIPTO":
        return "A"
    elif cat in ("MONOTRIBUTO", "EXENTO"):
        return "B"
    elif cat == "CONSUMIDOR_FINAL":
        return "B"
    elif cat == "EXTERIOR":
        return "E"
    return "B"

def _build_iva_rows(db: Session, desde: datetime, hasta: datetime, book_type: str, cost_center: Optional[int] = None):
    """
    Construye filas del Libro de IVA agregadas por alícuota.
    book_type: 'ventas' o 'compras'
    """
    if book_type == "ventas":
        doc_types = [DocumentType.INVOICE, DocumentType.DEBIT_NOTE, DocumentType.CREDIT_NOTE]
    else:
        doc_types = [DocumentType.PURCHASE_INVOICE, DocumentType.PURCHASE_DEBIT_NOTE, DocumentType.PURCHASE_CREDIT_NOTE]

    query = db.query(Document).filter(
        Document.doc_type.in_(doc_types),
        Document.date >= desde,
        Document.date <= hasta,
        Document.status != "CANCELLED"
    )
    
    if cost_center:
        query = query.filter(Document.cost_center == cost_center)
        
    docs = query.order_by(Document.date.asc(), Document.number.asc()).all()

    rows = []
    for doc in docs:
        entity = doc.entity
        # Aggregate lines by vat_rate
        vat_groups: dict[float, dict] = {}
        net_total = 0.0
        vat_total = 0.0
        exempt_total = 0.0

        for line in doc.lines:
            rate = round(float(line.vat_rate or 0), 3)
            net = float(line.net_amount or 0)
            vat = float(line.vat_amount or 0)

            if rate == 0.0:
                exempt_total += net
            else:
                if rate not in vat_groups:
                    vat_groups[rate] = {"net": 0.0, "vat": 0.0}
                vat_groups[rate]["net"] += net
                vat_groups[rate]["vat"] += vat

            net_total += net
            vat_total += vat

        # Calculate perceptions total
        perceptions_total = sum(float(p.amount or 0) for p in (doc.perceptions or []))
        # Calculate retentions total
        retentions_total = sum(float(r.amount or 0) for r in (doc.retentions or []))

        # If no lines, use document totals as fallback
        if not doc.lines:
            total = float(doc.total_amount or 0)
            # Assume 21% for unlisted docs
            net_total = round(total / 1.21, 2)
            vat_total = round(total - net_total, 2)
            vat_groups[0.21] = {"net": net_total, "vat": vat_total}

        letra = _get_comprobante_code(doc)
        tipo_cbte = AFIP_DOC_TYPE_CODE.get(doc.doc_type, "01")
        # ARCA uses specific codes for A vs B
        if doc.doc_type == DocumentType.INVOICE:
            if letra == "A": tipo_cbte = "01"
            elif letra == "B": tipo_cbte = "06"
            elif letra == "E": tipo_cbte = "19"
            else: tipo_cbte = "11"
        elif doc.doc_type in (DocumentType.DEBIT_NOTE, DocumentType.PURCHASE_DEBIT_NOTE):
            tipo_cbte = "02" if letra == "A" else "07"
        elif doc.doc_type in (DocumentType.CREDIT_NOTE, DocumentType.PURCHASE_CREDIT_NOTE):
            tipo_cbte = "03" if letra == "A" else "08"

        is_credit = doc.doc_type in (DocumentType.CREDIT_NOTE, DocumentType.PURCHASE_CREDIT_NOTE)
        sign = -1 if is_credit else 1

        rows.append({
            "fecha": doc.date.strftime("%Y-%m-%d"),
            "tipo_cbte": tipo_cbte,
            "letra": letra,
            "numero": doc.number or "",
            "razon_social": entity.name if entity else "S/D",
            "cuit": entity.tax_id or "00-00000000-0" if entity else "00-00000000-0",
            "condicion_iva": entity.tax_category or "" if entity else "",
            "moneda": doc.currency.value if hasattr(doc.currency, "value") else doc.currency,
            "tipo_cambio": round(float(doc.exchange_rate or 1.0), 4),
            "neto_21": round(vat_groups.get(0.21, {}).get("net", 0) * sign, 2),
            "iva_21": round(vat_groups.get(0.21, {}).get("vat", 0) * sign, 2),
            "neto_105": round(vat_groups.get(0.105, {}).get("net", 0) * sign, 2),
            "iva_105": round(vat_groups.get(0.105, {}).get("vat", 0) * sign, 2),
            "neto_27": round(vat_groups.get(0.27, {}).get("net", 0) * sign, 2),
            "iva_27": round(vat_groups.get(0.27, {}).get("vat", 0) * sign, 2),
            "exento": round(exempt_total * sign, 2),
            "total_neto": round(net_total * sign, 2),
            "total_iva": round(vat_total * sign, 2),
            "percepciones": round(perceptions_total * sign, 2),
            "retenciones": round(retentions_total * sign, 2),
            "total": round(float(doc.total_amount or 0) * sign, 2),
            "total_ars": round(float(doc.total_amount_ars or 0) * sign, 2),
            "doc_id": doc.id,
            "afip_status": doc.afip_status or "PENDING",
            "cae": doc.cae or "",
        })

    return rows


# ─────────────────────────────────────────────
# ENDPOINT: Libro JSON (para UI)
# ─────────────────────────────────────────────

@router.get("/libro")
def get_libro_iva(
    tipo: str = Query("ventas", description="ventas o compras"),
    desde: str = Query(..., description="YYYY-MM-DD"),
    hasta: str = Query(..., description="YYYY-MM-DD"),
    cost_center: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """Retorna el libro de IVA (Ventas o Compras) para el período dado."""
    try:
        desde_dt = datetime.strptime(desde, "%Y-%m-%d").replace(hour=0, minute=0, second=0)
        hasta_dt = datetime.strptime(hasta, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(400, "Formato de fecha inválido. Use YYYY-MM-DD")

    rows = _build_iva_rows(db, desde_dt, hasta_dt, tipo, cost_center)

    # Totals
    def sum_field(field):
        return round(sum(r[field] for r in rows), 2)

    totals = {
        "count": len(rows),
        "total_neto": sum_field("total_neto"),
        "total_iva": sum_field("total_iva"),
        "total_percepciones": sum_field("percepciones"),
        "total_retenciones": sum_field("retenciones"),
        "total": sum_field("total"),
        "neto_21": sum_field("neto_21"),
        "iva_21": sum_field("iva_21"),
        "neto_105": sum_field("neto_105"),
        "iva_105": sum_field("iva_105"),
        "neto_27": sum_field("neto_27"),
        "iva_27": sum_field("iva_27"),
        "exento": sum_field("exento"),
    }

    return {
        "tipo": tipo,
        "desde": desde,
        "hasta": hasta,
        "totals": totals,
        "rows": rows,
    }


# ─────────────────────────────────────────────
# ENDPOINT: Exportar CSV
# ─────────────────────────────────────────────

@router.get("/export/csv")
def export_libro_csv(
    tipo: str = Query("ventas"),
    desde: str = Query(...),
    hasta: str = Query(...),
    cost_center: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """Exporta el libro de IVA en formato CSV estándar."""
    try:
        desde_dt = datetime.strptime(desde, "%Y-%m-%d").replace(hour=0, minute=0, second=0)
        hasta_dt = datetime.strptime(hasta, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(400, "Formato de fecha inválido")

    rows = _build_iva_rows(db, desde_dt, hasta_dt, tipo, cost_center)

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")

    header = [
        "Fecha", "Tipo Cbte", "Letra", "Número",
        "Razón Social", "CUIT", "Condición IVA", "Moneda", "Tipo Cambio",
        "Neto 21%", "IVA 21%",
        "Neto 10.5%", "IVA 10.5%",
        "Neto 27%", "IVA 27%",
        "Exento", "Total Neto", "Total IVA", "Percepciones", "Retenciones", "Total", "Total ARS",
        "CAE", "Estado AFIP"
    ]
    writer.writerow(header)

    for r in rows:
        writer.writerow([
            r["fecha"], r["tipo_cbte"], r["letra"], r["numero"],
            r["razon_social"], r["cuit"], r["condicion_iva"],
            r["moneda"], str(r["tipo_cambio"]).replace(".", ","),
            str(r["neto_21"]).replace(".", ","), str(r["iva_21"]).replace(".", ","),
            str(r["neto_105"]).replace(".", ","), str(r["iva_105"]).replace(".", ","),
            str(r["neto_27"]).replace(".", ","), str(r["iva_27"]).replace(".", ","),
            str(r["exento"]).replace(".", ","),
            str(r["total_neto"]).replace(".", ","),
            str(r["total_iva"]).replace(".", ","),
            str(r["percepciones"]).replace(".", ","),
            str(r["retenciones"]).replace(".", ","),
            str(r["total"]).replace(".", ","),
            str(r["total_ars"]).replace(".", ","),
            r["cae"], r["afip_status"]
        ])

    output.seek(0)
    filename = f"libro_iva_{tipo}_{desde}_{hasta}.csv"
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),  # BOM for Excel
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ─────────────────────────────────────────────
# ENDPOINT: Exportar TXT formato ARCA (AFIP RG 3685)
# ─────────────────────────────────────────────

@router.get("/export/txt")
def export_libro_txt(
    tipo: str = Query("ventas"),
    desde: str = Query(...),
    hasta: str = Query(...),
    cost_center: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Exporta el Libro de IVA en formato TXT compatible con ARCA/AFIP (RG 3685).
    Registro: Fecha(8) | TipoCbte(3) | PtaVenta(5) | NúmCbte(20) | CUIT(11) | ImpNeto21(15) | IVA21(15) | ...
    """
    try:
        desde_dt = datetime.strptime(desde, "%Y-%m-%d").replace(hour=0, minute=0, second=0)
        hasta_dt = datetime.strptime(hasta, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(400, "Formato de fecha inválido")

    rows = _build_iva_rows(db, desde_dt, hasta_dt, tipo, cost_center)

    def arca_amount(val: float) -> str:
        """Formatea un importe para ARCA: 13 enteros + 2 decimales, sin punto"""
        cents = round(abs(val) * 100)
        sign = "-" if val < 0 else " "
        return f"{sign}{cents:015d}"

    def arca_cuit(cuit: str) -> str:
        """CUIT sin guiones, 11 dígitos"""
        clean = cuit.replace("-", "").replace(" ", "")
        return clean.zfill(11)[:11]

    def parse_number(number: str):
        """Extrae punto de venta y número de comprobante (ej: '0001-00000001')"""
        parts = number.split("-")
        if len(parts) == 2:
            return parts[0].zfill(5), parts[1].zfill(20)
        return "00001", number.zfill(20)

    lines_txt = []
    for r in rows:
        pta_venta, num_cbte = parse_number(r["numero"])
        fecha = r["fecha"].replace("-", "")  # YYYYMMDD
        tipo_cbte = r["tipo_cbte"].zfill(3)
        cuit = arca_cuit(r["cuit"])
        cbu_empty = " " * 22  # CBU vacío
        alias_empty = " " * 60

        line = (
            f"{fecha}"           # 8  Fecha
            f"{tipo_cbte}"       # 3  Tipo Comprobante
            f"{pta_venta}"       # 5  Punto de Venta
            f"{num_cbte}"        # 20 Número de Comprobante
            f"{cbu_empty}"       # 22 CBU (vacío)
            f"{alias_empty}"     # 60 Alias (vacío)
            f"{cuit}"            # 11 CUIT
            f"{arca_amount(r['neto_21'])}"   # 15+1 Importe Neto 21%
            f"{arca_amount(r['neto_27'])}"   # 15+1 Importe Neto 27%
            f"{arca_amount(r['neto_105'])}"  # 15+1 Importe Neto 10.5%
            f"{arca_amount(r['exento'])}"    # 15+1 Importe Exento
            f"{arca_amount(r['iva_21'])}"    # 15+1 IVA 21%
            f"{arca_amount(r['iva_27'])}"    # 15+1 IVA 27%
            f"{arca_amount(r['iva_105'])}"   # 15+1 IVA 10.5%
            f"{arca_amount(r['percepciones'])}" # 15+1 Percepciones IIBB
            f"{arca_amount(r['total'])}"     # 15+1 Total
        )
        lines_txt.append(line)

    content = "\r\n".join(lines_txt)
    filename = f"libro_iva_{tipo}_{desde}_{hasta}.txt"
    return StreamingResponse(
        io.BytesIO(content.encode("latin-1", errors="replace")),
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ─────────────────────────────────────────────
# ENDPOINT: Resumen de IVA por período (para el UI del cuadro)
# ─────────────────────────────────────────────

@router.get("/resumen")
def get_iva_resumen(
    year: int = Query(...),
    cost_center: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """Retorna totales de IVA Débito/Crédito mes a mes para el año dado."""
    from sqlalchemy import extract

    # Define all types
    sales_types = [DocumentType.INVOICE, DocumentType.DEBIT_NOTE, DocumentType.CREDIT_NOTE]
    purchase_types = [DocumentType.PURCHASE_INVOICE, DocumentType.PURCHASE_DEBIT_NOTE, DocumentType.PURCHASE_CREDIT_NOTE]

    result = []
    for month in range(1, 13):
        # IVA Débito Fiscal (ventas) - NC reduces it
        from sqlalchemy import case
        
        # We need to sign the vat_amount based on document type
        sign_case = case(
            (Document.doc_type == DocumentType.CREDIT_NOTE, -1.0),
            (Document.doc_type == DocumentType.PURCHASE_CREDIT_NOTE, -1.0),
            else_=1.0
        )

        deb_q = db.query(func.sum(DocumentLine.vat_amount * sign_case)).join(
            Document, DocumentLine.document_id == Document.id
        ).filter(
            Document.doc_type.in_(sales_types),
            extract("year", Document.date) == year,
            extract("month", Document.date) == month,
            Document.status != "CANCELLED"
        )
        if cost_center: deb_q = deb_q.filter(Document.cost_center == cost_center)
        debito = deb_q.scalar() or 0.0

        # IVA Crédito Fiscal (compras)
        cred_q = db.query(func.sum(DocumentLine.vat_amount * sign_case)).join(
            Document, DocumentLine.document_id == Document.id
        ).filter(
            Document.doc_type.in_(purchase_types),
            extract("year", Document.date) == year,
            extract("month", Document.date) == month,
            Document.status != "CANCELLED"
        )
        if cost_center: cred_q = cred_q.filter(Document.cost_center == cost_center)
        credito = cred_q.scalar() or 0.0

        saldo = float(debito) - float(credito)

        result.append({
            "mes": month,
            "mes_nombre": ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                           "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][month - 1],
            "debito_fiscal": round(float(debito), 2),
            "credito_fiscal": round(float(credito), 2),
            "saldo_iva": round(saldo, 2),
        })

    return result
