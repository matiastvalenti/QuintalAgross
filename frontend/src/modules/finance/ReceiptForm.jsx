import React, { useState, useEffect, useMemo } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import Autocomplete from "../../components/ui/Autocomplete";
import Modal from "../../components/ui/Modal";
import Badge from "../../components/ui/Badge";
import { useWindow } from "../../context/WindowContext";
import { openEditFactura } from "../../utils/openStandaloneWindow";
import { useToast } from "../../context/ToastContext";
import { useCostCenter } from "../../context/CostCenterContext";
import api from "../../services/api";
import LoadingScreen from "../../components/ui/LoadingScreen";
import {
  Save,
  X,
  Plus,
  Trash2,
  Link2,
  Calendar,
  CreditCard,
  Banknote,
  Landmark,
  FileText,
  Tag,
  Search,
  Ban,
  Upload,
  Printer,
  Check,
  Mail,
  Layout as LayoutIcon,
} from "lucide-react";
import EntityDashboard from "../entities/EntityDashboard";
import s from "./ReceiptForm.module.css";
import t from "../../components/ui/Table.module.css";
import FxAdjustmentDocModal from "../accounting/FxAdjustmentDocModal";
import CheckInterestModal from "../accounting/CheckInterestModal";

export default function ReceiptForm({
  mode = "new",
  id: propId = null,
  receiptId = null,
  windowId,
  initialEntityId = null,
  initialEntity = null,
  initialApplications = null,
  initialPayments = null,
  initialCurrency = "ARS",
  initialExchangeRate = null,
  isPayment = false,
  initialDate = null,
}) {
  const id = receiptId || propId;
  const { closeWindow, openWindow } = useWindow();
  const { showToast } = useToast();
  const { costCenter: globalCostCenter } = useCostCenter();

  const formatTaxId = (val) => {
    if (!val) return "";
    const clean = val.replace(/\D/g, "");
    if (clean.length === 11) {
      return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`;
    }
    return val;
  };

  const fmt = (val) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currency,
    }).format(val || 0);

  const formatCurrencyInput = (val) => {
    if (val === null || val === undefined || val === "") return "";
    let str = String(val).replace(".", ",");
    let parts = str.split(",");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return parts.join(",");
  };

  const parseCurrencyInput = (val) => {
    if (!val) return 0;
    let clean = val.replace(/\./g, "").replace(",", ".");
    return parseFloat(clean) || 0;
  };

  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("payments");
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showCheckModal, setShowCheckModal] = useState(false);
  const [currentCheck, setCurrentCheck] = useState(null);
  const [retentions, setRetentions] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showFxModalForDoc, setShowFxModalForDoc] = useState(null);
  const [showInterestModalForDoc, setShowInterestModalForDoc] = useState(null);

  // Header State
  const [date, setDate] = useState(initialDate || new Date().toISOString().split("T")[0]);
  const [entity, setEntity] = useState(null);
  const [number, setNumber] = useState("");
  const [currency, setCurrency] = useState(initialCurrency);
  const [exchangeRate, setExchangeRate] = useState(initialExchangeRate || 1);
  const [observations, setObservations] = useState("");
  const [pointsOfSale, setPointsOfSale] = useState([]);
  const [pv, setPv] = useState("");
  const [un, setUn] = useState("1");
  const [ctroCosto, setCtroCosto] = useState(String(globalCostCenter ?? 1));
  const [company, setCompany] = useState("1");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // Data State
  const [pendingInvoices, setPendingInvoices] = useState([]);
  const [applications, setApplications] = useState([]);
  const [payments, setPayments] = useState([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [history, setHistory] = useState([]);
  const [banks, setBanks] = useState([]);
  const [modalChecks, setModalChecks] = useState([]);

  const paymentMethods = [
    { value: "CASH", label: "Efectivo", icon: <Banknote size={16} /> },
    { value: "CHECK", label: "Cheque", icon: <FileText size={16} /> },
    { value: "TRANSFER", label: "Transferencia", icon: <Landmark size={16} /> },
    { value: "CREDIT_CARD", label: "Tarjeta", icon: <CreditCard size={16} /> },
    { value: "OTHER", label: "Otro", icon: <Plus size={16} /> },
  ];

  useEffect(() => {
    fetchInitialData();
    fetchBanks();
  }, []);

  const fetchBanks = async () => {
    try {
      const data = await api.get('/config/banks');
      setBanks(data);
    } catch (e) {
      console.error("Error fetching banks", e);
    }
  };

  const fetchInitialData = async () => {
    try {
      const data = await api.get('/config/pos');
      setPointsOfSale(data);
      if (data.length > 0 && mode === "new" && !pv) {
        setPv(data[0].pv);
      }
    } catch (e) {
      console.error("Error fetching POS config", e);
    }
  };

  useEffect(() => {
    if (mode === "new" && !id && pv) {
      fetchNextNumber(pv);
    }
  }, [mode, id, pv]);

  const fetchNextNumber = async (selectedPv) => {
    try {
      const docTypeKey = isPayment ? "ORDEN_PAGO" : "RECIBO";
      const data = await api.get(`/config/pos/next-number?pv=${selectedPv}&doc_type=${docTypeKey}`);
      setNumber(data.full_number);
    } catch (e) {
      console.error("Error fetching next number", e);
    }
  };

  useEffect(() => {
    if (initialEntity) setEntity(initialEntity);
    else if (initialEntityId) fetchEntity(initialEntityId);
    if (initialApplications) {
      setApplications(initialApplications);
      setPendingInvoices(initialApplications); 
      setTotalBalance(
        initialApplications.reduce((acc, inv) => acc + inv.remaining, 0),
      );
    }
    if (initialPayments) {
      setPayments(initialPayments);
    }
    if (!initialExchangeRate) fetchExchangeRate();
    if (mode === "edit" && id) fetchReceipt(id);
  }, [
    initialEntityId,
    initialEntity,
    initialApplications,
    initialPayments,
    mode,
    id,
  ]);

  const fetchEntity = async (eid) => {
    try {
      const data = await api.get(`/entities/${eid}`);
      setEntity(data);
    } catch (e) {
      console.error("Error fetching entity", e);
    }
  };

  const fetchExchangeRate = async () => {
    try {
      const data = await api.get('/accounting/fx/usd');
      setExchangeRate(data.rate);
    } catch (e) {
      console.error("Error fetching exchange rate", e);
    }
  };

  const fetchReceipt = async (rid) => {
    try {
      setLoading(true);
      const data = await api.get(`/accounting/documents/${rid}`);
      
      setDate(data.date);
      setNumber(data.number);
      setCurrency(data.currency);
      setExchangeRate(data.exchange_rate);
      setObservations(data.notes || "");
      setCtroCosto(data.cost_center ? String(data.cost_center) : String(globalCostCenter ?? 1));
      setEntity({
        id: data.entity_id,
        name: data.entity_name,
        tax_id: data.entity_tax_id,
        code: data.entity_code,
      });

      if (data.payments) {
        setPayments(
          data.payments.map((p) => ({
            ...p,
            id: p.id || Math.random(),
          })),
        );
      }

      if (data.applications) {
        setApplications(
          data.applications.map((a) => ({
            ...a,
            to_document_id: a.to_document_id,
            remaining: a.to_document_total - a.to_document_applied,
            amount_applied: a.amount_applied,
            number: a.to_document_number,
            date: a.to_document_date,
            currency: a.to_document_currency,
          })),
        );
      }
      setHistory(data.history || []);
    } catch (e) {
      showToast("Error al cargar el recibo", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (entity && mode === "new" && !initialApplications) {
      fetchPendingInvoices();
    }
  }, [entity]);

  const fetchPendingInvoices = async (manualId = null) => {
    const eid = manualId || entity?.id;
    if (!eid) return;
    try {
      const data = await api.get(`/accounts/${eid}/ledger?status=OPEN&include_commissions=${isPayment}`);
      const validTypes = isPayment
        ? ["PURCHASE_INVOICE", "PURCHASE_DEBIT_NOTE", "INVOICE", "DEBIT_NOTE"]
        : ["INVOICE", "DEBIT_NOTE"];
      const openInvoices = data.filter(
        (d) => d.remaining > 0 && validTypes.includes(d.doc_type),
      );
      setPendingInvoices(openInvoices);
      setTotalBalance(
        openInvoices.reduce((acc, inv) => acc + inv.remaining, 0),
      );
    } catch (e) {
      console.error("Error fetching pending invoices", e);
    }
  };

  const searchEntities = async (q) => {
    try {
      const entityType = isPayment ? "supplier" : "client";
      const data = await api.get(`/entities/?type=${entityType}&q=${q}`);
      return Array.isArray(data) ? data : [];
    } catch (e) {
       console.error("Error searching entities", e);
      return [];
    }
  };

  const handleEntitySelect = (ent) => {
    setEntity(ent);
    setApplications([]);
    if (ent) {
      fetchPendingInvoices(ent.id);
    }
  };

  const addPayment = (type) => {
    if (type === "CHECK") {
      const existingChecks = payments.filter(p => p.type === "CHECK");
      // If we are adding via button, we normally want to open the multi-grid
      setModalChecks(existingChecks.length > 0 ? existingChecks : [{
        id: Math.random(),
        type: "CHECK",
        amount: 0,
        description: "",
        bank_name: "",
        reference_number: "",
        due_date: new Date().toISOString().split("T")[0],
        issue_date: new Date().toISOString().split("T")[0],
        check_type: "FISICO",
        issuer_tax_id: entity?.tax_id || "",
        accounting_account: "111010301",
        business_unit: ctroCosto || "1"
      }]);
      setShowCheckModal(true);
      return;
    }
    const newId = Math.random();
    const newPayment = {
      id: newId,
      type,
      amount: 0,
      description: "",
      bank_name: "",
      reference_number: "",
      due_date: new Date().toISOString().split("T")[0],
      issue_date: new Date().toISOString().split("T")[0],
      check_type: "FISICO",
      issuer_tax_id: entity?.tax_id || "",
      accounting_account: "111010301", 
      business_unit: un || "1",
    };

    setPayments([...payments, newPayment]);

    if (type === "CHECK") {
      setCurrentCheck(newPayment);
      setShowCheckModal(true);
    }
  };
  
  const handleRetentionLookup = async (id, jurisdiction) => {
    if (!entity?.tax_id) {
      showToast("La entidad debe tener CUIT para el cálculo automático", "warning");
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`${api.defaults.baseURL}/accounting/perceptions/lookup?cuit=${entity.tax_id}&jurisdiction=${jurisdiction}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const rate = data.retention_rate || 0;
        setRetentions(retentions.map(r => {
          if (r.id === id) {
            const amount = (r.base_amount * rate) / 100;
            return { ...r, amount: Number(amount.toFixed(2)), rate };
          }
          return r;
        }));
        showToast(`Alícuota encontrada: ${rate}%`, "success");
      }
    } catch (e) {
      showToast("Error al consultar padrón", "error");
    }
  };

  const removePayment = (pid) =>
    setPayments(payments.filter((p) => p.id !== pid));
  const updatePayment = (pid, field, value) => {
    setPayments(
      payments.map((p) => (p.id === pid ? { ...p, [field]: value } : p)),
    );
    if (currentCheck && currentCheck.id === pid) {
      setCurrentCheck((prev) => ({ ...prev, [field]: value }));
    }
  };

  const autoApply = () => {
    let available = totalPayments + totalRetentions;
    const newApps = [];

    const sorted = [...pendingInvoices].sort(
      (a, b) => new Date(a.date) - new Date(b.date),
    );

    for (const inv of sorted) {
      if (available <= 0) break;
      const amount = Math.min(inv.remaining, available);
      newApps.push({
        to_document_id: inv.id,
        number: inv.number,
        date: inv.date,
        remaining: inv.remaining,
        currency: inv.currency,
        amount_applied: amount,
      });
      available -= amount;
    }
    setApplications(newApps);
    showToast(
      `Se aplicaron facturas por ${fmt(totalPayments + totalRetentions - available)}`,
      "success",
    );
  };

  const toggleInvoiceApplication = (inv) => {
    const isSelected = applications.some((a) => a.to_document_id === inv.id);
    if (isSelected) {
      setApplications(applications.filter((a) => a.to_document_id !== inv.id));
    } else {
      setApplications([
        ...applications,
        {
          to_document_id: inv.id,
          number: inv.number,
          date: inv.date,
          remaining: inv.remaining,
          currency: inv.currency,
          amount_applied: inv.remaining,
        },
      ]);
    }
  };

  const totalPayments = useMemo(
    () => payments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [payments],
  );
  
  const totalApplied = useMemo(() => {
    return applications.reduce((s, a) => {
      const isUsdInvoice = a.currency === "USD";
      if (currency === "ARS" && isUsdInvoice) {
        return s + Number(a.amount_applied) * exchangeRate;
      }
      return s + Number(a.amount_applied);
    }, 0);
  }, [applications, currency, exchangeRate]);

  const totalRetentions = useMemo(() => {
    return retentions.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
  }, [retentions]);

  const difference = useMemo(() => {
    return totalPayments + totalRetentions - totalApplied;
  }, [totalPayments, totalRetentions, totalApplied]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await api.post('/expenses/upload-receipt', formData);
      setAttachmentUrl(data.url);
      showToast("Comprobante adjuntado", "success");
    } catch (e) {
      showToast("Error al subir archivo", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!entity) return showToast("Seleccione un cliente", "error");
    const totalReceiptValue = totalPayments + totalRetentions;
    if (totalReceiptValue <= 0)
      return showToast("Monto del recibo debe ser > 0", "error");
    if (difference < -0.01)
      return showToast("Aplicado superior al valor del recibo", "error");

    const payload = {
      entity_id: entity.id,
      doc_type: isPayment ? "PAYMENT" : "RECEIPT",
      number: number || "AUTO",
      date,
      currency,
      exchange_rate: exchangeRate,
      total_amount: totalReceiptValue,
      notes: observations,
      cost_center: parseInt(ctroCosto, 10),
      attachment_url: attachmentUrl,
      payments: [
        ...payments.map((p) => ({
          type: p.type,
          amount: Number(p.amount) || 0,
          description: p.description,
          bank_name: p.bank_name,
          reference_number: p.reference_number,
          due_date: p.type === "CHECK" ? p.due_date : null,
          issue_date: p.type === "CHECK" ? p.issue_date : null,
          check_type: p.check_type,
          issuer_tax_id: p.issuer_tax_id,
          accounting_account: p.accounting_account
        })),
        ...retentions.map((r) => ({
          type: "RETENTION",
          amount: Number(r.amount) || 0,
          description: `Retención ${r.type}: ${r.reference}`,
          reference_number: r.reference,
          tax_name: r.type,
          jurisdiction: r.jurisdiction,
          certificate_number: r.reference,
          base_amount: Number(r.base_amount) || 0,
          due_date: null,
        })),
      ],
      applications: applications.map((app) => ({
        from_document_id: "NEW",
        to_document_id: app.to_document_id,
        amount_applied: Number(app.amount_applied),
        exchange_rate: exchangeRate,
      })),
    };

    try {
      setLoading(true);
      const savedDoc = await api.post('/accounting/documents/', payload);
      showToast("Recibo guardado", "success");
      window.dispatchEvent(new CustomEvent("receipt-changed"));
      setShowFxModalForDoc(savedDoc.id);
    } catch (e) {
      console.error(e);
      showToast(e.message || "Error al guardar", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("¿Está seguro que desea eliminar este recibo? Esta acción no se puede deshacer.")) {
      return;
    }
    
    setIsSaving(true);
    try {
      await api.delete(`/accounting/documents/${id}`);
      showToast("Recibo eliminado correctamente", "success");
      // Notificar cambios
      window.dispatchEvent(new CustomEvent("receipt-changed"));
      window.dispatchEvent(new CustomEvent("account-changed"));
      closeWindow(windowId);
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.detail || "Error al eliminar el recibo", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = async () => {
    if (!id) return;
    try {
      showToast('Generando PDF...', 'info');
      const blob = await api.get(`/accounting/documents/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Comprobante_${number}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast('PDF descargado', 'success');
    } catch (err) {
      showToast('Error al descargar PDF', 'error');
    }
  };

  const handleSendEmail = async () => {
    if (!id) return;
    if (!entity || !entity.email) {
      showToast("La entidad no tiene un email configurado.", "warning");
      return;
    }
    try {
      showToast('Enviando correo...', 'info');
      await api.post(`/accounting/documents/${id}/email`, {
        to_email: entity.email
      });
      showToast("Correo enviado con éxito", "success");
    } catch (e) {
      showToast('Error al enviar correo', 'error');
    }
  };

  if (loading && !isSaving && mode === "edit") return <LoadingScreen message="Cargando información..." />;

  return (
    <div className={s.container}>
      <div
        className={s.header}
        style={{
          pointerEvents: mode === "edit" ? "none" : "auto",
          opacity: mode === "edit" ? 0.8 : 1,
        }}
      >
        <div className={s.headerGrid}>
          <div className={s.headerGroup} style={{ gridColumn: "span 6" }}>
            <Autocomplete
              label={isPayment ? "Proveedor" : "Cliente / Entidad"}
              initialValue={entity}
              onSearch={searchEntities}
              onSelect={handleEntitySelect}
              renderItem={(e) => `${e.name} (${e.tax_id || "S/C"})`}
              valueDisplay={(e) => e.name}
              placeholder={isPayment ? "Buscar proveedor..." : "Buscar cliente..."}
              minChars={0}
              disabled={mode === "edit"}
            />
          </div>
          <div className={s.headerGroup} style={{ gridColumn: "span 2" }}>
            <Input
              label="Fecha"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={mode === "edit"}
            />
          </div>
          <div className={s.headerGroup} style={{ gridColumn: "span 2" }}>
            <Select
              label="Moneda"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={mode === "edit"}
            >
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </Select>
          </div>
          <div className={s.headerGroup} style={{ gridColumn: "span 2" }}>
            <Input
              label="Cotización"
              type="number"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(Number(e.target.value))}
              disabled={mode === "edit"}
            />
          </div>
          <div className={s.headerGroup} style={{ gridColumn: "span 2" }}>
            <Select
              label="PV"
              value={pv}
              onChange={(e) => setPv(e.target.value)}
              disabled={mode === "edit"}
            >
              {pointsOfSale.map((p) => (
                <option key={p.id} value={p.pv}>{p.pv}</option>
              ))}
            </Select>
          </div>
          <div className={s.headerGroup} style={{ gridColumn: "span 3" }}>
            <Input
              label="Número"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="0001-00000001"
              disabled={mode === "edit"}
            />
          </div>
          <div className={s.headerGroup} style={{ gridColumn: "span 3" }}>
            <Input 
              label="Concepto / Detalle" 
              value={observations} 
              onChange={(e) => setObservations(e.target.value)} 
              placeholder="Ej: Cobro de facturas..." 
              disabled={mode === 'edit'} 
            />
          </div>
          <div className={s.headerGroup} style={{ gridColumn: "span 2" }}>
            <Select
              label="C. Costo"
              value={ctroCosto}
              onChange={(e) => setCtroCosto(e.target.value)}
              disabled={mode === "edit"}
            >
              <option value="1">1</option>
              <option value="2">2</option>
            </Select>
          </div>
          <div className={s.headerGroup} style={{ gridColumn: "span 2" }}>
            <label className={s.fileLabel}>
              <Upload size={16} /> 
              {uploading ? "Subiendo..." : (attachmentUrl ? "Cambiar Adjunto" : "Adjuntar Comprobante")}
              <input type="file" onChange={handleFileUpload} style={{ display: "none" }} />
            </label>
            {attachmentUrl && <div className={s.fileOk} title={attachmentUrl}><Check size={12} /></div>}
          </div>
        </div>
      </div>

      <div className={s.tabs}>
        <button
          className={`${s.tab} ${activeTab === "vista360" ? s.active : ""}`}
          onClick={() => setActiveTab("vista360")}
          disabled={!entity}
          title={!entity ? "Seleccione un cliente para ver su estado" : "Vista 360 del Cliente"}
        >
          <LayoutIcon size={16} /> Vista 360
        </button>
        <button
          className={`${s.tab} ${activeTab === "payments" ? s.active : ""}`}
          onClick={() => setActiveTab("payments")}
        >
          <CreditCard size={16} /> Medios de Pago
        </button>
        <button
          className={`${s.tab} ${activeTab === "applications" ? s.active : ""}`}
          onClick={() => setActiveTab("applications")}
        >
          <Link2 size={16} /> {isPayment ? "Comprobantes (Aplicaciones)" : "Facturas (Aplicaciones)"}
        </button>
        <button
          className={`${s.tab} ${activeTab === "retentions" ? s.active : ""}`}
          onClick={() => setActiveTab("retentions")}
        >
          <Tag size={16} /> Retenciones
        </button>
        <button
          className={`${s.tab} ${activeTab === "history" ? s.active : ""}`}
          onClick={() => setActiveTab("history")}
        >
          <Calendar size={16} /> Historial
        </button>
      </div>

      <div className={s.content}>
        {activeTab === "vista360" && entity && (
           <div className={s.tabContent} style={{ padding: 0 }}>
             <EntityDashboard 
                entityId={entity.id} 
                entityName={entity.name} 
                onNavigate={({ type, mode: newMode, docId }) => {
                    if (type === 'invoice-form') {
                      openEditFactura(docId, { mode: newMode, title: `Factura ${docId}`, width: 1100, height: 800 });
                    }
                }}
             />
           </div>
        )}
        {activeTab === "applications" && (
          <div className={s.tabContent}>
            <div className={s.actionsBar}>
              {mode === "new" && (
                <div className={s.barActions}>
                  <Button variant="secondary" size="sm" onClick={() => setShowInvoiceModal(true)} disabled={!entity}>
                    <Plus size={16} /> {isPayment ? "Vincular Comprobantes" : "Vincular Facturas"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={autoApply} disabled={!entity || totalPayments + totalRetentions <= 0}>
                    <Search size={16} /> Saldar Automático
                  </Button>
                </div>
              )}
            </div>

            <div className={s.tableWrap}>
              <table className={t.table}>
                <thead>
                  <tr>
                    <th>Factura</th>
                    <th>Fecha</th>
                    <th style={{ textAlign: "right" }}>Saldo Original</th>
                    <th style={{ textAlign: "right", width: 140 }}>Aplicado ({applications[0]?.currency})</th>
                    {currency !== applications[0]?.currency && (
                      <th style={{ textAlign: "right", width: 140 }}>Equiv. ({currency})</th>
                    )}
                    {isPayment && <th style={{ textAlign: "right", width: 140 }}>Monto Aplicado</th>}
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => {
                    const isDiffCurrency = currency !== app.currency;
                    const equivAmount = isDiffCurrency ? (Number(app.amount_applied) * exchangeRate) : Number(app.amount_applied);

                    return (
                      <tr key={app.to_document_id}>
                        <td>{app.number}</td>
                        <td>{new Date(app.date).toLocaleDateString()}</td>
                        <td style={{ textAlign: "right" }}>{fmt(app.remaining)} (<strong>{app.currency}</strong>)</td>
                        <td style={{ textAlign: "right" }}>
                          <input
                            type="text"
                            className={s.cellInput}
                            style={{ textAlign: "right", fontWeight: 700 }}
                            value={app.temp_amount ?? formatCurrencyInput(app.amount_applied)}
                            onFocus={() => {
                              app.temp_amount = formatCurrencyInput(app.amount_applied);
                              setApplications([...applications]);
                            }}
                            onBlur={() => {
                              delete app.temp_amount;
                              setApplications([...applications]);
                            }}
                            onChange={(e) => {
                              const raw = e.target.value;
                              let cleanStr = raw.replace(/[^\d,]/g, "");
                              if ((cleanStr.match(/,/g) || []).length > 1) return;
                              
                              let parts = cleanStr.split(",");
                              parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
                              const visualVal = parts.join(",");
                              
                              const val = parseCurrencyInput(cleanStr);
                              app.amount_applied = val;
                              app.temp_amount = visualVal;
                              setApplications([...applications]);
                            }}
                          />
                        </td>
                        {isDiffCurrency && (
                          <td style={{ textAlign: "right", fontWeight: 600, color: '#64748b' }}>
                            {fmt(equivAmount)}
                          </td>
                        )}
                        <td style={{ textAlign: "center" }}>
                          {mode === "new" && (
                            <button className={s.deleteBtn} onClick={() => toggleInvoiceApplication({ id: app.to_document_id })}>
                              <X size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {applications.length === 0 && (
                    <tr>
                      <td colSpan={6} className={s.emptyState}>
                        No hay {isPayment ? "comprobantes vinculados" : "facturas vinculadas"}. Use el botón pertinente.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "payments" && (
          <div className={s.tabContent}>
            <div className={s.actionsBar}>
              <div className={s.payButtons}>
                {paymentMethods.map((m) => (
                  <button key={m.value} className={s.payTypeBtn} onClick={() => addPayment(m.value)}>
                    {m.icon} <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={s.tableWrap}>
              <table className={t.table}>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Bancos / Detalle</th>
                    <th>Referencia</th>
                    <th>Vencimiento</th>
                    <th style={{ textAlign: "right", width: 140 }}>Importe</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={6} className={s.emptyState}>No hay medios de pago cargados.</td>
                    </tr>
                  )}
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Badge variant="secondary">{p.type}</Badge>
                          {p.type === "CHECK" && (
                            <button className={s.iconBtnSmall} onClick={() => { 
                              const allChecks = payments.filter(pay => pay.type === "CHECK");
                              setModalChecks(allChecks);
                              setShowCheckModal(true); 
                            }}>
                              <Search size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        {(p.type === 'CHECK' || p.type === 'TRANSFER') ? (
                          <Select 
                            value={p.type === 'CHECK' ? (p.bank_name || "") : (p.description || "")} 
                            onChange={(e) => {
                              const val = e.target.value;
                              if (p.type === 'CHECK') updatePayment(p.id, "bank_name", val);
                              else updatePayment(p.id, "description", val);
                            }}
                          >
                            <option value="">Seleccione Banco...</option>
                            {banks.map(b => (
                              <option key={b.id} value={b.name}>{b.name}</option>
                            ))}
                          </Select>
                        ) : (
                          <input type="text" className={s.cellInput} value={p.description || ""} onChange={(e) => updatePayment(p.id, "description", e.target.value)} placeholder="Ej: Galicia..." />
                        )}
                      </td>
                      <td>
                        <input type="text" className={s.cellInput} value={p.reference_number || ""} onChange={(e) => updatePayment(p.id, "reference_number", e.target.value)} />
                      </td>
                      <td>{p.type === "CHECK" ? <input type="date" className={s.cellInput} value={p.due_date} onChange={(e) => updatePayment(p.id, "due_date", e.target.value)} /> : "-"}</td>
                      <td style={{ textAlign: "right" }}>
                        <input 
                          type="text" 
                          className={s.cellInput} 
                          style={{ textAlign: "right", fontWeight: 700 }} 
                          value={p.temp_amount ?? formatCurrencyInput(p.amount)} 
                          onFocus={() => {
                            p.temp_amount = formatCurrencyInput(p.amount);
                            setPayments([...payments]);
                          }}
                          onBlur={() => {
                            delete p.temp_amount;
                            setPayments([...payments]);
                          }}
                          onChange={(e) => {
                            const raw = e.target.value;
                            let cleanStr = raw.replace(/[^\d,]/g, "");
                            if ((cleanStr.match(/,/g) || []).length > 1) return;
                            
                            let parts = cleanStr.split(",");
                            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
                            const visualVal = parts.join(",");
                            
                            const val = parseCurrencyInput(cleanStr);
                            p.amount = val;
                            p.temp_amount = visualVal;
                            setPayments([...payments]);
                          }} 
                        />
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button className={s.deleteBtn} onClick={() => removePayment(p.id)}><X size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "retentions" && (
          <div className={s.tabContent}>
            <div className={s.actionsBar}>
              <Button variant="secondary" size="sm" onClick={() => setRetentions([...retentions, { id: Date.now(), type: "IIBB", jurisdiction: "ARBA", amount: 0, base_amount: totalApplied, reference: "" }])}>
                <Plus size={16} /> Agregar Retención
              </Button>
            </div>
            <div className={s.tableWrap}>
              <table className={t.table}>
                <thead>
                  <tr>
                    <th>Impuesto</th>
                    <th>Jurisdicción</th>
                    <th>Referencia</th>
                    <th style={{ textAlign: "right" }}>Base Imp.</th>
                    <th style={{ textAlign: "right", width: 140 }}>Importe</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {retentions.map((r) => (
                    <tr key={r.id}>
                      <td><Select value={r.type} onChange={(e) => setRetentions(retentions.map(re => re.id === r.id ? { ...re, type: e.target.value } : re))}><option value="IVA">IVA</option><option value="IIBB">IIBB</option><option value="GANANCIAS">Ganancias</option></Select></td>
                      <td><Select value={r.jurisdiction} onChange={(e) => setRetentions(retentions.map(re => re.id === r.id ? { ...re, jurisdiction: e.target.value } : re))} disabled={r.type !== "IIBB"}><option value="ARBA">ARBA</option><option value="AGIP">AGIP</option></Select></td>
                      <td><input type="text" className={s.cellInput} value={r.reference} onChange={(e) => setRetentions(retentions.map(re => re.id === r.id ? { ...re, reference: e.target.value } : re))} /></td>
                      <td style={{ textAlign: "right" }}><input type="number" className={s.cellInput} style={{ textAlign: "right" }} value={r.base_amount} onChange={(e) => setRetentions(retentions.map(re => re.id === r.id ? { ...re, base_amount: Number(e.target.value) } : re))} /></td>
                      <td style={{ textAlign: "right" }}><input type="number" className={s.cellInput} style={{ textAlign: "right", fontWeight: 700 }} value={r.amount} onChange={(e) => setRetentions(retentions.map(re => re.id === r.id ? { ...re, amount: Number(e.target.value) } : re))} /></td>
                      <td style={{ textAlign: "center" }}><button className={s.deleteBtn} onClick={() => setRetentions(retentions.filter(re => re.id !== r.id))}><X size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <div className={s.tabContent} style={{ padding: 24 }}>
            <Card title="Historial">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {history.map((h, i) => (
                  <div key={i} style={{ padding: 12, background: '#f8fafc', borderRadius: 8, fontSize: 13 }}>
                    <strong>{h.action}</strong> - {h.date} ({h.user})
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>

      <div className={s.footer}>
        <div className={s.footerLeft}>
          <Button onClick={handleSave} disabled={loading || isSaving} className={s.confirmBtn}>
            <Save size={18} /> {mode === "edit" ? "Guardar Cambios" : isPayment ? "Confirmar Pago" : "Confirmar Recibo"}
          </Button>
          {mode === "view" || mode === "edit" ? (
             <Button onClick={handleDelete} variant="danger" disabled={loading || isSaving} style={{ marginLeft: '12px' }}>
                <Trash2 size={18} /> Eliminar
             </Button>
          ) : null}
          <div className={s.footerTools}>
            <button onClick={handlePrint} className={s.toolBtn} title="Imprimir"><Printer size={18} /></button>
            <button onClick={handleSendEmail} className={s.toolBtn} title="Enviar por Email"><Mail size={18} /></button>
          </div>
        </div>
        
        <div className={s.footerRight}>
          <div className={s.summaryItem}>
            <span className={s.summaryLabel}>Total {isPayment ? "Pagos" : "Pagado"}</span>
            <span className={s.summaryValue}>{fmt(totalPayments)}</span>
          </div>
          <div className={s.summaryDivider} />
          <div className={s.summaryItem}>
            <span className={s.summaryLabel}>Retenciones</span>
            <span className={s.summaryValue}>{fmt(totalRetentions)}</span>
          </div>
          <div className={s.summaryDivider} />
          <div className={s.summaryItem}>
            <span className={s.summaryLabel}>Aplicado</span>
            <span className={s.summaryValue}>{fmt(totalApplied)}</span>
          </div>
          
          <div className={`${s.diffBlock} ${Math.abs(difference) > 0.01 ? s.hasDiff : ""}`}>
            <span className={s.diffLabel}>Diferencia</span>
            <span className={s.diffValue}>{fmt(difference)}</span>
          </div>
        </div>
      </div>

      {showFxModalForDoc && <FxAdjustmentDocModal documentId={showFxModalForDoc} onClose={() => { setShowFxModalForDoc(null); closeWindow(windowId); }} onConfirmed={() => { const docId = showFxModalForDoc; setShowFxModalForDoc(null); if (payments.some(p => p.type === "CHECK")) setShowInterestModalForDoc(docId); else closeWindow(windowId); }} />}
      {showInterestModalForDoc && <CheckInterestModal receiptId={showInterestModalForDoc} onClose={() => { setShowInterestModalForDoc(null); closeWindow(windowId); }} onConfirmed={() => { setShowInterestModalForDoc(null); closeWindow(windowId); }} />}
      
      {showCheckModal && (
        <Modal 
          open={showCheckModal} 
          onClose={() => setShowCheckModal(false)} 
          title="Alta de Cheques a Cobrar" 
          wide 
          maxWidth="95vw"
        >
          <div className={s.checkModalContainer}>
            <div className={s.tableWrap} style={{ maxHeight: 600, overflow: 'auto', background: 'white', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
              <table className={s.eliteTable} style={{ minWidth: '1300px' }}>
                <thead>
                  <tr>
                    <th style={{ width: 350 }}>Banco</th>
                    <th style={{ width: 110 }}>N° Cheque</th>
                    <th style={{ width: 170, textAlign: 'right' }}>Importe</th>
                    <th style={{ width: 100 }}>Tipo</th>
                    <th style={{ width: 100 }}>Emisión</th>
                    <th style={{ width: 100 }}>Vencimiento</th>
                    <th style={{ width: 110 }}>CUIT Emisor</th>
                    <th>Observaciones</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {modalChecks.map((ch, idx) => (
                    <tr key={idx}>
                      <td>
                        <Select 
                          className={s.inputElite}
                          style={{ fontWeight: 700, width: '100%', fontSize: '10px' }}
                          value={ch.bank_name || ""} 
                          onChange={(e) => {
                            const newChecks = [...modalChecks];
                            newChecks[idx].bank_name = e.target.value;
                            setModalChecks(newChecks);
                          }}
                        >
                          <option value="">Seleccione Banco...</option>
                          {banks.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                        </Select>
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className={s.inputElite} 
                          style={{ fontSize: '10px', width: '100%' }}
                          placeholder="00000000"
                          value={ch.reference_number || ""} 
                          onChange={(e) => {
                            const newChecks = [...modalChecks];
                            newChecks[idx].reference_number = e.target.value;
                            setModalChecks(newChecks);
                          }}
                        />
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className={`${s.inputElite} ${s.amountElite}`} 
                          style={{ fontSize: '12px', textAlign: 'right' }}
                          placeholder="0,00"
                          value={ch.temp_amount ?? formatCurrencyInput(ch.amount)} 
                          onFocus={(e) => {
                            const newChecks = [...modalChecks];
                            newChecks[idx].temp_amount = formatCurrencyInput(ch.amount);
                            setModalChecks(newChecks);
                          }}
                          onBlur={(e) => {
                            const newChecks = [...modalChecks];
                            delete newChecks[idx].temp_amount;
                            setModalChecks(newChecks);
                          }}
                          onChange={(e) => {
                            const raw = e.target.value;
                            // Relax numeric cleaning to allow commas while typing
                            let cleanStr = raw.replace(/[^\d,]/g, ""); // Only allow digits and COMMA
                            // Prevent multiple commas
                            if ((cleanStr.match(/,/g) || []).length > 1) return;
                            
                            // Visual formatting while typing
                            let parts = cleanStr.split(",");
                            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
                            const visualVal = parts.join(",");

                            const parsed = parseCurrencyInput(cleanStr);
                            const otherChecksTotal = modalChecks.reduce((s, c, i) => i !== idx ? s + (Number(c.amount) || 0) : s, 0);
                            const otherPaymentsTotal = payments.filter(p => p.type !== "CHECK").reduce((s, p) => s + (Number(p.amount) || 0), 0) + totalRetentions;
                            const maxAllowed = Math.max(0, totalApplied - otherPaymentsTotal - otherChecksTotal);
                            
                            const newChecks = [...modalChecks];
                            if (parsed > maxAllowed + 0.01) {
                              newChecks[idx].amount = maxAllowed;
                              newChecks[idx].temp_amount = formatCurrencyInput(maxAllowed);
                              showToast(`Monto excedido. Se ajustó al máximo: ${fmt(maxAllowed)}`, "warning");
                            } else {
                              newChecks[idx].amount = parsed;
                              newChecks[idx].temp_amount = visualVal;
                            }
                            setModalChecks(newChecks);
                          }}
                        />
                      </td>
                      <td>
                        <div className={`${s.badgeElite} ${ch.check_type === 'eCHEQ' ? s.typeEcheq : s.typeFisico}`} style={{ padding: '1px 6px', display: 'inline-flex' }}>
                          <select 
                            style={{ background: 'transparent', border: 'none', fontWeight: 800, fontSize: '8px', cursor: 'pointer', outline: 'none', color: 'inherit' }}
                            value={ch.check_type || "FISICO"} 
                            onChange={(e) => {
                              const newChecks = [...modalChecks];
                              newChecks[idx].check_type = e.target.value;
                              setModalChecks(newChecks);
                            }}
                          >
                            <option value="FISICO">FÍSICO</option>
                            <option value="eCHEQ">E-CHEQ</option>
                          </select>
                        </div>
                      </td>
                      <td>
                        <input 
                          type="date" 
                          className={s.inputElite} 
                          style={{ fontSize: '9px' }}
                          value={ch.issue_date || ""} 
                          onChange={(e) => {
                            const newChecks = [...modalChecks];
                            newChecks[idx].issue_date = e.target.value;
                            setModalChecks(newChecks);
                          }}
                        />
                      </td>
                      <td>
                        <input 
                          type="date" 
                          className={s.inputElite} 
                          style={{ fontSize: '9px' }}
                          value={ch.due_date || ""} 
                          onChange={(e) => {
                            const newChecks = [...modalChecks];
                            newChecks[idx].due_date = e.target.value;
                            setModalChecks(newChecks);
                          }}
                        />
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className={s.inputElite} 
                          style={{ fontSize: '10px', fontFamily: 'monospace' }}
                          placeholder="CUIT..."
                          value={ch.issuer_tax_id || ""} 
                          onChange={(e) => {
                            const newChecks = [...modalChecks];
                            newChecks[idx].issuer_tax_id = formatTaxId(e.target.value);
                            setModalChecks(newChecks);
                          }}
                        />
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className={s.inputElite} 
                          style={{ fontSize: '10px' }}
                          placeholder="Nota..."
                          value={ch.description || ""} 
                          onChange={(e) => {
                            const newChecks = [...modalChecks];
                            newChecks[idx].description = e.target.value;
                            setModalChecks(newChecks);
                          }}
                        />
                      </td>
                      <td>
                        <button className={s.deleteBtnElite} onClick={() => setModalChecks(modalChecks.filter((_, i) => i !== idx))}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={s.addCheckRow} style={{ padding: '10px' }}>
                <button className={s.addBtnElite} style={{ padding: '6px 14px', fontSize: '11px' }} onClick={() => setModalChecks([...modalChecks, { type: "CHECK", amount: 0, bank_name: "", reference_number: "", business_unit: "1", issue_date: new Date().toISOString().split('T')[0], due_date: new Date().toISOString().split('T')[0], check_type: "FISICO" }])}>
                  <Plus size={14} /> Agregar nuevo valor
                </button>
              </div>
            </div>

            <div className={s.modalFooter}>
              <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
                <div>
                  <div className={s.modalTotalLabel}>Saldo por Cubrir</div>
                  <div className={s.modalTotalValue} style={{ color: '#64748b' }}>
                    {fmt(totalApplied - (payments.filter(p => p.type !== "CHECK").reduce((s, p) => s + (Number(p.amount) || 0), 0) + totalRetentions))}
                  </div>
                </div>

                <div style={{ width: 1, height: 24, background: '#e2e8f0' }} />

                <div>
                  <div className={s.modalTotalLabel}>Valores Cargados</div>
                  <div className={s.modalTotalValue} style={{ color: '#2563eb' }}>
                    {fmt(modalChecks.reduce((sum, c) => sum + (Number(c.amount) || 0), 0))}
                  </div>
                </div>
                
                {totalApplied > 0 && (
                  <>
                    <div style={{ width: 1, height: 24, background: '#e2e8f0' }} />
                    <div>
                      <div className={s.modalTotalLabel}>Diferencia / Restante</div>
                      <div className={s.modalTotalValue} style={{ 
                        color: (totalApplied - (payments.filter(p => p.type !== "CHECK").reduce((s, p) => s + (Number(p.amount) || 0), 0) + totalRetentions + modalChecks.reduce((sum, c) => sum + (Number(c.amount) || 0), 0))) > 0.01 ? '#dc2626' : '#059669' 
                      }}>
                        {fmt(Math.max(0, (totalApplied - (payments.filter(p => p.type !== "CHECK").reduce((s, p) => s + (Number(p.amount) || 0), 0) + totalRetentions)) - modalChecks.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className={s.modalActions}>
                <button className={s.cancelBtnElite} onClick={() => setShowCheckModal(false)}>
                  Cancelar
                </button>
                <button 
                  className={s.submitBtnElite}
                  disabled={(modalChecks.reduce((sum, c) => sum + (Number(c.amount) || 0), 0) + payments.filter(p => p.type !== "CHECK").reduce((s, p) => s + (Number(p.amount) || 0), 0) + totalRetentions) > totalApplied + 0.01}
                  style={{ 
                    opacity: (modalChecks.reduce((sum, c) => sum + (Number(c.amount) || 0), 0) + payments.filter(p => p.type !== "CHECK").reduce((s, p) => s + (Number(p.amount) || 0), 0) + totalRetentions) > totalApplied + 0.01 ? 0.5 : 1,
                    cursor: (modalChecks.reduce((sum, c) => sum + (Number(c.amount) || 0), 0) + payments.filter(p => p.type !== "CHECK").reduce((s, p) => s + (Number(p.amount) || 0), 0) + totalRetentions) > totalApplied + 0.01 ? 'not-allowed' : 'pointer'
                  }}
                  onClick={() => {
                    const otherPayments = payments.filter(p => p.type !== "CHECK");
                    setPayments([...otherPayments, ...modalChecks]);
                    setShowCheckModal(false);
                    showToast("Cheques vinculados al recibo", "success");
                  }}
                >
                  <Check size={16} /> Vincular al Recibo
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {showInvoiceModal && (
        <Modal open={showInvoiceModal} onClose={() => setShowInvoiceModal(false)} title="Vincular Facturas" wide>
          <div className={s.modalSection}>
            <table className={t.table}>
              <thead><tr><th style={{ width: 40 }}></th><th>Número</th><th>Fecha</th><th style={{ textAlign: "right" }}>Saldo</th></tr></thead>
              <tbody>
                {pendingInvoices.map((inv) => (
                  <tr key={inv.id} onClick={() => toggleInvoiceApplication(inv)}>
                    <td><input type="checkbox" checked={applications.some(a => a.to_document_id === inv.id)} readOnly /></td>
                    <td>{inv.number}</td>
                    <td>{new Date(inv.date).toLocaleDateString()}</td>
                    <td style={{ textAlign: "right" }}>{fmt(inv.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}
