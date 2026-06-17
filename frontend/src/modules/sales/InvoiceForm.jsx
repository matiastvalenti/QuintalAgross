import React, { useState, useEffect, useMemo } from "react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import Autocomplete from "../../components/ui/Autocomplete";
import AccountSelector from "../../components/ui/AccountSelector";
import { useWindow } from "../../context/WindowContext";
import { useToast } from "../../context/ToastContext";
import { API_URL } from "../../config";
import { TraceabilityStatusBadge } from "../../components/ui/TraceabilityStatusBadge";
import LoadingScreen from "../../components/ui/LoadingScreen";
import {
  Save, Trash2, Printer, X, Receipt, ShoppingBag, Truck, CreditCard,
  Building, User, Link2, Plus, Pencil, CheckCircle, Clock, Activity, FileText, ArrowRight, Search
} from "lucide-react";
import s from "./SalesOrderForm.module.css";
import { padPV, padNumber, joinFullNumber, splitFullNumber } from "../../utils/formatters";

export default function InvoiceForm(props) {
  const {
    mode: initialMode = "new",
    id: initialId = null,
    windowId,
    initialSourceType = null,
    initialSourceId = null,
    preselectedLines = null,
    draftId = null,
    isStandalone = false,
    initialDocType = "INVOICE"
  } = props;

  const { closeWindow, openWindow } = useWindow();
  const { showToast } = useToast();
  
  const [mode, setMode] = useState(initialMode);
  const [id, setId] = useState(initialId);
  const [loading, setLoading] = useState(initialMode === "edit");
  const [isReadOnly, setIsReadOnly] = useState(initialMode === "edit");

  // Header State
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);
  const [entity, setEntity] = useState(null);
  const [pv, setPv] = useState("0001");
  const [number, setNumber] = useState("");
  const [currency, setCurrency] = useState("ARS");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [status, setStatus] = useState("DRAFT");
  const [docType, setDocType] = useState(initialDocType);
  const [letter, setLetter] = useState("A");
  const [observations, setObservations] = useState("");
  const [selectedConditionId, setSelectedConditionId] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [ctroCosto, setCtroCosto] = useState("1");
  const [sourceNumber, setSourceNumber] = useState("");
  const [reasonType, setReasonType] = useState("");
  const [returnStock, setReturnStock] = useState(false);
  
  // Lines
  const [items, setItems] = useState([]);
  
  // Selectors
  const [saleConditions, setSaleConditions] = useState([]);
  const [pointsOfSale, setPointsOfSale] = useState([]);
  const [sellers, setSellers] = useState([]);

  useEffect(() => {
    fetchInitialData();
    if (mode === "edit" && id) fetchInvoice();
    else if (mode === "new" && initialSourceType === "sales-order" && initialSourceId) {
        fetchFromSource();
    }
  }, []);

  const fetchInitialData = async () => {
    const token = localStorage.getItem("token");
    const headers = { Authorization: `Bearer ${token}` };
    const [scRes, posRes, spRes] = await Promise.all([
      fetch(`${API_URL}/sales/sale-conditions/`, { headers }),
      fetch(`${API_URL}/config/pos`, { headers }),
      fetch(`${API_URL}/entities/?is_salesperson=true`, { headers }),
    ]);
    if (scRes.ok) setSaleConditions(await scRes.json());
    if (posRes.ok) {
        const pvs = await posRes.json();
        // Filtrar PVs que tengan FA o FC en sus document_configs
        const docTag = docType === 'PURCHASE_INVOICE' ? 'FC' : 'FA';
        const configuredPvs = pvs.filter(p => p.document_configs?.some(c => c.document_type === docTag || c.document_type === 'INVOICE' || c.document_type === 'PURCHASE_INVOICE' || c.document_type.startsWith('F')));
        // Si no hay ninguno configurado formalmente, buscamos por nombre como fallback
        const fallbackPvs = pvs.filter(p => (!p.document_configs || p.document_configs.length === 0) && p.name.toLowerCase().includes('factura'));
        
        const finalPvs = configuredPvs.length > 0 ? configuredPvs : fallbackPvs;
        setPointsOfSale(finalPvs);
        
        if (mode === "new" && !initialSourceId && finalPvs.length > 0) {
            setPv(finalPvs[0].pv);
        }
    }
    if (spRes.ok) setSellers(await spRes.json());
  };

  const fetchNextNumber = async (currentPv) => {
      if (mode !== "new" || !currentPv) return;
      try {
          const docTag = docType === 'PURCHASE_INVOICE' ? 'FC' : 'FA';
          const token = localStorage.getItem("token");
          const res = await fetch(`${API_URL}/accounting/documents/next-number?pv=${currentPv}&doc_type=${docTag}`, { headers: { Authorization: `Bearer ${token}` }});
          if (res.ok) {
              const data = await res.json();
              setNumber(data.next_number);
          }
      } catch (e) {
          console.error("Error fetching next number:", e);
      }
  };

  useEffect(() => {
      fetchNextNumber(pv);
  }, [pv, docType]);

  const fetchInvoice = async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/accounting/documents/${id}`, { headers: { Authorization: `Bearer ${token}` }});
    if (res.ok) {
        const data = await res.json();
        setEntity(data.entity_id ? { id: data.entity_id, name: data.entity_name } : null);
        setDate(data.date.split("T")[0]);
        setDueDate((data.due_date || data.date).split("T")[0]);
        const parsedNum = splitFullNumber(data.number);
        setPv(parsedNum.pv);
        setNumber(parsedNum.num);
        setCurrency(data.currency || "ARS");
        setExchangeRate(data.exchange_rate || 1);
        setSelectedConditionId(data.sale_condition_id || "");
        setSalespersonId(data.salesperson_id || "");
        setCtroCosto(data.cost_center || "1");
        setObservations(data.notes || "");
        setStatus(data.status || "DRAFT");
        setDocType(data.doc_type || "INVOICE");
        setLetter(data.line || "A");
        
        // Para cada línea con producto, recuperar el contenido por envase
        // Funciona incluso para facturas viejas sin package_size guardado
        const enrichedLines = await Promise.all(data.lines.map(async (l) => {
            let unitContent = l.package_size && parseFloat(l.package_size) > 1 
                ? parseFloat(l.package_size) 
                : undefined;
            
            // Si tiene product_id pero no package_size guardado, buscar en el API
            if (l.product_id && !unitContent) {
                try {
                    const pRes = await fetch(`${API_URL}/inventory/products/${l.product_id}`, { 
                        headers: { Authorization: `Bearer ${token}` } 
                    });
                    if (pRes.ok) {
                        const prod = await pRes.json();
                        if (prod.quantity_per_container && parseFloat(prod.quantity_per_container) > 1) {
                            unitContent = parseFloat(prod.quantity_per_container);
                        }
                    }
                } catch (e) { /* ignorar si falla */ }
            }
            
            let qtyPackages = l.qty_packages;
            if (qtyPackages === null || qtyPackages === undefined) {
                if (unitContent && unitContent > 0) {
                    qtyPackages = parseFloat(l.qty) / unitContent;
                } else {
                    qtyPackages = parseFloat(l.qty);
                }
            }
            
            return { 
                ...l, 
                id: l.id || Math.random(),
                _unit_content: unitContent,
                qty_packages: qtyPackages
            };
        }));
        setItems(enrichedLines);
    }
    setLoading(false);
  };
  
  const fetchFromSource = async () => {
      setLoading(true);

      const token = localStorage.getItem("token");

      if (initialSourceType === 'invoice' && initialSourceId) {
          const res = await fetch(`${API_URL}/accounting/documents/${initialSourceId}`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
              const data = await res.json();
              if (data.entity_id) setEntity({ id: data.entity_id, name: data.entity_name || "Cliente Origen" });
              setSourceNumber(data.number);
              setCurrency(data.currency || "ARS");
              setExchangeRate(data.exchange_rate || 1);
              setSelectedConditionId(data.sale_condition_id || "");
              setSalespersonId(data.salesperson_id || "");
              setCtroCosto(data.cost_center || "1");
              // Líneas vacías para la nota de débito, el usuario carga los conceptos manualmente.
              setItems([]);
          }
          setLoading(false);
          return;
      }

      // Lógica existente para sales-order
      let draft = null;
      if (draftId) {
          const draftStr = localStorage.getItem(`invoice_draft_${draftId}`);
          if (draftStr) {
              draft = JSON.parse(draftStr);
          } else {
              showToast("No se encontró la selección de la Orden de Venta. Volvé a generar la factura.", "error");
              setLoading(false);
              return;
          }
      }

      const res = await fetch(`${API_URL}/sales/sales-orders/${initialSourceId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
          const data = await res.json();
          if (data.entity_id) setEntity({ id: data.entity_id, name: draft?.customerName || data.entity_name || "Cliente Origen" });
          
          if (draft) {
              setSourceNumber(draft.salesOrderNumber || data.number);
              setPv(draft.pointOfSale || "0001");
              setCurrency(draft.currency || data.currency || "ARS");
              setExchangeRate(draft.exchangeRate || data.exchange_rate || 1);
              setSelectedConditionId(draft.paymentCondition || data.sale_condition_id || "");
              setSalespersonId(draft.sellerId || data.salesperson_id || "");
              setCtroCosto(draft.costCenter || data.cost_center || "1");
              
              setItems(draft.lines.map(l => {
                  const factor = parseFloat(l._unit_content || l.package_size || 1);
                  const qty = parseFloat(l.qty_to_invoice || l.qty || 1);
                  let qtyPackages = l.qty_packages;
                  if ((qtyPackages === null || qtyPackages === undefined) && factor > 1) {
                      qtyPackages = qty / factor;
                  }
                  return {
                      id: Math.random(),
                      product_id: l.product_id,
                      description: l.product_name || l.description,
                      qty: qty,
                      qty_packages: qtyPackages,
                      _unit_content: factor > 1 ? factor : undefined,
                      _unit_label: l._unit_label || l.package_unit || 'u',
                      _container_name: l._container_name || 'Unidad',
                      unit_price: l.unit_price,
                      discount_pct: 0,
                      vat_rate: l.vat_rate || 0.21,
                      source_sales_line_id: l.source_sales_line_id,
                      _account_code: l._account_code || null,
                  };
              }));
          } else {
              setSourceNumber(data.number);
              setCurrency(data.currency || "ARS");

              // preselectedLines puede ser:
              // a) array de objetos completos (viene del modal OV con qty_packages, _unit_content, etc.)
              // b) array de strings/IDs
              // c) null
              const hasFullObjects = preselectedLines && preselectedLines.length > 0 && typeof preselectedLines[0] === 'object';

              if (hasFullObjects) {
                  // Usar los objetos pre-seleccionados directamente (ya traen qty_packages, _unit_content, etc.)
                  setItems(preselectedLines.map(l => {
                      const factor = parseFloat(l._unit_content || l.package_size || 1);
                      const qty = parseFloat(l.qty_to_invoice || l.qty || 1);
                      let qtyPackages = l.qty_packages;
                      if ((qtyPackages === null || qtyPackages === undefined) && factor > 1) {
                          qtyPackages = qty / factor;
                      }
                      return {
                          id: Math.random(),
                          product_id: l.product_id,
                          description: l.product?.name || l.name || l.description || '',
                          qty: qty,
                          qty_packages: qtyPackages,
                          _unit_content: factor > 1 ? factor : undefined,
                          _unit_label: l._unit_label || l.package_unit || 'u',
                          _container_name: l._container_name || 'Unidad',
                          unit_price: parseFloat(l.unit_price || 0),
                          discount_pct: parseFloat(l.discount_pct || 0),
                          vat_rate: parseFloat(l.vat_rate || 0.21),
                          source_sales_line_id: l.source_sales_line_id || l.id,
                          accounting_account_id: l.accounting_account_id || null,
                          _account_code: l._account_code || l.sales_account_code || null,
                      };
                  }));
              } else {
                  let linesToInvoice = data.lines.filter(l => (l.qty - (l.qty_invoiced || 0)) > 0);
                  if (preselectedLines && preselectedLines.length > 0) {
                      linesToInvoice = linesToInvoice.filter(l => preselectedLines.includes(l.id));
                  }
                  setItems(linesToInvoice.map(l => {
                      const factor = l.product?.quantity_per_container ? parseFloat(l.product.quantity_per_container) : (l.package_size ? parseFloat(l.package_size) : 1);
                      const qty = l.qty - (l.qty_invoiced || 0);
                      let qtyPackages = l.qty_packages;
                      if ((qtyPackages === null || qtyPackages === undefined) && factor > 1) {
                          qtyPackages = qty / factor;
                      }
                      return {
                          id: Math.random(),
                          product_id: l.product_id,
                          description: l.description,
                          qty: qty,
                          qty_packages: qtyPackages,
                          _unit_content: factor > 1 ? factor : undefined,
                          _unit_label: l.product?.container?.unit?.short_name || l.package_unit || 'u',
                          _container_name: l.product?.container?.name || 'Unidad',
                          unit_price: l.unit_price,
                          discount_pct: l.discount_pct || 0,
                          vat_rate: l.vat_rate || 0.21,
                          source_sales_line_id: l.id,
                          accounting_account_id: null,
                          _account_code: l.product?.sales_account_code || null,
                      };
                  }));
              }
          }
      }
      setLoading(false);
  };

  const totals = useMemo(() => {
    return items.reduce((acc, i) => {
        // Usar qty correctamente (litros/kg totales, no envases)
        const qty = i.qty || 0;
        const sub = qty * (i.unit_price || 0);
        const bonif = sub * ((i.discount_pct || 0) / 100);
        const net = sub - bonif;
        const vat = net * (i.vat_rate || 0.21);
        acc.subtotal += sub;
        acc.net += net;
        acc.vat += vat;
        acc.total += net + vat;
        return acc;
    }, { subtotal: 0, net: 0, vat: 0, total: 0 });
  }, [items]);

  const handleSave = async () => {
    if (!entity) return showToast("Falta Cliente", "error");
    if (currency === "USD" && exchangeRate <= 1) {
        return showToast("Para moneda USD el Tipo de Cambio debe ser mayor a 1", "error");
    }
    
    // Nota: NO validamos accounting_account_id aquí.
    // El backend intenta resolverlo automáticamente desde el producto.
    // Si no puede resolverlo, el backend rechaza con mensaje específico.

    setLoading(true);
    const token = localStorage.getItem("token");
    const finalNumber = joinFullNumber(pv, number);
    const payload = {
        doc_type: docType,
        line: letter,
        number: finalNumber || "0001-00000000",
        date: date,
        entity_id: entity.id,
        salesperson_id: salespersonId || null,
        warehouse_id: null,
        condition: selectedConditionId,
        currency: currency,
        exchange_rate: exchangeRate,
        notes: observations,
        subtotal: totals.subtotal,
        total_discount: 0,
        net_amount: totals.net,
        total_vat: totals.vat,
        total_amount: totals.total,
        reason_type: reasonType || null,
        return_stock: returnStock,
        source_invoice_id: initialSourceType === 'invoice' ? initialSourceId : null,
        lines: items.map(l => ({
            product_id: l.product_id,
            description: l.description,
            qty_packages: l.qty_packages !== undefined ? l.qty_packages : null,
            qty: l.qty,
            unit_price: l.unit_price,
            discount_pct: l.discount_pct,
            vat_rate: l.vat_rate,
            accounting_account_id: l.accounting_account_id,
            source_sales_line_id: l.source_sales_line_id,
            source_dn_line_id: l.source_dn_line_id
        }))
    };
    
    console.log("UPDATE INVOICE PAYLOAD", payload);
    
    try {
        const url = mode === "edit" ? `${API_URL}/accounting/documents/${id}` : `${API_URL}/accounting/documents/`;
        const res = await fetch(url, {
            method: mode === "edit" ? "PUT" : "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            showToast("Factura guardada correctamente", "success");
            const evtName = docType === 'PURCHASE_INVOICE' ? 'purchase-invoice-changed' : 'invoice-changed';
            window.dispatchEvent(new Event(evtName));
            if (window.opener) window.opener.dispatchEvent(new Event(evtName));
            
            if (isStandalone) window.close();
            else closeWindow(windowId);
        } else {
            const err = await res.json();
            console.error("ERROR FROM BACKEND:", err);
            showToast(err.detail || err.message || "Error al guardar la factura", "error");
        }
    } catch (e) {
        console.error("NETWORK ERROR:", e);
        showToast("Error de conexión al guardar", "error");
    } finally {
        setLoading(false);
    }
  };

  const searchEntities = async (q) => {
    const res = await fetch(`${API_URL}/entities/?q=${q}&type=client`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
    return res.json();
  };
  
  const searchProducts = async (q) => {
    const res = await fetch(`${API_URL}/inventory/products/?q=${q}&active=true`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
    return res.json();
  };

  const handleUpdateItem = (itemId, field, value) => {
    setItems(items.map(i => {
      if (i.id === itemId) {
        if (field === 'description' || field === 'accounting_account_id') {
          return { ...i, [field]: value };
        }
        
        const numericVal = parseFloat(value) || 0;
        let updated = { ...i, [field]: numericVal };
        
        // Al cambiar envases, recalcular la cantidad total equivalente
        if (field === 'qty_packages') {
            const unitContent = updated._unit_content || (updated.package_size && parseFloat(updated.package_size) > 1 ? parseFloat(updated.package_size) : null);
            if (unitContent) {
                updated.qty = numericVal * unitContent;
            }
        }
        
        return updated;
      }
      return i;
    }));
  };

  const fmt = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val || 0);
  const fmtValue = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency }).format(val || 0);

  if (loading) return <LoadingScreen message="Cargando Factura..." />;

  return (
    <div className={`${s.formCard} ${isStandalone ? s.formCardStandalone : ''}`}>
        
        {/* Header Area */}
        <div className={s.headerLine}>
            <div className={s.titleGroup}>
                <div className={s.compactHeaderTitle}>
                    <h1>
                        <Receipt size={24} style={{ color: 'var(--primary)' }} />
                        <span>{mode === 'edit' ? `${docType === 'CREDIT_NOTE' ? 'Nota de Crédito' : docType === 'DEBIT_NOTE' ? 'Nota de Débito' : 'Factura'} ${joinFullNumber(pv, number)}` : docType === 'CREDIT_NOTE' ? 'Nueva Nota de Crédito' : docType === 'DEBIT_NOTE' ? 'Nueva Nota de Débito' : 'Nueva Factura'}</span>
                    </h1>
                    <div className={s.headerMeta}>
                        {reasonType === 'EXCHANGE_DIFFERENCE' && (
                            <>
                                <span style={{ backgroundColor: '#10b981', color: 'white', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '11px' }}>DIF. CAMBIO</span>
                                <span>&middot;</span>
                            </>
                        )}
                        <span className={s.metaDate}>{new Date(date).toLocaleDateString('es-AR')}</span>
                        {initialSourceType === 'sales-order' && sourceNumber && (
                            <>
                                <span style={{ color: '#24389c', fontWeight: 800 }}>OV {sourceNumber} &middot; {entity?.name || 'Cliente'}</span>
                                <span>&middot;</span>
                            </>
                        )}
                        <span>{date ? (date.includes('T') ? new Date(date).toLocaleDateString('es-AR') : date.split('-').reverse().join('/')) : 'S/F'}</span>
                        <span>&middot;</span>
                        <span>{currency}</span>
                        <span>&middot;</span>
                        <span>TC {exchangeRate}</span>
                        <TraceabilityStatusBadge status={status} />
                    </div>
                </div>
            </div>
            <div className={s.headerActions}>
                {isReadOnly ? (
                  <button className={s.saveBtn} style={{ background: '#64748b', cursor: 'pointer' }} onClick={() => setIsReadOnly(false)}>
                      <Pencil size={16} /> Editar
                  </button>
                ) : (
                  <button className={s.saveBtn} onClick={handleSave}>
                      <Save size={16} /> Guardar
                  </button>
                )}
                <div className={s.actionGroup}>
                    <button className={s.actionBtn} disabled={!id} onClick={() => window.open(`${API_URL}/accounting/documents/${id}/pdf`, '_blank')} title="Imprimir Factura">
                        <Printer size={18} />
                    </button>
                </div>
            </div>
        </div>

        {/* Body: 2 Column Layout */}
        <div className={s.bodyTwoColumns}>
            
            {/* Columna Izquierda: Ítems y Productos */}
            <div className={s.leftCol}>
                {!isReadOnly && (
                    <div className={s.searchRibbon} style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                            <Autocomplete 
                                onSearch={searchProducts} 
                                onSelect={(p) => {
                                    const qtyPerContainer = p.quantity_per_container && p.quantity_per_container > 1 
                                        ? p.quantity_per_container 
                                        : null;
                                    const hasContainer = qtyPerContainer !== null;
                                    setItems([...items, { 
                                        id: Math.random(), 
                                        product_id: p.id, 
                                        description: p.name, 
                                        // Si el producto tiene envases, qty_packages=1 (bidón), qty=litros equivalentes
                                        qty_packages: hasContainer ? 1 : undefined,
                                        qty: hasContainer ? qtyPerContainer : 1, 
                                        _unit_content: qtyPerContainer,
                                        _unit_label: p.unit_of_measure || 'u',
                                        unit_price: p.cost_price || 0, 
                                        vat_rate: p.tax_type?.rate ?? 0.21, 
                                        discount_pct: 0,
                                        // Cuenta contable de venta del producto (puede ser null si no está configurada)
                                        accounting_account_id: p.sales_account_id || null,
                                    }]);
                                }}
                                placeholder="Escriba para buscar productos para añadir..."
                                variant="glass"
                                icon={<Search size={16} style={{ color: 'var(--primary)' }}/>}
                                minChars={0}
                                clearOnSelect={true}
                            />
                        </div>
                        <Button 
                            variant="primary" 
                            size="small" 
                            onClick={() => setItems([...items, { id: Math.random(), description: "", qty: 1, unit_price: 0, vat_rate: 0.21, discount_pct: 0 }])}
                            title="Agregar Concepto Libre"
                            style={{ padding: '0 12px' }}
                        >
                            <Plus size={20} strokeWidth={3} />
                        </Button>
                    </div>
                )}

                <div className={s.bentoContainer} style={{ padding: 0, overflow: 'hidden' }}>
                    {items.length > 0 ? (
                        <>
                            {isReadOnly ? null : (
                                <div className={s.tableHeader} style={{ gridTemplateColumns: 'minmax(250px, 1fr) 80px 100px 80px 90px 90px 60px 100px 30px' }}>
                                    <div className={s.th}>PRODUCTO / CONCEPTO</div>
                                    <div className={s.th}>ENVASES</div>
                                    <div className={s.th}>CANTIDAD</div>
                                    <div className={s.th}>UNIDAD</div>
                                    <div className={s.th}>P. UNIT</div>
                                    <div className={s.th}>DTO%</div>
                                    <div className={s.th}>IVA%</div>
                                    <div className={s.th} style={{ textAlign: 'right' }}>SUBTOTAL</div>
                                    <div></div>
                                </div>
                            )}
                            <div className={s.itemsList}>
                                {items.map(item => {
                                    if (isReadOnly) {
                                        const qtyPackages = item.qty_packages;
                                        const qty = item.qty || 0;
                                        const hasPackages = qtyPackages !== undefined && qtyPackages !== null;
                                        const subtotal = qty * (item.unit_price || 0) * (1 - (item.discount_pct || 0) / 100);
                                        const vatAmount = subtotal * (item.vat_rate || 0.21);
                                        const totalAmount = subtotal + vatAmount;
                                        
                                        return (
                                            <div key={item.id} style={{ display: 'flex', flexDirection: 'column', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', gap: 8 }}>
                                                <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b' }}>Producto: {item.description}</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 24px', fontSize: 12, color: '#475569' }}>
                                                    {hasPackages ? (
                                                        <>
                                                            <div><span style={{ fontWeight: 800 }}>Cantidad:</span> {qtyPackages} envases</div>
                                                            <div><span style={{ fontWeight: 800 }}>Equivalencia:</span> {qtyPackages} envases = {qty.toFixed(2)} {item._unit_label || 'u'}</div>
                                                        </>
                                                    ) : (
                                                        <div><span style={{ fontWeight: 800 }}>Cantidad:</span> {qty.toFixed(2)} {item._unit_label || 'u'}</div>
                                                    )}
                                                    <div><span style={{ fontWeight: 800 }}>Precio:</span> {fmtValue(item.unit_price)} / {item._unit_label || 'u'}</div>
                                                    <div><span style={{ fontWeight: 800 }}>Subtotal:</span> {fmtValue(subtotal)}</div>
                                                    <div><span style={{ fontWeight: 800 }}>IVA:</span> {fmtValue(vatAmount)}</div>
                                                    <div style={{ color: 'var(--primary)', fontWeight: 900 }}><span style={{ fontWeight: 800, color: '#1e293b' }}>Total:</span> {fmtValue(totalAmount)}</div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    
                                    return (
                                    <div key={item.id} className={s.tableRow} style={{ gridTemplateColumns: 'minmax(250px, 1fr) 80px 100px 80px 90px 90px 60px 100px 30px', alignItems: 'flex-start', height: 'auto', minHeight: 48, padding: '8px 12px' }}>
                                        <div style={{ padding: '4px 0', overflow: 'hidden' }}>
                                            <input 
                                                type="text" 
                                                className={s.tableInput} 
                                                value={item.description || ''} 
                                                onChange={(e) => handleUpdateItem(item.id, 'description', e.target.value)} 
                                                placeholder="Ingrese concepto..."
                                                style={{ fontWeight: 900, width: '100%', textAlign: 'left', background: 'transparent' }}
                                            />
                                            {item._unit_content && (
                                                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginTop: 2 }}>
                                                    {item.qty_packages || '?'} env × {item._unit_content} = {((item.qty_packages || 0) * item._unit_content).toFixed(0)} {item._unit_label || 'u'}
                                                </div>
                                            )}
                                            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                                                <span style={{ fontWeight: 800, color: '#475569' }}>Cuenta:</span>
                                                <div style={{ flex: 1, minWidth: 0, maxWidth: 200 }}>
                                                    <AccountSelector 
                                                        value={item.accounting_account_id ?? ''} 
                                                        onChange={(e) => handleUpdateItem(item.id, 'accounting_account_id', e.target.value)} 
                                                        placeholder="Sin asignar"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        {/* ENVASES: el usuario ingresa cuántos bidones */}
                                        <input 
                                            type="number" 
                                            className={s.tableInput} 
                                            value={item.qty_packages !== undefined ? item.qty_packages : (item.qty || 0)} 
                                            onChange={(e) => handleUpdateItem(item.id, 'qty_packages', e.target.value)}
                                            style={{ background: item._unit_content ? '#eff6ff' : '#fff', border: item._unit_content ? '1.5px solid #93c5fd' : undefined }}
                                            title={item._unit_content ? `Cantidad de envases (cada uno contiene ${item._unit_content} ${item._unit_label || 'u'})` : 'Cantidad'}
                                        />
                                        {/* UNIDADES EQUIVALENTES: calculado automáticamente */}
                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                            <input 
                                                type="number" 
                                                className={s.tableInput} 
                                                value={item.qty || 0} 
                                                onChange={(e) => handleUpdateItem(item.id, 'qty', e.target.value)} 
                                                readOnly={!!item._unit_content}
                                                style={{ background: item._unit_content ? '#f1f5f9' : '#fff', color: item._unit_content ? '#64748b' : 'inherit' }}
                                                title={item._unit_content ? 'Calculado automáticamente (envases × contenido)' : 'Cantidad'}
                                            />
                                        </div>
                                        <div style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', color: '#64748b' }}>{item._unit_label || 'u'}</div>
                                        <input type="number" className={s.tableInput} value={item.unit_price ?? 0} onChange={(e) => handleUpdateItem(item.id, 'unit_price', e.target.value)} />
                                        <input type="number" className={s.tableInput} value={item.discount_pct ?? 0} onChange={(e) => handleUpdateItem(item.id, 'discount_pct', e.target.value)} />
                                        <div style={{ fontSize: 11, fontWeight: 600, textAlign: 'center' }}>{((item.vat_rate || 0.21) * 100).toFixed(0)}%</div>
                                        <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--primary)', textAlign: 'right' }}>
                                            {fmtValue((item.qty * item.unit_price * (1 - (item.discount_pct||0)/100)) * (1 + (item.vat_rate||0.21)))}
                                        </div>
                                        <button style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }} onClick={() => setItems(items.filter(i => i.id !== item.id))}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 0', minHeight: 80 }}>
                            <Search size={24} style={{ marginBottom: 8, opacity: 0.3, color: 'var(--text-secondary)' }} />
                            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>Sin ítems a facturar</div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>Buscá un producto para agregarlo a la factura</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Columna Derecha: Panel Lateral Administrativo */}
            <div className={s.rightCol}>
                {/* Bloque Cliente */}
                <div className={s.sideBlock}>
                    <div className={s.sideBlockTitle}><User size={12}/> CLIENTE</div>
                    <div className={s.sideField}>
                        <label>NOMBRE</label>
                        {isReadOnly ? (
                            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)', textAlign: 'right' }}>{entity?.name || '-'}</div>
                        ) : (
                            <div style={{ flex: 1 }}>
                                <Autocomplete onSearch={searchEntities} onSelect={setEntity} initialValue={entity} placeholder="Buscar..." minChars={0} variant="glass" />
                            </div>
                        )}
                    </div>
                    <div className={s.sideField}>
                        <label>PTO. VENTA</label>
                        {isReadOnly ? <div className={s.sideInput}>{pv}</div> : (
                            <select className={s.sideSelect} value={pv} onChange={(e) => setPv(e.target.value)}>
                                {pointsOfSale.map(p => <option key={p.pv} value={p.pv}>{p.pv}</option>)}
                            </select>
                        )}
                    </div>
                    <div className={s.sideField}>
                        <label>NÚMERO</label>
                        <input 
                            type="text" 
                            className={s.sideInput} 
                            value={number} 
                            onChange={(e) => setNumber(e.target.value)}
                            placeholder="Autogenerado"
                            disabled={isReadOnly}
                            style={{ textAlign: 'right', fontWeight: 600, width: '100px' }}
                        />
                    </div>
                </div>

                {/* Bloque Comercial */}
                <div className={s.sideBlock}>
                    <div className={s.sideBlockTitle}><ShoppingBag size={12}/> COMERCIAL</div>

                    {(docType === 'DEBIT_NOTE' || docType === 'CREDIT_NOTE') && (
                        <div className={s.sideField}>
                            <label>MOTIVO</label>
                            {isReadOnly ? <div className={s.sideInput}>{reasonType || 'Otro'}</div> : (
                                <select className={s.sideSelect} value={reasonType} onChange={e => {
                                    setReasonType(e.target.value);
                                    if (e.target.value === 'EXCHANGE_DIFFERENCE' && items.length === 0) {
                                        setItems([{
                                            id: Math.random(),
                                            description: "Diferencia de cambio",
                                            qty: 1,
                                            unit_price: 0,
                                            discount_pct: 0,
                                            vat_rate: 0.21,
                                            accounting_account_id: ""
                                        }]);
                                    }
                                }}>
                                    <option value="">Seleccione Motivo...</option>
                                    <option value="RETURN">Devolución</option>
                                    <option value="DISCOUNT">Bonificación</option>
                                    <option value="BILLING_ERROR">Error de facturación</option>
                                    <option value="COMMERCIAL_ADJUSTMENT">Ajuste comercial</option>
                                    <option value="INTEREST">Intereses</option>
                                    <option value="EXCHANGE_DIFFERENCE">Diferencia de cambio</option>
                                    <option value="SURCHARGE">Recargo financiero</option>
                                    <option value="ADMIN_EXPENSE">Gastos administrativos</option>
                                    <option value="OTHER">Otro</option>
                                </select>
                            )}
                            {reasonType === 'RETURN' && docType === 'CREDIT_NOTE' && (
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '13px', color: '#1e293b', fontWeight: 500 }}>
                                    <input 
                                        type="checkbox" 
                                        checked={returnStock} 
                                        onChange={(e) => setReturnStock(e.target.checked)} 
                                        style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                                    />
                                    Reingresa stock
                                </label>
                            )}
                        </div>
                    )}
                    
                    <div className={s.sideField}>
                        <label>CONDICIÓN</label>
                        {isReadOnly ? <div className={s.sideInput}>{saleConditions.find(c => c.id === selectedConditionId)?.description || '-'}</div> : (
                            <select className={s.sideSelect} value={selectedConditionId ?? ''} onChange={e => setSelectedConditionId(e.target.value)}>
                                <option value="">Seleccione...</option>
                                {saleConditions.map(sc => <option key={sc.id} value={sc.id}>{sc.description}</option>)}
                            </select>
                        )}
                    </div>
                    
                    <div className={s.sideField}>
                        <label>VENDEDOR</label>
                        {isReadOnly ? <div className={s.sideInput}>{sellers.find(s => s.id === salespersonId)?.name || '-'}</div> : (
                            <select className={s.sideSelect} value={salespersonId ?? ''} onChange={e => setSalespersonId(e.target.value)}>
                                <option value="">Ninguno</option>
                                {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        )}
                    </div>

                    <div className={s.sideField}>
                        <label>MONEDA</label>
                        {isReadOnly ? <div className={s.sideInput}>{currency}</div> : (
                            <select className={s.sideSelect} value={currency} onChange={e => setCurrency(e.target.value)}>
                                <option value="ARS">ARS</option>
                                <option value="USD">USD</option>
                            </select>
                        )}
                    </div>

                    <div className={s.sideField}>
                        <label>T. CAMBIO</label>
                        {isReadOnly ? <div className={s.sideInput}>{exchangeRate}</div> : (
                            <input type="number" className={s.sideInput} value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} />
                        )}
                    </div>
                </div>

                {/* Bloque Observaciones */}
                <div className={s.sideBlock} style={{ flexShrink: 0, paddingBottom: 16 }}>
                    <div className={s.sideBlockTitle}><FileText size={12}/> OBSERVACIONES</div>
                    {isReadOnly ? (
                        <div style={{ fontSize: 11, color: '#475569', minHeight: 40 }}>{observations || 'Sin observaciones'}</div>
                    ) : (
                        <textarea 
                            className={s.sideTextarea} 
                            placeholder="Notas internas o comentarios..."
                            value={observations ?? ''}
                            onChange={e => setObservations(e.target.value)}
                            style={{ minHeight: 60 }}
                        />
                    )}
                </div>
            </div>
            {/* Flujo Inferior */}
          <div className={s.relationsBar}>
              <div className={s.relationCard} style={{ opacity: initialSourceType ? 1 : 0.5 }}>
                  <div className={s.nodeTitle} style={{ color: initialSourceType ? '#10b981' : '#0b132b' }}>ORIGEN</div>
                  <div className={s.nodeStatus} style={{ color: initialSourceType ? '#10b981' : '#eab308' }}>
                      {initialSourceType === 'sales-order' ? 'Completado' : initialSourceType === 'delivery-note' ? 'Remito' : initialSourceType === 'invoice' ? 'Factura' : 'Directo'}
                  </div>
                  <div className={s.nodeMetric} style={{ color: '#0f172a' }}>
                      {initialSourceType === 'sales-order' && sourceNumber ? `OV ${sourceNumber}` : 
                       initialSourceType === 'invoice' && sourceNumber ? `FC ${sourceNumber}` :
                       initialSourceType ? 'Vinculado' : 'Sin origen'}
                  </div>
              </div>

              <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

              {docType !== 'DEBIT_NOTE' && (
                  <>
                      <div className={s.relationCard}>
                          <div className={s.nodeTitle} style={{ color: '#0b132b' }}>REMITO</div>
                          <div className={s.nodeStatus} style={{ color: '#eab308' }}>Pendiente</div>
                          <div className={s.nodeMetric} style={{ color: '#0f172a' }}>0 remitos</div>
                      </div>
                      <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />
                  </>
              )}

              <div className={s.relationCard} style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe' }}>
                  <div className={s.nodeTitle} style={{ color: '#1d4ed8' }}>{docType === 'CREDIT_NOTE' ? 'NOTA DE CRÉDITO' : docType === 'DEBIT_NOTE' ? 'NOTA DE DÉBITO' : 'FACTURA'}</div>
                  <div className={s.nodeStatus} style={{ color: '#1d4ed8' }}>Activa</div>
                  <div className={s.nodeMetric} style={{ color: '#0f172a' }}>{fmt(totals.total)}</div>
              </div>

              <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

              <div className={s.relationCard}>
                  <div className={s.nodeTitle} style={{ color: '#0b132b' }}>COBRO</div>
                  <div className={s.nodeStatus} style={{ color: '#eab308' }}>Pendiente</div>
                  <div className={s.nodeMetric} style={{ color: '#0f172a' }}>0%</div>
              </div>

              {(docType === 'DEBIT_NOTE' || docType === 'CREDIT_NOTE') && (
                  <>
                      <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />
                      <div className={s.relationCard}>
                          <div className={s.nodeTitle} style={{ color: '#0b132b' }}>CTA. CORRIENTE</div>
                          <div className={s.nodeStatus} style={{ color: '#eab308' }}>Actualizado</div>
                          <div className={s.nodeMetric} style={{ color: '#0f172a' }}>-</div>
                      </div>
                  </>
              )}

              <ArrowRight size={14} color="#cbd5e1" style={{ flexShrink: 0 }} />

              <div className={s.relationCard} style={{ maxWidth: '140px', background: 'transparent', border: 'none', paddingLeft: 8 }}>
                  <div className={s.nodeTitle} style={{ color: '#64748b' }}>ESTADO</div>
                  <div className={s.obsText} style={{ marginTop: 4, fontWeight: 800, color: '#1e293b' }}>{status}</div>
              </div>
          </div>
        </div>

        {/* Operational Summary */}
        <div className={s.summaryPanel}>
            <div className={s.summaryItem}>
                <div className={s.summaryLabel}>CLIENTE</div>
                <div className={s.summaryValue} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>{entity?.name || '-'}</div>
            </div>
            <div className={s.summaryItem}>
                <div className={s.summaryLabel}>CONDICIÓN</div>
                <div className={s.summaryValue}>{saleConditions.find(c => c.id === selectedConditionId)?.description || '-'}</div>
            </div>
            <div className={s.summaryItem}>
                <div className={s.summaryLabel}>ITEMS</div>
                <div className={s.summaryValue}>{items.length}</div>
            </div>
            <div className={s.summaryItem}>
                <div className={s.summaryLabel}>ESTADO</div>
                <div className={s.summaryValue} style={{ color: '#10b981' }}>{status}</div>
            </div>
            <div className={s.summaryItem}>
                <div className={s.summaryLabel}>VENDEDOR</div>
                <div className={s.summaryValue}>{sellers.find(sl => sl.id === salespersonId)?.name || 'Ninguno'}</div>
            </div>
            <div className={s.summaryItem}>
                <div className={s.summaryLabel}>MODIFICACIÓN</div>
                <div className={s.summaryValue}>{new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</div>
            </div>
        </div>

        {/* Footer with Totals */}
        <div className={s.footerCompact}>
            <div className={s.footerCompactItem}>
                <span className={s.footerCompactLabel}>NETO GRAVADO</span>
                <span className={s.footerCompactValue}>{fmt(totals.net)}</span>
            </div>
            <div className={s.footerCompactItem}>
                <span className={s.footerCompactLabel}>IVA DETERMINADO</span>
                <span className={s.footerCompactValue}>{fmt(totals.vat)}</span>
            </div>
            <div className={s.footerCompactItem}>
                <span className={s.footerCompactLabel} style={{ color: 'var(--primary)' }}>TOTAL FACTURA</span>
                <span className={s.footerCompactTotal}>{fmt(totals.total)}</span>
            </div>
        </div>
        
    </div>
  );
}
