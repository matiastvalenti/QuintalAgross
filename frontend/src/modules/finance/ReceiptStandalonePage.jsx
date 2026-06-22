/**
 * ReceiptStandalonePage.jsx
 *
 * Página standalone para Recibos / Órdenes de Pago.
 */
import { useSearchParams, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import ReceiptForm from "./ReceiptForm";
import LoadingScreen from "../../components/ui/LoadingScreen";

function StandaloneGuard({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen message="Verificando sesión..." />;
  if (!user)
    return (
      <div
        style={{
          padding: 40,
          fontFamily: "system-ui, sans-serif",
          color: "#1e293b",
          textAlign: "center",
        }}
      >
        <h2>Sesión requerida</h2>
        <p>No hay sesión activa. Iniciá sesión desde la ventana principal.</p>
      </div>
    );
  return <>{children}</>;
}

export default function ReceiptStandalonePage() {
  const [searchParams] = useSearchParams();
  const { id: pathId } = useParams();
  
  // Parámetros soportados
  const id = pathId || searchParams.get("id");
  const draftId = searchParams.get("draft_id");
  const mode = id ? (searchParams.get("mode") || "view") : "new";
  const isPayment = searchParams.get("isPayment") === "true" || searchParams.get("context") === "payments";
  const entityId = searchParams.get("entityId");

  let initialPayments = null;
  if (draftId) {
    const draftStr = localStorage.getItem(`receipt_draft_${draftId}`);
    if (draftStr) {
      const draft = JSON.parse(draftStr);
      initialPayments = draft.initialPayments;
    }
  }

  return (
    <StandaloneGuard>
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <ReceiptForm
          mode={mode}
          id={id || null}
          isPayment={isPayment}
          initialEntityId={entityId}
          initialPayments={initialPayments}
          isStandalone={true}
        />
      </div>
    </StandaloneGuard>
  );
}
