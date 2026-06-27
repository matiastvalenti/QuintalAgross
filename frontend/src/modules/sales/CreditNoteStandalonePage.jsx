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

export default function CreditNoteStandalonePage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const initialSourceId = searchParams.get('factura_id');
  const initialSourceType = initialSourceId ? 'invoice' : null;

  return (
    <StandaloneGuard>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
        <InvoiceForm 
          mode={id ? "edit" : "new"}
          id={id} 
          isStandalone={true} 
          initialDocType="CREDIT_NOTE"
          initialSourceType={initialSourceType}
          initialSourceId={initialSourceId}
        />
      </div>
    </StandaloneGuard>
  );
}
