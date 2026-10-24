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

describe("Carga por lote de cheques", () => {
  it("permite ingresar varios consecutivos y los entrega juntos al finalizar", () => {
    const onSave = vi.fn();
    render(<ChequeEntryDialog open currency="ARS" banks={[{ id: 1, name: "Banco Nación", tax_id: "30-50001091-2" }]} onSave={onSave} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Agregar y siguiente/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("banco");

    // El mismo catálogo admite buscar por CUIT o nombre.
    fireEvent.change(screen.getByLabelText("Buscar banco por nombre o CUIT"), { target: { value: "50001091" } });
    fireEvent.click(screen.getByRole("option", { name: /Banco Nación/ }));
    expect(screen.getByLabelText("Buscar banco por nombre o CUIT")).toHaveValue("Banco Nación");

    fireEvent.change(screen.getByPlaceholderText("Número / referencia"), { target: { value: "CH-100" } });
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "15000" } });
    fireEvent.click(screen.getByRole("button", { name: /Agregar y siguiente/ }));

    expect(screen.getByText(/1 cheque preparado/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Número / referencia")).toHaveValue("");
    expect(screen.getByLabelText("Buscar banco por nombre o CUIT")).toHaveValue("Banco Nación");
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("Número / referencia"), { target: { value: "CH-101" } });
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "20000" } });
    fireEvent.click(screen.getByRole("button", { name: /Finalizar/ }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0]).toHaveLength(2);
    expect(onSave.mock.calls[0][0][0]).toMatchObject({ bank_name: "Banco Nación", reference_number: "CH-100", amount: 15000 });
    expect(onSave.mock.calls[0][0][1]).toMatchObject({ bank_name: "Banco Nación", reference_number: "CH-101", amount: 20000 });
  });

  it("el botón Cheque de Recibos incorpora dos cheques en una sola operación", async () => {
    api.get.mockImplementation(url => Promise.resolve(url.includes("/fx/usd") ? { rate: 1500 } : []));
    render(<MemoryRouter><ReceiptCollectionForm /></MemoryRouter>);

    await screen.findByText("Parámetros de Recibo");
    fireEvent.click(screen.getByRole("button", { name: /Cheque$/ }));
    expect(await screen.findByRole("dialog", { name: "Agregar cheque" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Buscar banco por nombre o CUIT"), { target: { value: "Banco Entre Ríos" } });
    fireEvent.change(screen.getByPlaceholderText("Número / referencia"), { target: { value: "CH-200" } });
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: /Agregar y siguiente/ }));
    fireEvent.change(screen.getByPlaceholderText("Número / referencia"), { target: { value: "CH-201" } });
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "12000" } });
    fireEvent.click(screen.getByRole("button", { name: /Finalizar/ }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(/N° CH-200/)).toBeInTheDocument();
    expect(screen.getByText(/N° CH-201/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Editar Cheque" })).toHaveLength(2);
  });
});
