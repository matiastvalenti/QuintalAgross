import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Landmark, X, Search, Check, Trash2, ArrowRight } from "lucide-react";
import s from "./ChequeEntryDialog.module.css";
import api from "../../../services/api";

const localToday = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

const buildDraft = (initialCheck, currency, suggestedAmount, isPayment = false) => ({
  id: initialCheck?.id ?? null,
  type: "CHECK",
  check_type: initialCheck?.check_type || "FISICO",
  check_origin: initialCheck?.check_origin || (isPayment ? "PROPIO" : "TERCERO"),
  source_cheque_id: initialCheck?.source_cheque_id || null,
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
  existingChecks = [],
  isPayment = false,
  onClose,
  onSave,
}) {
  const formId = useId();
  const [draft, setDraft] = useState(() => buildDraft(initialCheck, currency, suggestedAmount, isPayment));
  const [error, setError] = useState("");
  const [queued, setQueued] = useState([]);
  const [bankFocused, setBankFocused] = useState(false);
  const [portfolioMatches, setPortfolioMatches] = useState([]);
  const [searchingPortfolio, setSearchingPortfolio] = useState(false);
  const numberRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setDraft(buildDraft(initialCheck, currency, suggestedAmount, isPayment));
    setQueued([]);
    setPortfolioMatches([]);
    setBankFocused(false);
    setError("");
  }, [open, initialCheck?.id, currency, suggestedAmount, isPayment]);

  if (!open || typeof document === "undefined") return null;

  const change = (field, value) => {
    const changesLinkedCheck = ["check_origin", "bank_name", "reference_number", "amount", "drawer_cuit"].includes(field);
    setDraft(previous => ({ ...previous, [field]: value, ...(changesLinkedCheck ? { source_cheque_id: null } : {}) }));
    if (changesLinkedCheck) setPortfolioMatches([]);
    if (error) setError("");
  };

  const searchPortfolio = async () => {
    if (!draft.bank_name.trim() || !draft.reference_number.trim()) {
      setError("Indicá banco y número para buscar el cheque de terceros en cartera.");
      return;
    }
    setSearchingPortfolio(true);
    setError("");
    try {
      const results = await api.get("/cheques/", {
        params: { status: "EN_CARTERA", banco: draft.bank_name.trim(), nro_cheque: draft.reference_number.trim() }
      });
      const exact = (Array.isArray(results) ? results : []).filter(check =>
        String(check.banco || "").trim().toLocaleLowerCase("es-AR") === draft.bank_name.trim().toLocaleLowerCase("es-AR") &&
        String(check.nro_cheque || "").trim() === draft.reference_number.trim()
      );
      setPortfolioMatches(exact);
      if (!exact.length) setError("No se encontró ese cheque disponible en cartera. Revisá el banco y el número.");
    } catch (err) {
      setError(err?.message || "No se pudo consultar la cartera de cheques.");
    } finally {
      setSearchingPortfolio(false);
    }
  };

  const choosePortfolioCheque = check => {
    const foundCurrency = String(check.moneda || currency).toUpperCase();
    if (foundCurrency !== currency) {
      setError("La moneda del cheque seleccionado no coincide con la de esta orden de pago.");
      return;
    }
    setDraft(previous => ({
      ...previous,
      source_cheque_id: check.id,
      check_origin: "TERCERO",
      bank_name: check.banco,
      reference_number: check.nro_cheque,
      amount: Number(check.importe),
      currency: foundCurrency,
      check_type: check.tipo || "FISICO",
      issue_date: check.f_emision || previous.issue_date,
      due_date: check.f_vencimiento || check.f_pago || previous.due_date,
      drawer_name: check.librador || previous.drawer_name,
      drawer_cuit: check.cuit_emisor || previous.drawer_cuit,
    }));
    setPortfolioMatches([]);
    setError("");
  };

  const editing = initialCheck?.id != null;
  const bankRecords = Array.isArray(banks)
    ? banks.filter(bank => typeof bank === "string" || bank.active !== false).map(bank => typeof bank === "string" ? { name: bank, tax_id: "" } : {
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
    const validBank = bankRecords.find(bank =>
      bank.name.trim().toLocaleLowerCase("es-AR") === draft.bank_name.trim().toLocaleLowerCase("es-AR"));
    if (!validBank && (!editing || draft.bank_name.trim() !== initialCheck?.bank_name?.trim())) {
      setError(bankRecords.length
        ? "Seleccioná un banco cargado en Configuración → Bancos."
        : "Primero cargá los bancos en Configuración → Bancos.");
      return null;
    }
    if (!draft.reference_number.trim()) { setError("Indicá el número de cheque."); return null; }
    if (!Number.isFinite(amount) || amount <= 0) { setError("El importe debe ser mayor a cero."); return null; }
    if (!draft.issue_date || !draft.due_date) { setError("Completá las fechas de emisión y vencimiento."); return null; }
    if (draft.due_date < draft.issue_date) { setError("El vencimiento no puede ser anterior a la emisión."); return null; }
    const duplicate = [...queued, ...existingChecks.filter(check => !editing || check.id !== initialCheck?.id)].some(check => {
      const sameBank = String(check.bank_name || "").trim().toLocaleLowerCase("es-AR") === draft.bank_name.trim().toLocaleLowerCase("es-AR");
      const sameNumber = String(check.reference_number || "").trim() === draft.reference_number.trim();
      const existingCuit = String(check.drawer_cuit || check.issuer_tax_id || "").replace(/\D/g, "");
      const enteredCuit = String(draft.drawer_cuit || "").replace(/\D/g, "");
      return sameBank && sameNumber && (!existingCuit || !enteredCuit || existingCuit === enteredCuit);
    });
    if (duplicate) { setError("Ese número de cheque y banco ya están incluidos en este comprobante."); return null; }
    const drawerCuit = draft.drawer_cuit.replace(/\D/g, "");
    if (drawerCuit && drawerCuit.length !== 11) {
      setError("El CUIT del librador debe tener 11 dígitos o quedar vacío.");
      return null;
    }
    if (isPayment && draft.check_origin === "PROPIO" && drawerCuit.length !== 11) {
      setError("Para emitir un cheque propio, completá el CUIT del librador (11 dígitos).");
      return null;
    }
    if (isPayment && draft.check_origin === "TERCERO" && !draft.source_cheque_id) {
      setError("Seleccioná el cheque de terceros desde la cartera antes de continuar.");
      return null;
    }
    return {
      ...draft,
      amount,
      bank_name: validBank?.name || draft.bank_name.trim(),
      reference_number: draft.reference_number.trim(),
      drawer_name: draft.drawer_name.trim(),
      drawer_cuit: drawerCuit,
      issuer_tax_id: drawerCuit,
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
    setDraft(previous => ({
      ...previous, id: null, reference_number: "", amount: "", source_cheque_id: null,
      ...(previous.check_origin === "TERCERO" ? { drawer_name: "", drawer_cuit: "", issuer_tax_id: "" } : {})
    }));
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
              {isPayment && (
                <label className={s.field}>
                  <span>Origen del cheque</span>
                  <select value={draft.check_origin} onChange={e => change("check_origin", e.target.value)} aria-label="Origen del cheque">
                    <option value="PROPIO">Cheque propio emitido</option>
                    <option value="TERCERO">Cheque de terceros en cartera</option>
                  </select>
                </label>
              )}
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
            {isPayment && draft.check_origin === "TERCERO" && (
              <div className={s.batchPanel}>
                <div className={s.batchHeader}>
                  <strong>Cheque de terceros</strong>
                  <button className={s.batchEdit} type="button" onClick={searchPortfolio} disabled={searchingPortfolio}>
                    {searchingPortfolio ? "Buscando..." : "Buscar en cartera"}
                  </button>
                </div>
                {draft.source_cheque_id && <p className={s.bankHint}>Cheque de cartera #{draft.source_cheque_id} seleccionado. Si cambiás el número o importe, debés volver a seleccionarlo.</p>}
                {portfolioMatches.length > 0 && (
                  <div className={s.batchList}>
                    {portfolioMatches.map(check => (
                      <div className={s.batchRow} key={check.id}>
                        <div className={s.batchDetails}>
                          <strong>{check.banco} · {check.nro_cheque}</strong>
                          <small>{check.moneda} {Number(check.importe).toLocaleString("es-AR", { minimumFractionDigits: 2 })} · Vto. {check.f_vencimiento || check.f_pago || "Sin fecha"} · CUIT {check.cuit_emisor || "s/d"}</small>
                        </div>
                        <button className={s.batchEdit} type="button" onClick={() => choosePortfolioCheque(check)}>Usar cheque</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
            {!editing && <p className={s.bankHint}>Elegí un banco existente de Configuración → Bancos. Buscá por nombre o CUIT; si no está, cargalo en Configuración antes de continuar.</p>}
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
