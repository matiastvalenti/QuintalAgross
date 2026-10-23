import React from "react";
import v from "./CommercialDocumentWorkspace.module.css";

/**
 * Navegación interna para formularios embebidos en pestañas.
 * Limita la búsqueda al formulario actual para no saltar a otro documento abierto.
 */
export default function CommercialDocumentNav({ invoice = false }) {
  const navigate = (event, section) => {
    const workspace = event.currentTarget.closest("[data-commercial-document]");
    const target = workspace?.querySelector(`[data-document-section="${section}"]`);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <nav className={v.sections} aria-label="Secciones del documento">
      <button type="button" className={v.sectionLink} onClick={(event) => navigate(event, "items")}>
        {invoice ? "Productos y conceptos" : "Productos"}
      </button>
      <button type="button" className={v.sectionLink} onClick={(event) => navigate(event, "details")}>
        Datos de la operación
      </button>
      <button type="button" className={v.sectionLink} onClick={(event) => navigate(event, "total")}>
        Totales
      </button>
    </nav>
  );
}
