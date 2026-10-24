import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Landmark, X, Search, Check, Trash2, ArrowRight } from "lucide-react";
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
  const [queued, setQueued] = useState([]);
  const [bankFocused, setBankFocused] = useState(false);
  const numberRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setDraft(buildDraft(initialCheck, currency, suggestedAmount));
    setQueued([]);
    setBankFocused(false);
    setError("");
  }, [open, initialCheck?.id, currency, suggestedAmount]);

  if (!open || typeof document === "undefined") return null;

  const change = (field, value) => {
    setDraft(previous => ({ ...previous, [field]: value }));
    if (error) setError("");
  };

  const editing = initialCheck?.id != null;
  const bankRecords = Array.isArray(banks)
    ? banks.map(bank => typeof bank === "string" ? { name: bank, tax_id: "" } : {
      name: bank.name || bank.nombre || "",
      tax_id: bank.tax_id || "",
    }).filter(bank => bank.name)
    : [];
  const normalizedBankQuery = draft.bank_name.trim().toLocaleLowerCase("es-AR");
  const bankQueryDigits = normalizedBankQuery.replace(/\D/g, "");
  const bankMatches = bankRecords
    .filter(bank => bank.name.toLocaleLowerCase("es-AR").includes(normalizedBankQuery) ||
      (bankQueryDigits.length > 0 && String(bank.tax_id).replace(/\D/g, "").includes(bankQueryDigits)))
    .slice(0, 7);

  const parseCheck = () => {
    const amount = Number(draft.amount);
    if (!draft.bank_name.trim()) { setError("Indicá el banco del cheque."); return null; }
    if (!draft.reference_number.trim()) { setError("Indicá el número de cheque."); return null; }
    if (!Number.isFinite(amount) || amount <= 0) { setError("El importe debe ser mayor a cero."); return null; }
    if (!draft.issue_date || !draft.due_date) { setError("Completá las fechas de emisión y vencimiento."); return null; }
    if (draft.due_date < draft.issue_date) { setError("El vencimiento no puede ser anterior a la emisión."); return null; }
    const duplicate = queued.some(check =>
      check.bank_name.trim().toLowerCase() === draft.bank_name.trim().toLowerCase() &&
      check.reference_number.trim().toLowerCase() === draft.reference_number.trim().toLowerCase());
    if (duplicate) { setError("Ya cargaste ese número de cheque para el mismo banco."); return null; }
    return {
      ...draft,
      amount,
      bank_name: draft.bank_name.trim(),
      reference_number: draft.reference_number.trim(),
      drawer_name: draft.drawer_name.trim(),
      drawer_cuit: draft.drawer_cuit.trim(),
      issuer_tax_id: draft.drawer_cuit.trim(),
    };
  };

  const queueAndContinue = (event) => {
    event.preventDefault();
    const check = parseCheck();
    if (!check) return;
    if (editing) {
      onSave(check);
      return;
    }
    setQueued(previous => [...previous, { ...check, id: null, draftKey: Math.random().toString(36).slice(2) }]);
    // La mayoría de los lotes comparten banco, tipo, emisor y fechas.
    // Sólo limpiar lo que cambia cheque a cheque.
    setDraft(previous => ({ ...previous, id: null, reference_number: "", amount: "" }));
    setError("");
    setTimeout(() => numberRef.current?.focus(), 0);
  };

  const finalizeBatch = () => {
    if (editing) {
      const check = parseCheck();
      if (check) onSave(check);
      return;
    }
    const hasPendingCheck = Boolean(draft.reference_number.trim() || String(draft.amount ?? "").trim());
    const last = hasPendingCheck ? parseCheck() : null;
    if (hasPendingCheck && !last) return;
    const all = [...queued, ...(last ? [{ ...last, id: null }] : [])];
    if (!all.length) return setError("Cargá al menos un cheque.");
    onSave(all.map(({ draftKey, ...check }) => check));
  };

  const restoreQueued = (key) => {
    const row = queued.find(check => check.draftKey === key);
    if (!row) return;
    const { draftKey, ...restored } = row;
    setQueued(previous => previous.filter(check => check.draftKey !== key));
    setDraft(restored);
    setError("");
  };

  const queuedTotal = queued.reduce((sum, check) => sum + Number(check.amount || 0), 0);
  const cancel = () => {
    const hasUnsaved = queued.length > 0 || Boolean(draft.reference_number.trim() || String(draft.amount ?? "").trim());
    if (hasUnsaved && !window.confirm("Hay cheques sin incorporar al comprobante. ¿Descartar la carga?")) return;
    onClose();
  };
  return createPortal(
    <div className={s.overlay} onMouseDown={event => {
      if (event.target === event.currentTarget && queued.length === 0) cancel();
    }}>
      <section className={s.dialog} role="dialog" aria-modal="true" aria-labelledby={formId + "-title"}>
        <div className={s.header}>
          <div className={s.icon}><Landmark size={18} /></div>
          <div>
            <h2 id={formId + "-title"}>{editing ? "Editar cheque" : "Agregar cheque"}</h2>
            <p>{isPayment ? "Cheque de la orden de pago" : "Cheque recibido del cliente"}{!editing ? " · carga por lote" : ""}</p>
          </div>
          <button className={s.close} type="button" onClick={cancel} aria-label="Cerrar carga de cheque"><X size={19} /></button>
        </div>
        <form onSubmit={queueAndContinue} noValidate>
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
              <div className={s.field}>
                <span>Banco *</span>
                <div className={s.bankSearch}>
                  <Search size={15} className={s.searchIcon} />
                  <input
                    value={draft.bank_name}
                    onChange={e => { change("bank_name", e.target.value); setBankFocused(true); }}
                    onFocus={() => setBankFocused(true)}
                    onBlur={() => setBankFocused(false)}
                    placeholder="Buscar banco por nombre o CUIT"
                    aria-label="Buscar banco por nombre o CUIT"
                    autoComplete="off"
                    autoFocus
                  />
                  {bankFocused && bankMatches.length > 0 && (
                    <div className={s.bankSuggestions} role="listbox">
                      {bankMatches.map(bank => (
                        <button key={bank.name} type="button" role="option"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => { change("bank_name", bank.name); setBankFocused(false); }}
                        >
                          <strong>{bank.name}</strong>
                          {bank.tax_id && <small>CUIT {bank.tax_id}</small>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <label className={s.field}>
                <span>Número de cheque *</span>
                <input ref={numberRef} value={draft.reference_number} onChange={e => change("reference_number", e.target.value)} placeholder="Número / referencia" />
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
            {!editing && queued.length > 0 && (
              <div className={s.batchPanel}>
                <div className={s.batchHeader}>
                  <strong>{queued.length} {queued.length === 1 ? "cheque preparado" : "cheques preparados"}</strong>
                  <span>{draft.currency} {queuedTotal.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className={s.batchList}>
                  {queued.map((check, index) => (
                    <div className={s.batchRow} key={check.draftKey}>
                      <span className={s.batchIndex}>{index + 1}</span>
                      <div className={s.batchDetails}>
                        <strong>{check.bank_name} · {check.reference_number}</strong>
                        <small>Vto. {check.due_date} · {check.currency} {Number(check.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</small>
                      </div>
                      <button type="button" className={s.batchEdit} onClick={() => restoreQueued(check.draftKey)}>Editar</button>
                      <button type="button" className={s.batchRemove} onClick={() => setQueued(previous => previous.filter(item => item.draftKey !== check.draftKey))} aria-label={"Quitar cheque " + check.reference_number}><Trash2 size={15} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {error && <div className={s.error} role="alert">{error}</div>}
            {!editing && <p className={s.bankHint}>Los bancos se administran en Configuración → Bancos. Podés buscarlos por nombre o CUIT.</p>}
          </div>
          <div className={s.footer}>
            <button type="button" className={s.cancel} onClick={cancel}>Cancelar</button>
            {editing ? (
              <button type="submit" className={s.confirm}><Check size={16} /> Guardar cambios</button>
            ) : (
              <>
                <button type="submit" className={s.next}><ArrowRight size={16} /> Agregar y siguiente</button>
                <button type="button" className={s.confirm} onClick={finalizeBatch}>
                  <Check size={16} /> Finalizar {queued.length > 0 ? "(" + queued.length + ")" : ""}
                </button>
              </>
            )}
          </div>
        </form>
      </section>
    </div>,
    document.body
  );
}
