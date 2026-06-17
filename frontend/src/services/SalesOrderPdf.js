import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PDFDocument, rgb, StandardFonts } from 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.esm.js';
import { API_URL } from '../config';

const fetchLogo = async () => {
  try {
    const response = await fetch('/logo.jpg');
    if (response.ok) {
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > 100) {
            const arr = new Uint8Array(buffer);
            if (arr[0] === 0xFF && arr[1] === 0xD8) return buffer;
        }
    }
    
    // Fallback al nombre con el que se subió inicialmente
    const response2 = await fetch('/logo quintal.jpg');
    if (response2.ok) {
        const buffer = await response2.arrayBuffer();
        if (buffer.byteLength > 100) {
            const arr = new Uint8Array(buffer);
            if (arr[0] === 0xFF && arr[1] === 0xD8) return buffer;
        }
    }
    return null;
  } catch (e) {
    return null;
  }
};

/**
 * Genera un PDF estándar ERP SaaS 2026 para una Orden de Venta.
 */
export const generateSalesOrderPdf = async (
  order,
  entities = [],
  products = [],
  options = {},
  saleConditions = []
) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const logoBuffer = await fetchLogo();
  if (logoBuffer) {
      const pos = options.fieldPositions?.logo || { x: 15, y: 10 };
      const imgData = new Uint8Array(logoBuffer);
      // jsPDF accepts Uint8Array or base64. Base64 is safer for older versions.
      const base64 = btoa(String.fromCharCode.apply(null, imgData));
      doc.addImage(`data:image/jpeg;base64,${base64}`, 'JPEG', pos.x, pos.y, 35, 15);
  }

  const entity = entities.find((e) => e.id === order.entity_id) || {};
  const isUSD = order.currency === "USD";
  const exchangeRate = Number(order.exchange_rate || 1);
  const hidePrices = !!options.hidePrices;

  // --- Paleta SaaS 2026 ---
  const colors = {
    primary: [37, 99, 235], // #2563EB
    text: [17, 24, 39], // #111827
    secondary: [107, 114, 128], // #6B7280
    border: [229, 231, 235], // #E5E7EB
    headerBg: [243, 244, 246], // #F3F4F6
    zebra: [250, 250, 251], // #FAFAFB
    cardBg: [250, 250, 251],
  };

  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Helper formateo
  const fmt = (val, curr, isSecondary = false) => {
    const v = Number(val);
    const safeVal = isNaN(v) ? 0 : v;
    if (curr === "USD") {
      return `USD ${safeVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$ ${safeVal.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getSecondary = (val) =>
    isUSD ? val * exchangeRate : val / exchangeRate;
  const secondaryCurr = isUSD ? "ARS" : "USD";

  // --- HEADER ---
  // Izquierda: Empresa / Logo
  let contentStartY = 18;
  if (!logoBuffer) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      doc.text("Quintal Agross S.A.", margin, 18);
      contentStartY = 24;
  } else {
      const logoY = options.fieldPositions?.logo?.y || 10;
      contentStartY = logoY + 20; // 20mm debajo de la posición Y del logo
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(
    colors.secondary[0],
    colors.secondary[1],
    colors.secondary[2],
  );
  doc.text("Planta Industrial: Ruta 8 Km 370 - Venado Tuerto", margin, contentStartY);
  doc.text("CUIT: 30-71649283-4 • IVA Responsable Inscripto", margin, contentStartY + 4);

  // Derecha: Título Comprobante
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
  doc.text("ORDEN DE VENTA", pageWidth - margin, 15, { align: "right" });

  doc.setFontSize(18);
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.text(`${order.number || "00000"}`, pageWidth - margin, 22, {
    align: "right",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(
    colors.secondary[0],
    colors.secondary[1],
    colors.secondary[2],
  );
  const dateStr = order.date
    ? new Date(order.date).toLocaleDateString("es-AR")
    : "-";
  doc.text(`Fecha: ${dateStr}`, pageWidth - margin, 28, { align: "right" });

  // Separador
  const lineY = Math.max(34, contentStartY + 8);
  doc.setDrawColor(colors.border[0], colors.border[1], colors.border[2]);
  doc.setLineWidth(0.3);
  doc.line(margin, lineY, pageWidth - margin, lineY);

  // --- DATOS GENERALES (Grid 2 Col) ---
  const fieldY = lineY + 8;
  const colWidth = (pageWidth - margin * 2) / 2;

  const drawDataField = (label, value, x, y) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(
      colors.secondary[0],
      colors.secondary[1],
      colors.secondary[2],
    );
    doc.text(label.toUpperCase(), x, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
    doc.text(String(value || "-"), x, y + 5);
  };

  // Col 1
  drawDataField("Cliente", entity.name, margin, fieldY);
  drawDataField(
    "CUIT / IVA",
    `${entity.tax_id || "-"} / ${entity.tax_condition || "RI"}`,
    margin,
    fieldY + 12,
  );
  drawDataField(
    "Domicilio",
    `${entity.address || "-"}, ${entity.city || ""}`,
    margin,
    fieldY + 24,
  );
  drawDataField(
    "Observaciones",
    (order.header_notes || order.notes || "-").substring(0, 80),
    margin,
    fieldY + 36,
  );

  // Col 2
  const col2 = margin + colWidth;
  drawDataField("Vendedor", order.vendedor, col2, fieldY);
  drawDataField("Depósito / Sucursal", order.warehouse_name, col2, fieldY + 12);
  const condition = saleConditions?.find(c => String(c.id) === String(order.sale_condition_id))?.name || order.payment_condition || "-";
  drawDataField(
    "Cond. de Pago",
    condition,
    col2,
    fieldY + 24,
  );

  // Cotización / Moneda
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(
    colors.secondary[0],
    colors.secondary[1],
    colors.secondary[2],
  );
  doc.text("COTIZACIÓN / MONEDA", col2, fieldY + 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.text(
    `${order.currency} - TC: ${exchangeRate.toFixed(2)}`,
    col2,
    fieldY + 41,
  );

  // --- TABLA DE ITEMS ---
  const tableHead = [
    [
      "DESCRIPCIÓN",
      "ENVASE",
      "CANT",
      "TOTAL",
      "P. UNIT",
      "P. SEC",
      "IVA",
      "SUBTOTAL",
    ],
  ];

  const tableRows = (order.lines || []).map((l) => {
    const prod = products.find(p => String(p.id) === String(l.product_id)) || {};
    const container = prod.container || {};
    const containerName = container.name || l.container_name || "-";
    const capacity = Number(container.capacity || 1);
    const unitName = container.unit?.short_name || prod.unit_name || l.unit_name || "";
    
    const pPrice = Number(l.unit_price || 0);
    const sPrice = isUSD ? pPrice * exchangeRate : pPrice / exchangeRate;
    const sub = Number(l.total_amount || 0);
    const qty = Number(l.qty || 0);
    const vatRate = Number(l.vat || 0);
    
    const qtyContainers = qty / capacity;

    return [
      l.description || "-",
      containerName,
      qtyContainers.toLocaleString("es-AR", { maximumFractionDigits: 2 }),
      qty.toLocaleString("es-AR", { minimumFractionDigits: 2 }) + " " + unitName,
      {
        content: fmt(pPrice, order.currency),
        styles: { fontStyle: "bold", halign: "right" },
      },
      {
        content: fmt(sPrice, secondaryCurr),
        styles: { textColor: colors.secondary, fontSize: 7, halign: "right" },
      },
      `${(vatRate * 100).toFixed(1)}%`,
      {
        content: fmt(sub, order.currency),
        styles: { fontStyle: "bold", halign: "right" },
      },
    ];
  });

  autoTable(doc, {
    startY: fieldY + 50,
    head: tableHead,
    body: tableRows,
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: colors.border,
      textColor: colors.text,
      valign: "middle",
    },
    headStyles: {
      fillColor: colors.headerBg,
      textColor: colors.secondary,
      fontStyle: "bold",
      lineWidth: 0.1,
      halign: "left",
    },
    alternateRowStyles: {
      fillColor: colors.zebra,
    },
    columnStyles: {
      0: { cellWidth: "auto", halign: "left" }, // DESCRIPCIÓN
      1: { cellWidth: 20, halign: "left" }, // ENVASE
      2: { cellWidth: 12, halign: "right" }, // CANT
      3: { cellWidth: 15, halign: "right" }, // TOTAL
      4: { cellWidth: 25, halign: "right" }, // P. UNIT
      5: { cellWidth: 25, halign: "right" }, // P. SEC
      6: { cellWidth: 12, halign: "right" }, // IVA
      7: { cellWidth: 28, halign: "right" }, // SUBTOTAL
    },
    // Align headers with data for numeric columns (index 2 to 7)
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index >= 2) {
        data.cell.styles.halign = "right";
      }
    },
  });

  // --- TOTALES ---
  const lastY = doc.lastAutoTable.finalY + 10;
  const boxW = 85;
  const boxX = pageWidth - margin - boxW;

  if (!hidePrices) {
    // Caja de totales
    doc.setFillColor(colors.cardBg[0], colors.cardBg[1], colors.cardBg[2]);
    doc.setDrawColor(colors.border[0], colors.border[1], colors.border[2]);
    doc.rect(boxX, lastY, boxW, 50, "FD");

    let ty = lastY + 7;
    const total = Number(order.total_amount || 0);
    const secondaryTotal = getSecondary(total);

    const drawLine = (label, value, y, isBold = false) => {
      doc.setFont("helvetica", isBold ? "bold" : "normal");
      doc.setFontSize(isBold ? 10 : 8.5);
      doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
      doc.text(label, boxX + 5, y);
      doc.text(fmt(value, order.currency), boxX + boxW - 5, y, {
        align: "right",
      });
    };

    drawLine("Subtotal", total / 1.21, ty); // Simplificado 21%
    drawLine("Bonificación", 0, ty + 7);
    drawLine("Neto Gravado", total / 1.21, ty + 14);
    drawLine("IVA 21%", total - total / 1.21, ty + 21);

    doc.setDrawColor(colors.border[0], colors.border[1], colors.border[2]);
    doc.line(boxX + 5, ty + 24, boxX + boxW - 5, ty + 24);

    // Total Final
    doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    drawLine(`TOTAL ${order.currency}`, total, ty + 32, true);

    // Secundario
    doc.setFontSize(8);
    doc.setTextColor(
      colors.secondary[0],
      colors.secondary[1],
      colors.secondary[2],
    );
    doc.text(
      `EQUIV. ${secondaryCurr}: ${fmt(secondaryTotal, secondaryCurr)}`,
      boxX + boxW - 5,
      ty + 38,
      { align: "right" },
    );
  }

  // --- FOOTER ---
  const footY = pageHeight - 15;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(
    colors.secondary[0],
    colors.secondary[1],
    colors.secondary[2],
  );
  doc.text(
    "Quintal Agross - Comprobante no válido como factura fiscal.",
    margin,
    footY,
  );
  doc.text(
    `Página ${doc.internal.getNumberOfPages()}`,
    pageWidth - margin,
    footY,
    { align: "right" },
  );
  doc.line(margin, footY - 4, pageWidth - margin, footY - 4);

  return doc;
};

/**
 * Genera un PDF estándar ERP SaaS 2026 para un Remito (Delivery Note).
 */
export const generateDeliveryNotePdf = async (
  note,
  entities = [],
  products = [],
  options = {},
) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  let logoBuffer = await fetchLogo();
  const entity = entities.find((e) => e.id === note.entity_id) || {};
  const hidePrices = options.hidePrices === true; // Default false (show prices unless hidden)

  const colors = {
    primary: [37, 99, 235],
    text: [17, 24, 39],
    secondary: [107, 114, 128],
    border: [229, 231, 235],
    headerBg: [243, 244, 246],
    zebra: [250, 250, 251],
  };

  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // --- HEADER ---
  if (logoBuffer && logoBuffer.byteLength > 0) {
      try {
          const pos = options.fieldPositions?.logo || { x: 15, y: 10 };
          const imgData = new Uint8Array(logoBuffer);
          let binary = '';
          for (let i = 0; i < imgData.byteLength; i++) {
              binary += String.fromCharCode(imgData[i]);
          }
          const base64 = window.btoa(binary);
          doc.addImage(`data:image/jpeg;base64,${base64}`, 'JPEG', pos.x, pos.y, 35, 15);
      } catch (e) {
          console.warn("Logo rendering failed, using text fallback", e);
          logoBuffer = null; // Force text fallback
      }
  }

  let contentStartY = 18;
  if (!logoBuffer || logoBuffer.byteLength === 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      doc.text("Quintal Agross S.A.", margin, 18);
      contentStartY = 24;
  } else {
      const logoY = options.fieldPositions?.logo?.y || 10;
      contentStartY = logoY + 20; // Ubicar 20mm debajo de la posición del logo
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(
    colors.secondary[0],
    colors.secondary[1],
    colors.secondary[2],
  );
  doc.text("Planta Industrial: Ruta 8 Km 370 - Venado Tuerto", margin, contentStartY);
  doc.text("CUIT: 30-71649283-4 • IVA Responsable Inscripto", margin, contentStartY + 4);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
  doc.text("REMITO R", pageWidth - margin, 15, { align: "right" });

  doc.setFontSize(18);
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.text(`${note.number || "00000"}`, pageWidth - margin, 22, {
    align: "right",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(
    colors.secondary[0],
    colors.secondary[1],
    colors.secondary[2],
  );
  const dateStr = note.date
    ? new Date(note.date).toLocaleDateString("es-AR")
    : "-";
  doc.text(`Fecha: ${dateStr}`, pageWidth - margin, 28, { align: "right" });

  const lineY = Math.max(34, contentStartY + 8);
  doc.setDrawColor(colors.border[0], colors.border[1], colors.border[2]);
  doc.setLineWidth(0.3);
  doc.line(margin, lineY, pageWidth - margin, lineY);

  // --- DATOS ---
  const fieldY = lineY + 8;
  const colWidth = (pageWidth - margin * 2) / 2;
  const drawDataField = (label, value, x, y) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(
      colors.secondary[0],
      colors.secondary[1],
      colors.secondary[2],
    );
    doc.text(label.toUpperCase(), x, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
    doc.text(String(value || "-"), x, y + 5);
  };

  drawDataField("Destinatario (Cliente)", entity.name, margin, fieldY);
  drawDataField(
    "CUIT / IVA",
    `${entity.tax_id || "-"} / ${entity.tax_condition || "RI"}`,
    margin,
    fieldY + 12,
  );
  drawDataField(
    "Domicilio de Entrega",
    `${entity.address || "-"}, ${entity.city || ""}`,
    margin,
    fieldY + 24,
  );

  const col2 = margin + colWidth;
  drawDataField(
    "Depósito de Salida",
    note.warehouse_name || "Central",
    col2,
    fieldY,
  );
  drawDataField(
    "Referencia Origen",
    note.origin_reference || "Directo",
    col2,
    fieldY + 12,
  );
  drawDataField(
    "Transporte",
    note.transport || "Flete Quintal",
    col2,
    fieldY + 24,
  );

  // --- TABLA ---
  const tableHead = [
    hidePrices 
      ? ["DESCRIPCIÓN", "ENVASE", "CANT", "UNID", "OBSERVACIONES"]
      : ["DESCRIPCIÓN", "ENVASE", "CANT", "UNID", "P. UNIT", "TOTAL"]
  ];

  const tableRows = (note.lines || []).map((l) => {
    const product = products.find(p => p.id === l.product_id || p.id === l.item_id) || {};
    const envase = l.container_name || l.container?.name || product.container?.name || product.container_name || product.envase || "-";
    
    const row = [
      l.description || product.name || "-",
      envase,
      Number(l.qty || 0).toLocaleString("es-AR", { minimumFractionDigits: 1 }),
      l.unit_name || l.unit?.short_name || l.unit?.name || product.unit_name || "Unid",
    ];

    if (!hidePrices) {
      row.push(
        Number(l.unit_price || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 }),
        Number(l.total_amount || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })
      );
    } else {
      row.push(l.notes || "-");
    }
    return row;
  });

  autoTable(doc, {
    startY: fieldY + 40,
    head: tableHead,
    body: tableRows,
    theme: "grid",
    styles: {
      fontSize: 8.5,
      cellPadding: 2,
      lineColor: colors.border,
      textColor: colors.text,
    },
    headStyles: {
      fillColor: colors.headerBg,
      textColor: colors.secondary,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: colors.zebra },
    columnStyles: hidePrices ? {
      0: { cellWidth: "auto" },
      2: { cellWidth: 20, halign: "right" },
      3: { cellWidth: 15 },
    } : {
      0: { cellWidth: "auto" },
      2: { cellWidth: 18, halign: "right" },
      3: { cellWidth: 12 },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 25, halign: "right" },
    },
    didDrawPage: (data) => {
        if (!hidePrices && data.cursor) {
            const finalY = data.cursor.y + 10;
            
            // Cálculo robusto de totales
            const lines = note.lines || [];
            const total = note.total_amount || lines.reduce((sum, l) => sum + (Number(l.total_amount) || 0), 0);
            const subtotal = note.subtotal || lines.reduce((sum, l) => sum + (Number(l.qty || 0) * Number(l.unit_price || 0)), 0);
            const iva = note.iva_amount || (total - subtotal);

            if (finalY + 25 < pageHeight - 20) {
                const boxW = 50;
                const boxX = pageWidth - margin - boxW;
                
                doc.setFontSize(9);
                doc.setFont("helvetica", "normal");
                doc.text(`Subtotal:`, boxX, finalY);
                doc.text(`${subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`, pageWidth - margin, finalY, { align: 'right' });
                
                doc.text(`IVA:`, boxX, finalY + 6);
                doc.text(`${iva.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`, pageWidth - margin, finalY + 6, { align: 'right' });
                
                doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                doc.text(`TOTAL:`, boxX, finalY + 14);
                doc.text(`${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`, pageWidth - margin, finalY + 14, { align: 'right' });
            }
        }
    }
  });

  // --- FOOTER ---
  const footY = pageHeight - 15;
  doc.setFontSize(8);
  doc.setTextColor(
    colors.secondary[0],
    colors.secondary[1],
    colors.secondary[2],
  );
  doc.text(
    "Quintal Agross - Transporte: Firma conforme destinatario ________________",
    margin,
    footY - 10,
  );
  doc.text(
    "Documento no válido como factura. Mercadería recibida en conformidad.",
    margin,
    footY,
  );
  doc.text(
    `Página ${doc.internal.getNumberOfPages()}`,
    pageWidth - margin,
    footY,
    { align: "right" },
  );

  return doc;
};

/**
 * Genera un PDF optimizado para formularios pre-impresos (solo datos).
 */
/**
 * Genera un PDF usando el PDF real como base (overlay) o una hoja en blanco.
 * Utiliza posiciones exactas enviadas desde el editor interactivo.
 */
export const generatePrePrintedDeliveryNotePdf = async (
  note,
  entities = [],
  products = [],
  options = {}
) => {
  try {
    const { 
      showBackground = true, 
      fieldPositions = {} 
    } = options;

    const pdfDoc = await PDFDocument.create();
    let firstPage;
    let height;

    if (showBackground) {
        const templateUrl = options.templateUrl || `${API_URL}/templates/QUINTAL%20AGROSS%20Rem%2021x29,7.pdf`;
        const templateBytes = await fetch(templateUrl).then(res => {
            if (!res.ok) throw new Error("No se pudo cargar la plantilla PDF");
            return res.arrayBuffer();
        });
        const externalDoc = await PDFDocument.load(templateBytes);
        const [templatePage] = await pdfDoc.copyPages(externalDoc, [0]);
        firstPage = pdfDoc.addPage(templatePage);
        height = firstPage.getSize().height;
    } else {
        firstPage = pdfDoc.addPage([595.28, 841.89]);
        height = 841.89;
    }

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const mmToPt = (mm) => mm * 2.83465;
    const drawText = (text, pos, size = 10, isBold = false) => {
        const stringContent = (text === undefined || text === null || text === "") ? "" : String(text);
        if (!pos || stringContent === "") return;
        
        firstPage.drawText(stringContent, {
            x: mmToPt(pos.x),
            y: height - mmToPt(pos.y) - size, // Ajuste para que y sea el TOP
            size,
            font: isBold ? fontBold : font,
            color: rgb(0, 0, 0),
        });
    };

    // --- EN EL PRE-IMPRESO NO DIBUJAMOS EL LOGO ---
    // (La hoja pre-impresa ya lo tiene de fondo)

    const logoBuffer = await fetchLogo();
    if (logoBuffer && fieldPositions.logo) {
        try {
            const img = await pdfDoc.embedJpg(logoBuffer);
            firstPage.drawImage(img, {
                x: mmToPt(fieldPositions.logo.x),
                y: height - mmToPt(fieldPositions.logo.y) - mmToPt(15), // 15mm height
                width: mmToPt(35), // 35mm width
                height: mmToPt(15),
            });
        } catch (e) { console.error("Error drawing logo:", e); }
    }

    const entity = entities.find((e) => e.id === note.entity_id) || {};
    const dateStr = note.date ? new Date(note.date).toLocaleDateString("es-AR") : "-";

    // --- POSICIONAMIENTO DINÁMICO ---
    if (!options.hideData) {
        drawText(note.number || "-", fieldPositions.noteNumber, fieldPositions.noteNumber?.size || 11, true);
        drawText(note.date ? new Date(note.date).toLocaleDateString("es-AR") : "-", fieldPositions.date, fieldPositions.date?.size || 10); 
        
        drawText(entity.name || "-", fieldPositions.clientName, fieldPositions.clientName?.size || 10, true);
        const addressStr = entity.address ? `${entity.address || ""}${entity.city ? `, ${entity.city}` : ""}` : "-";
        drawText(addressStr, fieldPositions.clientAddress, fieldPositions.clientAddress?.size || 9);
        drawText(entity.tax_condition || "-", fieldPositions.clientIva, fieldPositions.clientIva?.size || 10);
        drawText(entity.tax_id || "-", fieldPositions.clientCuit, fieldPositions.clientCuit?.size || 10);
        
        drawText(note.payment_condition || "-", fieldPositions.paymentCondition, fieldPositions.paymentCondition?.size || 9);
        const rawDueDate = note.due_date || note.expiration_date || note.vto || null;
        let dueDateStr = "-";
        if (rawDueDate) {
            const d = new Date(rawDueDate);
            if (!isNaN(d.getTime())) dueDateStr = d.toLocaleDateString("es-AR");
        }
        drawText(dueDateStr, fieldPositions.dueDate, fieldPositions.dueDate?.size || 9);

        drawText(note.transport || note.vehicle_id || "-", fieldPositions.transport, fieldPositions.transport?.size || 9);
        drawText(note.transport_cuit || note.vehicle_driver || "-", fieldPositions.transportCuit, fieldPositions.transportCuit?.size || 9);

        drawText(note.notes || note.observations || "-", fieldPositions.observations, fieldPositions.observations?.size || 9);
        drawText(note.vehicle_driver || "-", fieldPositions.driverName, fieldPositions.driverName?.size || 9);
        drawText(note.vehicle_id || "-", fieldPositions.vehiclePlate, fieldPositions.vehiclePlate?.size || 9);
        drawText(note.vendedor || "-", fieldPositions.vendedor, fieldPositions.vendedor?.size || 9);
        drawText(note.origin_reference || "-", fieldPositions.origin_reference, fieldPositions.origin_reference?.size || 9);

        // --- TABLA DE ITEMS ---
        if (fieldPositions.table) {
            const tX = fieldPositions.table.x;
            const tY = fieldPositions.table.y;
            const lineStep = 6.45; // Interlineado estándar para pre-impresos
            let currentY = tY;
            
            for (const l of (note.lines || [])) {
                const qtyStr = Number(l.qty || 0).toLocaleString("es-AR", { minimumFractionDigits: 1 });
                const pUnitStr = (l.unit_price !== undefined && l.unit_price !== null) ? Number(l.unit_price).toLocaleString("es-AR", { minimumFractionDigits: 2 }) : "0,00";
                const totalStr = (l.total_amount !== undefined && l.total_amount !== null) ? Number(l.total_amount).toLocaleString("es-AR", { minimumFractionDigits: 2 }) : "0,00";

                // Usamos tX como el punto exacto de la primera columna (CANT)
                const tSize = fieldPositions.table.size || 9;
                drawText(qtyStr, { x: tX, y: currentY }, tSize); 
                drawText(l.description, { x: tX + 16, y: currentY }, tSize); 
                drawText(l.unit_price ? pUnitStr : "", { x: tX + 145, y: currentY }, tSize); // Re-alineado (145)
                drawText(totalStr, { x: tX + 178, y: currentY }, tSize); // Re-alineado (178)
                
                currentY += lineStep;
                if (currentY > 260) break; 
            }
        }

        // --- CÁLCULO DE TOTALES ---
        let computedTotal = note.total_amount || 0;
        if (computedTotal === 0 && note.lines && note.lines.length > 0) {
            computedTotal = note.lines.reduce((sum, l) => sum + (l.total_amount || 0), 0);
        }

        const netSubtotal = note.subtotal || note.lines?.reduce((sum, l) => sum + ((l.qty * l.unit_price) || 0), 0) || 0;
        const totalIva = note.iva_amount || note.lines?.reduce((sum, l) => sum + (l.tax_amount || 0), 0) || (computedTotal - netSubtotal);
        const tcValue = note.currency_rate || note.exchange_rate || 1;

        // --- RESUMEN AGRUPADO ---
        if (fieldPositions.totalsSummary) {
            const sX = fieldPositions.totalsSummary.x;
            const sY = fieldPositions.totalsSummary.y;
            const sSize = fieldPositions.totalsSummary.size || 9;
            
            drawText(`Neto: ${Number(netSubtotal).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`, { x: sX, y: sY }, sSize);
            drawText(`IVA: ${Number(totalIva).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`, { x: sX, y: sY + 4.5 }, sSize);
            if (tcValue > 1) {
                drawText(`TC: ${Number(tcValue).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`, { x: sX, y: sY + 9 }, sSize);
            }
        }

        // --- TOTAL ---
        if (fieldPositions.total) {
            const totalFinal = Number(computedTotal).toLocaleString("es-AR", { minimumFractionDigits: 2 });
            drawText(totalFinal, fieldPositions.total, fieldPositions.total.size || 12, true);
        }

        // --- SUBTOTAL INDIRECTO ---
        if (fieldPositions.subtotal) {
            drawText(Number(netSubtotal).toLocaleString("es-AR", { minimumFractionDigits: 2 }), fieldPositions.subtotal, fieldPositions.subtotal.size || 9);
        }
        if (fieldPositions.iva_amount) {
            drawText(Number(totalIva).toLocaleString("es-AR", { minimumFractionDigits: 2 }), fieldPositions.iva_amount, fieldPositions.iva_amount.size || 9);
        }
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  } catch (error) {
    console.error("Error in generatePrePrintedDeliveryNotePdf:", error);
    return new Blob(["Error al generar PDF"], { type: 'text/plain' });
  }
};

export const generateDeliveryNotePdfBlob = async (n, e, p, o) => {
  if (o?.template === 'pre-printed') {
    return await generatePrePrintedDeliveryNotePdf(n, e, p, o);
  }
  const doc = await generateDeliveryNotePdf(n, e, p, o);
  return doc.output("blob");
};

export const generateSalesOrderPdfBlob = async (
  order,
  entities,
  products,
  options = {},
  saleConditions = []
) => {
  const doc = await generateSalesOrderPdf(order, entities, products, options, saleConditions);
  return doc.output("blob");
};

export const downloadSalesOrderPdf = (
  order,
  entities,
  products,
  options = {},
) => {
  const doc = generateSalesOrderPdf(order, entities, products, options);
  doc.save(`OrdenVenta_${order.number}.pdf`);
};

export const previewSalesOrderPdf = (
  order,
  entities,
  products,
  options = {},
) => {
  const doc = generateSalesOrderPdf(order, entities, products, options);
  const blob = doc.output("blob");
  window.open(URL.createObjectURL(blob), "_blank");
};

export const printSalesOrderPdf = (order, entities, products, options = {}) => {
  const doc = generateSalesOrderPdf(order, entities, products, options);
  doc.autoPrint();
  window.open(doc.output("bloburl"), "_blank");
};
