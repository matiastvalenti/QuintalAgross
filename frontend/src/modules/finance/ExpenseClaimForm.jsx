import React, { useState, useEffect, useMemo } from 'react';
import { 
    Save, X, Plus, Trash2, Calendar, User, FileText, 
    ChevronRight, Camera, DollarSign, Info, AlertCircle,
    CheckCircle2, Fuel, Utensils, Home, Navigation, Settings, 
    HelpCircle, Eye, Building2, Hash, Percent, Receipt, Settings2,
    Search, ExternalLink, MoreVertical, Paperclip, ChevronDown
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Autocomplete from '../../components/ui/Autocomplete';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../context/ToastContext';
import { useWindow } from '../../context/WindowContext';
import { useCostCenter } from '../../context/CostCenterContext';
import s from './ExpenseClaimForm.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const CATEGORIES = [
    { name: "Combustible", icon: Fuel, color: "#6366f1" },
    { name: "Comida", icon: Utensils, color: "#f59e0b" },
    { name: "Alojamiento", icon: Home, color: "#8b5cf6" },
    { name: "Peaje / Estacionamiento", icon: Navigation, color: "#10b981" },
    { name: "Repuestos", icon: Settings, color: "#64748b" },
    { name: "Otros", icon: HelpCircle, color: "#94a3b8" }
];

const VAT_RATES = [
    { label: '21%', value: 0.21 },
    { label: '10.5%', value: 0.105 },
    { label: '27%', value: 0.27 },
    { label: '0%', value: 0 },
];

const DOCUMENT_LINES = [
    { label: 'A', value: 'A' },
    { label: 'B', value: 'B' },
    { label: 'C', value: 'C' },
    { label: 'M', value: 'M' },
    { label: 'X', value: 'X' },
];

const ACCOUNT_OPTIONS = [
    { value: '2.FUEL', label: 'Combustible' },
    { value: '2.MEALS', label: 'Comida' },
    { value: '2.SERVICES', label: 'Servicios' },
    { value: '2.TICKET', label: 'Peaje/Ticket' },
    { value: '2.TRAVEL', label: 'Viáticos' },
    { value: '2.VARIOUS', label: 'Varios/Otros' }
];

export default function ExpenseClaimForm({ claimId, onSave, onClose }) {
    const { showToast } = useToast();
    const { openWindow } = useWindow();
    const { costCenter: globalCostCenter } = useCostCenter();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [vehicles, setVehicles] = useState([]);
    
    // UI state for details popover / expanded row
    const [expandedItemId, setExpandedItemId] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        title: '',
        entity_id: '',
        employee_name: '',
        date: new Date().toISOString().split('T')[0],
        notes: '',
        status: 'DRAFT',
        unidad_negocio: '',
        campana: '',
        cost_center: globalCostCenter ?? 1,
        por_cta_orden: false,
        items: []
    });

    useEffect(() => {
        if (claimId) {
            fetchClaim();
        } else {
            addItem();
        }
        fetchVehicles();
        fetchGlobalOptions();
    }, [claimId]);

    const fetchGlobalOptions = async () => {
        try {
            const [ubRes, cpRes] = await Promise.all([
                fetch(`${API_URL}/business-units`),
                fetch(`${API_URL}/campaigns`)
            ]);
            if (ubRes.ok) setBusinessUnits(await ubRes.json());
            if (cpRes.ok) setCampaigns(await cpRes.json());
        } catch (e) { console.error(e); }
    };

    const [businessUnits, setBusinessUnits] = useState([]);
    const [campaigns, setCampaigns] = useState([]);

    const fetchVehicles = async () => {
        try {
            const res = await fetch(`${API_URL}/vehicles?active_only=true`);
            if (res.ok) setVehicles(await res.json());
        } catch (e) { console.error(e); }
    };

    const fetchClaim = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/expenses/claims/${claimId}`);
            if (!res.ok) throw new Error('Error al cargar rendición');
            const data = await res.json();
            
            // Map items for UI (split invoice number)
            const mappedItems = data.items.map(item => {
                const [pv, num] = (item.invoice_number || "-").split("-");
                return {
                    ...item,
                    invoice_number_pv: pv || "",
                    invoice_number_num: num || "",
                    date: item.date.split('T')[0]
                };
            });

            setFormData({
                ...data,
                date: data.date.split('T')[0],
                items: mappedItems
            });
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const addItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [
                ...prev.items,
                { 
                    id: Date.now() + Math.random(), 
                    date: new Date().toISOString().split('T')[0], 
                    category: 'Otros',
                    description: '', 
                    provider_name: '',
                    amount: 0, 
                    account_code: '2.TRAVEL',
                    invoice_number_pv: '0001',
                    invoice_number_num: '',
                    line: 'C',
                    vehicle_ids: []
                }
            ]
        }));
    };

    const removeItem = (id) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter(item => item.id !== id)
        }));
    };

    const calculateItemTotals = (item) => {
        const net = parseFloat(item.net_amount || 0);
        const vat = net * parseFloat(item.vat_rate || 0);
        const total = net + vat + 
            parseFloat(item.iibb_perception || 0) + 
            parseFloat(item.iva_perception || 0) + 
            parseFloat(item.ganancias_perception || 0) + 
            parseFloat(item.municipal_tax || 0) + 
            parseFloat(item.other_taxes || 0);
        
        return { vat_amount: vat.toFixed(2), amount: total.toFixed(2) };
    };

    const updateItem = (id, field, value) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.map(item => {
                if (item.id !== id) return item;
                return { ...item, [field]: value };
            })
        }));
    };

    const padZeros = (val, length) => {
        if (!val) return "";
        return String(val).padStart(length, '0').slice(-length);
    };

    const handleSubmit = async () => {
        if (!formData.entity_id) {
            showToast('Debe seleccionar un empleado', 'warning');
            return;
        }

        const submissionData = { ...formData };
        if (!submissionData.title) {
            submissionData.title = `Rendición: ${submissionData.employee_name}`;
        }

        submissionData.items = submissionData.items.map(item => ({
            ...item,
            invoice_number: `${padZeros(item.invoice_number_pv, 4)}-${padZeros(item.invoice_number_num, 8)}`
        }));

        setSaving(true);
        try {
            const method = claimId ? 'PUT' : 'POST';
            const url = claimId ? `${API_URL}/expenses/claims/${claimId}` : `${API_URL}/expenses/claims`;
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(submissionData)
            });
            if (!res.ok) throw new Error('Error al guardar');
            showToast('Rendición enviada!', 'success');
            if (onSave) onSave();
            onClose();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleFileUpload = async (itemId, file) => {
        const formDataUpload = new FormData();
        formDataUpload.append('file', file);
        try {
            const res = await fetch(`${API_URL}/expenses/upload-receipt`, { method: 'POST', body: formDataUpload });
            if (!res.ok) throw new Error('Error al subir comprobante');
            const data = await res.json();
            updateItem(itemId, 'attachment_url', `${API_URL}${data.url}`);
            showToast('Imagen guardada!', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const updateStatus = async (newStatus) => {
        try {
            const res = await fetch(`${API_URL}/expenses/claims/${claimId}/status?status=${newStatus}`, { method: 'PATCH' });
            if (!res.ok) throw new Error('Error al actualizar');
            showToast(`Estado: ${newStatus}`, 'success');
            fetchClaim();
            if (onSave) onSave();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const totalRendicion = formData.items.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    const isViewOnly = claimId && formData.status !== 'DRAFT';

    return (
        <div className={s.container}>
            {/* Header section similar to InvoiceForm */}
            <div className={s.header}>
                <div className={s.headerTop}>
                    <div className={s.titleArea}>
                        <div className={s.iconBadge}><Receipt size={22} /></div>
                        <div>
                            <h2 className={s.titleText}>{claimId ? "Consulta de Rendición" : "Carga de Rendición de Gastos"}</h2>
                            <p className={s.subtitleText}>Ingrese los tickets y comprobantes del empleado.</p>
                        </div>
                    </div>
                    <div className={s.headerActions}>
                        {claimId && <Badge variant={formData.status}>{formData.status}</Badge>}
                    </div>
                </div>

                <div className={s.headerFieldsGrid}>
                    <div style={{ gridColumn: 'span 3' }}>
                        <Autocomplete 
                            label="Empleado Responsable"
                            onSearch={(q) => fetch(`${API_URL}/entities?type=employee&q=${q}`).then(r => r.json())}
                            initialValue={formData.entity_id ? { id: formData.entity_id, name: formData.employee_name } : null}
                            onSelect={e => setFormData({ ...formData, entity_id: e.id, employee_name: e.name })}
                            disabled={isViewOnly || !!claimId}
                            placeholder="Buscar por nombre..."
                        />
                    </div>
                    <Input 
                        label="Motivo" 
                        style={{ gridColumn: 'span 3' }} 
                        value={formData.title} 
                        onChange={e => setFormData({ ...formData, title: e.target.value })} 
                        placeholder="Ej: Gastos Viaje..."
                        disabled={isViewOnly}
                    />
                    <Select 
                        label="Unidad Neg." 
                        style={{ gridColumn: 'span 2' }} 
                        value={formData.unidad_negocio} 
                        onChange={e => setFormData({ ...formData, unidad_negocio: e.target.value })}
                        disabled={isViewOnly}
                    >
                        <option value="">Selecc...</option>
                        {businessUnits.map(ub => <option key={ub.id} value={ub.name}>{ub.name}</option>)}
                    </Select>
                    <Select 
                        label="Campaña" 
                        style={{ gridColumn: 'span 2' }} 
                        value={formData.campana} 
                        onChange={e => setFormData({ ...formData, campana: e.target.value })}
                        disabled={isViewOnly}
                    >
                        <option value="">Selecc...</option>
                        {campaigns.map(cp => <option key={cp.id} value={cp.name}>{cp.name}</option>)}
                    </Select>
                    <div style={{ gridColumn: 'span 2' }}>
                        <Select 
                            label="C. Costo" 
                            value={formData.cost_center} 
                            onChange={e => setFormData({ ...formData, cost_center: parseInt(e.target.value) })}
                            disabled={isViewOnly}
                        >
                            <option value={1}>1 - ARCA</option>
                            <option value={2}>2 - Interno</option>
                        </Select>
                    </div>
                    <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <label className={s.checkboxLabel} style={{ marginBottom: 4 }}>Opciones</label>
                        <label className={s.checkboxField} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            <input 
                                type="checkbox" 
                                checked={formData.por_cta_orden} 
                                onChange={e => setFormData({ ...formData, por_cta_orden: e.target.checked })}
                                disabled={isViewOnly}
                            />
                            CTA/ORD
                        </label>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className={s.content}>
                <div className={s.tableCard}>
                    <table className={s.table}>
                        <thead>
                            <tr>
                                <th className={s.th}>Fecha</th>
                                <th className={s.th}>Categoría</th>
                                <th className={s.th}>Descripción</th>
                                <th className={s.th}>Proveedor (Opcional)</th>
                                <th className={`${s.th}`} style={{ textAlign: 'right' }}>Monto Total</th>
                                <th className={s.th} style={{ textAlign: 'center' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {formData.items.map((item, idx) => (
                                <React.Fragment key={item.id}>
                                    <tr className={s.tr}>
                                        <td className={s.td} style={{ width: 130 }}>
                                            <input type="date" className={s.cellInput} value={item.date} onChange={e => updateItem(item.id, 'date', e.target.value)} disabled={isViewOnly} />
                                        </td>
                                        <td className={s.td} style={{ width: 140 }}>
                                            <select className={s.cellInput} value={item.category} onChange={e => updateItem(item.id, 'category', e.target.value)} disabled={isViewOnly}>
                                                {CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                            </select>
                                        </td>
                                        <td className={s.td}>
                                            <input className={s.cellInput} value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} placeholder="¿En qué se gastó?" disabled={isViewOnly} />
                                        </td>
                                        <td className={s.td} style={{ width: 180 }}>
                                            <input className={s.cellInput} value={item.provider_name} onChange={e => updateItem(item.id, 'provider_name', e.target.value)} placeholder="Nombre del comercio..." disabled={isViewOnly} />
                                        </td>
                                        <td className={s.td} style={{ width: 130 }}>
                                            <input type="number" className={`${s.cellInput} ${s.totalInput}`} value={item.amount} onChange={e => updateItem(item.id, 'amount', e.target.value)} disabled={isViewOnly} placeholder="0.00" />
                                        </td>
                                        <td className={s.td} style={{ width: 120 }}>
                                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                                {item.attachment_url && (
                                                    <button className={s.actionBtn} onClick={() => setPreviewUrl(item.attachment_url)} title="Ver Comprobante">
                                                        <Eye size={18} className={s.viewIcon} />
                                                    </button>
                                                )}
                                                <label className={s.actionBtn} title="Adjuntar Ticket">
                                                    <input type="file" style={{ display: 'none' }} onChange={e => handleFileUpload(item.id, e.target.files[0])} disabled={isViewOnly} />
                                                    <Paperclip size={18} className={item.attachment_url ? s.successIcon : s.paperclipIcon} />
                                                </label>
                                                <button className={s.actionBtn} onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)} title="Más datos / Vehículos">
                                                    <Settings2 size={18} style={{ color: item.vehicle_ids?.length ? '#10b981' : '#64748b' }} />
                                                </button>
                                                {!isViewOnly && (
                                                    <button className={s.actionBtn} onClick={() => removeItem(item.id)} title="Eliminar">
                                                        <Trash2 size={18} className={s.trashIcon} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    
                                    {/* Expanded Details Row (Taxes and Vehicles) */}
                                    {expandedItemId === item.id && (
                                        <tr className={s.expandedRow}>
                                            <td colSpan={11} className={s.expandedCell}>
                                                <div className={s.expandedContainer}>
                                                    <div className={s.expandedGrid}>
                                                        <div className={s.taxSection}>
                                                            <div className={s.expandedHeader}>
                                                                <Percent size={18} color="#3b82f6" />
                                                                <h4 className={s.expandedTitle}>Datos Contables (Opcional)</h4>
                                                            </div>
                                                            <div className={s.miniGrid}>
                                                                <div style={{ display: 'flex', gap: 10, gridColumn: 'span 3' }}>
                                                                    <div style={{ width: 60 }}>
                                                                        <label className={s.label}>Línea</label>
                                                                        <select className={s.cellInput} value={item.line} onChange={e => updateItem(item.id, 'line', e.target.value)} disabled={isViewOnly}>
                                                                            {DOCUMENT_LINES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                                                                        </select>
                                                                    </div>
                                                                    <div style={{ width: 60 }}>
                                                                        <label className={s.label}>PV</label>
                                                                        <input className={s.cellInput} value={item.invoice_number_pv} onChange={e => updateItem(item.id, 'invoice_number_pv', e.target.value)} onBlur={e => updateItem(item.id, 'invoice_number_pv', padZeros(e.target.value, 4))} disabled={isViewOnly} />
                                                                    </div>
                                                                    <div style={{ flex: 1 }}>
                                                                        <label className={s.label}>Número de Factura</label>
                                                                        <input className={s.cellInput} value={item.invoice_number_num} onChange={e => updateItem(item.id, 'invoice_number_num', e.target.value)} onBlur={e => updateItem(item.id, 'invoice_number_num', padZeros(e.target.value, 8))} disabled={isViewOnly} />
                                                                    </div>
                                                                </div>
                                                                <div className={s.fieldGroup}>
                                                                    <label className={s.label}>IVA %</label>
                                                                    <select className={s.cellInput} value={item.vat_rate} onChange={e => updateItem(item.id, 'vat_rate', e.target.value)} disabled={isViewOnly}>
                                                                        {VAT_RATES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                                                                    </select>
                                                                </div>
                                                                <div className={s.fieldGroup}>
                                                                    <label className={s.label}>Neto</label>
                                                                    <input type="number" className={s.cellInput} value={item.net_amount} onChange={e => updateItem(item.id, 'net_amount', e.target.value)} disabled={isViewOnly} />
                                                                </div>
                                                                <div className={s.fieldGroup}>
                                                                    <label className={s.label}>Perc. IIBB / Varios</label>
                                                                    <input type="number" className={s.cellInput} value={item.iibb_perception} onChange={e => updateItem(item.id, 'iibb_perception', e.target.value)} disabled={isViewOnly} />
                                                                </div>
                                                                <div className={s.fieldGroup} style={{ gridColumn: 'span 3' }}>
                                                                    <label className={s.label}>Cuenta Contable</label>
                                                                    <select className={s.cellInput} style={{ height: 28 }} value={item.account_code} onChange={e => updateItem(item.id, 'account_code', e.target.value)} disabled={isViewOnly}>
                                                                        {ACCOUNT_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                                                                    </select>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className={s.vehicleSection}>
                                                            <div className={s.expandedHeader}>
                                                                <Navigation size={18} color="#10b981" />
                                                                <h4 className={s.expandedTitle}>Vehículos Asociados</h4>
                                                            </div>
                                                            <div className={s.vehicleGrid}>
                                                                {vehicles.map(v => (
                                                                    <label key={v.id} className={s.vehicleOption}>
                                                                        <input 
                                                                            type="checkbox" 
                                                                            checked={item.vehicle_ids?.includes(v.id)} 
                                                                            onChange={e => {
                                                                                const next = e.target.checked ? [...(item.vehicle_ids || []), v.id] : (item.vehicle_ids || []).filter(vid => vid !== v.id);
                                                                                updateItem(item.id, 'vehicle_ids', next);
                                                                            }}
                                                                            disabled={isViewOnly}
                                                                        />
                                                                        <span style={{ fontWeight: 600 }}>{v.plate}</span> - {v.name}
                                                                    </label>
                                                                ))}
                                                                {vehicles.length === 0 && <span style={{ fontStyle: 'italic', fontSize: 12, color: '#94a3b8' }}>Cargando vehículos...</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
                                                        <button 
                                                            className={s.addBtn} 
                                                            style={{ border: 'none', background: '#334155', color: 'white' }}
                                                            onClick={() => setExpandedItemId(null)}
                                                        >
                                                            <CheckCircle2 size={16} /> Finalizar Detalle
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                    {!isViewOnly && (
                        <div className={s.addItemArea}>
                            <button className={s.addBtn} onClick={addItem}>
                                <Plus size={18} /> Añadir Gasto / Ticket
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer consistent with system aesthetics */}
            <div className={s.footer}>
                <div className={s.totalsArea}>
                    <div className={s.totalLabel}>REEMBOLSO TOTAL AL EMPLEADO</div>
                    <div className={s.totalValue}>$ {totalRendicion.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </div>
                <div className={s.actionArea}>
                    {!isViewOnly ? (
                        <Button 
                            variant="primary" 
                            size="lg" 
                            onClick={handleSubmit} 
                            disabled={saving}
                            style={{ height: 54, padding: '0 32px', borderRadius: 14, fontSize: 16, fontWeight: 800 }}
                        >
                            <Save size={20} style={{ marginRight: 10 }} />
                            {saving ? "Enviando..." : claimId ? "Guardar Cambios" : "Presentar Rendición"}
                        </Button>
                    ) : (
                        <div style={{ display: 'flex', gap: 12 }}>
                            {formData.status === 'SUBMITTED' && (
                                <>
                                    <Button variant="success" onClick={() => updateStatus('APPROVED')} size="lg">
                                        <CheckCircle2 size={20} style={{ marginRight: 10 }} /> Aprobar y Contabilizar
                                    </Button>
                                    <Button variant="danger" onClick={() => updateStatus('REJECTED')} size="lg">
                                        Rechazar
                                    </Button>
                                </>
                            )}
                            {formData.status === 'APPROVED' && (
                                <Button variant="success" onClick={() => updateStatus('REIMBURSED')} size="lg">
                                    <DollarSign size={20} style={{ marginRight: 10 }} /> Confirmar Pago Realizado
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Receipt Preview Overlay */}
            {previewUrl && (
                <div className={s.previewOverlay} onClick={() => setPreviewUrl(null)}>
                    <div className={s.previewContent} onClick={e => e.stopPropagation()}>
                        <div className={s.previewHeader}>
                            <h3>Vista Previa del Comprobante</h3>
                            <button className={s.closePreview} onClick={() => setPreviewUrl(null)}><X size={24} /></button>
                        </div>
                        <div className={s.previewBody}>
                            {previewUrl.toLowerCase().endsWith('.pdf') ? (
                                <iframe src={previewUrl} className={s.previewFrame} title="Ticket PDF" />
                            ) : (
                                <img src={previewUrl} alt="Ticket" className={s.previewImage} />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
