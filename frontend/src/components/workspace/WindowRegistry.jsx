// Avoid circular dependencies by using a registry
import SalesOrderForm from "../../modules/sales/SalesOrderForm";
import GrainSettlementModal from "../../modules/inventory/grains/GrainSettlementModal";
import SalesOrdersPage from "../../modules/sales/SalesOrdersPage";
import ProfilePage from "../../modules/config/ProfilePage";
import UsersManager from "../../modules/auth/UsersManager";
import AuditLogsPage from "../../modules/auth/AuditLogsPage";
import DeliveryNotesPage from "../../modules/sales/DeliveryNotesPage";
import DeliveryNoteForm from "../../modules/sales/DeliveryNoteForm";
import InvoiceForm from "../../modules/sales/InvoiceForm";
import ArticlesManager from "../../modules/inventory/articles/ArticlesManager";
import EntitiesManager from "../../modules/entities/EntitiesManager";
import SaleConditionsPage from "../../modules/sales/SaleConditionsPage";
import WarehousesPage from "../../modules/inventory/WarehousesPage";
import PosConfigPage from "../../modules/config/PosConfigPage";
import SystemConfigPage from "../../modules/config/SystemConfigPage";
import SimpleConfigPage from "../../modules/config/SimpleConfigPage";
import BankConfigPage from "../../modules/config/BankConfigPage";
import PdfViewer from "./PdfViewer";
import PurchaseOrderForm from "../../modules/purchases/PurchaseOrderForm";
import LedgerPage from "../../modules/reports/LedgerPage";
import ReceiptForm from "../../modules/finance/ReceiptForm";
import ReceiptsPage from "../../modules/finance/ReceiptsPage";
import StatementPage from "../../modules/reports/StatementPage";
import BalancesPage from "../../modules/reports/BalancesPage";
import FleetPage from "../../modules/fleet/FleetPage";
import ExpenseClaimForm from "../../modules/finance/ExpenseClaimForm";
import CommissionReport from "../../modules/sales/CommissionReport";
import ApplicationManager from "../../modules/finance/ApplicationManager";
import EntityDashboard from "../../modules/entities/EntityDashboard";
import JournalPage from "../../modules/reports/JournalPage";
import AccountReportPage from "../../modules/reports/AccountReportPage";
import TrialBalancePage from "../../modules/reports/TrialBalancePage";
import LedgerSettingsPage from "../../modules/config/LedgerSettingsPage";
import FarmsPage from "../../modules/field/FarmsPage";
import LotsPage from "../../modules/field/LotsPage";
import MachineryPage from "../../modules/field/MachineryPage";
import ActivitiesPage from "../../modules/field/ActivitiesPage";
import FieldDashboardPage from "../../modules/field/FieldDashboardPage";

// Wrappers might be needed if standard components expect different props or layout
// But for now direct mapping
export const registry = {
  "commission-report": CommissionReport,
  "application-manager": ApplicationManager,
  // Forms
  "sales-order": SalesOrderForm,
  "purchase-order": PurchaseOrderForm,
  "delivery-note": DeliveryNoteForm,
  "articles-manager": ArticlesManager,
  "entities-manager": EntitiesManager,
  "sale-conditions": SaleConditionsPage,
  "warehouses-manager": WarehousesPage,
  "pos-config": PosConfigPage,
  "simple-config": SimpleConfigPage,
  "bank-config": BankConfigPage,
  "system-config": SystemConfigPage,
  "ledger-manager": LedgerPage,
  "journal-page": JournalPage,
  "account-report": AccountReportPage,
  "trial-balance": TrialBalancePage,
  "ledger-settings": LedgerSettingsPage,
  "user-profile": ProfilePage,
  "users-manager": UsersManager,
  "audit-logs": AuditLogsPage,
  "fleet-manager": FleetPage,


  // Lists
  "sales-order-list": SalesOrdersPage,
  "delivery-note-list": DeliveryNotesPage,
  "invoice-form": InvoiceForm,
  "debit-note-form": (props) => (
    <InvoiceForm {...props} initialDocType="DEBIT_NOTE" />
  ),
  "credit-note-form": (props) => (
    <InvoiceForm {...props} initialDocType="CREDIT_NOTE" />
  ),
  "purchase-invoice-form": (props) => (
    <InvoiceForm {...props} context="purchases" />
  ),
  "receipt-form": ReceiptForm,
  "receipt-list": ReceiptsPage,
  "statement-page": StatementPage,
  "balances-report": BalancesPage,
  "pdf-viewer": PdfViewer,
  "expense-claim-form": ExpenseClaimForm,
  "entity-dashboard": EntityDashboard,
  "grain-settlement": GrainSettlementModal,
  "farms-manager": FarmsPage,
  "lots-manager": LotsPage,
  "machinery-manager": MachineryPage,
  "activities-manager": ActivitiesPage,
  "field-dashboard": FieldDashboardPage,
};
