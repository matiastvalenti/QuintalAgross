import React, { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Landmark, X } from "lucide-react";
import s from "./ChequeEntryDialog.module.css";

const localToday = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

const buildDraft = (initialCheck, currency, suggestedAmount) => ({
  id: initialCheck?.id ?? null,
  type: "CHECK",
  check_type: initialCheck?.check_type || "FISICO",
  bank_name: initialCheck?.bank_name || "",
  reference_number: initialCheck?.reference_number || "",
  amount: initialCheck?.amount ?? suggestedAmount ?? "",
  currency: initialCheck?.currency || currency || "ARS",
  issue_date: initialCheck?.issue_date || localToday(),
  due_date: initialCheck?.due_date || localToday(),
  drawer_name: initialCheck?.drawer_name || "",
  drawer_cuit: initialCheck?.drawer_cuit || initialCheck?.issuer_tax_id || "",
  issuer_tax_id: initialCheck?.issuer_tax_id || initialCheck?.drawer_cuit || "",
  description: initialCheck?.description || "",
  accounting_account: initialCheck?.accounting_account || "111010301",
  business_unit: initialCheck?.business_unit || "1",
  fx_rate: initialCheck?.fx_rate || 1,
});

/**
 * Carga de cheques compartida por Órdenes de Pago y Recibos.
 * No registra documentos: entrega el cheque validado al formulario padre.
 */
export default function ChequeEntryDialog({
  open,
  initialCheck,
  currency = "ARS",
  suggestedAmount = "",
  banks = [],
  isPayment = false,
  onClose,
  onSave,
}) {
  const formId = useId();
  const [draft, setDraft] = useState(() => buildDraft(initialCheck, currency, suggestedAmount));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(buildDraft(initialCheck, currency, suggestedAmount));
    setError("");
  }, [open, initialCheck?.id, currency, suggestedAmount]);

  if (!open || typeof document === "undefined") return null;

  const change = (field, value) => {
    setDraft(previous => ({ ...previous, [field]: value }));
    if (error) setError("");
  };

  const submit = (event) => {
    event.preventDefault();
    const amount = Number(draft.amount);
    if (!draft.bank_name.trim()) return setError("Indicá el banco del cheque.");
    if (!draft.reference_number.trim()) return setError("Indicá el número de cheque.");
    if (!Number.isFinite(amount) || amount <= 0) return setError("El importe debe ser mayor a cero.");
    if (!draft.issue_date || !draft.due_date) return setError("Completá las fechas de emisión y vencimiento.");
    if (draft.due_date < draft.issue_date) return setError("El vencimiento no puede ser anterior a la emisión.");

    onSave({
      ...draft,
      amount,
      bank_name: draft.bank_name.trim(),
      reference_number: draft.reference_number.trim(),
      drawer_name: draft.drawer_name.trim(),
      drawer_cuit: draft.drawer_cuit.trim(),
      issuer_tax_id: draft.drawer_cuit.trim(),
    });
  };

  const editing = initialCheck?.id != null;
  const bankNames = Array.isArray(banks)
    ? banks.map(bank => typeof bank === "string" ? bank : (bank.name || bank.nombre || "")).filter(Boolean)
    : [];

  return createPortal(
    <div className={s.overlay} onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={s.dialog} role="dialog" aria-modal="true" aria-labelledby={formId + "-title"}>
        <div className={s.header}>
          <div className={s.icon}><Landmark size={18} /></div>
          <div>
            <h2 id={formId + "-title"}>{editing ? "Editar cheque" : "Agregar cheque"}</h2>
            <p>{isPayment ? "Cheque de la orden de pago" : "Cheque recibido del cliente"}</p>
          </div>
          <button className={s.close} type="button" onClick={onClose} aria-label="Cerrar carga de cheque"><X size={19} /></button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className={s.body}>
            <div className={s.grid}>
              <label className={s.field}>
                <span>Tipo de cheque</span>
                <select value={draft.check_type} onChange={e => change("check_type", e.target.value)}>
                  <option value="FISICO">Cheque físico</option>
                  <option value="ECHEQ">eCheq / electrónico</option>
                </select>
              </label>
              <label className={s.field}>
                <span>Moneda</span>
                <select value={draft.currency} disabled title="La moneda del cheque coincide con la del comprobante">
                  <option value="ARS">Pesos (ARS)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </label>
              <label className={s.field}>
                <span>Banco *</span>
                <input list={formId + "-banks"} value={draft.bank_name} onChange={e => change("bank_name", e.target.value)} placeholder="Buscar o escribir banco" autoFocus />
                <datalist id={formId + "-banks"}>
                  {bankNames.map(name => <option key={name} value={name} />)}
                </datalist>
              </label>
              <label className={s.field}>
                <span>Número de cheque *</span>
                <input value={draft.reference_number} onChange={e => change("reference_number", e.target.value)} placeholder="Número / referencia" />
              </label>
              <label className={s.field}>
                <span>Fecha de emisión *</span>
                <input type="date" value={draft.issue_date || ""} onChange={e => change("issue_date", e.target.value)} />
              </label>
              <label className={s.field}>
                <span>Fecha de vencimiento *</span>
                <input type="date" value={draft.due_date || ""} onChange={e => change("due_date", e.target.value)} />
              </label>
              <label className={s.field}>
                <span>Importe *</span>
                <input type="number" min="0.01" step="0.01" value={draft.amount} onChange={e => change("amount", e.target.value)} placeholder="0,00" />
              </label>
              <label className={s.field}>
                <span>Librador</span>
                <input value={draft.drawer_name} onChange={e => change("drawer_name", e.target.value)} placeholder="Nombre o razón social" />
              </label>
              <label className={s.field}>
                <span>CUIT del librador</span>
                <input value={draft.drawer_cuit} onChange={e => change("drawer_cuit", e.target.value)} placeholder="Opcional" />
              </label>
              <label className={s.field}>
                <span>Observación</span>
                <input value={draft.description} onChange={e => change("description", e.target.value)} placeholder="Detalle opcional" />
              </label>
            </div>
            {error && <div className={s.error} role="alert">{error}</div>}
          </div>
          <div className={s.footer}>
            <button type="button" className={s.cancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={s.confirm}>{editing ? "Guardar cambios" : "Agregar cheque"}</button>
          </div>
        </form>
      </section>
    </div>,
    document.body
  );
}
