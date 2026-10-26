import React, { useEffect, useId, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { API_URL } from "../../config";
import s from "./BnaDivisasRateField.module.css";

export const argentinaToday = (now = new Date()) => {
  const pieces = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(pieces.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const formatDate = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return iso || "sin fecha";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
};

/**
 * Referencia oficial: BNA / Cotización Divisas / Dólar U.S.A. / Venta.
 * No usa billetes, otro proveedor ni cotizaciones inventadas.
 *
 * En comprobantes nuevos completa el TC cuando coincide con el día del
 * comprobante o, si es hoy, con el último cierre oficialmente publicado.
 * El último cierre publicado puede completar el TC sin mostrar avisos de antigüedad.
 * Nunca modifica facturas existentes ni una cotización ingresada manualmente.
 */
export default function BnaDivisasRateField({
  value,
  onChange,
  date,
  currency = "ARS",
  isNew = true,
  compact = false,
}) {
  const inputId = useId();
  const manuallyEdited = useRef(false);
  const lastAutoRate = useRef(null);
  const previousDate = useRef(date);
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
  // Fuera del horario bancario y durante fines de semana se usa el último
  // cierre publicado, identificado claramente como tal.
  const isLatestCloseForToday = Boolean(quote && date === argentinaToday() && quote.date < date);
  const canUsePublishedRate = rateMatchesDate || isLatestCloseForToday;

  useEffect(() => {
    if (previousDate.current === date) return;
    previousDate.current = date;
    if (lastAutoRate.current !== null && Number(value) === lastAutoRate.current) {
      lastAutoRate.current = null;
      onChange(1);
    }
  }, [date, onChange, value]);

  useEffect(() => {
    if (!isNew || !canUsePublishedRate || manuallyEdited.current) return;
    if (Number(value) <= 1 || Number(value) === lastAutoRate.current) {
      lastAutoRate.current = quote.rate;
      if (Number(value) !== quote.rate) onChange(quote.rate);
    }
  }, [isNew, canUsePublishedRate, quote?.rate, value, onChange]);

  const handleManualChange = (event) => {
    manuallyEdited.current = true;
    onChange(event.target.value);
  };

  const applyBna = () => {
    if (!canUsePublishedRate) return;
    manuallyEdited.current = false;
    lastAutoRate.current = quote.rate;
    onChange(quote.rate);
  };

  return (
    <div className={`${s.field} ${compact ? s.compact : ""}`}>
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
            onClick={() => canUsePublishedRate ? applyBna() : setRefreshCounter(n => n + 1)}
            title={canUsePublishedRate ? "Aplicar cotización BNA publicada" : "Volver a consultar Banco Nación"}
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
          error ? "Tipo de cambio manual" :
          !quote ? "Tipo de cambio manual" :
          rateMatchesDate ?
            compact ? null : <span>Banco Nación · Divisas vendedor USD {quote.rate.toLocaleString("es-AR", { maximumFractionDigits: 4 })} · {formatDate(quote.date)}{currency === "ARS" ? " · referencia USD/ARS" : ""}</span> :
          null
        }
      </div>
    </div>
  );
}
