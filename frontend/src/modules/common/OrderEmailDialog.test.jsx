import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OrderEmailDialog from "./OrderEmailDialog";

describe("envío de órdenes desde el frontend", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.setItem("token", "test-token");
  });

  it("no envía sin confirmación y exige destinatario válido", async () => {
    const request = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", request);
    render(<OrderEmailDialog
      open
      endpoint="/api/sales/sales-orders/ov1/email"
      defaultSubject="Orden de Venta 0001-00001234"
      onClose={vi.fn()}
    />);
    expect(request).not.toHaveBeenCalled();
    const send = screen.getByRole("button", { name: "Enviar correo" });
    fireEvent.click(send);
    expect(request).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("proveedor@empresa.com"), { target: { value: "cliente@example.com" } });
    fireEvent.click(send);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const [url, options] = request.mock.calls[0];
    expect(url).toBe("/api/sales/sales-orders/ov1/email");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body).to_email).toBe("cliente@example.com");
  });

  it("muestra errores de servidor y no cierra el modal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      json: async () => ({ detail: "Servidor de correo no configurado" }),
    })));
    const close = vi.fn();
    render(<OrderEmailDialog
      open
      endpoint="/api/purchases/purchase-orders/oc1/email"
      defaultRecipient="proveedor@example.com"
      defaultSubject="OC 123"
      onClose={close}
    />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar correo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Servidor de correo no configurado");
    expect(close).not.toHaveBeenCalled();
  });
});
