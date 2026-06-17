/**
 * NotaDebitoStandalonePage.jsx
 *
 * Página standalone para Nueva Nota de Débito / Editar Nota de Débito.
 *
 * Parámetros de URL soportados:
 *   ?id=ID              => edita nota de débito existente
 *   ?factura_id=ID      => crea nota de débito vinculada a una factura
 *   (ninguno)           => crea nota de débito directa
 *
 * Compatible con window.open() — no depende de Electron.
 */
import { useSearchParams, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import InvoiceForm from "./InvoiceForm";
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

export default function NotaDebitoStandalonePage() {
  const [searchParams] = useSearchParams();
  const { id: paramId } = useParams();

  // "id" puede venir por react-router (:id) o por queryString (?id=)
  const id = paramId || searchParams.get("id");
  const facturaId = searchParams.get("factura_id");

  return (
    <StandaloneGuard>
      <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "var(--bg-primary)" }}>
        <InvoiceForm
          id={id}
          initialSourceType={facturaId ? "invoice" : null}
          initialSourceId={facturaId}
          isStandalone={true}
          initialDocType="DEBIT_NOTE"
        />
      </div>
    </StandaloneGuard>
  );
}
