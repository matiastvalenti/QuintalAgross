import React, { useEffect, useId, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { API_URL } from "../../config";
import s from "./BnaDivisasRateField.module.css";

const formatDate = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return iso || "sin fecha";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
};

/**
 * Referencia oficial: BNA / Cotización Divisas / Dólar U.S.A. / Venta.
 * No usa billetes, otro proveedor ni cotizaciones inventadas.
 *
 * En comprobantes nuevos completa el TC sólo si BNA confirma la cotización
 * de la fecha del documento y el campo aún tiene su valor inicial (1).
 * Nunca modifica facturas existentes ni una cotización ingresada manualmente.
 */
export default function BnaDivisasRateField({
  value,
  onChange,
  date,
  currency = "ARS",
  isNew = true,
}) {
  const inputId = useId();
  const manuallyEdited = useRef(false);
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    if (!isNew || !date) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setQuote(null);
    setError("");
    const url = `${API_URL}/accounting/fx/usd?side=sell&date=${encodeURIComponent(date)}`;
    fetch(url, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(typeof data.detail === "string"
            ? data.detail
            : "No se pudo consultar Banco Nación.");
        }
        return response.json();
      })
      .then(data => {
        if (!active) return;
        const rate = Number(data.rate);
        if (data.source !== "bna_divisas" || data.side !== "sell" ||
            !Number.isFinite(rate) || rate <= 1 || !data.quote_date) {
          throw new Error("BNA no devolvió una cotización de divisas vendedor verificable.");
        }
        setQuote({ rate, date: data.quote_date, warning: data.warning || "" });
      })
      .catch(e => {
        if (active && e.name !== "AbortError") setError(e.message || "Error consultando Banco Nación.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [date, isNew, refreshCounter]);

  const rateMatchesDate = Boolean(quote && quote.date === date);
  useEffect(() => {
    if (isNew && rateMatchesDate && !manuallyEdited.current && Number(value) <= 1) {
      onChange(quote.rate);
    }
  }, [isNew, rateMatchesDate, quote?.rate, value, onChange]);

  const handleManualChange = (event) => {
    manuallyEdited.current = true;
    onChange(event.target.value);
  };

  const applyBna = () => {
    if (!rateMatchesDate) return;
    manuallyEdited.current = false;
    onChange(quote.rate);
  };

  return (
    <div className={s.field}>
      <label htmlFor={inputId}>T. CAMBIO <span className={s.tag}>BNA · DIVISAS VENTA</span></label>
      <div className={s.inputRow}>
        <input
          id={inputId}
          type="number"
          min="0.0001"
          step="0.0001"
          value={value}
          onChange={handleManualChange}
          aria-describedby={`${inputId}-source`}
        />
        {isNew && (
          <button
            type="button"
            className={s.refresh}
            onClick={() => rateMatchesDate ? applyBna() : setRefreshCounter(n => n + 1)}
            title={rateMatchesDate ? "Aplicar cotización BNA verificada" : "Volver a consultar Banco Nación"}
            aria-label="Actualizar tipo de cambio desde Banco Nación"
            disabled={loading}
          >
            <RefreshCw size={15} />
          </button>
        )}
      </div>
      <div id={`${inputId}-source`} className={s.source} role="status">
        {!isNew ? "Tipo de cambio guardado en este comprobante." :
          loading ? "Consultando BNA divisas vendedor..." :
          error ? <span className={s.warning}>BNA: {error} Ingresá el TC verificado manualmente.</span> :
          !quote ? "Sin cotización verificada." :
          rateMatchesDate ?
            <span>Banco Nación · Venta USD {quote.rate.toLocaleString("es-AR", { maximumFractionDigits: 4 })} · {formatDate(quote.date)}{currency === "ARS" ? " · referencia USD/ARS" : ""}</span> :
            <span className={s.warning}>BNA publicó {formatDate(quote.date)}. No coincide con {formatDate(date)}; verificá el TC antes de facturar.</span>
        }
      </div>
    </div>
  );
}
