import React from "react";
import { describe, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Dock from "./Dock";

const mocks = vi.hoisted(() => ({
  windows: [],
  focusWindow: vi.fn(),
  closeWindow: vi.fn(),
}));
vi.mock("../../context/WindowContext", () => ({
  useWindow: () => ({
    windows: mocks.windows,
    focusWindow: mocks.focusWindow,
    closeWindow: mocks.closeWindow,
  }),
}));

describe("bandeja de documentos del ERP", () => {
  beforeEach(() => {
    mocks.focusWindow.mockClear();
    mocks.closeWindow.mockClear();
    mocks.windows = [];
  });

  it("no tapa un formulario que está abierto", () => {
    mocks.windows = [{ id: "f-1", title: "Nueva Factura", isMinimized: false }];
    const { container } = render(<Dock />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTitle("Nueva Factura")).toBeNull();
  });

  it("muestra únicamente documentos minimizados y permite restaurarlos", () => {
    mocks.windows = [
      { id: "f-1", title: "Nueva Factura", isMinimized: false },
      { id: "f-2", title: "Orden de Compra", isMinimized: true },
    ];
    render(<Dock />);
    expect(screen.queryByTitle("Nueva Factura")).toBeNull();
    fireEvent.click(screen.getByTitle("Orden de Compra"));
    expect(mocks.focusWindow).toHaveBeenCalledWith("f-2");
  });
});
