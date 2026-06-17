from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from app.db.models.finance_models import Cheque
from .mailer import send_email
from .excel_export import export_cheques_to_excel
from .pdf_export import export_cheques_to_pdf

def _fmt_money(x):
    try:
        if x is None:
            return "0,00"
        return f"{float(x):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return "0,00"

def _render_table(cheques, title):
    if not cheques:
        return ""
    
    rows_html = ""
    for ch in cheques:
        moneda = ch.moneda if ch.moneda else "ARS"
        rows_html += f"""
        <tr>
            <td>{ch.banco}</td>
            <td>{ch.nro_cheque}</td>
            <td>{ch.f_pago}</td>
            <td>${_fmt_money(ch.importe)} {moneda}</td>
            <td>{ch.estado}</td>
            <td>{ch.cliente_dador or '-'}</td>
        </tr>
        """
        
    return f"""
    <h3>{title} ({len(cheques)})</h3>
    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">
        <thead>
            <tr style="background-color: #f2f2f2;">
                <th>Banco</th>
                <th>Nro</th>
                <th>Fecha Pago</th>
                <th>Importe</th>
                <th>Estado</th>
                <th>Cliente</th>
            </tr>
        </thead>
        <tbody>
            {rows_html}
        </tbody>
    </table>
    """

def generate_stock_report(db: Session) -> dict:
    pending_cheques = db.query(Cheque).filter(Cheque.estado == "PENDIENTE").order_by(Cheque.f_pago).all()
    rejected_cheques = db.query(Cheque).filter(Cheque.estado == "RECHAZADO").order_by(Cheque.f_pago).all()

    if not pending_cheques and not rejected_cheques:
        return {"status": "error", "message": "No hay cheques en cartera ni rechazados para reportar."}

    all_cheques = pending_cheques + rejected_cheques
    
    total_ars = sum(c.importe for c in all_cheques if (c.moneda == 'ARS' or not c.moneda))
    total_usd = sum(c.importe for c in all_cheques if c.moneda == 'USD')
    
    html_body = f"""
    <div style="font-family: Arial, sans-serif;">
        <h2>📉 Reporte de Stock de Cheques (Cartera)</h2>
        <p>Fecha: {date.today().strftime('%d/%m/%Y')}</p>
        
        <div style="background: #eef2ff; padding: 10px; border-radius: 5px; margin-bottom: 20px;">
            <p style="margin: 0;"><b>Total General ARS:</b> ${_fmt_money(total_ars)}</p>
            <p style="margin: 5px 0 0 0;"><b>Total General USD:</b> ${_fmt_money(total_usd)}</p>
        </div>
        
        {_render_table(pending_cheques, "✅ Cheques en Cartera (Pendientes)")}
        {_render_table(rejected_cheques, "❌ Cheques Rechazados")}
        
        <p><i>Se adjuntan versiones en Excel y PDF.</i></p>
    </div>
    """

    attachments = [
        {"filename": f"Stock_Cheques_{date.today()}.xlsx", "content": export_cheques_to_excel(all_cheques)},
        {"filename": f"Stock_Cheques_{date.today()}.pdf", "content": export_cheques_to_pdf(all_cheques)}
    ]

    subject = f"Stock Cheques - {date.today().strftime('%d/%m/%Y')}"
    res = send_email(subject, html_body, attachments)
    if res.get("sent"):
        return {"status": "ok", "message": "Reporte de stock enviado correctamente."}
    return {"status": "error", "message": f"Error SMTP: {res.get('error')}"}

def generate_rejected_report(db: Session) -> dict:
    rejected_cheques = db.query(Cheque).filter(Cheque.estado == "RECHAZADO").order_by(Cheque.f_pago).all()

    if not rejected_cheques:
        return {"status": "error", "message": "No hay cheques rechazados para reportar."}

    total_ars = sum(c.importe for c in rejected_cheques if (c.moneda == 'ARS' or not c.moneda))
    
    html_body = f"""
    <div style="font-family: Arial, sans-serif;">
        <h2>❌ Reporte de Cheques Rechazados</h2>
        <p>Fecha: {date.today().strftime('%d/%m/%Y')}</p>
        
        <p><b>Total Rechazado ARS:</b> ${_fmt_money(total_ars)}</p>
        
        {_render_table(rejected_cheques, "Cheques Rechazados")}
        
        <p><i>Se adjuntan versiones en Excel y PDF.</i></p>
    </div>
    """

    attachments = [
        {"filename": f"Rechazados_{date.today()}.xlsx", "content": export_cheques_to_excel(rejected_cheques)},
        {"filename": f"Rechazados_{date.today()}.pdf", "content": export_cheques_to_pdf(rejected_cheques)}
    ]

    subject = f"Reporte Rechazados - {date.today().strftime('%d/%m/%Y')}"
    res = send_email(subject, html_body, attachments)
    if res.get("sent"):
        return {"status": "ok", "message": "Reporte de rechazados enviado correctamente."}
    return {"status": "error", "message": f"Error SMTP: {res.get('error')}"}

def generate_custom_report(db: Session, start: date, end: date) -> dict:
    cheques = db.query(Cheque).filter(
        or_(
            and_(Cheque.f_pago >= start, Cheque.f_pago <= end),
            and_(Cheque.f_vencimiento >= start, Cheque.f_vencimiento <= end)
        )
    ).order_by(Cheque.f_pago).all()

    if not cheques:
        return {"status": "ok", "message": "No se encontraron cheques en ese rango de fechas."}

    rows_html = ""
    for ch in cheques:
        moneda = ch.moneda if ch.moneda else "ARS"
        rows_html += f"""
        <tr>
            <td>{ch.banco}</td>
            <td>{ch.nro_cheque}</td>
            <td>{ch.f_pago}</td>
            <td>{ch.f_vencimiento or '-'}</td>
            <td>${_fmt_money(ch.importe)} {moneda}</td>
            <td>{ch.estado}</td>
        </tr>
        """

    html_body = f"""
    <div style="font-family: Arial, sans-serif;">
        <h2>📅 Reporte Personalizado de Cheques</h2>
        <p><b>Desde:</b> {start.strftime('%d/%m/%Y')} - <b>Hasta:</b> {end.strftime('%d/%m/%Y')}</p>
        
        <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
            <thead>
                <tr style="background-color: #f2f2f2;">
                    <th>Banco</th>
                    <th>Nro</th>
                    <th>Fecha Pago</th>
                    <th>Vencimiento</th>
                    <th>Importe</th>
                    <th>Estado</th>
                </tr>
            </thead>
            <tbody>
                {rows_html}
            </tbody>
        </table>
        <p><i>Se adjuntan versiones en Excel y PDF.</i></p>
    </div>
    """

    attachments = [
        {"filename": f"Reporte_{start}_{end}.xlsx", "content": export_cheques_to_excel(cheques)},
        {"filename": f"Reporte_{start}_{end}.pdf", "content": export_cheques_to_pdf(cheques)}
    ]

    subject = f"Reporte Cheques {start.strftime('%d/%m')} al {end.strftime('%d/%m')}"
    res = send_email(subject, html_body, attachments)
    if res.get("sent"):
        return {"status": "ok", "message": "Reporte personalizado enviado correctamente."}
    return {"status": "error", "message": f"Error SMTP: {res.get('error')}"}
