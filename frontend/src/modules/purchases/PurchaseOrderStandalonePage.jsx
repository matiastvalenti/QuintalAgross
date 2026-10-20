/**
 * PurchaseOrderStandalonePage.jsx
 *
 * Página standalone para Nueva Orden de Compra / Editar Orden de Compra.
 */
import { useSearchParams, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import PurchaseOrderForm from "./PurchaseOrderForm";
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

export default function PurchaseOrderStandalonePage() {
  const [searchParams] = useSearchParams();
  const { id: pathId } = useParams();
  const id = pathId || searchParams.get("id");
  const mode = id ? "edit" : "new";

  return (
    <StandaloneGuard>
      <PurchaseOrderForm
        mode={mode}
        id={id || null}
        isStandalone={true}
      />
    </StandaloneGuard>
  );
}
