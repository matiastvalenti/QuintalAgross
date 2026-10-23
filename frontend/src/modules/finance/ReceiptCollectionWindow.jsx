import { useEffect, useState } from "react";
import { useWindow } from "../../context/WindowContext";
import api from "../../services/api";
import LoadingScreen from "../../components/ui/LoadingScreen";
import ReceiptCollectionForm from "./ReceiptCollectionForm";

/**
 * Mantiene el circuito completo de recibos dentro de una ventana del ERP,
 * sin redirigir el navegador al guardar, editar o consultar el comprobante.
 */
export default function ReceiptCollectionWindow({ mode = "new", id = null, windowId }) {
  const { closeWindow } = useWindow();
  const [currentMode, setCurrentMode] = useState(mode);
  const [receiptId, setReceiptId] = useState(id);
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!receiptId) {
      setReceipt(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");
    api.get(`/accounting/documents/${receiptId}`)
      .then(data => { if (active) setReceipt(data); })
      .catch(err => {
        if (active) setError(err?.message || "No se pudo cargar el recibo.");
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [receiptId, currentMode]);

  const close = () => closeWindow(windowId);
  const handleSaved = (savedId) => {
    setReceipt(null);
    setLoading(true);
    setReceiptId(savedId);
    setCurrentMode("view");
    window.dispatchEvent(new Event("receipt-changed"));
    window.dispatchEvent(new Event("account-changed"));
  };

  if (loading) return <LoadingScreen message="Cargando recibo..." />;
  if (error) {
    return (
      <div style={{ padding: 24, color: "var(--text-primary)" }}>
        <h3>No se pudo abrir el recibo</h3>
        <p>{error}</p>
        <button type="button" onClick={close}>Cerrar</button>
      </div>
    );
  }

  return (
    <ReceiptCollectionForm
      key={`${receiptId || "new"}-${currentMode}`}
      mode={currentMode}
      source="manual"
      initialData={receipt}
      onClose={close}
      onModeChange={setCurrentMode}
      onSaved={handleSaved}
    />
  );
}
