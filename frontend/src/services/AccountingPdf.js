import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Genera un PDF del Libro Diario o Cuenta Corriente.
 */
export const generateLedgerPdf = (
  data,
  title = "LIBRO DIARIO GLOBAL",
  subtitle = "",
) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const colors = {
    primary: [37, 99, 235], // #2563EB
    text: [17, 24, 39], // #111827
    secondary: [107, 114, 128], // #6B7280
    border: [229, 231, 235], // #E5E7EB
    headerBg: [243, 244, 246], // #F3F4F6
    zebra: [250, 250, 251], // #FAFAFB
  };

  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // --- HEADER ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.text("Quintal Agross S.A.", margin, 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
  doc.text(title.toUpperCase(), pageWidth - margin, 18, { align: "right" });

  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(
      colors.secondary[0],
      colors.secondary[1],
      colors.secondary[2],
    );
    doc.text(subtitle, pageWidth - margin, 24, { align: "right" });
  }

  const dateStr = new Date().toLocaleDateString("es-AR");
  doc.setFontSize(8);
  doc.text(`Generado el: ${dateStr}`, margin, 24);

  doc.setDrawColor(colors.border[0], colors.border[1], colors.border[2]);
  doc.line(margin, 28, pageWidth - margin, 28);

  // --- TABLE ---
  const tableHead = [
    ["FECHA", "TIPO", "NÚMERO", "ENTIDAD", "MONEDA", "MONTO", "ARS EQUIV"],
  ];

  const tableRows = data.map((d) => [
    new Date(d.date).toLocaleDateString("es-AR"),
    d.doc_type.replace("_", " "),
    d.number || "-",
    d.entity_name || "-",
    d.currency,
    d.total_amount.toLocaleString("es-AR", { minimumFractionDigits: 2 }),
    d.total_amount_ars.toLocaleString("es-AR", { minimumFractionDigits: 2 }),
  ]);

  autoTable(doc, {
    startY: 35,
    head: tableHead,
    body: tableRows,
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: colors.border,
      textColor: colors.text,
    },
    headStyles: {
      fillColor: colors.headerBg,
      textColor: colors.secondary,
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: colors.zebra,
    },
    columnStyles: {
      5: { halign: "right" },
      6: { halign: "right" },
    },
  });

  // --- FOOTER ---
  const footY = pageHeight - 10;
  doc.setFontSize(8);
  doc.setTextColor(
    colors.secondary[0],
    colors.secondary[1],
    colors.secondary[2],
  );
  doc.text(
    "Documento interno de gestión contable - Quintal Agross",
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

export const downloadLedgerPdf = (data, title, subtitle) => {
  const doc = generateLedgerPdf(data, title, subtitle);
  const name = title.replace(/\s+/g, "_");
  doc.save(`${name}_${new Date().getTime()}.pdf`);
};
export const generateDocumentPdf = (docData, entityData = {}) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });
  const colors = {
    primary: [37, 99, 235],
    text: [17, 24, 39],
    secondary: [107, 114, 128],
    border: [229, 231, 235],
    headerBg: [243, 244, 246],
  };
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.text("Quintal Agross S.A.", margin, 18);

  doc.setFontSize(12);
  doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
  doc.text(
    docData.doc_type.toUpperCase().replace("_", " "),
    pageWidth - margin,
    18,
    {
      align: "right",
    },
  );
  doc.setFontSize(14);
  doc.text(`N° ${docData.number}`, pageWidth - margin, 25, { align: "right" });

  // Entity Data
  doc.setFontSize(10);
  doc.text("DESTINATARIO", margin, 40);
  doc.setFont("helvetica", "normal");
  doc.text(entityData.name || docData.entity_name || "S/D", margin, 45);
  doc.text(`CUIT: ${entityData.tax_id || "-"}`, margin, 50);
  doc.text(`Dirección: ${entityData.address || "-"}`, margin, 55);

  // Document Data
  doc.setFont("helvetica", "bold");
  doc.text("DETALLES", pageWidth - margin - 50, 40);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Fecha: ${new Date(docData.date).toLocaleDateString("es-AR")}`,
    pageWidth - margin - 50,
    45,
  );
  doc.text(`Moneda: ${docData.currency}`, pageWidth - margin - 50, 50);
  doc.text(`Exchange: ${docData.exchange_rate}`, pageWidth - margin - 50, 55);

  // Lines Table
  const tableHead = [["DESCRIPCIÓN", "NETO", "IVA", "TOTAL"]];
  const tableRows = (docData.lines || []).map((l) => [
    l.description || "Sin descripción",
    (l.net_amount || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 }),
    (l.vat_amount || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 }),
    (l.total_amount || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 }),
  ]);

  if (tableRows.length === 0) {
    tableRows.push([
      "CONCEPTO GENERAL",
      (docData.total_amount / 1.21).toLocaleString("es-AR", {
        minimumFractionDigits: 2,
      }),
      (docData.total_amount - docData.total_amount / 1.21).toLocaleString(
        "es-AR",
        { minimumFractionDigits: 2 },
      ),
      (docData.total_amount || 0).toLocaleString("es-AR", {
        minimumFractionDigits: 2,
      }),
    ]);
  }

  autoTable(doc, {
    startY: 70,
    head: tableHead,
    body: tableRows,
    theme: "striped",
    headStyles: { fillColor: colors.primary },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });

  const finalY = doc.lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "bold");
  doc.text(`TOTAL ${docData.currency}:`, pageWidth - margin - 60, finalY);
  doc.text(
    docData.total_amount.toLocaleString("es-AR", { minimumFractionDigits: 2 }),
    pageWidth - margin,
    finalY,
    { align: "right" },
  );

  return doc;
};

export const downloadDocumentPdf = (docData, entityData) => {
  const doc = generateDocumentPdf(docData, entityData);
  doc.save(`${docData.doc_type}_${docData.number}.pdf`);
};

export const generateVatPdf = (data, title, subtitle) => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 12;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(37, 99, 235);
  doc.text("Quintal Agross S.A.", margin, 15);
  doc.setTextColor(17, 24, 39);
  doc.text(title.toUpperCase(), pageWidth - margin, 15, { align: "right" });
  doc.setFontSize(10);
  doc.text(subtitle, pageWidth - margin, 21, { align: "right" });

  const tableHead = [
    [
      "FECHA",
      "TIPO",
      "NRO",
      "ENTIDAD",
      "CUIT",
      "NETO",
      "IVA 10.5",
      "IVA 21",
      "TOTAL ARS",
    ],
  ];

  const tableRows = data.map((d) => {
    // Attempt to extract split IVA if breakdown exists (simplified for now)
    const iva105 = d.vat_breakdown ? d.vat_breakdown["0.105"]?.vat || 0 : 0;
    const iva21 = d.vat_breakdown
      ? d.vat_breakdown["0.21"]?.vat || 0
      : d.total_vat;

    return [
      d.date,
      d.doc_type,
      d.number,
      d.entity_name,
      d.entity_tax_id,
      d.total_net.toLocaleString("es-AR", { minimumFractionDigits: 2 }),
      iva105.toLocaleString("es-AR", { minimumFractionDigits: 2 }),
      iva21.toLocaleString("es-AR", { minimumFractionDigits: 2 }),
      d.total_amount_ars.toLocaleString("es-AR", { minimumFractionDigits: 2 }),
    ];
  });

  autoTable(doc, {
    startY: 28,
    head: tableHead,
    body: tableRows,
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [243, 244, 246], textColor: [107, 114, 128] },
    columnStyles: {
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right" },
    },
  });

  return doc;
};

export const downloadVatPdf = (data, title, subtitle) => {
  const doc = generateVatPdf(data, title, subtitle);
  doc.save(`${title.replace(/\s+/g, "_")}.pdf`);
};
