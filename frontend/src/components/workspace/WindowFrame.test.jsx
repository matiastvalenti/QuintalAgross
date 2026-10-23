import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import WindowFrame from "./WindowFrame";

const actions = vi.hoisted(() => ({
  minimizeWindow: vi.fn(),
  focusWindow: vi.fn(),
  closeWindow: vi.fn(),
  maximizeWindow: vi.fn(),
  updateWindow: vi.fn(),
}));

vi.mock("../../context/WindowContext", () => ({
  useWindow: () => actions,
}));

function FormWithState() {
  const [quantity, setQuantity] = useState(1);
  return (
    <div>
      <span>Envases: {quantity}</span>
      <button type="button" onClick={() => setQuantity(n => n + 1)}>Agregar envase</button>
    </div>
  );
}

const orderWindow = {
  id: "ov-1",
  type: "sales-order",
  title: "Nueva Orden de Venta",
  x: 70,
  y: 60,
  width: 950,
  height: 650,
  zIndex: 101,
  isMaximized: false,
  isMinimized: false,
};

describe("minimización de ventanas internas", () => {
  it("oculta el frame inmediatamente sin desmontar ni perder el formulario", () => {
    const view = render(<WindowFrame window={orderWindow} component={FormWithState} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar envase" }));
    expect(screen.getByText("Envases: 2")).toBeInTheDocument();

    view.rerender(
      <WindowFrame window={{ ...orderWindow, isMinimized: true }} component={FormWithState} />
    );
    const frame = view.container.firstElementChild;
    expect(frame).toHaveStyle({ display: "none" });
    expect(frame).toHaveAttribute("aria-hidden", "true");
    // El formulario permanece montado para preservar todos sus datos.
    expect(view.container.textContent).toContain("Envases: 2");

    view.rerender(<WindowFrame window={orderWindow} component={FormWithState} />);
    expect(frame).not.toHaveStyle({ display: "none" });
    expect(screen.getByText("Envases: 2")).toBeInTheDocument();
  });
});
