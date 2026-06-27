import React, { useState, useEffect, useMemo } from "react";
import { ReceiptShell, ShellSection } from "./components/ReceiptShell/ReceiptShell";
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
  initialObservations = "",
  sourceInvoice = null,
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
  const [observations, setObservations] = useState(initialObservations || "");
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

  const isFromInvoice = Boolean(sourceInvoice);

  const addPayment = (type) => {
    const diffToPay = Math.max(0, totalApplied - totalPayments - totalRetentions);
    const amt = diffToPay > 0 ? diffToPay : 0;

    if (type === "CHECK") {
      const existingChecks = payments.filter(p => p.type === "CHECK");
      // If we are adding via button, we normally want to open the multi-grid
      setModalChecks(existingChecks.length > 0 ? existingChecks : [{
        id: Math.random(),
        type: "CHECK",
        amount: amt,
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
      amount: amt,
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
      // Notificar a ventanas abiertas (BroadcastChannel + CustomEvent)
      const invoiceIds = applications.map(a => a.to_document_id).filter(Boolean);
      const bcPayload = {
        type: "QUINTAL_DOCUMENT_SAVED",
        documentType: "receipt",
        receiptId: savedDoc.id,
        invoiceIds,
        entityId: entity?.id,
        timestamp: Date.now(),
      };
      try {
        const bc = new BroadcastChannel("quintal_events");
        bc.postMessage(bcPayload);
        bc.close();
      } catch (_) {}
      window.dispatchEvent(new CustomEvent("receipt-changed", { detail: bcPayload }));
      window.dispatchEvent(new CustomEvent("invoice-changed", { detail: bcPayload }));
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
    <ReceiptShell 
      headerTitle={mode === 'new' ? 'Nuevo Recibo' : `Recibo N° ${number || ''}`}
      headerSubtitle={isPayment ? 'Orden de Pago' : 'Recibo de Cobro'}
      headerStats={[
        { label: 'Estado', value: id ? 'Guardado' : 'Borrador', color: id ? 'var(--primary)' : 'var(--text-secondary)' },
        { label: 'Entidad', value: entity?.name || 'No seleccionada' },
        { label: 'Total Pagado', value: fmt(totalPayments + totalRetentions) }
      ]}
      topLeftContent={
        <ShellSection title="Parámetros">
          <div className={s.headerGrid} style={{ pointerEvents: mode === 'edit' ? 'none' : 'auto', opacity: mode === 'edit' ? 0.8 : 1 }}>
            <div className={s.headerGroup} style={{ gridColumn: 'span 6' }}>
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
            <div className={s.headerGroup} style={{ gridColumn: 'span 3' }}>
              <Input label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={mode === "edit"} />
            </div>
            <div className={s.headerGroup} style={{ gridColumn: 'span 3' }}>
              <Select label="Moneda" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={mode === "edit"}>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </Select>
            </div>
            <div className={s.headerGroup} style={{ gridColumn: 'span 3' }}>
              <Input label="Cotización" type="number" value={exchangeRate} onChange={(e) => setExchangeRate(Number(e.target.value))} disabled={mode === "edit"} />
            </div>
            <div className={s.headerGroup} style={{ gridColumn: 'span 3' }}>
              <Select label="PV" value={pv} onChange={(e) => setPv(e.target.value)} disabled={mode === "edit"}>
                {pointsOfSale.map((p) => <option key={p.id} value={p.pv}>{p.pv}</option>)}
              </Select>
            </div>
            <div className={s.headerGroup} style={{ gridColumn: 'span 6' }}>
              <Input label="Número" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="0001-00000001" disabled={mode === "edit"} />
            </div>
            <div className={s.headerGroup} style={{ gridColumn: 'span 6' }}>
              <Input label="Concepto / Detalle" value={observations} onChange={(e) => setObservations(e.target.value)} disabled={mode === 'edit'} />
            </div>
            <div className={s.headerGroup} style={{ gridColumn: 'span 3' }}>
              <Select label="C. Costo" value={ctroCosto} onChange={(e) => setCtroCosto(e.target.value)} disabled={mode === "edit"}>
                <option value="1">1</option><option value="2">2</option>
              </Select>
            </div>
            <div className={s.headerGroup} style={{ gridColumn: 'span 3' }}>
              <label className={s.fileLabel}>
                <Upload size={16} /> 
                {uploading ? "Subiendo..." : (attachmentUrl ? "Cambiar Adjunto" : "Adjuntar Comprobante")}
                <input type="file" onChange={handleFileUpload} style={{ display: "none" }} />
              </label>
              {attachmentUrl && <div className={s.fileOk} title={attachmentUrl}><Check size={12} /></div>}
            </div>
          </div>
        </ShellSection>
      }
      summaryContent={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className={s.summaryRow} style={{ color: 'var(--text-secondary)' }}>
            <span>Total Aplicado a Facturas:</span>
            <span>{fmt(totalApplied)}</span>
          </div>
          <div className={s.summaryRow} style={{ color: 'var(--text-secondary)' }}>
            <span>Total Medios de Pago:</span>
            <span>{fmt(totalPayments)}</span>
          </div>
          <div className={s.summaryRow} style={{ color: 'var(--text-secondary)' }}>
            <span>Total Retenciones:</span>
            <span>{fmt(totalRetentions)}</span>
          </div>
          <div className={`${s.summaryRow} ${s.total}`}>
            <span>Total Recibo:</span>
            <span>{fmt(totalPayments + totalRetentions)}</span>
          </div>
          <div className={`${s.summaryRow} ${difference < -0.01 ? s.warning : ''}`} style={{ fontWeight: 600 }}>
            <span>Diferencia:</span>
            <span style={{ color: difference < -0.01 ? 'red' : 'inherit' }}>{fmt(difference)}</span>
          </div>
        </div>
      }
      summaryFooter={
        <>
          {mode === 'edit' && id && (
            <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', padding: '8px 12px', borderRadius: 6, fontSize: 13, color: '#9a3412', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>La edición directa de recibos aplicados no está soportada contablemente. Para modificarlo, anulá este cobro y generá uno nuevo.</span>
            </div>
          )}
          {mode === 'view' ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" className={s.btnPrimary} style={{ flex: 1 }} onClick={() => window.location.href = window.location.href.replace('mode=view', 'mode=edit')}>
                Editar
              </button>
              <button type="button" className={s.btnSecondary} onClick={handlePrint}>
                Imprimir
              </button>
              <button type="button" className={s.btnSecondary} onClick={() => window.close()}>
                Cerrar
              </button>
            </div>
          ) : (
            <button type="button" className={s.btnPrimary} disabled={isSaving || !entity || totalPayments + totalRetentions <= 0 || difference < -0.01} onClick={handleSave}>
              <Save size={18} /> Confirmar
            </button>
          )}
        </>
      }
      bottomContent={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* APLICACIONES (FACTURAS) */}
          <ShellSection title="Facturas Aplicadas">
            {pendingInvoices.length > 0 && mode !== 'view' && (
              <div style={{ marginBottom: 12 }}>
                <button type="button" className={s.btnSecondary} onClick={autoApply}>
                  Aplicar Automáticamente
                </button>
              </div>
            )}
            
            {(mode === 'view' ? applications : pendingInvoices).length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                No hay facturas aplicadas.
              </div>
            ) : (
              <table className={t.table}>
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th>Fecha</th>
                    <th>Moneda</th>
                    <th style={{ textAlign: 'right' }}>Saldo Pendiente</th>
                    <th style={{ textAlign: 'right' }}>A Aplicar</th>
                  </tr>
                </thead>
                <tbody>
                  {(mode === 'view' ? applications : pendingInvoices).map((inv) => {
                    const isSelected = applications.some((a) => a.to_document_id === inv.id || a.to_document_id === inv.to_document_id);
                    const app = applications.find((a) => a.to_document_id === inv.id || a.to_document_id === inv.to_document_id);
                    return (
                      <tr key={inv.id || inv.to_document_id} className={isSelected ? t.selectedRow : ""}>
                        <td>
                          {mode !== 'view' && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleInvoiceApplication(inv)}
                              style={{ marginRight: 8 }}
                            />
                          )}
                          {inv.number}
                        </td>
                        <td>{new Date(inv.date).toLocaleDateString()}</td>
                        <td>{inv.currency}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(inv.remaining)}</td>
                        <td style={{ textAlign: 'right' }}>
                          {mode === 'view' ? (
                            fmt(app?.amount_applied || 0)
                          ) : (
                            isSelected ? (
                              <Input
                                type="number"
                                value={app?.amount_applied || 0}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setApplications(applications.map((a) => 
                                    a.to_document_id === (inv.id || inv.to_document_id) ? { ...a, amount_applied: val } : a
                                  ));
                                }}
                                style={{ width: 120, marginLeft: 'auto' }}
                              />
                            ) : (
                              "-"
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </ShellSection>

          {/* MEDIOS DE PAGO */}
          <ShellSection 
            title="Medios de Pago" 
            toolbar={
              mode !== 'view' && (
                <div style={{ display: 'flex', gap: 8, padding: '12px 16px' }}>
                  {[{ value: "CASH", label: "Efectivo" }, { value: "CHECK", label: "Cheque" }, { value: "TRANSFER", label: "Transferencia" }, { value: "OTHER", label: "Otro" }].map(m => (
                    <button key={m.value} type="button" className={s.btnSecondary} onClick={() => addPayment(m.value)}>
                      + {m.label}
                    </button>
                  ))}
                </div>
              )
            }
          >
            {payments.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                No hay medios de pago cargados.
              </div>
            ) : (
              <table className={t.table}>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Detalle</th>
                    <th style={{ textAlign: 'right' }}>Monto</th>
                    {mode !== 'view' && <th style={{ width: 60 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.type}</td>
                      <td>
                        {mode === 'view' ? (
                          p.type === 'CASH' ? 'Efectivo' :
                          p.type === 'CHECK' ? `Cheque ${p.reference_number || ''}` :
                          p.type === 'TRANSFER' ? `Transf. ${p.reference_number || ''}` : p.description
                        ) : (
                          <Input 
                            value={p.type === 'CHECK' ? p.reference_number : p.description} 
                            onChange={(e) => updatePayment(p.id, p.type === 'CHECK' ? 'reference_number' : 'description', e.target.value)} 
                            placeholder="Detalle..."
                          />
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {mode === 'view' ? (
                          fmt(p.amount)
                        ) : (
                          <Input 
                            type="number" 
                            value={p.amount} 
                            onChange={(e) => updatePayment(p.id, 'amount', e.target.value)}
                            style={{ width: 120, marginLeft: 'auto' }}
                          />
                        )}
                      </td>
                      {mode !== 'view' && (
                        <td>
                          <button type="button" className={s.iconBtn} onClick={() => removePayment(p.id)} style={{ color: 'red' }}>
                            <Trash2 size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ShellSection>

        </div>
      }
    />
  );
}
