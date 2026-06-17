/**
 * StandaloneLayout.jsx
 *
 * Layout mínimo para formularios independientes abiertos con window.open().
 * Sin sidebar, sin navbar, sin dashboard.
 * Solo ocupa 100vw × 100vh.
 *
 * Incluye todos los providers necesarios para que los formularios funcionen
 * de forma completamente autónoma (auth, toast, cost-center, window-context).
 */
import { Outlet } from "react-router-dom";
import { AuthProvider } from "../../context/AuthContext";
import { WindowProvider } from "../../context/WindowContext";
import { CostCenterProvider } from "../../context/CostCenterContext";
import { ToastProvider } from "../../context/ToastContext";

export default function StandaloneLayout() {
  return (
    <CostCenterProvider>
      <AuthProvider>
        <WindowProvider>
          <ToastProvider>
            <div
              style={{
                width: "100vw",
                height: "100vh",
                overflow: "auto",
                background: "#fff",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Outlet />
            </div>
          </ToastProvider>
        </WindowProvider>
      </AuthProvider>
    </CostCenterProvider>
  );
}
