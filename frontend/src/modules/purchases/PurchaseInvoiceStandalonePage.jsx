/**
 * PurchaseInvoiceStandalonePage.jsx
 *
 * Página standalone para Nueva Factura de Compra / Editar Factura de Compra.
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

export default function PurchaseInvoiceStandalonePage() {
  const [searchParams] = useSearchParams();
  const { id: pathId } = useParams();
  const id = pathId || searchParams.get("id");
  const ocId = searchParams.get("oc_id"); // Changed ov_id to oc_id
  const remitoId = searchParams.get("remito_id"); // Added remito_id
  const draftId = searchParams.get("draft_id");

  let initialSourceType = ocId ? "purchase-order" : remitoId ? "delivery-note" : null; // Adapted source types
  let initialSourceId = ocId || remitoId || null; // Adapted source IDs

  if (draftId) {
    console.log("PurchaseInvoiceStandalonePage: draft_id =", draftId);
    const draftStr = localStorage.getItem(`purchase_invoice_draft_${draftId}`); // Changed invoice_draft_ to purchase_invoice_draft_
    if (draftStr) {
      const draft = JSON.parse(draftStr);
      console.log("PurchaseInvoiceStandalonePage: draft recuperado =", draft);
      initialSourceType = draft.sourceType;
      initialSourceId = draft.purchaseOrderId || draft.ocId || draft.remitoId || null; // Adapted source IDs
    } else {
      console.warn("PurchaseInvoiceStandalonePage: draft_id presente pero no encontrado en localStorage");
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
        <PurchaseInvoiceForm // Changed from InvoiceForm
          mode={mode}
          id={id || null}
          initialSourceType={initialSourceType}
          initialSourceId={initialSourceId}
          draftId={draftId}
          preselectedLines={preselectedLines}
          isStandalone={true}
        />
      </div>
    </StandaloneGuard>
  );
}
