import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ContentHeader from "../../components/layout/ContentHeader";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import Autocomplete from "../../components/ui/Autocomplete";
import { useWindow } from "../../context/WindowContext";
import s from "./PurchaseOrderForm.module.css";
import t from "../../components/ui/Table.module.css";
import Modal from "../../components/ui/Modal";
import Badge from "../../components/ui/Badge";
import Card from "../../components/ui/Card";
import {
  Save,
  Ban,
  Plus,
  Trash2,
  Printer,
  Combine,
  Receipt,
  Eye,
  Link2Off,
  History,
  PackageCheck,
  Paperclip,
  X,
  Mail,
  ChevronDown,
  Calculator,
  ShoppingCart,
  Truck
} from "lucide-react";
import { useToast } from "../../context/ToastContext";
import { API_URL } from "../../config";
import { padPV, padNumber, splitFullNumber, joinFullNumber } from "../../utils/formatters";

export default function PurchaseOrderForm({
  isWindow,
  windowId,
  mode: initialMode = "new",
  id: initialId = null,
}) {
  const navigate = useNavigate();
  const { openWindow, closeWindow } = useWindow();
  const { showToast } = useToast();

  const [mode, setMode] = useState(initialMode);
  const [id, setId] = useState(initialId);

  // ── State ──
  const [loading, setLoading] = useState(mode === "edit");
  const [items, setItems] = useState([]);
  const [supplier, setSupplier] = useState(null);

  // Header Fields
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [pvOptions, setPvOptions] = useState([]);
  const [pv, setPv] = useState("0001");
  const [number, setNumber] = useState("");
  const [isLoadingNumber, setIsLoadingNumber] = useState(false);
  const [isNumberDirty, setIsNumberDirty] = useState(false);
  
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [status, setStatus] = useState("DRAFT");
  const [notes, setNotes] = useState("");
  const [generalDiscount, setGeneralDiscount] = useState(0);
  const [activeTab, setActiveTab] = useState("items");
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);
  const [costCenterVal, setCostCenterVal] = useState("1");
  const [selectedConditionId, setSelectedConditionId] = useState("");
  const [saleConditions, setSaleConditions] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [salespersonId, setSalespersonId] = useState("");
  const [vendedor, setVendedor] = useState("");
  
  const [deliveryNotesHistory, setDeliveryNotesHistory] = useState([]);
  const [saveError, setSaveError] = useState(null);
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Crossing Modal State
  const [showCrossModal, setShowCrossModal] = useState(false);
  const [crossForm, setCrossForm] = useState({ warehouse_id: '', number: '', notes: '', pv: '0001', date: new Date().toISOString().split('T')[0] });
  const [crossLines, setCrossLines] = useState([]);

  // ── Effects ──
  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}` };
    fetch(`${API_URL}/config/pos`, { headers })
      .then((res) => res.json())
      .then((data) => {
        setPvOptions(data);
        if (data.length > 0 && mode === "new" && !pv) {
          setPv(data[0].pv || "0001");
        }
      })
      .catch((err) => console.error("Error fetching POS config:", err));
  }, [mode, pv]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}` };
    fetch(`${API_URL}/inventory/warehouses/`, { headers })
      .then((res) => res.json())
      .then((data) => {
        setWarehouses(data);
        if (data.length > 0 && !selectedWarehouseId) {
          setSelectedWarehouseId(data[0].id);
        }
      })
      .catch((err) => console.error("Error fetching warehouses:", err));

    fetch(`${API_URL}/sales/sale-conditions/`, { headers })
      .then(r => r.json())
      .then(setSaleConditions);

    fetch(`${API_URL}/entities/?is_salesperson=true`, { headers })
      .then(r => r.json())
      .then(setSellers);
  }, []);

  useEffect(() => {
    if (mode === "edit" && id) {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      fetch(`${API_URL}/purchases/purchase-orders/${id}`, { headers })
        .then((res) => res.json())
        .then((data) => {
          const { pv: loadedPv, num: loadedNum } = splitFullNumber(data.number);
          setPv(loadedPv);
          setNumber(loadedNum);
          setDate(data.date ? data.date.split("T")[0] : "");
          if (data.warehouse_id) setSelectedWarehouseId(data.warehouse_id);
          if (data.currency) setCurrency(data.currency);
          if (data.exchange_rate) setExchangeRate(Number(data.exchange_rate));
          if (data.notes) setNotes(data.notes);
          if (data.status) setStatus(data.status);
          if (data.delivery_notes) setDeliveryNotesHistory(data.delivery_notes);
          if (data.due_date) setDueDate(data.due_date.split("T")[0]);
          if (data.cost_center) setCostCenterVal(String(data.cost_center));
          if (data.sale_condition_id) setSelectedConditionId(data.sale_condition_id);
          if (data.salesperson_id) setSalespersonId(data.salesperson_id);
          if (data.vendedor) setVendedor(data.vendedor);

          if (data.entity_id) {
            fetch(`${API_URL}/entities/${data.entity_id}`, { headers })
              .then((r) => r.json())
              .then((ent) => setSupplier(ent));
          }
          if (data.lines) {
            setItems(
              data.lines.map((l) => {
                const item = {
                  ...l,
                  id_db: l.id,
                  id: l.id || Math.random(),
                  product_id: l.product_id,
                  description: l.description,
                  qty_containers: Number(l.qty),
                  qty_per_container: 1,
                  container_name: "Unid.",
                  unit_name: "Unid",
                  qty: Number(l.qty),
                  price: Number(l.unit_price),
                  vat: Number(l.vat_rate || 0.21),
                  discount: Number(l.discount_pct || 0),
                  qty_delivered: Number(l.qty_delivered || 0)
                };
                return calculateLine(item);
              }),
            );
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setLoading(false);
        });
    }
  }, [mode, id]);

  const fetchNextNumber = async (currentPv) => {
    if (!currentPv || mode !== "new" || isNumberDirty) return;
    setIsLoadingNumber(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`${API_URL}/purchases/purchase-orders/next-number?pv=${currentPv}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const { pv: nextPv, num: nextNum } = splitFullNumber(data.number);
        setPv(nextPv);
        setNumber(nextNum);
      }
    } catch (err) {
      console.error("Error generating number:", err);
    } finally {
      setIsLoadingNumber(false);
    }
  };

  useEffect(() => {
    if (mode === "new" && !isNumberDirty) {
      fetchNextNumber(pv);
    }
  }, [pv, mode, isNumberDirty]);

  const calculateLine = (item) => {
    const totalQty = item.qty_containers * (item.qty_per_container || 1);
    const sub = totalQty * item.price;
    const net = sub * (1 - (item.discount || 0) / 100);
    const vatAmount = net * (item.vat || 0);
    return {
      ...item,
      qty: totalQty,
      subtotal: sub,
      net: net,
      vatAmount: vatAmount,
      lineTotal: net + vatAmount,
    };
  };

  const searchSuppliers = async (q) => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`${API_URL}/entities/?type=provider&q=${q}`, { headers });
      return await res.json();
    } catch (e) {
      return [];
    }
  };

  const searchProducts = async (q) => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`${API_URL}/inventory/products?q=${q}&active=true`, { headers });
      const data = await res.json();
      return data.map(p => ({
        ...p,
        container_name: p.container?.name || "Unid.",
        qty_per_container: p.quantity_per_container || 1,
        iva_rate: p.tax_type?.rate || 0.21,
        unit_name: p.container?.unit?.short_name || "Unid"
      }));
    } catch (e) {
      return [];
    }
  };

  const handleAddItem = (product) => {
    if (!product) return;
    const newItem = calculateLine({
      id: Date.now(),
      product_id: product.id,
      description: product.name,
      qty_containers: 1,
      container_name: product.container_name || "Unid.",
      qty_per_container: product.qty_per_container || 1,
      unit_name: product.unit_name || "Unid",
      qty: product.qty_per_container || 1,
      price: product.price || 0,
      discount: 0,
      vat: product.iva_rate || 0.21,
      qty_delivered: 0
    });
    setItems([...items, newItem]);
  };

  const updateItem = (id, field, value) => {
    setItems(
      items.map((i) => (i.id === id ? calculateLine({ ...i, [field]: value }) : i))
    );
  };

  const removeItem = (id) => {
    setItems(items.filter((i) => i.id !== id));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`${API_URL}/uploads/`, {
        method: 'POST',
        headers,
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setAttachmentUrl(`${API_URL}${data.url}`);
        showToast("Archivo subido", "success");
      }
    } catch (e) {
      showToast("Error subiendo archivo", "error");
    } finally {
      setUploading(false);
    }
  };

  const handlePrint = async () => {
    if (!id) return;
    try {
      showToast('Generando PDF...', 'info');
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`${API_URL}/purchases/purchase-orders/${id}/pdf`, { headers });
      if (!res.ok) throw new Error('Error al generar PDF');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `OC_${number}.pdf`;
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
    if (!supplier || !supplier.email) {
      showToast("El proveedor no tiene un email configurado.", "warning");
      return;
    }
    try {
      showToast('Enviando correo...', 'info');
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/purchases/purchase-orders/${id}/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          to_email: supplier.email
        })
      });
      if (!res.ok) throw new Error('Error al enviar correo');
      
      showToast("Correo enviado con éxito", "success");
    } catch (e) {
      showToast('Error al enviar correo', 'error');
    }
  };

  const handleSave = async () => {
    if (!supplier) return showToast("Seleccione un proveedor", "error");
    if (items.length === 0) return showToast("Agregue al menos un ítem", "error");

    const payload = {
      entity_id: supplier.id,
      date,
      number: joinFullNumber(pv, number),
      currency,
      exchange_rate: exchangeRate,
      notes,
      due_date: dueDate,
      cost_center: parseInt(costCenterVal),
      sale_condition_id: selectedConditionId,
      salesperson_id: salespersonId,
      vendedor: vendedor,
      lines: items.map((i) => ({
        product_id: i.product_id,
        description: i.description,
        qty: i.qty,
        unit_price: i.price,
        vat_rate: i.vat,
        discount_pct: i.discount,
      })),
      attachment_url: attachmentUrl,
    };

    setSaveError(null);
    try {
      const method = mode === "new" ? "POST" : "PUT";
      const url = mode === "new" ? `${API_URL}/purchases/purchase-orders/` : `${API_URL}/purchases/purchase-orders/${id}`;
      const token = localStorage.getItem('token');
      const res = await fetch(url, {
        method,
        headers: { 
          "Content-Type": "application/json",
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const saved = await res.json();
        showToast("Guardado exitosamente", "success");
        window.dispatchEvent(new CustomEvent("purchase-order-changed"));
        if (mode === "new") {
          setMode("edit");
          setId(saved.id);
          setStatus(saved.status);
        }
      } else {
        const err = await res.json();
        setSaveError(err.detail || "Error desconocido");
      }
    } catch (e) {
      setSaveError("Error de conexión");
    }
  };

  const handleCancel = () => {
    isWindow ? closeWindow(windowId) : navigate(-1);
  };

  const handleDelete = async () => {
    if (!window.confirm("¿Eliminar esta orden?")) return;
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`${API_URL}/purchases/purchase-orders/${id}`, { 
        method: "DELETE",
        headers
      });
      if (res.ok) {
        showToast("Eliminado", "success");
        window.dispatchEvent(new CustomEvent("purchase-order-changed"));
        isWindow ? closeWindow(windowId) : navigate(-1);
      }
    } catch (e) {
      showToast("Error", "error");
    }
  };

  const handleEmitirRemito = () => {
    const lines = items.map(i => {
      const remaining = i.qty - (i.qty_delivered || 0);
      return {
        source_purchase_line_id: i.id_db || i.id,
        description: i.description,
        qty_ordered: i.qty,
        qty_delivered: i.qty_delivered || 0,
        qty_to_deliver: remaining,
        selected: remaining > 0
      };
    });
    setCrossLines(lines);
    setCrossForm({ ...crossForm, warehouse_id: selectedWarehouseId, date: new Date().toISOString().split('T')[0], pv: '0001', number: '' });
    setShowCrossModal(true);
  };

  const submitInternalCrossRemito = async (e) => {
    e.preventDefault();
    if (!crossForm.warehouse_id || !crossForm.number) return showToast("Faltan datos obligatorios", "error");
    const validLines = crossLines.filter(l => l.selected && l.qty_to_deliver > 0);
    if (validLines.length === 0) return showToast("Seleccione al menos un ítem", "error");

    const payload = {
      warehouse_id: crossForm.warehouse_id,
      number: joinFullNumber(crossForm.pv || "0001", crossForm.number),
      notes: crossForm.notes,
      lines: validLines.map(l => ({
        source_purchase_line_id: l.source_purchase_line_id,
        description: l.description,
        qty: l.qty_to_deliver
      }))
    };

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/sales/delivery-notes/from-oc/${id}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const created = await res.json();
        showToast("Remito creado exitosamente", "success");
        setShowCrossModal(false);
        window.dispatchEvent(new CustomEvent("delivery-note-changed"));
        window.dispatchEvent(new CustomEvent("purchase-order-changed", { detail: { id } }));
        openWindow(
          'delivery-note',
          { id: created.id, mode: 'edit' },
          { title: `Remito ${created.number}`, width: 1200, height: 650 }
        );
        // Refresh items to update delivered quantity
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        fetch(`${API_URL}/sales/delivery-notes/by-oc/${id}`, { headers })
           .then(r => r.json())
           .then(dns => setDeliveryNotesHistory(dns));
        
        fetch(`${API_URL}/purchases/purchase-orders/${id}`, { headers })
          .then(r => r.json())
          .then(data => {
            if (data.lines) {
              setItems(data.lines.map(l => calculateLine({
                ...l,
                id_db: l.id,
                id: l.id,
                qty_containers: Number(l.qty),
                qty_per_container: 1,
                qty: Number(l.qty),
                price: Number(l.unit_price),
                vat: Number(l.vat_rate || 0.21),
                discount: Number(l.discount_pct || 0),
                qty_delivered: Number(l.qty_delivered || 0)
              })));
            }
            if (data.delivery_notes) setDeliveryNotesHistory(data.delivery_notes);
            setLoading(false);
          });
      } else {
        const err = await res.json();
        showToast(err.detail || 'Error al crear remito', "error");
      }
    } catch (e) {
      showToast("Error de conexión", "error");
    }
  };

  const itemSummary = items.reduce(
    (acc, i) => {
      acc.subtotal += i.subtotal;
      acc.bonif += i.subtotal * (i.discount / 100);
      acc.net += i.net;
      acc.vat += i.vatAmount;
      acc.total += i.lineTotal;
      return acc;
    },
    { subtotal: 0, bonif: 0, net: 0, vat: 0, total: 0 }
  );

  const finalTotal = itemSummary.total - generalDiscount;

  const fmt = (n) =>
    n.toLocaleString("es-AR", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
    });

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-secondary)' }}>
       <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
       <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.05em' }}>CARGANDO ORDEN DE COMPRA...</div>
    </div>
  );

  return (
    <div className={s.container} style={isWindow ? { height: "100%" } : {}}>
      <div className={s.headerSection}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className={s.titleGroup}>
            <div className={s.iconWrapper}>
               <ShoppingCart size={20} />
            </div>
            <div className={s.titleText}>
               <h2>Orden de Compra</h2>
               <div className={s.badgeStatus}>{status}</div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {attachmentUrl && (
              <button className={s.headerActionBtn} onClick={() => setPreviewUrl(attachmentUrl)} title="Ver Comprobante Adjunto">
                <Eye size={18} />
              </button>
            )}
            <div className={s.attachmentWrapper}>
               <input 
                  type="file" 
                  id="headerFile" 
                  style={{ display: 'none' }} 
                  onChange={handleFileUpload} 
                  accept="image/*,application/pdf"
               />
               <label htmlFor="headerFile" className={s.headerActionBtn} title="Adjuntar Documento">
                  {uploading ? <div className={s.uploadSpinner} /> : <Paperclip size={18} />}
               </label>
            </div>
            
            <div style={{ width: 1, height: 28, background: '#e2e8f0', margin: '0 4px' }} />

            <button className={s.headerActionBtn} onClick={handleSave} title="Sincronizar cambios" style={{ color: '#16a34a', borderColor: '#16a34a' }}><Save size={18} /></button>
            <button className={s.headerActionBtn} disabled={mode === 'new'} onClick={handleEmitirRemito} title="Registrar Ingreso (Remitir)"><Truck size={18} /></button>
            <button className={s.headerActionBtn} disabled={mode === 'new'} onClick={() => openWindow('purchase-invoice-form', { initialSourceType: 'purchase-order', initialSourceId: id }, { title: 'Cargar Factura de Compra', width: 1100, height: 700 })} title="Cargar Factura de Compra"><Receipt size={18} /></button>
            
            <div style={{ width: 1, height: 28, background: '#e2e8f0', margin: '0 4px' }} />

            <button className={s.headerActionBtn} onClick={handlePrint} title="Imprimir / Exportar"><Printer size={18} /></button>
            <button className={s.headerActionBtn} onClick={handleSendEmail} title="Enviar por Email"><Mail size={18} /></button>
            {mode === 'edit' && <button className={s.headerActionBtn} onClick={handleDelete} title="Eliminar Orden" style={{ color: '#ef4444' }}><Trash2 size={18} /></button>}
            <button className={s.headerActionBtn} onClick={handleCancel} style={{ color: '#ef4444' }} title="Cerrar ventana"><X size={18} /></button>
          </div>
        </div>

        <div className={s.headerGrid}>
           <div className={s.field}>
              <Autocomplete label="Proveedor" onSearch={searchSuppliers} onSelect={setSupplier} initialValue={supplier} renderItem={(c) => c.name} placeholder="Buscar proveedor..." minChars={0} />
           </div>
           <div className={s.field}>
              <Select label="PV" value={pv} onChange={(e) => setPv(e.target.value)}>
                {pvOptions.filter(opt => opt.document_configs?.some(c => c.document_type === 'OC')).map(opt => (
                    <option key={opt.pv} value={opt.pv}>{opt.pv} - {opt.name}</option>
                ))}
                {!pvOptions.some(opt => opt.pv === pv) && <option value={pv}>{pv}</option>}
              </Select>
           </div>
           <div className={s.field}>
              <Input label="Número" value={number} onChange={(e) => { setNumber(e.target.value); setIsNumberDirty(true); }} onBlur={() => setNumber(padNumber(number))} placeholder="00000001" disabled={isLoadingNumber} />
           </div>
           <div className={s.field}>
              <Input label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
           </div>
           <div className={s.field}>
              <Input label="Vencimiento" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
           </div>

           {/* Row 2 */}
           <div className={s.field}>
              <Select label="Depósito Recepción" value={selectedWarehouseId} onChange={(e) => setSelectedWarehouseId(e.target.value)}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
           </div>
           <div className={s.field}>
                <Select label="Comprador" value={salespersonId} onChange={(e) => {
                    setSalespersonId(e.target.value);
                    const sel = sellers.find(s => s.id === e.target.value);
                    if (sel) setVendedor(sel.name);
                }}>
                  <option value="">Seleccionar...</option>
                  {sellers.map(sel => <option key={sel.id} value={sel.id}>{sel.name}</option>)}
                </Select>
           </div>
           <div className={s.field}>
                <Select label="CC" value={costCenterVal} onChange={(e) => setCostCenterVal(e.target.value)}>
                    <option value="1">1 - ARCA</option>
                    <option value="2">2 - Interno</option>
                </Select>
           </div>
           <div className={s.field}>
                <Select label="Condición de Pago" value={selectedConditionId} onChange={(e) => setSelectedConditionId(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {saleConditions.map(c => <option key={c.id} value={c.id}>{c.description}</option>)}
                </Select>
           </div>
           <div className={s.field}>
                <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ flex: 1 }}>
                         <Select label="Mon." value={currency} onChange={(e) => setCurrency(e.target.value)}>
                             <option value="USD">USD</option>
                             <option value="ARS">ARS</option>
                         </Select>
                    </div>
                    <div style={{ width: 70 }}>
                         <Input label="TC" type="number" step="0.01" value={exchangeRate} onChange={(e) => setExchangeRate(Number(e.target.value) || 0)} />
                    </div>
                </div>
           </div>
        </div>
      </div>

      <div className={s.tabContainer}>
        <button className={`${s.tabButton} ${activeTab === "items" ? s.tabButtonActive : ""}`} onClick={() => setActiveTab("items")}>Ítems</button>
        <button className={`${s.tabButton} ${activeTab === "notes" ? s.tabButtonActive : ""}`} onClick={() => setActiveTab("notes")}>Notas</button>
        <button className={`${s.tabButton} ${activeTab === "seguimiento" ? s.tabButtonActive : ""}`} onClick={() => setActiveTab("seguimiento")}>Seguimiento</button>
      </div>

      <div className={s.itemsSection}>
        {activeTab === "items" && (
          <div className={`${s.itemsScroll} ${s.tabContentFade}`}>
            <Autocomplete 
              placeholder="Buscar y agregar producto a la orden..." 
              onSearch={searchProducts} 
              onSelect={handleAddItem} 
              renderItem={(p) => `${p.sku ? p.sku + " - " : ""}${p.name}`} 
              minChars={0} clearOnSelect={true}
            />
            <div className={s.tableWrap}>
            <table className={t.table} style={{ width: "100%", marginTop: 0 }}>
              <thead>
                <tr>
                  <th>DESCRIPCIÓN</th>
                  <th style={{ width: 100, textAlign: "left" }}>ENVASE</th>
                  <th style={{ width: 70, textAlign: "right" }}>BULTOS</th>
                  <th style={{ width: 70, textAlign: "right" }}>CANT. TOTAL</th>
                  <th style={{ width: 40, textAlign: "left" }}>UNID</th>
                  <th style={{ width: 90, textAlign: "right" }}>COSTO UNIT.</th>
                  <th style={{ width: 70, textAlign: "right" }}>BONIF.%</th>
                  <th style={{ width: 100, textAlign: "right" }}>SUBTOTAL</th>
                  <th style={{ width: 100, textAlign: "right" }}>IVA ($)</th>
                  <th style={{ width: 100, textAlign: "right" }}>TOTAL ($)</th>
                  <th style={{ width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                      <td>
                        <input
                          type="text"
                          className={s.inlineInput}
                          value={item.description || ''}
                          onChange={(e) => updateItem(item.id, "description", e.target.value)}
                          placeholder="Ingrese concepto..."
                          style={{ width: '100%', background: 'transparent' }}
                        />
                      </td>
                    <td style={{ textAlign: "left", color: 'var(--text-secondary)', fontSize: 13 }}>{item.container_name}</td>
                    <td style={{ textAlign: "right" }}>
                      <input type="number" className={s.inlineInput} value={item.qty_containers} onChange={(e) => updateItem(item.id, "qty_containers", Number(e.target.value))} style={{ width: 60, textAlign: "right" }} />
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 'bold' }}>{item.qty}</td>
                    <td style={{ textAlign: "left", color: 'var(--text-secondary)', fontSize: 13 }}>{item.unit_name}</td>
                    <td style={{ textAlign: "right" }}>
                      <input type="number" className={s.inlineInput} value={item.price} onChange={(e) => updateItem(item.id, "price", Number(e.target.value))} style={{ textAlign: "right", width: 80 }} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <input type="number" className={s.inlineInput} value={item.discount} onChange={(e) => updateItem(item.id, "discount", Number(e.target.value))} style={{ textAlign: "right", width: 50, color: '#16a34a' }} />
                    </td>
                    <td style={{ textAlign: "right" }}>{fmt(item.subtotal)}</td>
                    <td style={{ textAlign: "right" }}>{fmt(item.vatAmount)}</td>
                    <td style={{ textAlign: "right", color: '#16a34a', fontWeight: 'bold' }}>{fmt(item.lineTotal)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className={s.iconBtn} onClick={() => removeItem(item.id)}>&times;</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {activeTab === "notes" && (
          <div style={{ padding: 16 }}>
            <textarea className={s.notes} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas internas..." />
          </div>
        )}

        {activeTab === "seguimiento" && (
          <div className={`${s.itemsScroll} ${s.tabContentFade}`} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
             
             {/* ── Visual Roadmap ── */}
             <div className={s.roadmap}>
                <div className={`${s.roadmapStep} ${status === 'DRAFT' ? s.active : s.complete}`}>
                   <div className={s.stepIcon}><FileText size={18} /></div>
                   <span className={s.stepLabel}>Orden {status === 'DRAFT' ? '(Borrador)' : ''}</span>
                   <div className={`${s.stepLine} ${status !== 'DRAFT' ? s.complete : ''}`} />
                </div>
                
                <div className={`${s.roadmapStep} ${items.some(i => i.qty_delivered > 0) ? (items.every(i => i.qty_delivered >= i.qty) ? s.complete : s.active) : ''}`}>
                   <div className={s.stepIcon}><Truck size={18} /></div>
                   <span className={s.stepLabel}>Recepción</span>
                   <div className={`${s.stepLine} ${items.every(i => i.qty_delivered >= i.qty) && items.length > 0 ? s.complete : ''}`} />
                </div>

                <div className={`${s.roadmapStep} ${status === 'CLOSED' ? s.complete : ''}`}>
                   <div className={s.stepIcon}><Receipt size={18} /></div>
                   <span className={s.stepLabel}>Facturación</span>
                </div>
             </div>

             <Card title="Progreso de Recepción" noPad style={{ border: '1px solid var(--border-color)', boxShadow: 'none' }}>
                <table className={t.table}>
                   <thead>
                      <tr>
                         <th>Producto / Descripción</th>
                         <th style={{ textAlign: 'right' }}>Pedido</th>
                         <th style={{ textAlign: 'right' }}>Recibido</th>
                         <th style={{ textAlign: 'right' }}>Pendiente</th>
                         <th style={{ width: 150 }}>Progreso</th>
                      </tr>
                   </thead>
                   <tbody>
                      {items.map(l => {
                         const pend = l.qty - (l.qty_delivered || 0);
                         const pct = Math.min(100, (l.qty_delivered || 0) / l.qty * 100);
                         return (
                            <tr key={l.id}>
                               <td>{l.description}</td>
                               <td style={{ textAlign: 'right' }}>{l.qty}</td>
                               <td style={{ textAlign: 'right', color: 'var(--ok)', fontWeight: 600 }}>{l.qty_delivered || 0}</td>
                               <td style={{ textAlign: 'right', color: pend > 0 ? 'var(--warn)' : 'var(--ok)', fontWeight: 600 }}>{pend}</td>
                               <td>
                                  <div style={{ width: '100%', height: 6, background: 'var(--bg-page)', borderRadius: 3, overflow: 'hidden' }}>
                                     <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--ok)' : 'var(--primary)' }} />
                                  </div>
                               </td>
                            </tr>
                         );
                      })}
                   </tbody>
                </table>
             </Card>

             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Card title="Remitos Recibidos" noPad style={{ border: '1px solid var(--border-color)', boxShadow: 'none' }}
                   actions={status !== 'DRAFT' && <Button size="sm" variant="ghost" onClick={handleEmitirRemito}><Plus size={14} /> Nuevo</Button>}
                >
                   {deliveryNotesHistory.length === 0 ? (
                      <div style={{ padding: 20, textAlign: 'center', opacity: 0.5, fontSize: 13 }}>No hay remitos de entrada registrados.</div>
                   ) : (
                      <table className={t.table}>
                         <thead><tr><th>Número</th><th>Fecha</th><th>Estado</th><th style={{ width: 40 }}></th></tr></thead>
                         <tbody>
                            {deliveryNotesHistory.map(dn => (
                               <tr key={dn.id}>
                                  <td><strong>{dn.number}</strong></td>
                                  <td>{new Date(dn.date).toLocaleDateString()}</td>
                                  <td><Badge variant={dn.status}>{dn.status}</Badge></td>
                                   <td style={{ textAlign: 'right' }}>
                                      <Button size="sm" variant="ghost" onClick={() => openWindow('pdf-viewer', { id: dn.id, docType: 'delivery-note' }, { title: `Remito ${dn.number}`, width: 1000, height: 750 })}><Eye size={14} /></Button>
                                   </td>
                               </tr>
                            ))}
                         </tbody>
                      </table>
                   )}
                </Card>

                <Card title="Facturas de Compra" noPad style={{ border: '1px solid var(--border-color)', boxShadow: 'none' }}
                   actions={status !== 'DRAFT' && <Button size="sm" variant="ghost" onClick={() => openWindow('purchase-invoice-form', { initialSourceType: 'purchase-order', initialSourceId: id }, { title: 'Cargar Factura de Compra', width: 1100, height: 700 })}><Plus size={14} /> Cargar</Button>}
                >
                   <div style={{ padding: 20, textAlign: 'center', opacity: 0.5, fontSize: 13 }}>Facturas vinculadas a esta orden.</div>
                </Card>
             </div>
          </div>
        )}
      </div>

      {saveError && (
        <div style={{ padding: '8px 16px', background: 'var(--bad-light)', color: 'var(--bad)', margin: '0 16px 12px', borderRadius: 8, fontSize: 13, border: '1px solid var(--bad)' }}>
           <strong>Error al guardar:</strong> {saveError}
        </div>
      )}

      {showCrossModal && (
        <Modal open={showCrossModal} onClose={() => setShowCrossModal(false)} title={`Recibir Mercadería - OC ${number}`} wide
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowCrossModal(false)}>Cancelar</Button>
              <Button onClick={submitInternalCrossRemito} style={{ background: 'var(--primary)', color: 'white' }}>Generar Recepción</Button>
            </>
          }
        >
          <div className={s.formContainer}>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <Card noPad style={{ padding: 16, border: '1px solid var(--border-color)', background: 'var(--bg-page)' }}>
                   <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Proveedor</div>
                   <div style={{ fontWeight: 600 }}>{supplier?.name}</div>
                </Card>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 140px 1fr', gap: 12 }}>
                   <Input label="PV" placeholder="0001" value={crossForm.pv} onChange={e => setCrossForm({...crossForm, pv: e.target.value})} onBlur={() => setCrossForm({...crossForm, pv: padPV(crossForm.pv)})} maxLength={4} />
                   <Input label="Número" placeholder="00000001" value={crossForm.number} onChange={e => setCrossForm({...crossForm, number: e.target.value})} onBlur={() => setCrossForm({...crossForm, number: padNumber(crossForm.number)})} />
                   <Select label="Depósito" value={crossForm.warehouse_id} onChange={e => setCrossForm({...crossForm, warehouse_id: e.target.value})}>
                      {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                   </Select>
                </div>
             </div>

             <Card title="Selección de Ítems" noPad style={{ border: '1px solid var(--border-color)', boxShadow: 'none' }}>
                <table className={t.table}>
                   <thead>
                      <tr>
                         <th style={{ width: 30 }}></th>
                         <th>Descripción</th>
                         <th style={{ textAlign: 'right' }}>Pedido</th>
                         <th style={{ textAlign: 'right' }}>Recibido</th>
                         <th style={{ textAlign: 'right', width: 100 }}>A Recibir</th>
                      </tr>
                   </thead>
                   <tbody>
                      {crossLines.map((l, i) => (
                         <tr key={i} style={{ opacity: l.selected ? 1 : 0.5 }}>
                            <td><input type="checkbox" checked={l.selected} onChange={e => {
                               const copy = [...crossLines];
                               copy[i].selected = e.target.checked;
                               setCrossLines(copy);
                            }} /></td>
                            <td>{l.description}</td>
                            <td style={{ textAlign: 'right' }}>{l.qty_ordered}</td>
                            <td style={{ textAlign: 'right' }}>{l.qty_delivered}</td>
                            <td style={{ textAlign: 'right' }}>
                               <input type="number" className={s.inlineInput} value={l.qty_to_deliver} 
                                 onChange={e => {
                                    const copy = [...crossLines];
                                    copy[i].qty_to_deliver = Number(e.target.value);
                                    setCrossLines(copy);
                                 }} 
                                 disabled={!l.selected}
                               />
                            </td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             </Card>
             <div style={{ marginTop: 12 }}>
                <Input label="Notas de Recepción" value={crossForm.notes} onChange={e => setCrossForm({...crossForm, notes: e.target.value})} />
             </div>
          </div>
        </Modal>
      )}

      <div className={s.footerSection}>
         <div className={s.horizontalFooter}>
           <div className={s.footerActions}>
             <div style={{ display: 'flex', gap: 12 }}>
                <div />
             </div>
           </div>

           <div className={s.footerTotals}>
             <div className={s.totalsGrid}>
               <div className={s.totalCell}>
                 <div className={s.totalLabel}>NETO GRAVADO</div>
                 <div className={s.totalValue}>{fmt(itemSummary.net)}</div>
               </div>
               <div className={s.totalCell}>
                 <div className={s.totalLabel}>BONIF.</div>
                 <div className={s.totalValue} style={{ color: '#2563EB' }}>- {fmt(itemSummary.bonif)}</div>
               </div>
               <div className={s.totalCell}>
                 <div className={s.totalLabel}>IVA</div>
                 <div className={s.totalValue}>{fmt(itemSummary.vat)}</div>
               </div>
               <div className={s.totalCell}>
                  <div className={s.totalLabel}>DESC. GRAL</div>
                  <input 
                    type="number" 
                    className={s.inlineInput} 
                    style={{ width: 80, textAlign: 'right', fontWeight: 700, marginTop: 4 }}
                    value={generalDiscount} 
                    onChange={(e) => setGeneralDiscount(Number(e.target.value))} 
                  />
               </div>
               <div className={s.grandTotalCell}>
                 <div className={s.totalLabel}>TOTAL {currency}</div>
                 <div className={s.totalValue}>{fmt(finalTotal)}</div>
               </div>
             </div>
           </div>
         </div>
       </div>
      {previewUrl && (
          <div className={s.previewOverlay} onClick={() => setPreviewUrl(null)}>
              <div className={s.previewContent} onClick={e => e.stopPropagation()}>
                  <div className={s.previewHeader}>
                      <h3>VISTA PREVIA DEL COMPROBANTE</h3>
                      <button className={s.closePreview} onClick={() => setPreviewUrl(null)}><X size={24} /></button>
                  </div>
                  <div className={s.previewBody}>
                      {previewUrl.toLowerCase().endsWith('.pdf') ? (
                          <iframe src={previewUrl} className={s.previewFrame} title="Documento PDF" />
                      ) : (
                          <img src={previewUrl} alt="Comprobante" className={s.previewImage} />
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
