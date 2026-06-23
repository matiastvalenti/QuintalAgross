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
import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { AuthProvider } from "../../context/AuthContext";
import { WindowProvider } from "../../context/WindowContext";
import { CostCenterProvider } from "../../context/CostCenterContext";
import { ToastProvider } from "../../context/ToastContext";

export default function StandaloneLayout() {
  useEffect(() => {
    document.body.classList.add("standalone-document-body");
    return () => document.body.classList.remove("standalone-document-body");
  }, []);
  return (
    <CostCenterProvider>
      <AuthProvider>
        <WindowProvider>
          <ToastProvider>
            <div
              style={{
                width: "100vw",
                height: "fit-content",
                maxHeight: "100vh",
                overflowY: "auto",
                overflowX: "hidden",
                background: "#fff",
                boxSizing: "border-box",
                display: "block",
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
