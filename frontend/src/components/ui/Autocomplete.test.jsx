import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Autocomplete from "./Autocomplete";
import { WindowVisibilityContext } from "../workspace/WindowVisibilityContext";

function TestAutocomplete({ minimized = false, label = "Buscar producto" }) {
  return (
    <WindowVisibilityContext.Provider value={{ isWindowMinimized: minimized }}>
      <Autocomplete
        label={label}
        minChars={0}
        onSearch={vi.fn().mockResolvedValue([{ id: "p1", name: "Glifosato" }])}
        onSelect={() => {}}
      />
    </WindowVisibilityContext.Provider>
  );
}

describe("autocomplete en ventanas del ERP", () => {
  it("elimina el desplegable del body al minimizar y no lo reabre al restaurar", async () => {
    const view = render(<TestAutocomplete />);
    const searchInput = screen.getByRole("textbox");
    fireEvent.change(searchInput, { target: { value: "glifo" } });
    expect(await screen.findByText("Glifosato")).toBeInTheDocument();
    // La lista no es descendiente del formulario: está montada como portal en document.body.
    const menu = document.querySelector('[class*="dropdown"]');
    expect(menu).toBeInTheDocument();
    expect(view.container.contains(menu)).toBe(false);

    view.rerender(<TestAutocomplete minimized />);
    expect(screen.queryByText("Glifosato")).toBeNull();
    expect(document.querySelector('[class*="dropdown"]')).toBeNull();

    view.rerender(<TestAutocomplete />);
    expect(screen.queryByText("Glifosato")).toBeNull();
    expect(screen.getByRole("textbox")).toHaveValue("glifo");
  });

  it("minimizar una ventana no cierra el buscador de otra ventana activa", async () => {
    const view = render(
      <>
        <TestAutocomplete label="Orden A" />
        <TestAutocomplete label="Orden B" />
      </>
    );
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "glifo" } });
    fireEvent.change(screen.getAllByRole("textbox")[1], { target: { value: "glifo" } });
    await waitFor(() => expect(screen.getAllByText("Glifosato")).toHaveLength(2));

    view.rerender(
      <>
        <TestAutocomplete label="Orden A" minimized />
        <TestAutocomplete label="Orden B" />
      </>
    );
    expect(screen.getAllByText("Glifosato")).toHaveLength(1);
  });
});
