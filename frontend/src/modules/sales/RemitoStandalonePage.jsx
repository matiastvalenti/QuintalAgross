/**
 * RemitoStandalonePage.jsx
 *
 * Página standalone para Nuevo Remito / Editar Remito.
 * 
 * Parámetros de URL soportados:
 *   ?ov_id=ID    → crea remito vinculado a una Orden de Venta
 *   ?id=ID       → edita un remito existente
 *   (ninguno)    → crea remito directo sin vinculación
 *
 * Compatible con window.open() — no depende de Electron.
 */
import { useSearchParams, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import DeliveryNoteForm from "./DeliveryNoteForm";
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

export default function RemitoStandalonePage() {
  const [searchParams] = useSearchParams();
  const ovId = searchParams.get("ov_id");
  const { id: pathId } = useParams();
  const id = pathId || searchParams.get("id");
  const mode = id ? "edit" : "new";

  return (
    <StandaloneGuard>
      {id ? (
        <DeliveryNoteForm
          mode="edit"
          id={id}
          isStandalone={true}
        />
      ) : ovId ? (
        <DeliveryNoteForm
          mode="new"
          ov_id={ovId}
          isStandalone={true}
          autoOpenSelector={false}
        />
      ) : (
        <DeliveryNoteForm
          mode="new"
          isStandalone={true}
          autoOpenSelector={false}
        />
      )}
    </StandaloneGuard>
  );
}
