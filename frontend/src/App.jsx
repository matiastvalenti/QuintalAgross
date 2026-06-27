import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
} from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import StandaloneLayout from "./components/layout/StandaloneLayout";

// Pages
import Dashboard from "./modules/dashboard/Dashboard";
import CRMDashboard from "./modules/dashboard/CRMDashboard";
import SalesOrdersPage from "./modules/sales/SalesOrdersPage";
import InvoicesPage from "./modules/sales/InvoicesPage";
import DeliveryNotesPage from "./modules/sales/DeliveryNotesPage";
import DebitNotesPage from "./modules/sales/DebitNotesPage";
import CreditNotesPage from "./modules/sales/CreditNotesPage";
import PlaceholderPage from "./modules/common/PlaceholderPage";
import PurchaseOrdersPage from "./modules/purchases/PurchaseOrdersPage";
import PurchaseInvoicesPage from "./modules/purchases/PurchaseInvoicesPage";
import PurchaseDeliveryNotesPage from "./modules/purchases/PurchaseDeliveryNotesPage";
import PurchaseDebitNotesPage from "./modules/purchases/PurchaseDebitNotesPage";
import PurchaseCreditNotesPage from "./modules/purchases/PurchaseCreditNotesPage";
import PriceComparisonPage from "./modules/purchases/PriceComparisonPage";
import ReceiptsPage from './modules/finance/ReceiptsPage';
import MoraManagement from './modules/finance/MoraManagement';
import FinancialCalendarPage from './modules/finance/FinancialCalendarPage';
import ChequesPage from "./modules/finance/ChequesPage";
import PaymentsPage from './modules/finance/PaymentsPage'; 
import CashBoxPage from './modules/finance/CashBoxPage';
import TrialBalancePage from './modules/reports/TrialBalancePage'; 
import LoadingScreen from './components/ui/LoadingScreen';
import ErrorPage from './modules/common/ErrorPage';

// Modules
import EntitiesManager from "./modules/entities/EntitiesManager";
import SaleConditionsPage from "./modules/sales/SaleConditionsPage";
import Accounts from "./modules/accounting/accounts_tmp/Accounts"; 
import ArticlesManager from "./modules/inventory/articles/ArticlesManager";
import CommissionReport from "./modules/sales/commissions/CommissionReport";
import SellerCommissionStandalone from "./modules/sales/commissions/SellerCommissionStandalone";
import WarehousesPage from "./modules/inventory/WarehousesPage";
import StockMovementsPage from "./modules/inventory/StockMovementsPage";
import InventoryDashboard from "./modules/inventory/InventoryDashboard";
import ExpenseClaimsPage from "./modules/finance/ExpenseClaimsPage";
import TasksPage from "./modules/tasks/TasksPage";
import AgeingReportPage from "./modules/reports/AgeingReportPage";
import LedgerSettingsPage from "./modules/config/LedgerSettingsPage";
import NotificationsPage from "./modules/tasks/NotificationsPage";
import ProfilePage from "./modules/config/ProfilePage";
import BalancesPage from "./modules/reports/BalancesPage";
import StatementPage from "./modules/reports/StatementPage";
import ApplicationManager from "./modules/finance/ApplicationManager";
import TaxReportsPage from "./modules/reports/TaxReportsPage";
import GrainSettlementsPage from "./modules/inventory/grains/GrainSettlementsPage";
import GrainMovementsPage from "./modules/inventory/grains/GrainMovementsPage";
import GrainStockPage from "./modules/inventory/grains/GrainStockPage";
import GrainContractsPage from "./modules/inventory/grains/GrainContractsPage";
import FarmsPage from "./modules/field/FarmsPage";
import LotsPage from "./modules/field/LotsPage";
import MachineryPage from "./modules/field/MachineryPage";
import ActivitiesPage from "./modules/field/ActivitiesPage";
import FieldDashboardPage from "./modules/field/FieldDashboardPage";
import TaxDashboard from "./modules/accounting/TaxDashboard";
import Accounting from "./modules/accounting/Accounting"; 
import SystemConfigPage from "./modules/config/SystemConfigPage";

// Auth
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CostCenterProvider } from "./context/CostCenterContext";
import { SearchProvider } from "./context/SearchContext";
import LoginPage from "./modules/auth/LoginPage";
import ForgotPasswordPage from "./modules/auth/ForgotPasswordPage";
import ResetPasswordPage from "./modules/auth/ResetPasswordPage";
import { useEffect, Suspense, lazy } from "react";
import { OfflineBanner } from "./components/OfflineBanner";
import { WindowProvider, useWindow } from "./context/WindowContext";

// Standalone pages — lazy loaded para optimizar el bundle principal
const OrdenVentaStandalonePage = lazy(() => import("./modules/sales/OrdenVentaStandalonePage"));
const RemitoStandalonePage = lazy(() => import("./modules/sales/RemitoStandalonePage"));
const FacturaStandalonePage = lazy(() => import("./modules/sales/FacturaStandalonePage"));
const InvoiceCollectionWrapper = lazy(() => import("./modules/sales/InvoiceCollectionWrapper"));
const NotaDebitoStandalonePage = lazy(() => import("./modules/sales/NotaDebitoStandalonePage"));
const CreditNoteStandalonePage = lazy(() => import("./modules/sales/CreditNoteStandalonePage"));
const PurchaseOrderStandalonePage = lazy(() => import("./modules/purchases/PurchaseOrderStandalonePage"));
const PurchaseDeliveryNoteStandalonePage = lazy(() => import("./modules/purchases/PurchaseDeliveryNoteStandalonePage"));
const PurchaseInvoiceStandalonePage = lazy(() => import("./modules/purchases/PurchaseInvoiceStandalonePage"));
const PurchaseDebitNoteStandalonePage = lazy(() => import("./modules/purchases/PurchaseDebitNoteStandalonePage"));
const PurchaseCreditNoteStandalonePage = lazy(() => import("./modules/purchases/PurchaseCreditNoteStandalonePage"));
const ReceiptStandalonePage = lazy(() => import("./modules/finance/ReceiptStandalonePage"));
const ExpenseClaimStandalonePage = lazy(() => import("./modules/finance/ExpenseClaimStandalonePage"));
const StatementStandalonePage = lazy(() => import("./modules/reports/StatementStandalonePage"));
const EntitiesManagerStandalonePage = lazy(() => import("./modules/entities/EntitiesManagerStandalonePage"));
const EntityDashboardStandalonePage = lazy(() => import("./modules/entities/EntityDashboardStandalonePage"));
const UsersManagerStandalonePage = lazy(() => import("./modules/auth/UsersManagerStandalonePage"));
const AuditLogsStandalonePage = lazy(() => import("./modules/auth/AuditLogsStandalonePage"));
const FleetStandalonePage = lazy(() => import("./modules/fleet/FleetStandalonePage"));

// Legacy standalone (backwards compat)
const SalesOrderStandalonePage = lazy(() => import("./modules/sales/SalesOrderStandalonePage"));
const DeliveryNoteStandalonePage = lazy(() => import("./modules/sales/DeliveryNoteStandalonePage"));

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen message="Iniciando sesión..." />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

// ── Strict Window Route Helper ──
const OpenWindowRedirect = ({ type, props, options, to }) => {
  const { openWindow } = useWindow();
  const navigate = useNavigate();

  useEffect(() => {
    openWindow(type, props, options);
  }, []);

  return <Navigate to={to} replace />;
};

console.time('3. App.jsx Render');
export default function App() {
  return (
    <CostCenterProvider>
      <SearchProvider>
        <AuthProvider>
          <WindowProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <OfflineBanner />
          <Routes>
            {/* ── Rutas públicas ── */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/error" element={<ErrorPage />} />

            {/* ── Rutas Standalone — formularios independientes abiertos con window.open() ── */}
            {/* Estas rutas no tienen sidebar, navbar ni dashboard. */}
            <Route element={<Suspense fallback={<LoadingScreen message="Cargando formulario..." />}><StandaloneLayout /></Suspense>}>
              {/* Órdenes de Venta */}
              <Route path="/standalone/ordenes-venta/nueva" element={<OrdenVentaStandalonePage />} />
              <Route path="/standalone/ordenes-venta/:id" element={<OrdenVentaStandalonePage />} />

              {/* Remitos */}
              <Route path="/standalone/remitos/nuevo" element={<RemitoStandalonePage />} />
              <Route path="/standalone/remitos/:id" element={<RemitoStandalonePage />} />

              {/* Facturas */}
              <Route path="/standalone/facturas/nueva" element={<FacturaStandalonePage />} />
              <Route path="/standalone/facturas/:id" element={<FacturaStandalonePage />} />
              
              {/* Cobros de Factura */}
              <Route path="/standalone/cobros/factura/:id" element={<InvoiceCollectionWrapper />} />
              <Route path="/standalone/cobros/recibo/:id" element={<InvoiceCollectionWrapper />} />

              {/* Notas de Débito */}
              <Route path="/standalone/notas-debito/nueva" element={<NotaDebitoStandalonePage />} />
              <Route path="/standalone/notas-debito/:id" element={<NotaDebitoStandalonePage />} />

              {/* Notas de Crédito */}
              <Route path="/standalone/notas-credito/nueva" element={<CreditNoteStandalonePage />} />
              <Route path="/standalone/notas-credito/:id" element={<CreditNoteStandalonePage />} />

              {/* Órdenes de Compra */}
              <Route path="/standalone/ordenes-compra/nueva" element={<PurchaseOrderStandalonePage />} />
              <Route path="/standalone/ordenes-compra/:id" element={<PurchaseOrderStandalonePage />} />

              {/* Remitos de Entrada */}
              <Route path="/standalone/remitos-entrada/nuevo" element={<PurchaseDeliveryNoteStandalonePage />} />
              <Route path="/standalone/remitos-entrada/:id" element={<PurchaseDeliveryNoteStandalonePage />} />

              {/* Facturas de Compra */}
              <Route path="/standalone/facturas-compra/nueva" element={<PurchaseInvoiceStandalonePage />} />
              <Route path="/standalone/facturas-compra/:id" element={<PurchaseInvoiceStandalonePage />} />

              {/* Notas de Débito de Compra */}
              <Route path="/standalone/notas-debito-compra/nueva" element={<PurchaseDebitNoteStandalonePage />} />
              <Route path="/standalone/notas-debito-compra/:id" element={<PurchaseDebitNoteStandalonePage />} />

              {/* Notas de Crédito de Compra */}
              <Route path="/standalone/notas-credito-compra/nueva" element={<PurchaseCreditNoteStandalonePage />} />
              <Route path="/standalone/notas-credito-compra/:id" element={<PurchaseCreditNoteStandalonePage />} />
              
              {/* Comisiones Standalone */}
              <Route path="/standalone/comisiones/vendedor/:id" element={<SellerCommissionStandalone />} />            
              
              {/* Recibos y Pagos */}
              <Route path="/standalone/recibos/nuevo" element={<ReceiptStandalonePage />} />
              <Route path="/standalone/recibos/:id" element={<ReceiptStandalonePage />} />
              <Route path="/standalone/pagos/nuevo" element={<ReceiptStandalonePage />} />
              <Route path="/standalone/pagos/:id" element={<ReceiptStandalonePage />} />
              
              {/* Rendiciones de Gastos */}
              <Route path="/standalone/gastos/nuevo" element={<ExpenseClaimStandalonePage />} />
              <Route path="/standalone/gastos/:id" element={<ExpenseClaimStandalonePage />} />

              {/* Resumen de Cuenta */}
              <Route path="/standalone/resumen-cuenta" element={<StatementStandalonePage />} />
              <Route path="/standalone/resumen-cuenta/:entityId" element={<StatementStandalonePage />} />

              {/* Entidades y CRM */}
              <Route path="/standalone/entidades" element={<EntitiesManagerStandalonePage />} />
              <Route path="/standalone/crm/entidad/:id" element={<EntityDashboardStandalonePage />} />

              {/* Auth y Auditoría */}
              <Route path="/standalone/usuarios" element={<UsersManagerStandalonePage />} />
              <Route path="/standalone/auditoria" element={<AuditLogsStandalonePage />} />

              {/* Flota */}
              <Route path="/standalone/flota" element={<FleetStandalonePage />} />
            </Route>

            {/* ── Rutas legacy (backwards compat) — redirigen a /standalone/ ── */}
            <Route path="/ventas/orden-venta/nueva" element={<Suspense fallback={null}><SalesOrderStandalonePage /></Suspense>} />
            <Route path="/ventas/remitos/nuevo" element={<Suspense fallback={null}><DeliveryNoteStandalonePage /></Suspense>} />

            {/* ── Rutas principales dentro de AppShell (con sidebar + navbar) ── */}
            <Route path="/*" element={
              <ProtectedRoute>
                <AppShell>
                  <Routes>
                    {/* Dashboard */}
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/crm/dashboard" element={<CRMDashboard />} />
                    <Route path="/dashboard" element={<Navigate to="/" replace />} />

                    {/* Ventas */}
                    <Route path="/ventas/orden-venta" element={<SalesOrdersPage />} />
                    <Route path="/ventas/remitos" element={<DeliveryNotesPage />} />
                    <Route path="/ventas/facturas" element={<InvoicesPage />} />
                    <Route path="/ventas/notas-debito" element={<DebitNotesPage />} />
                    <Route path="/ventas/notas-credito" element={<CreditNotesPage />} />
                    <Route path="/ventas/comisiones" element={<CommissionReport />} />

                    {/* Compras */}
                    <Route path="/compras/orden-compra" element={<PurchaseOrdersPage />} />
                    <Route path="/compras/comparativa-precios" element={<PriceComparisonPage />} />
                    <Route path="/compras/remitos" element={<PurchaseDeliveryNotesPage />} />
                    <Route path="/compras/facturas" element={<PurchaseInvoicesPage />} />
                    <Route path="/compras/notas-debito" element={<PurchaseDebitNotesPage />} />
                    <Route path="/compras/notas-credito" element={<PurchaseCreditNotesPage />} />

                    {/* Cereales */}
                    <Route path="/cereales/liquidaciones-primarias" element={<GrainSettlementsPage type="PRIMARY" />} />
                    <Route path="/cereales/liquidaciones-secundarias" element={<GrainSettlementsPage type="SECONDARY" />} />
                    <Route path="/cereales/contratos" element={<GrainContractsPage />} />
                    <Route path="/cereales/movimientos" element={<GrainMovementsPage />} />
                    <Route path="/cereales/stock" element={<GrainStockPage />} />

                    {/* Campo */}
                    <Route path="/campo/establecimientos" element={<FarmsPage />} />
                    <Route path="/campo/lotes" element={<LotsPage />} />
                    <Route path="/campo/actividades" element={<ActivitiesPage />} />
                    <Route path="/campo/maquinaria" element={<MachineryPage />} />
                    <Route path="/campo/rentabilidad" element={<FieldDashboardPage />} />

                    {/* Inventario */}
                    <Route path="/inventario/articulos" element={<ArticlesManager />} />
                    <Route path="/inventario/dashboard" element={<InventoryDashboard />} />
                    <Route path="/inventario/productos" element={<Navigate to="/inventario/articulos" replace />} />
                    <Route path="/inventario/depositos" element={<WarehousesPage />} />
                    <Route path="/inventario/movimientos" element={<StockMovementsPage />} />

                    {/* Finanzas */}
                    <Route path="/finanzas/cajas" element={<CashBoxPage />} />
                    <Route path="/finanzas/cheques" element={<ChequesPage />} />
                    <Route path="/finanzas/recibos" element={<ReceiptsPage />} />
                    <Route path="/finanzas/pagos" element={<PaymentsPage />} />
                    <Route path="/finanzas/gastos" element={<ExpenseClaimsPage />} />
                    <Route path="/finanzas/aplicaciones" element={<ApplicationManager />} />
                    <Route path="/finanzas/antiguedad" element={<AgeingReportPage />} />
                    <Route path="/finanzas/mora" element={<MoraManagement />} />
                    <Route path="/finanzas/calendario" element={<FinancialCalendarPage />} />
                    <Route path="/finanzas/gestion-mora" element={<Navigate to="/finanzas/mora" replace />} />
                    <Route
                      path="/finanzas/recibos/new"
                      element={
                        <OpenWindowRedirect
                          type="receipt-form"
                          props={{ mode: "new" }}
                          options={{
                            title: "Nuevo Recibo",
                            singletonKey: "receipt-new",
                            width: 1100,
                            height: 800,
                          }}
                          to="/finanzas/recibos"
                        />
                      }
                    />

                    {/* Contabilidad */}
                    <Route path="/contabilidad/saldos" element={<BalancesPage />} />
                    <Route path="/contabilidad/cuenta-corriente" element={<StatementPage />} />
                    <Route path="/contabilidad/cuenta-corriente/:entityId" element={<StatementPageWrapper />} />
                    <Route path="/contabilidad/libro-diario" element={<Accounting />} />
                    <Route path="/contabilidad/iva" element={<TaxReportsPage />} />
                    <Route path="/contabilidad/impuestos" element={<TaxDashboard />} />

                    {/* Configuración */}
                    <Route path="/configuracion/entidades" element={<EntitiesManager />} />
                    <Route path="/configuracion/condiciones-venta" element={<SaleConditionsPage />} />
                    <Route path="/configuracion" element={<SystemConfigPage />} />

                    {/* Tareas y Planificación */}
                    <Route path="/planificacion" element={<TasksPage />} />
                    <Route path="/notificaciones" element={<NotificationsPage />} />
                    <Route path="/perfil" element={<ProfilePage />} />

                    {/* Catch all */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AppShell>
              </ProtectedRoute>
            } />
          </Routes>
          </BrowserRouter>
          </WindowProvider>
        </AuthProvider>
      </SearchProvider>
    </CostCenterProvider>
  );
}

// Wrapper for StatementPage with params
function StatementPageWrapper() {
  const { entityId } = useParams();
  return <StatementPage entityId={entityId} />;
}


