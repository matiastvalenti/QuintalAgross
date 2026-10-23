import React, { useEffect, useState } from "react";
import Modal from "../../components/ui/Modal";
import s from "./OrderEmailDialog.module.css";

export default function OrderEmailDialog({
  open,
  onClose,
  endpoint,
  defaultRecipient = "",
  defaultSubject = "",
  onSent,
}) {
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("Adjuntamos la orden para su revisión.");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setRecipient(defaultRecipient || "");
    setSubject(defaultSubject || "");
    setMessage("Adjuntamos la orden para su revisión.");
    setError("");
  }, [open, defaultRecipient, defaultSubject]);

  const handleSend = async (event) => {
    event.preventDefault();
    if (sending) return;
    const address = recipient.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Ingresá un correo electrónico válido.");
      return;
    }

    setSending(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to_email: address,
          subject: subject.trim(),
          body: message.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replace(/\n/g, "<br/>"),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.detail === "string" ? data.detail : "No se pudo enviar el correo.");
      }
      onSent?.();
      onClose?.();
    } catch (sendError) {
      setError(sendError.message || "Error de conexión al enviar.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={sending ? undefined : onClose} title="Enviar orden por correo">
      <form className={s.form} onSubmit={handleSend}>
        <p className={s.hint}>Se adjuntará el PDF de esta orden. Revisá el destinatario antes de enviarlo.</p>
        <label className={s.field}>Destinatario
          <input type="email" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="proveedor@empresa.com" autoComplete="email" required disabled={sending} />
        </label>
        <label className={s.field}>Asunto
          <input type="text" value={subject} onChange={e => setSubject(e.target.value)} required disabled={sending} />
        </label>
        <label className={s.field}>Mensaje
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} disabled={sending} />
        </label>
        {error && <p className={s.error} role="alert">{error}</p>}
        <div className={s.actions}>
          <button type="button" className={s.cancel} onClick={onClose} disabled={sending}>Cancelar</button>
          <button type="submit" className={s.submit} disabled={sending}>{sending ? "Enviando..." : "Enviar correo"}</button>
        </div>
      </form>
    </Modal>
  );
}
