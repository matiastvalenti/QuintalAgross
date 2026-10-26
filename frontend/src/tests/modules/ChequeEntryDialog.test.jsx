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
    api.get.mockImplementation(url => Promise.resolve(
      url.includes("/fx/usd") ? { rate: 1500 } :
      url.includes("/config/banks") ? [{ id: "ber", name: "Banco Entre Ríos", tax_id: "30-12345678-9" }] : []
    ));
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
  it("impide incorporar bancos no configurados y números duplicados del recibo", () => {
    const onSave = vi.fn();
    render(<ChequeEntryDialog open banks={[{ name: "Banco Nación", tax_id: "30-50001091-2" }]}
      existingChecks={[{ id: "ya-1", type: "CHECK", bank_name: "Banco Nación", reference_number: "100" }]}
      onSave={onSave} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Buscar banco por nombre o CUIT"), { target: { value: "Banco inventado" } });
    fireEvent.change(screen.getByPlaceholderText("Número / referencia"), { target: { value: "101" } });
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "9000" } });
    fireEvent.click(screen.getByRole("button", { name: /Finalizar/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Configuración");
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Buscar banco por nombre o CUIT"), { target: { value: "Banco Nación" } });
    fireEvent.change(screen.getByPlaceholderText("Número / referencia"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /Finalizar/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("ya están incluidos");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("conserva datos del librador y cheque electrónico en los cheques preparados", () => {
    const onSave = vi.fn();
    render(<ChequeEntryDialog open banks={[{ name: "Banco Entre Ríos" }]} onSave={onSave} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Buscar banco por nombre o CUIT"), { target: { value: "Banco Entre Ríos" } });
    fireEvent.change(screen.getByPlaceholderText("Número / referencia"), { target: { value: "EC-1" } });
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "13000" } });
    fireEvent.change(screen.getByPlaceholderText("Nombre o razón social"), { target: { value: "Agro SRL" } });
    fireEvent.change(screen.getByPlaceholderText("Opcional"), { target: { value: "30-12345678-9" } });
    fireEvent.change(screen.getByDisplayValue("Cheque físico"), { target: { value: "ECHEQ" } });
    fireEvent.click(screen.getByRole("button", { name: /Finalizar/ }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0][0]).toMatchObject({
      bank_name: "Banco Entre Ríos", reference_number: "EC-1", check_type: "ECHEQ",
      drawer_name: "Agro SRL", drawer_cuit: "30123456789", issuer_tax_id: "30123456789"
    });
  });

  it("en una orden de pago exige origen y CUIT si se emite un cheque propio", () => {
    const onSave = vi.fn();
    render(<ChequeEntryDialog open isPayment banks={[{ name: "Banco Nación" }]} onSave={onSave} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Origen del cheque")).toHaveValue("PROPIO");
    fireEvent.change(screen.getByLabelText("Buscar banco por nombre o CUIT"), { target: { value: "Banco Nación" } });
    fireEvent.change(screen.getByPlaceholderText("Número / referencia"), { target: { value: "CP-001" } });
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "50000" } });
    fireEvent.click(screen.getByRole("button", { name: /Finalizar/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("CUIT del librador");
    fireEvent.change(screen.getByPlaceholderText("Opcional"), { target: { value: "30-12345678-9" } });
    fireEvent.click(screen.getByRole("button", { name: /Finalizar/ }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0][0]).toMatchObject({
      check_origin: "PROPIO", drawer_cuit: "30123456789", reference_number: "CP-001"
    });
  });

  it("en una orden de pago vincula un cheque de terceros por ID de cartera", async () => {
    api.get.mockReset();
    api.get.mockResolvedValue([{
      id: 84, banco: "Banco Nación", nro_cheque: "CH-84", importe: 12500,
      moneda: "ARS", tipo: "ECHEQ", cuit_emisor: "30123456789",
      librador: "Agro SA", f_emision: "2026-10-10", f_vencimiento: "2026-11-10"
    }]);
    const onSave = vi.fn();
    render(<ChequeEntryDialog open isPayment banks={[{ name: "Banco Nación" }]} onSave={onSave} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Origen del cheque"), { target: { value: "TERCERO" } });
    fireEvent.change(screen.getByLabelText("Buscar banco por nombre o CUIT"), { target: { value: "Banco Nación" } });
    fireEvent.change(screen.getByPlaceholderText("Número / referencia"), { target: { value: "CH-84" } });
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "12500" } });
    fireEvent.click(screen.getByRole("button", { name: /Finalizar/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("desde la cartera");
    fireEvent.click(screen.getByRole("button", { name: /Buscar en cartera/ }));
    expect(await screen.findByRole("button", { name: "Usar cheque" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Usar cheque" }));
    expect(screen.getByText(/cartera #84 seleccionado/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Finalizar/ }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0][0]).toMatchObject({
      check_origin: "TERCERO", source_cheque_id: 84, check_type: "ECHEQ",
      reference_number: "CH-84", drawer_cuit: "30123456789", amount: 12500,
    });
  });

});
