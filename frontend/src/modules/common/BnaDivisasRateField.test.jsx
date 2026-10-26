import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BnaDivisasRateField, { argentinaToday } from "./BnaDivisasRateField";

const published = (quoteDate, rate = 1528) => ({
  ok: true,
  json: async () => ({
    rate, sell: rate, buy: rate - 9,
    quote_date: quoteDate, source: "bna_divisas", side: "sell",
  }),
});

function Form({ date, currency = "ARS", initialRate = 1, isNew = true }) {
  const [rate, setRate] = useState(initialRate);
  return (
    <BnaDivisasRateField
      date={date}
      currency={currency}
      value={rate}
      onChange={setRate}
      isNew={isNew}
    />
  );
}

describe("cotización oficial BNA divisas vendedor", () => {
  beforeEach(() => {
    localStorage.setItem("token", "test-token");
    vi.restoreAllMocks();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("consulta exclusivamente BNA divisas venta y completa el tipo de cambio de la fecha", async () => {
    const request = vi.fn(async () => published("2026-10-22"));
    vi.stubGlobal("fetch", request);
    render(<Form date="2026-10-22" />);
    await waitFor(() => expect(screen.getByRole("spinbutton")).toHaveValue(1528));
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("/accounting/fx/usd?side=sell&date=2026-10-22"),
      expect.objectContaining({ headers: { Authorization: "Bearer test-token" } }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Divisas vendedor USD");
    expect(screen.getByRole("status")).toHaveTextContent("22/10/2026");
  });

  it("para comprobantes de hoy carga último cierre publicado sin aviso de antigüedad", async () => {
    const today = argentinaToday();
    const yesterday = new Date(`${today}T12:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const previousDate = yesterday.toISOString().slice(0, 10);
    vi.stubGlobal("fetch", vi.fn(async () => published(previousDate, 1530)));
    render(<Form date={today} currency="USD" />);
    await waitFor(() => expect(screen.getByRole("spinbutton")).toHaveValue(1530));
    expect(screen.getByRole("status")).not.toHaveTextContent("Último cierre");
    expect(screen.getByRole("status")).not.toHaveTextContent("anterior a hoy");
  });

  it("no acepta otra fuente ni inventa un tipo de cambio si BNA falla", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...await published("2026-10-22").json(), source: "billetes" }),
    })));
    render(<Form date="2026-10-22" />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Tipo de cambio manual"));
    expect(screen.queryByText(/no devolvió una cotización/i)).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(1);
  });

  it("un HTTP 503 no dispara ningún warning visible y permite ingresar el TC", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false, status: 503,
      json: async () => ({ detail: "No se pudo obtener BNA divisas" }),
    })));
    render(<Form date="2026-10-22" />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Tipo de cambio manual"));
    expect(screen.queryByText(/no se pudo obtener BNA/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1542" } });
    expect(screen.getByRole("spinbutton")).toHaveValue(1542);
  });

  it("conserva la cotización ingresada manualmente antes de que responda BNA", async () => {
    let resolveRequest;
    const pending = new Promise(resolve => { resolveRequest = resolve; });
    vi.stubGlobal("fetch", vi.fn(() => pending));
    render(<Form date="2026-10-22" />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1540" } });
    resolveRequest(published("2026-10-22"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Divisas vendedor USD"));
    expect(screen.getByRole("spinbutton")).toHaveValue(1540);
  });

  it("no reemplaza el tipo de cambio histórico de facturas existentes", () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    render(<Form date="2026-08-01" initialRate={1405} isNew={false} />);
    expect(screen.getByRole("spinbutton")).toHaveValue(1405);
    expect(request).not.toHaveBeenCalled();
  });
});
