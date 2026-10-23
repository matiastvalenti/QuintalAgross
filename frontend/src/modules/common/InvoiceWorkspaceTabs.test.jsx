import React, { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InvoiceWorkspaceTabs from "./InvoiceWorkspaceTabs";

function TestInvoice() {
  const [view, setView] = useState("products");
  return (
    <div data-active-view={view}>
      <InvoiceWorkspaceTabs
        value={view}
        onChange={setView}
        itemCount={3}
        hasNotes
        idPrefix="test-invoice"
      />
      <section role="tabpanel" id="test-invoice-products" hidden={view !== "products"}>Tabla completa de productos</section>
      <section role="tabpanel" id="test-invoice-notes" hidden={view !== "notes"}>Notas del documento</section>
      <section role="tabpanel" id="test-invoice-documents" hidden={view !== "documents"}>Origen, remitos y cobros</section>
    </div>
  );
}

describe("solapas reales en facturas del ERP", () => {
  it("abre en productos y expone cuántas líneas contiene", () => {
    render(<TestInvoice />);
    expect(screen.getByRole("tab", { name: /Productos y conceptos/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Tabla completa de productos")).toBeVisible();
    expect(screen.getByRole("tab", { name: /Productos y conceptos/ })).toHaveTextContent("3");
  });

  it("cambia de panel sin crear ventanas externas y conserva las solapas", () => {
    render(<TestInvoice />);
    fireEvent.click(screen.getByRole("tab", { name: /Observaciones y gastos/ }));
    expect(screen.getByRole("tab", { name: /Observaciones y gastos/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Notas del documento")).toBeVisible();
    expect(screen.getByText("Tabla completa de productos")).not.toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: /Documentos asociados/ }));
    expect(screen.getByText("Origen, remitos y cobros")).toBeVisible();
    expect(screen.getByText("Notas del documento")).not.toBeVisible();
  });
});
