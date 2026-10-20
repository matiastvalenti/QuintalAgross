/**
 * UsersManagerStandalonePage.jsx
 *
 * Página standalone para Gestión de Usuarios.
 */
import { useAuth } from "../../context/AuthContext";
import UsersManager from "../../modules/auth/UsersManager";
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

export default function UsersManagerStandalonePage() {
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
        <UsersManager
          isStandalone={true}
        />
      </div>
    </StandaloneGuard>
  );
}
