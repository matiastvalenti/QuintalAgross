import os
from datetime import datetime
from sqlalchemy.orm import Session
from app.db import grain_models, models
from app.modules.finance.mailer import send_email
from decimal import Decimal

def get_settlement_html_template(settlement: grain_models.GrainSettlement, entity: models.Entity):
    """Genera un template HTML profesional para la notificación de liquidación."""
    
    # Formateo de números
    def fmt_curr(val, currency="USD"):
        if val is None: return "$ 0.00"
        return f"{currency} {float(val):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    def fmt_qty(val):
        if val is None: return "0.00"
        return f"{float(val):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    title = "Nueva Liquidación de Granos" if settlement.settlement_type == grain_models.SettlementType.PRIMARY else "Nueva Liquidación de Venta de Granos"
    header_color = "#10b981" if settlement.settlement_type == grain_models.SettlementType.PRIMARY else "#3b82f6"
    
    # Construcción de las filas de ítems
    items_html = ""
    for item in settlement.items:
        items_html += f"""
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #edf2f7; font-size: 14px; color: #4a5568;">{item.description}</td>
            <td style="padding: 10px; border-bottom: 1px solid #edf2f7; font-size: 14px; color: #4a5568; text-align: right;">{fmt_qty(item.quantity or 0)}</td>
            <td style="padding: 10px; border-bottom: 1px solid #edf2f7; font-size: 14px; color: #4a5568; text-align: right;">{fmt_curr(item.total_amount, settlement.currency)}</td>
        </tr>
        """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #2d3748; margin: 0; padding: 0; background-color: #f7fafc; }}
            .container {{ max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0; }}
            .header {{ background-color: {header_color}; padding: 30px; text-align: center; color: white; }}
            .header h1 {{ margin: 0; font-size: 24px; font-weight: 700; }}
            .content {{ padding: 30px; }}
            .greeting {{ font-size: 18px; font-weight: 600; margin-bottom: 20px; }}
            .summary-box {{ background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin-bottom: 25px; }}
            .summary-item {{ display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 15px; }}
            .summary-label {{ color: #718096; font-weight: 500; }}
            .summary-value {{ color: #2d3748; font-weight: 700; }}
            .table {{ width: 100%; border-collapse: collapse; margin-bottom: 20px; }}
            .table th {{ text-align: left; padding: 10px; background-color: #f1f5f9; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }}
            .total-row {{ background-color: #f8fafc; font-weight: 700; font-size: 18px; color: {header_color}; }}
            .footer {{ background-color: #edf2f7; padding: 20px; text-align: center; color: #718096; font-size: 12px; }}
            .btn {{ display: inline-block; padding: 12px 24px; background-color: {header_color}; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>{title}</h1>
            </div>
            <div class="content">
                <div class="greeting">Hola, {entity.name}</div>
                <p>Le informamos que se ha generado una nueva liquidación de granos en el sistema.</p>
                
                <div class="summary-box">
                    <div class="summary-item">
                        <span class="summary-label">Comprobante:</span>
                        <span class="summary-value">LPG {settlement.number}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Fecha:</span>
                        <span class="summary-value">{settlement.date.strftime('%d/%m/%Y')}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Grano:</span>
                        <span class="summary-value">{settlement.grain_type.name if settlement.grain_type else 'N/A'}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Campaña:</span>
                        <span class="summary-value">{settlement.harvest.name if settlement.harvest else 'N/A'}</span>
                    </div>
                </div>

                <table class="table">
                    <thead>
                        <tr>
                            <th>Descripción</th>
                            <th style="text-align: right;">Cantidad</th>
                            <th style="text-align: right;">Importe</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items_html}
                        <tr class="total-row">
                            <td colspan="2" style="padding: 15px; border-top: 2px solid #e2e8f0; text-align: right;">Líquido a Pagar/Cobrar:</td>
                            <td style="padding: 15px; border-top: 2px solid #e2e8f0; text-align: right;">{fmt_curr(settlement.net_amount, settlement.currency)}</td>
                        </tr>
                    </tbody>
                </table>

                <p style="font-size: 14px; color: #718096;">Puede ver el detalle completo de su cuenta corriente ingresando a nuestra plataforma.</p>
                
                <div style="text-align: center;">
                    <a href="https://quintalagross.ar" class="btn">Ir a la Plataforma</a>
                </div>
            </div>
            <div class="footer">
                <p>&copy; {datetime.now().year} Quintal Agross. Todos los derechos reservados.</p>
                <p>Este es un mensaje automático, por favor no responda a este correo.</p>
            </div>
        </div>
    </body>
    </html>
    """
    return html

def send_settlement_notification(db: Session, settlement_id: str):
    """Busca los datos de la liquidación y envía el correo de notificación."""
    try:
        settlement = db.query(grain_models.GrainSettlement).filter(grain_models.GrainSettlement.id == settlement_id).first()
        if not settlement:
            print(f"Error: Liquidación {settlement_id} no encontrada para notificación.")
            return
            
        entity = db.query(models.Entity).filter(models.Entity.id == settlement.entity_id).first()
        if not entity or not entity.email:
            print(f"Notificación saltada: La entidad {entity.name if entity else 'Unknown'} no tiene email.")
            return

        subject = f"Liquidación de Granos LPG {settlement.number} - Quintal Agross"
        html_body = get_settlement_html_template(settlement, entity)
        
        result = send_email(subject, html_body, to_email=entity.email)
        if result.get("sent"):
            print(f"Notificación enviada con éxito a {entity.email} para LPG {settlement.number}")
        else:
            print(f"Error enviando notificación a {entity.email}: {result.get('reason') or result.get('error')}")
            
    except Exception as e:
        print(f"Excepción en send_settlement_notification: {e}")
