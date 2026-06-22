import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import Autocomplete from "../../components/ui/Autocomplete";
import Modal from "../../components/ui/Modal";
import Badge from "../../components/ui/Badge";
import Card from "../../components/ui/Card";
import { useToast } from "../../context/ToastContext";
import { useCostCenter } from "../../context/CostCenterContext";
import { API_URL } from "../../config";
import {
  padPV,
  padNumber,
  splitFullNumber,
  joinFullNumber,
} from "../../utils/formatters";
import {
  Save,
  Trash2,
  Plus,
  Truck,
  History,
  Info,
  Layers,
  Search,
  Printer,
  Mail,
  X,
  Building,
  ClipboardList,
  Receipt,
  FileText,
  CreditCard,
  MapPin,
  Calendar,
  User,
  ShoppingBag,
  MoreVertical,
  Link2,
  Link2Off,
  ShoppingBasket,
  FileDown,
  FileBarChart,
  Box,
  Pencil,
  Check,
  CheckSquare,
  Square,
  AlertCircle,
  ArrowUpRight,
  ArrowRight,
  Calculator,
  ChevronDown
} from "lucide-react";
import s from "./PurchaseOrderForm.module.css";
import { TraceabilityStatusBadge, TraceabilityProgress } from "../../components/ui/TraceabilityStatusBadge";
import LoadingScreen from "../../components/ui/LoadingScreen";

export default function PurchaseOrderForm(props) {
  const {
    mode: initialMode = "new",
    id: initialId = null,
    windowId,
    isStandalone = false,
  } = props;

  const { showToast } = useToast();
  const { costCenter } = useCostCenter();

  const [mode, setMode] = useState(initialMode);
  const [id, setId] = useState(initialId);
  const [loading, setLoading] = useState(initialMode === "edit");

  // --- Header Data ---
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);
  const [ctroCosto, setCtroCosto] = useState(String(costCenter || 1));
  const [supplier, setSupplier] = useState(null);
  const [pv, setPv] = useState("0001");
  const [number, setNumber] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState(1); 
  const [observations, setObservations] = useState("");
  const [buyerId, setBuyerId] = useState(""); // Comprador
  const [selectedConditionId, setSelectedConditionId] = useState("");
  const [status, setStatus] = useState("BORRADOR");
  
  const [isReadOnly, setIsReadOnly] = useState(initialMode === 'edit');
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);

  // --- Lists ---
  const [warehouses, setWarehouses] = useState([]);
  const [purchaseConditions, setPurchaseConditions] = useState([]);
  const [sellers, setSellers] = useState([]); // Compradores
  const [items, setItems] = useState([]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (mode === "edit" && id) fetchPurchaseOrder();
    else if (mode === "new") {
        fetchNextNumber(pv);
    }
  }, [mode, id, pv]);

  const fetchInitialData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [whRes, condRes, sellRes] = await Promise.all([
        fetch(`${API_URL}/inventory/warehouses/`, { headers }),
        fetch(`${API_URL}/sales/sale-conditions/`, { headers }),
        fetch(`${API_URL}/entities/?is_salesperson=true`, { headers })
      ]);

      if (whRes.ok) {
          const data = await whRes.json();
          setWarehouses(data);
          if (data.length > 0 && !warehouseId) setWarehouseId(data[0].id);
      }
      if (condRes.ok) setPurchaseConditions(await condRes.json());
      if (sellRes.ok) setSellers(await sellRes.json());

    } catch (e) { console.error("Error fetching initial data", e); }
  };

  const fetchPurchaseOrder = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`${API_URL}/purchases/purchase-orders/${id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const { pv: loadedPv, num: loadedNum } = splitFullNumber(data.number);
        setPv(loadedPv);
        setNumber(loadedNum);
        setDate(data.date ? data.date.split("T")[0] : "");
        if (data.warehouse_id) setWarehouseId(data.warehouse_id);
        if (data.currency) setCurrency(data.currency);
        if (data.exchange_rate) setExchangeRate(Number(data.exchange_rate));
        if (data.notes) setObservations(data.notes);
        if (data.status) setStatus(data.status);
        if (data.due_date) setDueDate(data.due_date.split("T")[0]);
        if (data.cost_center) setCtroCosto(String(data.cost_center));
        if (data.sale_condition_id) setSelectedConditionId(data.sale_condition_id);
        if (data.salesperson_id) setBuyerId(data.salesperson_id);
        if (data.attachment_url) setAttachmentUrl(data.attachment_url);

        if (data.entity_id) {
            const entRes = await fetch(`${API_URL}/entities/${data.entity_id}`, { headers });
            if (entRes.ok) setSupplier(await entRes.json());
        }

        if (data.lines) {
            setItems(data.lines.map(l => ({
                ...l,
                id: l.id || Math.random(),
                qty_packages: Number(l.qty) / (l.package_size || 1),
                qty: Number(l.qty),
                unit_price: Number(l.unit_price),
                vat_rate: Number(l.vat_rate || 0.21),
                discount_pct: Number(l.discount_pct || 0),
                _unit_content: l.package_size || 1,
                _unit_label: l.package_unit || 'u'
            })));
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchNextNumber = async (currentPv) => {
    if (mode !== "new") return;
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`${API_URL}/purchases/purchase-orders/next-number?pv=${currentPv}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const { num } = splitFullNumber(data.number);
        setNumber(num);
      }
    } catch (e) { console.error(e); }
  };

  const totals = useMemo(() => {
    return items.reduce(
      (acc, i) => {
        const sub = (i.qty || 0) * (i.unit_price || 0);
        const bonif = sub * ((i.discount_pct || 0) / 100);
        const net = sub - bonif;
        const vat = net * (i.vat_rate || 0.21);
        acc.subtotal += sub;
        acc.bonif += bonif;
        acc.net += net;
        acc.vat += vat;
        acc.total += net + vat;
        return acc;
      },
      { subtotal: 0, bonif: 0, net: 0, vat: 0, total: 0 }
    );
  }, [items]);

  const handleSave = async () => {
    if (!supplier) return showToast("Seleccione un proveedor", "warning");
    if (items.length === 0) return showToast("Agregue al menos un ítem", "warning");

    const payload = {
      number: joinFullNumber(pv, number),
      date: date,
      entity_id: supplier.id,
      warehouse_id: warehouseId,
      currency: currency,
      exchange_rate: exchangeRate,
      notes: observations,
      total_amount: totals.total,
      due_date: dueDate,
      cost_center: parseInt(ctroCosto),
      sale_condition_id: selectedConditionId,
      salesperson_id: buyerId,
      attachment_url: attachmentUrl,
      lines: items.map((i, idx) => ({
        product_id: i.product_id,
        description: i.description || i.name,
        qty: i.qty,
        qty_packages: i.qty_packages,
        package_size: i._unit_content,
        package_unit: i._unit_label,
        unit_price: i.unit_price,
        discount_pct: i.discount_pct,
        vat_rate: i.vat_rate,
        net_amount: i.qty * i.unit_price * (1 - i.discount_pct / 100),
        total_amount: (i.qty * i.unit_price * (1 - i.discount_pct / 100)) * (1 + i.vat_rate),
        line_order: idx
      }))
    };

    try {
      const token = localStorage.getItem('token');
      const method = mode === 'new' ? 'POST' : 'PUT';
      const url = mode === 'new' ? `${API_URL}/purchases/purchase-orders/` : `${API_URL}/purchases/purchase-orders/${id}`;
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const saved = await res.json();
        showToast(`Orden de Compra ${mode === 'new' ? 'creada' : 'actualizada'} correctamente`, "success");
        if (mode === 'new') {
            setId(saved.id);
            setMode('edit');
            setIsReadOnly(true);
        } else {
            setIsReadOnly(true);
        }
        window.dispatchEvent(new CustomEvent('purchase-order-changed'));
      } else {
          const err = await res.json();
          showToast(err.detail || "Error al guardar", "error");
      }
    } catch (e) { showToast("Error de red", "error"); }
  };

  const handleAddItem = (p) => {
    if (!p) return;
    const newItem = {
      id: Math.random(),
      product_id: p.id,
      name: p.name,
      description: p.name,
      brand: p.brand?.name || p.brand_name || '',
      qty: 1 * (p.quantity_per_container || 1),
      qty_packages: 1,
      unit_price: p.cost_price || 0,
      discount_pct: 0,
      vat_rate: p.tax_type?.rate ?? 0.21,
      _unit_content: p.quantity_per_container || 1,
      _unit_label: p.container?.unit?.short_name || 'u',
    };
    setItems([...items, newItem]);
  };

  const handleUpdateItem = (itemId, field, value) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== itemId) return i;
        const newItem = { ...i, [field]: value };
        if (field === 'qty_packages') {
            newItem.qty_packages = Number(value);
            newItem.qty = Number(value) * (i._unit_content || 1);
        }
        if (field === 'qty') {
            newItem.qty = Number(value);
            const factor = i._unit_content || 1;
            if (factor > 1) newItem.qty_packages = Number(value) / factor;
        }
        if (field === 'unit_price') newItem.unit_price = Number(value);
        if (field === 'discount_pct') newItem.discount_pct = Number(value);
        return newItem;
      })
    );
  };

  const searchSuppliers = async (q) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/entities/?type=supplier&q=${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  };

  const searchProducts = async (q) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/inventory/products/?q=${q}&active=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  };

  const fmtValue = (val) => {
    return Number(val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmt = (val) => `${fmtValue(val)} ${currency}`;

  if (loading) return <LoadingScreen message="Cargando Orden de Compra..." />;

  const hasProgress = items.some(i => (i.qty_delivered || 0) > 0 || (i.qty_invoiced || 0) > 0);

  return (
    <div className={`${s.formCard} ${isStandalone ? s.formCardStandalone : ''}`}>
        {/* Header Section */}
        <div className={s.headerLine} style={{ paddingBottom: 12, borderBottom: '1px solid var(--border-color)', marginBottom: 12 }}>
            <div className={s.compactHeaderTitle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <h1 style={{ fontSize: '15px', margin: 0, fontWeight: 900, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {mode === 'new' ? 'Nueva Orden de Compra' : `Orden de Compra`}
                        {isReadOnly && <span className={s.readOnlyBadge}>MODO VISTA</span>}
                    </h1>
                    <div className={s.headerMeta}>
                        <span>{mode === 'new' ? 'Nueva Orden' : `OC ${joinFullNumber(pv, number)}`}</span>
                        <span>&middot;</span>
                        <span>{date ? date.split('-').reverse().join('/') : 'S/F'}</span>
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
                  <button 
                    className={s.saveBtn} 
                    style={{ background: '#64748b', cursor: 'pointer' }} 
                    onClick={() => setIsReadOnly(false)}
                    title="Activar modo edición"
                  >
                      <Pencil size={16} />
                      {hasProgress ? 'Bloqueado' : 'Editar'}
                  </button>
                ) : (
                  <button className={s.saveBtn} onClick={handleSave}>
                      <Save size={16} />
                      Guardar
                  </button>
                )}
                <div className={s.actionGroup}>
                    <button className={s.actionBtn} disabled={!id} onClick={() => window.open(`${API_URL}/purchases/purchase-orders/${id}/pdf`, '_blank')} title="Imprimir">
                        <Printer size={18} />
                    </button>
                    <button className={s.actionBtn} disabled={!id} onClick={() => showToast("En desarrollo", "info")} title="Enviar por Email">
                        <Mail size={18} />
                    </button>
                </div>
            </div>
        </div>

        {/* Body: 2 Column Layout */}
        <div className={s.bodyTwoColumns}>
            <div className={s.leftCol}>
                {!isReadOnly && (
                    <div className={s.searchRibbon}>
                        <Autocomplete 
                            onSearch={searchProducts} 
                            onSelect={handleAddItem}
                            renderItem={(item) => (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 12 }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 800, fontSize: 12, color: '#1e293b' }}>{item.name}</div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{item.sku || 'N/A'} · {item.brand || item.subcategory?.name}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 10, fontWeight: 900, color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: 6 }}>
                                            Stock: {item.total_available}
                                        </div>
                                    </div>
                                </div>
                            )}
                            placeholder="Buscar productos para añadir..."
                            variant="glass"
                            icon={<Search size={16} style={{ color: 'var(--primary)' }}/>}
                            minChars={0}
                            clearOnSelect={true}
                        />
                    </div>
                )}

                <div className={s.bentoContainer}>
                    <div className={s.tableHeader} style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 0.6fr 0.6fr 1fr 1fr 0.4fr' }}>
                        <div className={s.th}>Producto</div>
                        <div className={s.th}>Bultos/Env.</div>
                        <div className={s.th}>Unidades</div>
                        <div className={s.th}>Costo U.</div>
                        <div className={s.th}>Dto%</div>
                        <div className={s.th}>IVA%</div>
                        <div className={s.th} style={{ textAlign: 'right' }}>Subtotal</div>
                        <div className={s.th} style={{ textAlign: 'right' }}>Total</div>
                        <div></div>
                    </div>
                    <div className={s.itemsList}>
                        {items.map(item => (
                            <div key={item.id} className={s.tableRow} style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 0.6fr 0.6fr 1fr 1fr 0.4fr' }}>
                                <input type="text" className={s.tableInput} value={item.description || item.name} onChange={e => handleUpdateItem(item.id, 'description', e.target.value)} readOnly={isReadOnly} style={{border: 'none', background: 'transparent'}}/>
                                <input type="number" className={s.tableInput} value={item.qty_packages} onChange={e => handleUpdateItem(item.id, 'qty_packages', e.target.value)} readOnly={isReadOnly} />
                                <input type="number" className={s.tableInput} value={item.qty} onChange={e => handleUpdateItem(item.id, 'qty', e.target.value)} readOnly={isReadOnly} />
                                <input type="number" className={s.tableInput} value={item.unit_price} onChange={e => handleUpdateItem(item.id, 'unit_price', e.target.value)} readOnly={isReadOnly} />
                                <input type="number" className={s.tableInput} value={item.discount_pct} onChange={e => handleUpdateItem(item.id, 'discount_pct', e.target.value)} readOnly={isReadOnly} />
                                <div style={{ textAlign: 'center' }}>{((item.vat_rate || 0) * 100).toFixed(0)}%</div>
                                <div style={{ textAlign: 'right' }}>{fmtValue(item.qty * item.unit_price * (1 - (item.discount_pct/100)))}</div>
                                <div style={{ textAlign: 'right', fontWeight: 'bold' }}>{fmtValue((item.qty * item.unit_price * (1 - (item.discount_pct/100))) * (1 + item.vat_rate))}</div>
                                <button className={s.iconBtn} onClick={() => setItems(items.filter(i => i.id !== item.id))} disabled={isReadOnly}><Trash2 size={16} /></button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className={s.rightCol}>
                <div className={s.sideBlock}>
                    <div className={s.sideBlockTitle}><User size={12}/> PROVEEDOR</div>
                    <Autocomplete onSearch={searchSuppliers} onSelect={setSupplier} value={supplier?.name || ''} placeholder="Buscar..." readOnly={isReadOnly} variant="glass"/>
                    {supplier && <div style={{fontSize: 11, color: '#64748b', textAlign: 'right'}}>CUIT: {supplier.tax_id}</div>}
                </div>

                <div className={s.sideBlock}>
                    <div className={s.sideBlockTitle}><ClipboardList size={12}/> ADMINISTRACIÓN</div>
                    <div className={s.sideField}><label>Fecha</label><input type="date" className={s.sideInput} value={date} onChange={e => setDate(e.target.value)} readOnly={isReadOnly}/></div>
                    <div className={s.sideField}><label>Vto.</label><input type="date" className={s.sideInput} value={dueDate} onChange={e => setDueDate(e.target.value)} readOnly={isReadOnly}/></div>
                    <div className={s.sideField}><label>Pto./Numeral</label><div style={{display: 'flex', gap: 4}}><input className={s.sideInput} style={{textAlign: 'center'}} value={pv} onChange={e => setPv(e.target.value)} readOnly={isReadOnly}/><input className={s.sideInput} style={{flex: 1}} value={number} onChange={e => setNumber(e.target.value)} readOnly={isReadOnly}/></div></div>
                </div>

                <div className={s.sideBlock}>
                    <div className={s.sideBlockTitle}><MapPin size={12}/> LOGÍSTICA</div>
                    <div className={s.sideField}><label>Depósito</label><select className={s.sideSelect} value={warehouseId} onChange={e => setWarehouseId(e.target.value)} disabled={isReadOnly}>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
                    <div className={s.sideField}><label>Comprador</label><select className={s.sideSelect} value={buyerId} onChange={e => setBuyerId(e.target.value)} disabled={isReadOnly}><option value="">Seleccionar...</option>{sellers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                </div>

                <div className={s.sideBlock}>
                    <div className={s.sideBlockTitle}><CreditCard size={12}/> FINANZAS / COMERCIAL</div>
                    <div className={s.sideField}><label>Moneda</label><select className={s.sideSelect} value={currency} onChange={e => setCurrency(e.target.value)} disabled={isReadOnly}><option value="USD">USD</option><option value="ARS">ARS</option></select></div>
                    <div className={s.sideField}><label>T. Cambio</label><input type="number" className={s.sideInput} value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} readOnly={isReadOnly}/></div>
                    <div className={s.sideField}><label>Condición</label><select className={s.sideSelect} value={selectedConditionId} onChange={e => setSelectedConditionId(e.target.value)} disabled={isReadOnly}><option value="">Seleccionar...</option>{purchaseConditions.map(c=><option key={c.id} value={c.id}>{c.description}</option>)}</select></div>
                </div>
            </div>
        </div>

        <div className={s.relationsBar}>
            <div className={s.relationCard}><div className={s.nodeTitle}>ORDEN DE COMPRA</div><div className={s.nodeBadge}>Actual</div><div className={s.nodeMetric}>{joinFullNumber(pv, number)}</div><div className={s.nodeMetric}>{new Date(date + 'T00:00:00').toLocaleDateString()}</div></div>
            <ArrowRight size={14} color="#cbd5e1"/>
            <div className={s.relationCard}><div className={s.nodeTitle}>RECEPCIÓN</div><div className={s.nodeStatus} style={{color: '#eab308'}}>Pendiente</div><div className={s.nodeMetric}>0 ingresos</div></div>
            <ArrowRight size={14} color="#cbd5e1"/>
            <div className={s.relationCard}><div className={s.nodeTitle}>FACTURA COMPRA</div><div className={s.nodeStatus} style={{color: '#eab308'}}>Pendiente</div><div className={s.nodeMetric}>0 facturas</div></div>
            <ArrowRight size={14} color="#cbd5e1"/>
            <div className={s.relationCard}><div className={s.nodeTitle}>PAGO</div><div className={s.nodeStatus} style={{color: '#eab308'}}>Pendiente</div><div className={s.nodeMetric}>0 pagos</div></div>
            <ArrowRight size={14} color="#cbd5e1"/>
            <div className={s.relationCard}><div className={s.nodeTitle}>STOCK</div><div className={s.nodeMetric}>Se actualizará al recibir</div><div className={s.nodeMetric}>{warehouses.find(w=>w.id===warehouseId)?.name || ''}</div></div>
             <div className={s.relationCard} style={{flex: 0.5}}><div className={s.nodeTitle}>OBS.</div><div className={s.obsText}>{observations || 'Sin notas'}</div></div>
        </div>

        <div className={s.summaryPanel}>
            <div className={s.summaryItem}><div className={s.summaryLabel}>PROVEEDOR</div><div className={s.summaryValue}>{supplier?.name || '-'}</div></div>
            <div className={s.summaryItem}><div className={s.summaryLabel}>CONDICIÓN</div><div className={s.summaryValue}>{purchaseConditions.find(c=>c.id===selectedConditionId)?.description || '-'}</div></div>
            <div className={s.summaryItem}><div className={s.summaryLabel}>ITEMS</div><div className={s.summaryValue}>{items.length}</div></div>
            <div className={s.summaryItem}><div className={s.summaryLabel}>ESTADO</div><div className={s.summaryValue}>{status}</div></div>
            <div className={s.summaryItem}><div className={s.summaryLabel}>COMPRADOR</div><div className={s.summaryValue}>{sellers.find(b=>b.id===buyerId)?.name || '-'}</div></div>
            <div className={s.summaryItem}><div className={s.summaryLabel}>MODIFICACIÓN</div><div className={s.summaryValue}>{new Date().toLocaleString('es-AR', {dateStyle: 'short', timeStyle: 'short'})}</div></div>
        </div>

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
                <span className={s.footerCompactLabel} style={{color: 'var(--primary)'}}>TOTAL COMPRA</span>
                <span className={s.footerCompactTotal}>{fmt(totals.total)}</span>
            </div>
        </div>
    </div>
  );
}
