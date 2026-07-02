/**
 * FacturaStandalonePage.jsx
 *
 * Página standalone para Nueva Factura / Editar Factura.
 *
 * Parámetros de URL soportados:
 *   ?id=ID              → edita factura existente
 *   ?remito_id=ID       → crea factura vinculada a un remito
 *   ?ov_id=ID           → crea factura vinculada a una OV
 *   (ninguno)           → crea factura directa
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

export default function FacturaStandalonePage() {
  const [searchParams] = useSearchParams();
  const { id: pathId } = useParams();
  const id = pathId || searchParams.get("id");
  const remitoId = searchParams.get("remito_id") || searchParams.get("source_delivery_note_id");
  const ovId = searchParams.get("ov_id");
  const draftId = searchParams.get("draft_id");
  const entityId = searchParams.get("entity_id");

  let initialSourceType = remitoId ? "delivery-note" : ovId ? "sales-order" : null;
  let initialSourceId = remitoId || ovId || null;

  if (draftId) {
    console.log("FacturaStandalonePage: draft_id =", draftId);
    const draftStr = localStorage.getItem(`invoice_draft_${draftId}`);
    if (draftStr) {
      const draft = JSON.parse(draftStr);
      console.log("FacturaStandalonePage: draft recuperado =", draft);
      initialSourceType = draft.sourceType || initialSourceType;
      initialSourceId = draft.deliveryNoteId || draft.salesOrderId || draft.ovId || null;
    } else {
      console.warn("FacturaStandalonePage: draft_id presente pero no encontrado en localStorage");
    }
  }

  // Determina el modo y los parámetros de origen
  const mode = id ? "edit" : "new";
  
  // Extraer las líneas preseleccionadas si vinieron por la URL
  const selectedLinesParam = searchParams.get("lines");
  const preselectedLines = selectedLinesParam ? selectedLinesParam.split(',').map(Number) : null;

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
        <InvoiceForm
          mode={mode}
          id={id || null}
          initialSourceType={initialSourceType}
          initialSourceId={initialSourceId}
          initialEntityId={entityId}
          draftId={draftId}
          preselectedLines={preselectedLines}
          isStandalone={true}
        />
      </div>
    </StandaloneGuard>
  );
}
