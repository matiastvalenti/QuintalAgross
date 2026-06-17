import React, { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../../config';
import { Save, X, Trash2, Search, Link as LinkIcon, MapPin, Users, ChevronRight } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import AccountSelector from '../../../components/ui/AccountSelector';

const Section = ({ title, children }) => (
    <div style={{ background: '#fff', borderRadius: 'var(--r-md)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div style={{ background: 'var(--bg-page)', padding: '6px 12px', borderBottom: '1px solid var(--border-color)', fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
            {title}
        </div>
        <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {children}
        </div>
    </div>
);

const FormGroup = ({ label, children, colSpan = 1 }) => (
    <div style={{ gridColumn: `span ${colSpan}` }}>
        <label style={{ display: 'block', marginBottom: 2, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</label>
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
    color: 'var(--text)',
    background: '#fff',
    outline: 'none',
    transition: 'all 150ms ease',
};

const inputFocusStyle = (e) => {
    e.target.style.borderColor = 'var(--primary)';
    e.target.style.boxShadow = '0 0 0 4px rgba(79, 70, 229, 0.1)';
};

const inputBlurStyle = (e) => {
    e.target.style.borderColor = '#e2e8f0';
    e.target.style.boxShadow = 'none';
};

export default function EntityEditor({ entity, onSave, onCancel, initialType = 'client' }) {
    const [activeTab, setActiveTab] = useState('general');
    const [saving, setSaving] = useState(false);
    const [salespeople, setSalespeople] = useState([]);

    const [formData, setFormData] = useState({
        name: '',
        code: '',
        type: initialType,
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
        if (entity) {
            setFormData({ ...entity, create_linked: false });
        } else {
            setFormData(prev => ({ ...prev, type: initialType }));
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
        let finalValue = value;
        
        if (field === 'name') {
            finalValue = value.toUpperCase();
        } else if (field === 'tax_id') {
            finalValue = formatCUIT(value);
        }
        
        setFormData(prev => ({ ...prev, [field]: finalValue }));
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
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
            
            if (!res.ok) throw new Error('Error al guardar');
            const saved = await res.json();
            onSave(saved);
        } catch (err) {
            showToast(err.message, "error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc' }}>
            {/* Toolbar */}
            <div style={{ padding: '0 16px', background: 'white', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '36px' }}>
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
                    <button 
                        onClick={onCancel}
                        style={{
                            padding: '8px 14px',
                            background: 'white',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            color: '#64748b',
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
                        <Save size={16} /> {saving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
                <form id="entity-form" onSubmit={handleSubmit} style={{ maxWidth: '1000px', margin: '0 0' }}>
                    {activeTab === 'general' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
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
                                        style={{...inputStyle, background: '#f1f5f9', cursor: 'not-allowed'}} 
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
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '13px', cursor: 'pointer', padding: '12px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1', color: '#475569' }}>
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
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '13px', cursor: 'pointer', padding: '12px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', color: '#475569' }}>
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
                                                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                        <div style={{ flex: '1 1 200px' }}>
                                                            <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Modalidad</label>
                                                            <select 
                                                                style={{...inputStyle, background: '#fff'}}
                                                                value={formData.commission_mode || 'BY_COLLECTION'}
                                                                onChange={e => handleChange('commission_mode', e.target.value)}
                                                            >
                                                                <option value="BY_COLLECTION">Sobre Cobranza (Liberación post-cobro)</option>
                                                                <option value="BY_MARGIN">Por Margen (Precio - Costo)</option>
                                                                <option value="BY_CASH">Sobre Efectivo Ingresado</option>
                                                            </select>
                                                        </div>
                                                        <div style={{ width: '120px' }}>
                                                            <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Moneda Base</label>
                                                            <select 
                                                                style={{...inputStyle, background: '#fff'}}
                                                                value={formData.commission_currency || 'USD'}
                                                                onChange={e => handleChange('commission_currency', e.target.value)}
                                                            >
                                                                <option value="USD">USD</option>
                                                                <option value="ARS">ARS</option>
                                                            </select>
                                                        </div>
                                                        <div style={{ flex: '1 1 200px' }}>
                                                            <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Tipo de Cambio</label>
                                                            <select 
                                                                style={{...inputStyle, background: '#fff'}}
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
                                                            <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>% de Comisión</label>
                                                            <input 
                                                                type="number"
                                                                style={{...inputStyle, background: '#fff'}}
                                                                value={formData.commission_pct || 0}
                                                                onChange={e => handleChange('commission_pct', Number(e.target.value))}
                                                                placeholder="Ej: 2.0"
                                                            />
                                                        </div>
                                                        {formData.commission_mode === 'BY_MARGIN' && (
                                                            <div style={{ width: '150px' }}>
                                                                <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>% Particip. en Margen</label>
                                                                <input 
                                                                    type="number"
                                                                    style={{...inputStyle, background: '#fff'}}
                                                                    value={formData.margin_commission_pct || 100}
                                                                    onChange={e => handleChange('margin_commission_pct', Number(e.target.value))}
                                                                    placeholder="Ej: 100"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', background: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
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
                                <div style={{ gridColumn: 'span 2', fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
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
        </div>
    );
}
