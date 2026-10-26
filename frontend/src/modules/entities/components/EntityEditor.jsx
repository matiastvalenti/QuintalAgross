import React, { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../../config';
import { Save, X, Trash2, Search, Link as LinkIcon, MapPin, Users, ChevronRight } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import AccountSelector from '../../../components/ui/AccountSelector';

const Section = ({ title, children }) => (
    <section className="entity-form-section" style={{ background: 'var(--entity-panel, #202c46)', borderRadius: '10px', border: '1px solid var(--entity-border, rgba(255,255,255,.12))', overflow: 'hidden' }}>
        <div style={{ background: '#17233b', padding: '12px 15px', borderBottom: '1px solid rgba(255,255,255,.1)', fontSize: '11px', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.075em', color: '#b2a6fa' }}>
            {title}
        </div>
        <div className="entity-section-grid" style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px' }}>
            {children}
        </div>
    </section>
);

const FormGroup = ({ label, children, colSpan = 1 }) => (
    <div className="entity-form-group" style={{ gridColumn: `span ${colSpan}`, minWidth: 0 }}>
        <label style={{ display: 'block', marginBottom: 2, fontSize: 'var(--text-sm)', fontWeight: 600, color: '#b9c8e0' }}>{label}</label>
        {children}
    </div>
);

const inputStyle = {
    width: '100%',
    padding: '0 10px',
    height: 'var(--input-h)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--r-md)',
    fontSize: 'var(--text-md)',
    color: '#f8fafc',
    background: '#162139',
    outline: 'none',
    transition: 'all 150ms ease',
};

const inputFocusStyle = (e) => {
    e.target.style.borderColor = 'var(--primary)';
    e.target.style.boxShadow = '0 0 0 4px rgba(79, 70, 229, 0.1)';
};

const inputBlurStyle = (e) => {
    e.target.style.borderColor = 'rgba(255,255,255,.17)';
    e.target.style.boxShadow = 'none';
};

const createEmptyEntity = type => ({
        name: '',
        code: '',
        type,
        tax_id: '',
        tax_category: '',
        phone: '',
        email: '',
        contact_name: '',
        address: '',
        
        country: 'Argentina', 
        state: '',
        city: '',
        zip_code: '',

        notes: '',
        account_code: '',
        create_linked: false,
        is_salesperson: false,
        salesperson_id: '',
        commission_type: 'fixed',
        commission_pct: 0,
        commission_mode: 'BY_COLLECTION',
        commission_currency: 'USD',
        commission_exchange_mode: 'INVOICE_RATE',
        margin_commission_pct: 100,
        credit_limit: 0,
        credit_status: 'OK'
    });

export default function EntityEditor({ entity, onSave, onCancel, initialType = 'client', onSelectExisting, onDirtyChange }) {
    const [activeTab, setActiveTab] = useState('general');
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
    const [salespeople, setSalespeople] = useState([]);
    const [duplicateError, setDuplicateError] = useState(null);
    const [lookingUpCuit, setLookingUpCuit] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const [formData, setFormData] = useState(() => createEmptyEntity(initialType));

    const [taxCategories] = useState([
        {id: "RESPONSABLE_INSCRIPTO", label: "Responsable Inscripto"},
        {id: "MONOTRIBUTO", label: "Monotributo"},
        {id: "EXENTO", label: "Exento"},
        {id: "CONSUMIDOR_FINAL", label: "Consumidor Final"}
    ]);

    // Initial Load
    useEffect(() => {
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        setDirty(false);
        if (entity) {
            setFormData({ ...entity, create_linked: false });
        } else {
            setFormData(createEmptyEntity(initialType));
        }

        // Fetch salespeople for assignment
        fetch(`${API_URL}/entities/?is_salesperson=true`, { headers })
            .then(res => res.json())
            .then(data => setSalespeople(data))
            .catch(err => console.error("Error loading salespeople", err));
    }, [entity, initialType]);





    const formatCUIT = (val) => {
        // Remove everything that's not a digit
        const raw = val.replace(/\D/g, '');
        
        // Limit to 11 digits
        const digits = raw.slice(0, 11);
        
        // Reconstruct: XX-XXXXXXXX-X
        let formatted = '';
        if (digits.length > 0) {
            formatted += digits.slice(0, 2);
            if (digits.length > 2) {
                formatted += '-' + digits.slice(2, 10);
                if (digits.length > 10) {
                    formatted += '-' + digits.slice(10, 11);
                }
            }
        }
        return formatted;
    };

    const handleChange = (field, value) => {
        setDirty(true);
        let finalValue = value;
        
        if (field === 'name') {
            finalValue = value.toUpperCase();
        } else if (field === 'tax_id') {
            finalValue = formatCUIT(value);
        }
        
        setFormData(prev => ({ ...prev, [field]: finalValue }));
    };

    const { showToast } = useToast ? useToast() : { showToast: console.log };

    // Primero consultar entidades ya guardadas: evita duplicar un CUIT como
    // cliente y proveedor cuando en realidad corresponde una entidad mixta.
    const lookupExistingCuit = async () => {
        const cuitDigits = (formData.tax_id || "").replace(/\D/g, "");
        if (cuitDigits.length !== 11) {
            showToast("Ingresá un CUIT de 11 dígitos para buscar.", "error");
            return;
        }
        setLookingUpCuit(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(
                API_URL + "/entities/?q=" + encodeURIComponent(formData.tax_id) + "&limit=100",
                { headers: { Authorization: "Bearer " + token } }
            );
            if (!res.ok) throw new Error("No se pudo consultar el padrón interno.");
            const results = await res.json();
            let candidates = Array.isArray(results) ? results : [];
            if (!candidates.some(candidate => String(candidate.tax_id || "").replace(/\D/g, "") === cuitDigits)) {
                const alternate = await fetch(API_URL + "/entities/?q=" + encodeURIComponent(cuitDigits) + "&limit=100",
                    { headers: { Authorization: "Bearer " + token } });
                if (alternate.ok) {
                    const more = await alternate.json();
                    if (Array.isArray(more)) candidates = candidates.concat(more);
                }
            }
            const match = candidates.find(candidate =>
                String(candidate.tax_id || "").replace(/\D/g, "") === cuitDigits &&
                String(candidate.id) !== String(entity?.id || "")
            );
            if (match) {
                setDuplicateError({
                    code: "DUPLICATE_TAX_ID",
                    message: "La entidad ya existe en el sistema.",
                    existing_entity: match
                });
            } else {
                showToast("CUIT no encontrado entre las entidades guardadas. La consulta externa a ARCA necesita autorización.", "info");
            }
        } catch (err) {
            showToast(err.message || "No se pudo consultar el CUIT.", "error");
        } finally {
            setLookingUpCuit(false);
        }
    };

    const handleConvertToMixed = async (existingId) => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/entities/${existingId}/convert-to-mixed`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || 'Error al convertir la entidad.');
            }
            const saved = await res.json();
            setDuplicateError(null);
            if (onSelectExisting) {
                await onSelectExisting(saved);
            }
            if (showToast) {
                showToast("La entidad fue convertida a Mixta.", "success");
            } else {
                alert("La entidad fue convertida a Mixta.");
            }
        } catch (err) {
            if (showToast) {
                showToast(err.message, "error");
            } else {
                alert(err.message);
            }
        }
    };

    const handleDelete = () => {
        setShowDeleteConfirm(true);
    };

    const executeDelete = async () => {
        setShowDeleteConfirm(false);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/entities/${entity.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!res.ok) {
                if (res.status === 400) {
                    const errData = await res.json().catch(() => ({}));
                    if (errData.detail?.code === "ENTITY_HAS_DEPENDENCIES") {
                        const labels = {
                            documents: "Comprobantes",
                            account_movements: "Movimientos de cuenta",
                            sales_orders: "Órdenes de venta",
                            purchase_orders: "Órdenes de compra",
                            delivery_notes: "Remitos",
                            cheques: "Cheques",
                            expense_claims: "Rendiciones de gastos"
                        };
                        const deps = errData.detail.dependencies || {};
                        const activeDeps = Object.entries(deps)
                            .filter(([, count]) => count > 0)
                            .map(([key, count]) => `${labels[key] || key}: ${count}`)
                            .join(", ");
                        throw new Error(activeDeps
                            ? `No se puede eliminar porque tiene operaciones asociadas. (${activeDeps})`
                            : 'No se puede eliminar porque tiene operaciones asociadas.');
                    }
                    throw new Error(typeof errData.detail === 'string'
                        ? errData.detail
                        : 'No se puede eliminar esta entidad porque tiene operaciones asociadas.');
                }
                if (res.status === 403) {
                    throw new Error('No tenés permisos para eliminar entidades.');
                }
                throw new Error('Error al intentar eliminar la entidad.');
            }
            
            if (showToast) {
                showToast("Entidad eliminada correctamente.", "success");
            } else {
                alert("Entidad eliminada correctamente.");
            }
            
            if (onSave) {
                onSave(null);
            }
        } catch (err) {
            if (showToast) {
                showToast(err.message, "error");
            } else {
                alert(err.message);
            }
        }
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!formData.name?.trim()) { showToast('Ingresá el nombre o razón social.', 'error'); return; }
        const digits = String(formData.tax_id || '').replace(/\D/g, '');
        if (digits.length !== 0 && digits.length !== 11) { showToast('El CUIT debe tener 11 dígitos.', 'error'); return; }
        if (Number(formData.credit_limit || 0) < 0) { showToast('El límite de crédito no puede ser negativo.', 'error'); return; }
        setSaving(true);
        try {
            const method = entity ? 'PUT' : 'POST';
            const url = entity ? `${API_URL}/entities/${entity.id}` : `${API_URL}/entities/`;
            
            // Ensure IDs are integers
            const payload = {
                ...formData,
                country_id: formData.country_id ? parseInt(formData.country_id) : null,
                province_id: formData.province_id ? parseInt(formData.province_id) : null,
                locality_id: formData.locality_id ? parseInt(formData.locality_id) : null,
            };

            const token = localStorage.getItem('token');
            const res = await fetch(url, {
                method,
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            
            if (!res.ok) {
                if (res.status === 409) {
                    try {
                        const errData = await res.json();
                        if (errData.detail && errData.detail.code === "DUPLICATE_TAX_ID") {
                            setDuplicateError(errData.detail);
                            return;
                        }
                    } catch (pErr) {
                        console.error("Error parsing conflict error", pErr);
                    }
                }
                const errorData = await res.json().catch(() => ({}));
                throw new Error(typeof errorData.detail === 'string' ? errorData.detail : errorData.detail?.message || 'Error al guardar la entidad.');
            }
            const saved = await res.json();
            setDirty(false);
            onSave(saved);
        } catch (err) {
            if (showToast) {
                showToast(err.message, "error");
            } else {
                alert(err.message);
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="entity-editor-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#202c46', color: '#f8fafc' }}>
            {/* Toolbar */}
            <div className="entity-editor-toolbar" style={{ padding: '10px 16px', background: '#202c46', borderBottom: '1px solid rgba(255,255,255,.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '54px', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 10, height: '100%' }}>
                    {['general', 'location', 'contact', 'commercial'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '0 12px',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                                color: activeTab === tab ? 'var(--primary)' : 'var(--text-secondary)',
                                fontSize: 'var(--text-xs)',
                                fontWeight: activeTab === tab ? 700 : 500,
                                cursor: 'pointer',
                                height: '36px',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                display: 'flex',
                                alignItems: 'center',
                                textTransform: 'uppercase',
                                letterSpacing: '0.025em'
                            }}
                        >
                            {tab === 'general' ? 'General' : tab === 'location' ? 'Domicilio' : tab === 'contact' ? 'Contacto' : 'Comercial'}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    {entity && (
                        <button 
                            type="button"
                            onClick={handleDelete}
                            style={{
                                padding: '8px 14px',
                                background: '#202c46',
                                border: '1px solid #fee2e2',
                                borderRadius: '8px',
                                color: '#ef4444',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                transition: 'all 0.2s ease',
                                marginRight: '4px'
                            }}
                        >
                            <Trash2 size={16} /> Eliminar
                        </button>
                    )}
                    <button 
                        onClick={onCancel}
                        style={{
                            padding: '8px 14px',
                            background: '#202c46',
                            border: '1px solid rgba(255,255,255,.16)',
                            borderRadius: '8px',
                            color: '#9cabca',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <X size={16} /> Cancelar
                    </button>
                    <button 
                        onClick={handleSubmit} 
                        disabled={saving}
                        style={{
                            padding: '8px 18px',
                            background: 'linear-gradient(135deg, var(--primary) 0%, #4338ca 100%)',
                            border: 'none',
                            borderRadius: '8px',
                            color: 'white',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.25)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <Save size={16} /> {saving ? 'Guardando...' : entity ? 'Guardar cambios' : 'Crear entidad'}
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="entity-editor-content" style={{ flex: 1, minHeight: 0, padding: '18px', overflowY: 'auto' }}>
                <form id="entity-form" onSubmit={handleSubmit} style={{ maxWidth: '1180px', margin: '0' }}>
                    {activeTab === 'general' && (
                        <div className="entity-form-columns" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
                            <Section title="Identificación Principal">
                                <FormGroup label="Razón Social / Nombre" colSpan={2}>
                                    <input 
                                        style={inputStyle} 
                                        onFocus={inputFocusStyle} 
                                        onBlur={inputBlurStyle} 
                                        value={formData.name || ''} 
                                        onChange={e => handleChange('name', e.target.value)} 
                                        required 
                                    />
                                </FormGroup>
                                <FormGroup label="CUIT">
                                    <input 
                                        style={inputStyle} 
                                        onFocus={inputFocusStyle} 
                                        onBlur={inputBlurStyle} 
                                        value={formData.tax_id || ''} 
                                        onChange={e => handleChange('tax_id', e.target.value)} 
                                        placeholder="00-00000000-0" 
                                    />
                                    <button type="button" onClick={lookupExistingCuit} disabled={lookingUpCuit}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 7, background: '#273551', color: '#f8fafc', cursor: lookingUpCuit ? 'wait' : 'pointer', fontSize: 11, fontWeight: 700 }}>
                                        <Search size={14} /> {lookingUpCuit ? 'Buscando...' : 'Buscar CUIT en Quintal'}
                                    </button>
                                </FormGroup>
                                <FormGroup label="Condición IVA">
                                    <select 
                                        style={inputStyle} 
                                        onFocus={inputFocusStyle} 
                                        onBlur={inputBlurStyle} 
                                        value={formData.tax_category || ''} 
                                        onChange={e => handleChange('tax_category', e.target.value)}
                                    >
                                        <option value="">Seleccionar...</option>
                                        {taxCategories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                </FormGroup>
                            </Section>

                            <Section title="Configuración de Cuenta">
                                <FormGroup label="Código Interno">
                                    <input 
                                        style={{...inputStyle, background: '#1b2944', cursor: 'not-allowed'}} 
                                        value={formData.code || ''} 
                                        readOnly
                                    />
                                </FormGroup>
                                <FormGroup label="Tipo de Entidad">
                                    <select 
                                        style={inputStyle} 
                                        onFocus={inputFocusStyle} 
                                        onBlur={inputBlurStyle} 
                                        value={formData.type || ''} 
                                        onChange={e => handleChange('type', e.target.value)} 
                                    >
                                        <option value="client">Cliente</option>
                                        <option value="provider">Proveedor</option>
                                        <option value="employee">Empleado</option>
                                        <option value="mixed">Mixto</option>
                                    </select>
                                </FormGroup>
                                {!entity && (
                                    <FormGroup label="Cuenta Compartida" colSpan={2}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '13px', cursor: 'pointer', padding: '12px 16px', background: '#17233b', borderRadius: '10px', border: '1px dashed #cbd5e1', color: '#bac9de' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={formData.create_linked || false} 
                                                onChange={e => handleChange('create_linked', e.target.checked)} 
                                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                            />
                                            <span style={{ fontWeight: 500 }}>
                                                Habilitar también como {formData.type === 'client' ? 'Proveedor' : 'Cliente'}
                                            </span>
                                        </label>
                                    </FormGroup>
                                )}
                                {formData.type === 'employee' && (
                                    <>
                                        <FormGroup label="Rol" colSpan={2}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '13px', cursor: 'pointer', padding: '12px 16px', background: '#17233b', borderRadius: '10px', border: '1px solid rgba(255,255,255,.16)', color: '#bac9de' }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={formData.is_salesperson || false} 
                                                    onChange={e => handleChange('is_salesperson', e.target.checked)} 
                                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                                />
                                                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                                                    Activar como Vendedor
                                                </span>
                                            </label>
                                        </FormGroup>
                                        {formData.is_salesperson && (
                                            <FormGroup label="Configuración de Comisión" colSpan={2}>
                                                <div style={{ background: '#17233b', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,.16)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                        <div style={{ flex: '1 1 200px' }}>
                                                            <label style={{ fontSize: '11px', color: '#9cabca', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Modalidad</label>
                                                            <select 
                                                                style={{...inputStyle, background: '#202c46'}}
                                                                value={formData.commission_mode || 'BY_COLLECTION'}
                                                                onChange={e => handleChange('commission_mode', e.target.value)}
                                                            >
                                                                <option value="BY_COLLECTION">Sobre Cobranza (Liberación post-cobro)</option>
                                                                <option value="BY_MARGIN">Por Margen (Precio - Costo)</option>
                                                                <option value="BY_CASH">Sobre Efectivo Ingresado</option>
                                                            </select>
                                                        </div>
                                                        <div style={{ width: '120px' }}>
                                                            <label style={{ fontSize: '11px', color: '#9cabca', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Moneda Base</label>
                                                            <select 
                                                                style={{...inputStyle, background: '#202c46'}}
                                                                value={formData.commission_currency || 'USD'}
                                                                onChange={e => handleChange('commission_currency', e.target.value)}
                                                            >
                                                                <option value="USD">USD</option>
                                                                <option value="ARS">ARS</option>
                                                            </select>
                                                        </div>
                                                        <div style={{ flex: '1 1 200px' }}>
                                                            <label style={{ fontSize: '11px', color: '#9cabca', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Tipo de Cambio</label>
                                                            <select 
                                                                style={{...inputStyle, background: '#202c46'}}
                                                                value={formData.commission_exchange_mode || 'INVOICE_RATE'}
                                                                onChange={e => handleChange('commission_exchange_mode', e.target.value)}
                                                            >
                                                                <option value="INVOICE_RATE">TC de la Factura</option>
                                                                <option value="COLLECTION_RATE">TC del Cobro</option>
                                                                <option value="PAYMENT_RATE">TC de la Liquidación</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                    
                                                    <div style={{ display: 'flex', gap: '10px' }}>
                                                        <div style={{ width: '150px' }}>
                                                            <label style={{ fontSize: '11px', color: '#9cabca', fontWeight: 600, display: 'block', marginBottom: '4px' }}>% de Comisión</label>
                                                            <input 
                                                                type="number"
                                                                style={{...inputStyle, background: '#202c46'}}
                                                                value={formData.commission_pct || 0}
                                                                onChange={e => handleChange('commission_pct', Number(e.target.value))}
                                                                placeholder="Ej: 2.0"
                                                            />
                                                        </div>
                                                        {formData.commission_mode === 'BY_MARGIN' && (
                                                            <div style={{ width: '150px' }}>
                                                                <label style={{ fontSize: '11px', color: '#9cabca', fontWeight: 600, display: 'block', marginBottom: '4px' }}>% Particip. en Margen</label>
                                                                <input 
                                                                    type="number"
                                                                    style={{...inputStyle, background: '#202c46'}}
                                                                    value={formData.margin_commission_pct || 100}
                                                                    onChange={e => handleChange('margin_commission_pct', Number(e.target.value))}
                                                                    placeholder="Ej: 100"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div style={{ fontSize: '12px', color: '#9cabca', fontStyle: 'italic', background: '#202c46', padding: '8px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                                                        {formData.commission_mode === 'BY_COLLECTION' && `Calcula comisión del ${formData.commission_pct || 0}% sobre el total neto facturado. La disponibilidad se libera gradualmente a medida que el cliente paga la factura.`}
                                                        {formData.commission_mode === 'BY_MARGIN' && `Calcula comisión del ${formData.commission_pct || 0}% sobre la participación del ${formData.margin_commission_pct || 100}% del margen (Precio de Venta - Costo) línea por línea.`}
                                                        {formData.commission_mode === 'BY_CASH' && `Calcula comisión del ${formData.commission_pct || 0}% directo sobre cada pago ingresado por un cliente asignado a este vendedor, independiente del margen.`}
                                                    </div>
                                                </div>
                                            </FormGroup>
                                        )}
                                    </>
                                )}
                                {formData.type === 'client' && (
                                    <FormGroup label="Vendedor Asignado" colSpan={2}>
                                        <select 
                                            style={inputStyle}
                                            value={formData.salesperson_id || ''}
                                            onChange={e => handleChange('salesperson_id', e.target.value)}
                                        >
                                            <option value="">-- Sin asignar --</option>
                                            {salespeople.map(sp => (
                                                <option key={sp.id} value={sp.id}>{sp.name}</option>
                                            ))}
                                        </select>
                                    </FormGroup>
                                )}
                            </Section>
                        </div>
                    )}

                    {activeTab === 'location' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
                            <Section title="Ubicación Geográfica">
                                <FormGroup label="País">
                                    <input 
                                        style={inputStyle} 
                                        onFocus={inputFocusStyle} 
                                        onBlur={inputBlurStyle} 
                                        value={formData.country || ''} 
                                        onChange={e => handleChange('country', e.target.value)} 
                                    />
                                </FormGroup>
                                <FormGroup label="Provincia">
                                    <input 
                                        style={inputStyle} 
                                        onFocus={inputFocusStyle} 
                                        onBlur={inputBlurStyle} 
                                        value={formData.state || ''} 
                                        onChange={e => handleChange('state', e.target.value)} 
                                    />
                                </FormGroup>

                                <FormGroup label="Localidad">
                                    <input 
                                        style={inputStyle} 
                                        onFocus={inputFocusStyle} 
                                        onBlur={inputBlurStyle} 
                                        value={formData.city || ''} 
                                        onChange={e => handleChange('city', e.target.value)} 
                                    />
                                </FormGroup>
                                <FormGroup label="Dirección" colSpan={2}>
                                    <input 
                                        style={inputStyle} 
                                        onFocus={inputFocusStyle} 
                                        onBlur={inputBlurStyle} 
                                        value={formData.address || ''} 
                                        onChange={e => handleChange('address', e.target.value)} 
                                    />
                                </FormGroup>
                                <FormGroup label="Código Postal">
                                    <input 
                                        style={inputStyle} 
                                        onFocus={inputFocusStyle} 
                                        onBlur={inputBlurStyle} 
                                        value={formData.zip_code || ''} 
                                        onChange={e => handleChange('zip_code', e.target.value)} 
                                    />
                                </FormGroup>
                            </Section>
                        </div>
                    )}

                    {activeTab === 'contact' && (
                         <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
                            <Section title="Información de Contacto">
                                <FormGroup label="Teléfono">
                                    <input 
                                        style={inputStyle} 
                                        onFocus={inputFocusStyle} 
                                        onBlur={inputBlurStyle} 
                                        value={formData.phone || ''} 
                                        onChange={e => handleChange('phone', e.target.value)} 
                                    />
                                </FormGroup>
                                <FormGroup label="Email">
                                    <input 
                                        style={inputStyle} 
                                        onFocus={inputFocusStyle} 
                                        onBlur={inputBlurStyle} 
                                        type="email" 
                                        value={formData.email || ''} 
                                        onChange={e => handleChange('email', e.target.value)} 
                                    />
                                </FormGroup>
                                <FormGroup label="Nombre de Contacto" colSpan={2}>
                                    <input 
                                        style={inputStyle} 
                                        onFocus={inputFocusStyle} 
                                        onBlur={inputBlurStyle} 
                                        value={formData.contact_name || ''} 
                                        onChange={e => handleChange('contact_name', e.target.value)} 
                                    />
                                </FormGroup>
                            </Section>
                         </div>
                    )}

                    {activeTab === 'commercial' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
                            <Section title="Crédito y Riesgo">
                                <FormGroup label="Límite de Crédito (USD)">
                                    <input 
                                        type="number"
                                        style={inputStyle} 
                                        onFocus={inputFocusStyle} 
                                        onBlur={inputBlurStyle} 
                                        value={formData.credit_limit || 0} 
                                        onChange={e => handleChange('credit_limit', parseFloat(e.target.value) || 0)} 
                                        placeholder="0.00 (Sin límite)"
                                    />
                                </FormGroup>
                                <FormGroup label="Estado de Riesgo">
                                    <select 
                                        style={inputStyle} 
                                        onFocus={inputFocusStyle} 
                                        onBlur={inputBlurStyle} 
                                        value={formData.credit_status || 'OK'} 
                                        onChange={e => handleChange('credit_status', e.target.value)}
                                    >
                                        <option value="OK">🟢 NORMAL (Operación habitual)</option>
                                        <option value="WARNING">🟡 OBSERVADO (Avisar al facturar)</option>
                                        <option value="BLOCKED">🔴 BLOQUEADO (No permite facturar)</option>
                                    </select>
                                </FormGroup>
                                <div style={{ gridColumn: 'span 2', fontSize: '12px', color: '#9cabca', fontStyle: 'italic' }}>
                                    El control de límite se realiza en USD. El estado BLOQUEADO impide guardar nuevas facturas.
                                </div>
                            </Section>

                            <Section title="Datos Adicionales">
                                <FormGroup label="Observaciones" colSpan={2}>
                                    <textarea 
                                        style={{...inputStyle, height: '120px', resize: 'none'}} 
                                        onFocus={inputFocusStyle} 
                                        onBlur={inputBlurStyle} 
                                        value={formData.notes || ''} 
                                        onChange={e => handleChange('notes', e.target.value)}
                                        placeholder="Ingrese notas u observaciones adicionales..."
                                    />
                                </FormGroup>
                                <FormGroup label="Cuenta Contable (ARCA)">
                                    <AccountSelector 
                                        value={formData.account_code || ''}
                                        onChange={e => handleChange('account_code', e.target.value)}
                                    />
                                </FormGroup>
                            </Section>
                        </div>
                    )}
                </form>
            </div>

            {duplicateError && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999
                }}>
                    <div style={{
                        background: '#202c46',
                        padding: '24px',
                        borderRadius: '8px',
                        width: '450px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                    }}>
                        <h3 style={{ margin: '0 0 12px 0', color: 'var(--text)', fontSize: '18px', fontWeight: 700 }}>
                            CUIT ya registrado
                        </h3>
                        <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#b8c6de' }}>
                            Ya existe una entidad registrada con ese CUIT.
                        </p>
                        
                        <div style={{
                            background: '#1b2944',
                            padding: '12px',
                            borderRadius: '6px',
                            fontSize: '13px',
                            color: '#dce4f7',
                            marginBottom: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                        }}>
                            <div><strong>Nombre:</strong> {duplicateError.existing_entity?.name}</div>
                            <div><strong>Código:</strong> {duplicateError.existing_entity?.code}</div>
                            <div><strong>Tipo actual:</strong> {duplicateError.existing_entity?.type === 'client' ? 'Cliente' : duplicateError.existing_entity?.type === 'provider' ? 'Proveedor' : duplicateError.existing_entity?.type === 'mixed' ? 'Mixto' : duplicateError.existing_entity?.type}</div>
                            <div><strong>CUIT:</strong> {duplicateError.existing_entity?.tax_id}</div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'end', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => setDuplicateError(null)}
                                style={{
                                    padding: '8px 14px',
                                    background: '#202c46',
                                    border: '1px solid rgba(255,255,255,.16)',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    color: '#b8c6de'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (onSelectExisting) {
                                        onSelectExisting(duplicateError.existing_entity);
                                    }
                                    setDuplicateError(null);
                                }}
                                style={{
                                    padding: '8px 14px',
                                    background: '#1b2944',
                                    border: '1px solid rgba(255,255,255,.16)',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    color: '#f8fafc'
                                }}
                            >
                                Ver entidad existente
                            </button>
                            <button
                                type="button"
                                onClick={() => handleConvertToMixed(duplicateError.existing_entity?.id)}
                                style={{
                                    padding: '8px 14px',
                                    background: 'var(--primary)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: 600
                                }}
                            >
                                Convertir a Mixto
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDeleteConfirm && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999
                }}>
                    <div style={{
                        background: '#202c46',
                        padding: '24px',
                        borderRadius: '8px',
                        width: '450px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                    }}>
                        <h3 style={{ margin: '0 0 12px 0', color: '#ef4444', fontSize: '18px', fontWeight: 700 }}>
                            ¿Seguro que querés eliminar esta entidad?
                        </h3>
                        <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#b8c6de', lineHeight: '1.5' }}>
                            Solo se puede eliminar si no tiene comprobantes, movimientos ni operaciones asociadas.
                        </p>
                        
                        <div style={{ display: 'flex', justifyContent: 'end', gap: '12px' }}>
                            <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(false)}
                                style={{
                                    padding: '8px 16px',
                                    background: '#202c46',
                                    border: '1px solid rgba(255,255,255,.16)',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#b8c6de'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={executeDelete}
                                style={{
                                    padding: '8px 16px',
                                    background: '#ef4444',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 600
                                }}
                            >
                                Sí, eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
