/**
 * OrdenVentaStandalonePage.jsx
 *
 * Página standalone para Nueva Orden de Venta / Editar Orden de Venta.
 * Lee el parámetro `id` de la URL si se quiere editar una existente.
 * Compatible con window.open() — no depende de Electron.
 */
import { useSearchParams, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import SalesOrderForm from "./SalesOrderForm";
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

export default function OrdenVentaStandalonePage() {
  const [searchParams] = useSearchParams();
  const { id: pathId } = useParams();
  const id = pathId || searchParams.get("id");
  const mode = id ? "edit" : "new";

  return (
    <StandaloneGuard>
      <SalesOrderForm
        mode={mode}
        id={id || null}
        isStandalone={true}
      />
    </StandaloneGuard>
  );
}
