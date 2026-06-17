from io import BytesIO
from datetime import datetime
from typing import List
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT
from app.db.models.finance_models import Cheque

import os
from io import BytesIO
from datetime import datetime
from typing import List, Optional
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, Frame, PageTemplate
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT
from app.db.models.finance_models import Cheque

# Configuración de Rutas
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOGO_PATH = os.path.join(BASE_DIR, "app", "assets", "logo.jpg")

def get_company_info(db=None):
    """Obtiene información de la empresa desde LedgerSettings o valores por defecto."""
    defaults = {
        "name": "QUINTAL AGROSS S.A.",
        "address": "Av. Libertador 1234, CABA",
        "tax_id": "30-71645012-3",
        "tax_category": "IVA Responsable Inscripto",
        "iibb": "30-71645012-3",
        "activity_start": "01/01/2021"
    }
    
    if not db:
        return defaults
        
    try:
        from app.db.models.models import LedgerSetting
        settings = db.query(LedgerSetting).filter(LedgerSetting.key.like("COMPANY_%")).all()
        for s in settings:
            key = s.key.replace("COMPANY_", "").lower()
            if key in defaults:
                defaults[key] = s.value
    except Exception:
        pass
        
    return defaults

def export_document_to_pdf(doc, db=None) -> BytesIO:
    output = BytesIO()
    
    # Configuración del documento
    doc_pdf = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=1.5*cm,
        leftMargin=1.5*cm,
        topMargin=1.5*cm,
        bottomMargin=1.5*cm
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Colores de Marca
    PRIMARY_BLUE = colors.HexColor('#1E3A8A')    # Slate-900 / Navy
    ACCENT_BLUE = colors.HexColor('#2563EB')     # Blue-600
    LIGHT_BG = colors.HexColor('#F8FAFC')        # Slate-50
    BORDER_COLOR = colors.HexColor('#E2E8F0')    # Slate-200
    TEXT_MUTED = colors.HexColor('#64748B')      # Slate-500

    # Estilos Custom
    label_style = ParagraphStyle('Label', parent=styles['Normal'], fontSize=7, textColor=TEXT_MUTED, leading=8, textTransform='uppercase', fontName='Helvetica-Bold')
    value_style = ParagraphStyle('Value', parent=styles['Normal'], fontSize=9, textColor=colors.black, leading=11, fontName='Helvetica')
    header_right_style = ParagraphStyle('HeaderRight', parent=styles['Normal'], alignment=TA_RIGHT, fontSize=10, leading=14)
    section_title = ParagraphStyle('Section', parent=styles['Heading3'], fontSize=10, textColor=PRIMARY_BLUE, spaceBefore=10, spaceAfter=5, fontName='Helvetica-Bold')
    total_label_style = ParagraphStyle('TotalLabel', parent=styles['Normal'], fontSize=11, textColor=TEXT_MUTED, alignment=TA_RIGHT)
    total_val_style = ParagraphStyle('TotalVal', parent=styles['Normal'], fontSize=12, textColor=colors.black, alignment=TA_RIGHT, fontName='Helvetica-Bold')

    # Identificación del Tipo de Documento
    doc_label = "DOCUMENTO"
    doc_letter = "X" 
    is_remito = False
    is_lpg = False
    
    class_name = doc.__class__.__name__
    d_type = str(getattr(doc, 'doc_type', ''))
    
    if "LPG" in d_type or "LSG" in d_type:
        is_lpg = True
        doc_label = "LIQUIDACIÓN DE GRANOS"
        doc_letter = "C"
    elif "INVOICE" in d_type or "NC" in d_type or "ND" in d_type:
        doc_label = "FACTURA" if "INVOICE" in d_type else "NOTA DE CRÉDITO" if "NC" in d_type else "NOTA DE DÉBITO"
        doc_letter = "A"
    elif d_type == "RECEIPT":
        doc_label = "RECIBO"
        doc_letter = "R"
    elif class_name == 'SalesOrder':
        doc_label = "ORDEN DE VENTA"
    elif class_name == 'PurchaseOrder':
        doc_label = "ORDEN DE COMPRA"
    elif class_name == 'DeliveryNote':
        doc_label = "REMITO"
        doc_letter = "R"
        is_remito = True

    # 1. HEADER
    logo_img = None
    if os.path.exists(LOGO_PATH):
        try:
            logo_img = Image(LOGO_PATH, width=3.5*cm, height=2.2*cm)
        except: pass

    header_data = [
        [
            logo_img if logo_img else Paragraph("<b>QUINTAL AGROSS</b>", styles['Heading2']),
            [
                Paragraph(f"<font size=20><b>{doc_letter}</b></font>", ParagraphStyle('Letter', alignment=TA_CENTER, borderPadding=2)),
                Paragraph("<font size=7>COD. 01</font>", ParagraphStyle('Cod', alignment=TA_CENTER))
            ],
            [
                Paragraph(f"<font size=14 color='#1E3A8A'><b>{doc_label}</b></font>", header_right_style),
                Paragraph(f"<b>N° {doc.number}</b>", header_right_style),
                Paragraph(f"Fecha: {doc.date.strftime('%d/%m/%Y')}", header_right_style),
            ]
        ]
    ]
    
    header_table = Table(header_data, colWidths=[8*cm, 2*cm, 8*cm])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (1,0), (1,0), 'CENTER'),
        ('BOX', (1,0), (1,0), 1, PRIMARY_BLUE),
    ]))
    elements.append(header_table)

    company = get_company_info(db)
    empresa_info = [
        [Paragraph(f"<font size=8><b>{company['name']}</b><br/>{company['address']}<br/>{company['tax_category']}</font>", styles['Normal']),
         Paragraph(f"<font size=8><b>CUIT: {company['tax_id']}</b><br/>Ing. Brutos: {company['iibb']}<br/>Inicio Actividades: {company['activity_start']}</font>", header_right_style)]
    ]
    elements.append(Table(empresa_info, colWidths=[9*cm, 9*cm]))
    elements.append(Spacer(1, 0.4*cm))
    elements.append(Table([[""]], colWidths=[18*cm], rowHeights=[1], style=[('LINEBELOW', (0,0), (-1,-1), 0.5, BORDER_COLOR)]))
    elements.append(Spacer(1, 0.4*cm))
    
    # 2. ENTITY INFO
    entity = getattr(doc, 'entity', None)
    entity_name = entity.name if entity else "S/D"
    tax_id = entity.tax_id if entity else "S/D"
    address = (entity.address or "S/D") if entity else "S/D"
    tax_cond = getattr(entity, 'tax_category', 'IVA Responsable Inscripto') or 'IVA Responsable Inscripto'

    currency = getattr(doc, 'currency', 'ARS')
    xr = float(getattr(doc, 'exchange_rate', 1.0) or 1.0)

    entity_data = [
        [Paragraph("SEÑOR(ES)", label_style), Paragraph("CUIT / IDENTIFICACIÓN", label_style), Paragraph("COND. IVA", label_style)],
        [Paragraph(entity_name, value_style), Paragraph(tax_id, value_style), Paragraph(tax_cond, value_style)],
        [Paragraph("DOMICILIO", label_style), Paragraph("MONEDA / TC", label_style), Paragraph("LOCALIDAD", label_style)],
        [Paragraph(address, value_style), Paragraph(f"{currency} (TC: {xr:,.2f})", value_style), Paragraph(getattr(entity, 'city', 'S/D') or 'S/D', value_style)]
    ]
    entity_table = Table(entity_data, colWidths=[9*cm, 4.5*cm, 4.5*cm])
    entity_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), LIGHT_BG),
        ('BOX', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    elements.append(entity_table)
    elements.append(Spacer(1, 0.5*cm))

    # 3. LPG SPECIFICS
    gs = getattr(doc, 'grain_settlement', None)
    if is_lpg and gs:
        elements.append(Paragraph("DETALLE DE LA OPERACIÓN DE GRANOS", section_title))
        grain_header = [
            [Paragraph("COE", label_style), Paragraph("GRANO", label_style), Paragraph("CAMPAÑA", label_style), Paragraph("CORREDOR", label_style)],
            [Paragraph(gs.coe_number or "-", value_style), Paragraph(gs.grain_type.name if gs.grain_type else "-", value_style), 
             Paragraph(gs.harvest.name if gs.harvest else "-", value_style), Paragraph(gs.broker.name if gs.broker else "SIN CORREDOR", value_style)],
            [Paragraph("KILOS TOTALES", label_style), Paragraph("PRECIO PACTADO", label_style), Paragraph("ESTADO SISA", label_style), Paragraph("CONTRATO N°", label_style)],
            [Paragraph(f"{float(gs.total_kilos or 0):,.0f} kg", value_style), Paragraph(f"{float(gs.price_pacted or 0):,.2f}", value_style),
             Paragraph(gs.sisa_status or "-", value_style), Paragraph(gs.contract_number or "-", value_style)]
        ]
        gs_table = Table(grain_header, colWidths=[4.5*cm, 4.5*cm, 4.5*cm, 4.5*cm])
        gs_table.setStyle(TableStyle([
            ('BOX', (0,0), (-1,-1), 0.5, BORDER_COLOR),
            ('BACKGROUND', (0,0), (-1,-1), colors.white),
            ('LEFTPADDING', (0,0), (-1,-1), 10),
            ('TOPPADDING', (0,0), (-1,0), 4),
            ('TOPPADDING', (0,2), (-1,2), 4),
        ]))
        elements.append(gs_table)
        elements.append(Spacer(1, 0.5*cm))

        # Linked Movements (Carta de Porte / Tickets)
        if gs.movements:
            elements.append(Paragraph("MOVIMIENTOS VINCULADOS (CARTAS DE PORTE / TICKETS)", section_title))
            move_data = [["Fecha", "CPE / Ticket", "Kilos Netos", "Campaña"]]
            for m in gs.movements:
                move_data.append([
                    m.date.strftime("%d/%m/%Y"), m.cpe_number or m.ticket_number or "-", 
                    f"{float(m.clean_kilos or 0):,.0f} kg", m.harvest.name if m.harvest else "-"
                ])
            move_table = Table(move_data, colWidths=[4*cm, 6*cm, 4*cm, 4*cm])
            move_table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), BORDER_COLOR),
                ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
                ('FONTSIZE', (0,0), (-1,0), 8),
                ('ALIGN', (2,1), (2,-1), 'RIGHT'),
            ]))
            elements.append(move_table)
            elements.append(Spacer(1, 0.5*cm))

    # 4. LINE ITEMS (Standard or Grain Items)
    lines = []
    if is_lpg and gs and gs.items:
        lines = gs.items
    elif hasattr(doc, 'lines'):
        lines = doc.lines

    if lines:
        elements.append(Paragraph("DETALLE DE ITEMS / CONCEPTOS", section_title))
        line_data = [["Detalle / Actividad", "Cantidad", "U.M.", "P.Unit", "IVA", "Total"]]
        
        for l in lines:
            desc = getattr(l, 'description', '-')
            if is_lpg:
                activity = getattr(l, 'activity', '')
                if activity: desc = f"[{activity}] {desc}"
            
            qty = float(getattr(l, 'quantity', getattr(l, 'qty', 1.0)) or 1.0)
            u_price = float(getattr(l, 'unit_price', 0.0) or 0.0)
            v_rate = float(getattr(l, 'vat_rate', 0.0) or 0.0)
            if v_rate > 1: v_rate = v_rate / 100
            
            sub = float(getattr(l, 'total_amount', 0.0) or 0.0)
            
            line_data.append([
                Paragraph(desc, value_style),
                f"{qty:,.2f}",
                "TN" if is_lpg else "un",
                f"{u_price:,.2f}",
                f"{v_rate*100:g}%",
                f"{sub:,.2f}"
            ])
        
        line_table = Table(line_data, colWidths=[9*cm, 2*cm, 1.5*cm, 2.3*cm, 1.2*cm, 2*cm])
        line_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), PRIMARY_BLUE),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('ALIGN', (0,0), (-1,0), 'CENTER'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,0), 8),
            ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
            ('ALIGN', (1,1), (-1,-1), 'RIGHT'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        elements.append(line_table)

    # 5. LPG TAXES (Perceptions/Retentions/Expenses)
    if is_lpg and gs and gs.taxes:
        elements.append(Spacer(1, 0.5*cm))
        elements.append(Paragraph("IMPUESTOS, RETENCIONES Y GASTOS", section_title))
        tax_data = [["Tipo", "Categoría / Concepto", "Jurisdicción", "Base", "Aliq.", "Importe"]]
        for t in gs.taxes:
            tax_data.append([
                t.tax_type, t.category or "-", t.jurisdiction or "-",
                f"{float(t.base_amount or 0):,.2f}", f"{float(t.rate or 0):g}%", f"{float(t.amount or 0):,.2f}"
            ])
        tax_table = Table(tax_data, colWidths=[3*cm, 6*cm, 3*cm, 2*cm, 1.5*cm, 2.5*cm])
        tax_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#64748B')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
            ('ALIGN', (3,1), (-1,-1), 'RIGHT'),
            ('FONTSIZE', (0,0), (-1,0), 8)
        ]))
        elements.append(tax_table)

    # 6. APPLICATIONS & PAYMENTS
    if hasattr(doc, 'applied_to') and doc.applied_to:
        elements.append(Spacer(1, 0.5*cm))
        elements.append(Paragraph("COMPROBANTES CANCELADOS / APLICACIONES", section_title))
        app_data = [["Comprobante", "Fecha", "Monto Orig.", "Monto Aplicado"]]
        for app in doc.applied_to:
            app_data.append([
                app.to_document.number if app.to_document else "-",
                app.to_document.date.strftime("%d/%m/%Y") if app.to_document else "-",
                f"{app.to_document.total_amount:,.2f}" if app.to_document else "-",
                f"{app.amount_applied:,.2f}"
            ])
        app_table = Table(app_data, colWidths=[6*cm, 4*cm, 4*cm, 4*cm])
        app_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), PRIMARY_BLUE), ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR), ('ALIGN', (2,1), (-1,-1), 'RIGHT'), ('FONTSIZE', (0,0), (-1,0), 8)
        ]))
        elements.append(app_table)
    
    if hasattr(doc, 'payments') and doc.payments:
        elements.append(Spacer(1, 0.5*cm))
        elements.append(Paragraph("VALORES RECIBIDOS / ENTREGADOS", section_title))
        pay_data = [["Medio", "Banco / Detalle", "Referencia", "Vencimiento", "Importe"]]
        for pay in doc.payments:
            pay_data.append([
                pay.type, pay.bank_name or pay.description or "-", pay.reference_number or "-",
                pay.due_date.strftime("%d/%m/%Y") if pay.due_date else "-", f"{pay.amount:,.2f}"
            ])
        pay_table = Table(pay_data, colWidths=[3*cm, 5.5*cm, 3.5*cm, 3*cm, 3*cm])
        pay_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E293B')), ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR), ('ALIGN', (4,1), (-1,-1), 'RIGHT'), ('FONTSIZE', (0,0), (-1,0), 8)
        ]))
        elements.append(pay_table)

    # 7. TOTALS
    elements.append(Spacer(1, 1*cm))
    t_amount = float(getattr(doc, 'total_amount', 0.0) or 0.0)
    
    totals_data = []
    if is_lpg and gs:
        totals_data.append([Paragraph("Subtotal Gravado:", total_label_style), Paragraph(f"{float(gs.gross_amount or 0):,.2f}", total_val_style)])
        totals_data.append([Paragraph("IVA Liquidado:", total_label_style), Paragraph(f"{float(gs.vat_amount or 0):,.2f}", total_val_style)])
        if float(gs.perceptions_amount or 0) > 0:
            totals_data.append([Paragraph("Percepciones:", total_label_style), Paragraph(f"{float(gs.perceptions_amount):,.2f}", total_val_style)])
        if float(gs.retentions_amount or 0) > 0:
            totals_data.append([Paragraph("Retenciones / Deducciones:", total_label_style), Paragraph(f"- {float(gs.retentions_amount):,.2f}", total_val_style)])
        if float(gs.expenses_amount or 0) > 0:
            totals_data.append([Paragraph("Gastos y Comisiones:", total_label_style), Paragraph(f"- {float(gs.expenses_amount):,.2f}", total_val_style)])
    elif not is_remito:
        # Calculate subtotal (net + vat)
        total_net = sum(float(l.net_amount or 0) for l in getattr(doc, 'lines', []))
        total_vat = sum(float(l.vat_amount or 0) for l in getattr(doc, 'lines', []))
        total_perceptions = sum(float(p.amount or 0) for p in getattr(doc, 'perceptions', []))
        
        totals_data.append([Paragraph("Subtotal Gravado:", total_label_style), Paragraph(f"{total_net:,.2f}", total_val_style)])
        totals_data.append([Paragraph("IVA:", total_label_style), Paragraph(f"{total_vat:,.2f}", total_val_style)])
        if total_perceptions > 0:
            totals_data.append([Paragraph("Percepciones IIBB:", total_label_style), Paragraph(f"{total_perceptions:,.2f}", total_val_style)])
    
    totals_data.append([Paragraph("TOTAL:", total_label_style), Paragraph(f"<font color='#1E3A8A'>{currency} {t_amount:,.2f}</font>", total_val_style)])
    
    t_table = Table(totals_data, colWidths=[14*cm, 4*cm])
    t_table.setStyle(TableStyle([('ALIGN', (0,0), (-1,-1), 'RIGHT'), ('VALIGN', (0,0), (-1,-1), 'MIDDLE')]))
    elements.append(t_table)
    
    # 8. LOGISTICA
    if is_remito:
        elements.append(Spacer(1, 1*cm))
        elements.append(Paragraph("INFORMACIÓN DE LOGÍSTICA Y TRANSPORTE", section_title))
        trans_data = [
            [Paragraph("CHOFER", label_style), Paragraph("VEHÍCULO / PATENTE", label_style)],
            [Paragraph(getattr(doc, 'vehicle_driver', '-') or '-', value_style), 
             Paragraph(getattr(doc, 'vehicle_id', '-') or '-', value_style)] # Ideally patent from vehicle relation
        ]
        elements.append(Table(trans_data, colWidths=[9*cm, 9*cm], style=[('BOX', (0,0), (-1,-1), 0.5, BORDER_COLOR), ('BACKGROUND', (0,0), (-1,-1), LIGHT_BG), ('LEFTPADDING', (0,0), (-1,-1), 10)]))

    if doc.notes:
        elements.append(Spacer(1, 1*cm))
        elements.append(Paragraph(f"<b>NOTAS / OBSERVACIONES:</b><br/>{doc.notes}", styles['Normal']))

    # Footer
    elements.append(Spacer(1, 2*cm))
    elements.append(Paragraph("<font size=7 color='#999' align='center'>Este comprobante es una representación gráfica de la operación registrada en Quintal Agross ERP. Sujeto a validación AFIP/ARCA.</font>", styles['Normal']))

    doc_pdf.build(elements)
    output.seek(0)
    return output

def export_delivery_note_preprinted_pdf(dn, db=None) -> BytesIO:
    """
    Genera un PDF transparente con los datos de un remito ubicados en posiciones exactas
    (coordenadas) para poder superponer/imprimir sobre un formulario preimpreso.
    """
    from reportlab.pdfgen import canvas
    
    output = BytesIO()
    c = canvas.Canvas(output, pagesize=A4)
    
    # -------------------------------------------------------------
    # AJUSTE DE COORDENADAS (Medidas aproximadas en milímetros)
    # 1 cm = 10 mm
    # -------------------------------------------------------------
    
    # Datos de Cabecera Derecha
    c.setFont("Helvetica-Bold", 10)
    # Fecha: Se asume preimpreso tiene el espacio Día Mes Año
    if dn.date:
        d = dn.date.strftime("%d")
        m = dn.date.strftime("%m")
        y = dn.date.strftime("%Y")
        c.drawString(150*mm, 260*mm, d)
        c.drawString(165*mm, 260*mm, m)
        c.drawString(180*mm, 260*mm, y)
        
    # Entidad (Cliente/Proveedor)
    c.setFont("Helvetica-Bold", 11)
    entity_name = dn.entity.name if dn.entity else ""
    c.drawString(45*mm, 235*mm, entity_name)
    
    # Domicilio
    c.setFont("Helvetica", 10)
    address = dn.entity.address if dn.entity and dn.entity.address else ""
    c.drawString(45*mm, 227*mm, address)
    
    # Localidad / Provincia (agrupados si no hay provincia separada)
    city = dn.entity.city if dn.entity and getattr(dn.entity, 'city', None) else ""
    c.drawString(45*mm, 219*mm, city)
    
    # CUIT
    tax_id = dn.entity.tax_id if dn.entity else ""
    c.drawString(145*mm, 227*mm, tax_id)
    
    # Condición de IVA
    tax_cond = getattr(dn.entity, 'tax_category', '') if dn.entity else ''
    c.drawString(145*mm, 219*mm, tax_cond)

    # -------------------------------------------------------------
    # LINEAS DE PRODUCTOS
    # -------------------------------------------------------------
    start_y_lines = 190 * mm
    line_step = 6.5 * mm
    c.setFont("Helvetica", 9)
    
    for i, line in enumerate(dn.lines):
        y_pos = start_y_lines - (i * line_step)
        if y_pos < 50 * mm:  # Límite de la hoja antes del pie
            break
            
        qty = float(line.qty or 0)
        desc = line.description or ""
        
        c.drawString(20*mm, y_pos, f"{qty:,.2f}")
        c.drawString(45*mm, y_pos, desc[:60]) # Truncar la descripción para no pisar bordes
        
    # -------------------------------------------------------------
    # TRANSPORTE (Pie de Página)
    # -------------------------------------------------------------
    driver = dn.vehicle_driver or ""
    vehicle_id = dn.vehicle_id or ""
    
    c.setFont("Helvetica", 10)
    c.drawString(45*mm, 45*mm, driver)
    c.drawString(145*mm, 45*mm, vehicle_id)
    
    c.showPage()
    c.save()
    output.seek(0)
    return output

def export_cheques_to_pdf(cheques: List[Cheque]) -> BytesIO:
    output = BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=landscape(A4),
        rightMargin=1*cm,
        leftMargin=1*cm,
        topMargin=1.5*cm,
        bottomMargin=1.5*cm
    )
    
    elements = []
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.HexColor('#2563EB'),
        spaceAfter=12,
        alignment=TA_CENTER
    )
    title = Paragraph("Reporte de Cheques", title_style)
    elements.append(title)
    
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#64748B'),
        spaceAfter=20,
        alignment=TA_CENTER
    )
    subtitle = Paragraph(
        f"Generado el {datetime.now().strftime('%d/%m/%Y %H:%M')} · Total: {len(cheques)} cheques",
        subtitle_style
    )
    elements.append(subtitle)
    elements.append(Spacer(1, 0.5*cm))
    
    data = [
        ["Banco", "Nro", "CUIT", "Cliente", "Importe", "F. Pago", "Venc.", "Estado", "Rech.", "ND"]
    ]
    for cheque in cheques:
        row = [
            cheque.banco[:20] if cheque.banco else "",
            cheque.nro_cheque,
            cheque.cuit_emisor,
            (cheque.cliente_dador[:18] if cheque.cliente_dador else "-"),
            f"${float(cheque.importe):,.2f}" if cheque.importe else "-",
            cheque.f_pago.strftime("%d/%m/%Y") if cheque.f_pago else "-",
            cheque.f_vencimiento.strftime("%d/%m/%Y") if cheque.f_vencimiento else "-",
            cheque.estado[:10],
            "Sí" if cheque.rechazado else "No",
            "Sí" if cheque.nd_realizada else "No"
        ]
        data.append(row)
    
    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2563EB')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#1E293B')),
        ('ALIGN', (0, 1), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('TOPPADDING', (0, 1), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
        ('ALIGN', (4, 1), (4, -1), 'RIGHT'),
    ]))
    
    elements.append(table)
    doc.build(elements)
    output.seek(0)
    
    return output
