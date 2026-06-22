/**
 * StatementStandalonePage.jsx
 *
 * Página standalone para Resumen de Cuenta.
 */
import { useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import StatementPage from "../../modules/reports/StatementPage";
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

export default function StatementStandalonePage() {
  const { entityId } = useParams();

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
        <StatementPage
          entityId={entityId || null}
          isStandalone={true}
        />
      </div>
    </StandaloneGuard>
  );
}
