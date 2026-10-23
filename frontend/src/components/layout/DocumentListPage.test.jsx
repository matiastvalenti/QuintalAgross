import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import DocumentListPage from "./DocumentListPage";

vi.mock("./ContentHeader", () => ({
  default: ({ title }) => <h1>{title}</h1>,
}));

describe("listados comerciales sin registros", () => {
  it("centra el estado vacío fuera de las celdas de la tabla", () => {
    const { container } = render(
      <DocumentListPage
        title="Órdenes de Venta"
        theme="quintal"
        table={{
          empty: true,
          columns: <><th>ORDEN</th><th>FECHA</th><th>CLIENTE</th></>,
          emptyContent: <p>Sin órdenes coincidentes</p>,
          body: <tr><td colSpan={3}>Estado viejo comprimido</td></tr>,
        }}
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader")).toHaveLength(3);
    expect(within(table).queryByText("Estado viejo comprimido")).toBeNull();
    expect(within(table).queryByText("Sin órdenes coincidentes")).toBeNull();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Sin órdenes coincidentes");
    expect(table.parentElement.nextElementSibling).toBe(status);
  });

  it("mantiene las filas normales cuando hay datos", () => {
    render(
      <DocumentListPage
        title="Órdenes de Venta"
        theme="quintal"
        table={{
          empty: false,
          columns: <th>ORDEN</th>,
          body: <tr><td>OV-0001</td></tr>,
          emptyContent: <p>Sin órdenes</p>,
        }}
      />,
    );
    expect(screen.getByText("OV-0001")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
