import React from "react";
import { ShoppingBag, FileText, Network } from "lucide-react";
import w from "./InvoiceWorkbench.module.css";

/**
 * Solapas reales, con paneles mutuamente excluyentes, como en Nueva Orden de Venta.
 * No son enlaces a secciones ni abren otras ventanas.
 */
export default function InvoiceWorkspaceTabs({ value, onChange, itemCount = 0, hasNotes = false }) {
  const tabs = [
    { id: "products", label: "Productos y conceptos", icon: ShoppingBag },
    { id: "notes", label: "Observaciones y gastos", icon: FileText },
    { id: "documents", label: "Documentos asociados", icon: Network },
  ];

  return (
    <nav className={w.tabs} role="tablist" aria-label="Secciones de factura">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          aria-controls={`invoice-panel-${id}`}
          className={`${w.tab} ${value === id ? w.tabActive : ""}`}
          onClick={() => onChange(id)}
        >
          <Icon size={15} aria-hidden="true" />
          {label}
          {id === "products" && <span className={w.tabCount}>{itemCount}</span>}
          {id === "notes" && hasNotes && <span className={w.tabCount} aria-label="Con observaciones">●</span>}
        </button>
      ))}
    </nav>
  );
}
