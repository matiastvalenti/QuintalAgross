/**
 * PurchaseCreditNoteStandalonePage.jsx
 *
 * Página standalone para Nueva Nota de Crédito de Compra / Editar Nota de Crédito de Compra.
 */
import { useSearchParams, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import PurchaseInvoiceForm from "./PurchaseInvoiceForm";
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

export default function PurchaseCreditNoteStandalonePage() {
  const [searchParams] = useSearchParams();
  const { id: paramId } = useParams();

  const id = paramId || searchParams.get("id");
  const facturaId = searchParams.get("factura_id");

  return (
    <StandaloneGuard>
      <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "var(--bg-primary)" }}>
        <PurchaseInvoiceForm
          mode={id ? "edit" : "new"}
          id={id}
          initialSourceType={facturaId ? "invoice" : null}
          initialSourceId={facturaId}
          isStandalone={true}
          initialDocType="PURCHASE_CREDIT_NOTE"
        />
      </div>
    </StandaloneGuard>
  );
}
