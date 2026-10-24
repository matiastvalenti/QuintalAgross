import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ChequeEntryDialog from "../../modules/finance/components/ChequeEntryDialog";
import ReceiptCollectionForm from "../../modules/finance/ReceiptCollectionForm";
import api from "../../services/api";

vi.mock("../../services/api");
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("../../modules/finance/components/ReceiptCollectionShell/ReceiptPendingInvoicesSelector", () => ({ default: () => null }));

describe("Carga de cheques en cobranzas y pagos", () => {
  it("abre el formulario, valida datos y entrega el cheque cargado", () => {
    const onSave = vi.fn();
    render(<ChequeEntryDialog open currency="ARS" banks={[{ id: 1, name: "Banco Nación" }]} onSave={onSave} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Agregar cheque" }));
    expect(screen.getByRole("alert")).toHaveTextContent("banco");

    fireEvent.change(screen.getByPlaceholderText("Buscar o escribir banco"), { target: { value: "Banco Nación" } });
    fireEvent.change(screen.getByPlaceholderText("Número / referencia"), { target: { value: "CH-100" } });
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "15000" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar cheque" }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0]).toMatchObject({
      type: "CHECK", bank_name: "Banco Nación", reference_number: "CH-100",
      amount: 15000, currency: "ARS",
    });
  });

  it("el botón Cheque del nuevo recibo abre la ventana y agrega el medio de cobro", async () => {
    api.get.mockImplementation(url => Promise.resolve(url.includes("/fx/usd") ? { rate: 1500 } : []));
    render(<MemoryRouter><ReceiptCollectionForm /></MemoryRouter>);

    await screen.findByText("Parámetros de Recibo");
    fireEvent.click(screen.getByRole("button", { name: /Cheque$/ }));
    expect(await screen.findByRole("dialog", { name: "Agregar cheque" })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Buscar o escribir banco"), { target: { value: "Banco Entre Ríos" } });
    fireEvent.change(screen.getByPlaceholderText("Número / referencia"), { target: { value: "CH-200" } });
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar cheque" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(/N° CH-200/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar Cheque" })).toBeInTheDocument();
  });
});
