import React from "react";
import { describe, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Dock from "./Dock";

const mocks = vi.hoisted(() => ({
  windows: [],
  activeId: null,
  focusWindow: vi.fn(),
  closeWindow: vi.fn(),
}));
vi.mock("../../context/WindowContext", () => ({
  useWindow: () => ({
    windows: mocks.windows,
    activeId: mocks.activeId,
    focusWindow: mocks.focusWindow,
    closeWindow: mocks.closeWindow,
  }),
}));

describe("barra de ventanas del ERP", () => {
  beforeEach(() => {
    mocks.focusWindow.mockClear();
    mocks.closeWindow.mockClear();
    mocks.windows = [];
    mocks.activeId = null;
  });

  it("no ocupa espacio con un único formulario visible", () => {
    mocks.windows = [{ id: "f-1", title: "Nueva Factura", isMinimized: false }];
    const { container } = render(<Dock />);
    expect(container.firstChild).toBeNull();
  });

  it("conserva accesibles la ventana abierta y la minimizada", () => {
    mocks.windows = [
      { id: "f-1", title: "Nueva Orden de Venta", isMinimized: true },
      { id: "f-2", title: "Nueva Orden de Compra", isMinimized: false },
    ];
    render(<Dock />);
    fireEvent.click(screen.getByRole("button", { name: "Restaurar Nueva Orden de Venta" }));
    expect(mocks.focusWindow).toHaveBeenCalledWith("f-1");
    expect(screen.getByRole("button", { name: "Ir a Nueva Orden de Compra" })).toBeTruthy();
  });

  it("permite alternar entre dos ventanas abiertas y cerrar sólo la elegida", () => {
    mocks.windows = [
      { id: "ov", title: "Orden de Venta", isMinimized: false },
      { id: "oc", title: "Orden de Compra", isMinimized: false },
    ];
    render(<Dock />);
    fireEvent.click(screen.getByRole("button", { name: "Ir a Orden de Venta" }));
    expect(mocks.focusWindow).toHaveBeenCalledWith("ov");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar Orden de Compra" }));
    expect(mocks.closeWindow).toHaveBeenCalledWith("oc");
  });
});
