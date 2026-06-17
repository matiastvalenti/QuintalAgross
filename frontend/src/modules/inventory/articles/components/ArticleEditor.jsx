import React, { useState, useEffect } from 'react';
import { Save, X, Trash2, Box, Info, Target, Settings, Database, Activity, FileText, ChevronRight, Download } from 'lucide-react';
import Button from '../../../../components/ui/Button';
import AccountSelector from '../../../../components/ui/AccountSelector';
import s from './ArticleEditor.module.css';

import api from '../../../../services/api';

export default function ArticleEditor({ article, onSave, onCancel, currentSubcategoryId, initialTab = 'general' }) {
    const [formData, setFormData] = useState(initialState(currentSubcategoryId));
    const [catalogs, setCatalogs] = useState({ units: [], containers: [], taxTypes: [] });
    const [loading, setLoading] = useState(false);
    const [movements, setMovements] = useState([]);
    const [loadingMovements, setLoadingMovements] = useState(false);
    const [activeTab, setActiveTab] = useState(initialTab);
    const [deleteReport, setDeleteReport] = useState(null);

    useEffect(() => {
        if (article) setFormData(article);
        else setFormData(initialState(currentSubcategoryId));
    }, [article, currentSubcategoryId]);

    useEffect(() => {
        const fetchCatalogs = async () => {
             try {
                 const [units, containers, taxTypes] = await Promise.all([
                     api.get('/inventory/catalogs/units'),
                     api.get('/inventory/catalogs/containers'),
                     api.get('/inventory/catalogs/tax-types')
                 ]);
                 setCatalogs({ 
                     units: Array.isArray(units) ? units : [], 
                     containers: Array.isArray(containers) ? containers : [], 
                     taxTypes: Array.isArray(taxTypes) ? taxTypes : [] 
                 });
             } catch (err) { 
                 console.error("Error loading catalogs", err);
                 setCatalogs({ units: [], containers: [], taxTypes: [] });
             }
        };
        fetchCatalogs();
    }, []);

    useEffect(() => {
        if (article) {
             setLoadingMovements(true);
             api.get(`/inventory/products/${article.id}/movements`)
                .then(setMovements)
                .catch(console.error)
                .finally(() => setLoadingMovements(false));
        }
    }, [article]);

    const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

    const handleContainerChange = (containerId) => {
        const selected = catalogs.containers.find(c => c.id === containerId);
        setFormData(prev => ({
            ...prev,
            container_id: containerId,
            quantity_per_container: selected ? selected.capacity : prev.quantity_per_container
        }));
    };

    const handleDelete = async () => {
        if (!article || !window.confirm("¿Seguro que desea eliminar este artículo?")) return;
        try {
            await api.delete(`/inventory/products/${article.id}`);
            onSave(null);
        } catch (err) { 
            if (err.detail && typeof err.detail === 'object' && err.detail.links) setDeleteReport(err.detail);
            else alert(err.message || "No se puede eliminar el artículo.");
        }
    };

    const downloadReport = () => {
        if (!deleteReport) return;
        const content = `REPORTE DE VINCULACIONES - ${article.name}\nSKU: ${article.sku}\n------------------------------------------\n` + deleteReport.links.join('\n');
        const element = document.createElement("a");
        element.href = URL.createObjectURL(new Blob([content], {type: 'text/plain'}));
        element.download = `reporte_vinculacion_${article.sku || 'articulo'}.txt`;
        element.click();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const path = article ? `/inventory/products/${article.id}` : `/products`;
            const data = article ? await api.put(path, formData) : await api.post(path, formData);
            onSave(data);
        } catch (err) { alert(err.message); }
        finally { setLoading(false); }
    };

    return (
        <div className={s.container}>
            <div className={s.header}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <h3 className={s.title}>{article ? 'Detalle de Artículo' : 'Nuevo Producto'}</h3>
                    {article && (
                        <div className={s.pills}>
                            <span className={s.pill}>SKU: {article.sku || 'S/N'}</span>
                            <span className={`${s.pill} ${article.active ? s.pillActive : ''}`}>{article.active ? 'ACTIVO' : 'INACTIVO'}</span>
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    {article && (
                        <Button variant="ghost" onClick={handleDelete} className={s.deleteBtn} style={{ color: '#ef4444' }}>
                            <Trash2 size={16} /> <span style={{ marginLeft: 6 }}>Eliminar</span>
                        </Button>
                    )}
                    <Button variant="outline" onClick={onCancel}>Cerrar</Button>
                    <Button variant="primary" onClick={handleSubmit} disabled={loading} style={{ background: 'var(--primary)', color: 'white' }}>
                        <Save size={16} /> <span style={{ marginLeft: 6 }}>{loading ? 'Guardando...' : 'Guardar'}</span>
                    </Button>
                </div>
            </div>

            <div className={s.tabs}>
                <button className={`${s.tab} ${activeTab === 'general' ? s.active : ''}`} onClick={() => setActiveTab('general')}>
                    <Info size={14} style={{ marginRight: 6 }} /> Información General
                </button>
                <button className={`${s.tab} ${activeTab === 'tecnico' ? s.active : ''}`} onClick={() => setActiveTab('tecnico')}>
                    <Target size={14} style={{ marginRight: 6 }} /> Ficha Técnica
                </button>
                {article && (
                    <button className={`${s.tab} ${activeTab === 'movimientos' ? s.active : ''}`} onClick={() => setActiveTab('movimientos')}>
                        <Activity size={14} style={{ marginRight: 6 }} /> Historial Stock
                    </button>
                )}
            </div>

            <div className={s.content}>
                <form onSubmit={handleSubmit}>
                    {activeTab === 'general' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
                            <div className={s.section}>
                                <div className={s.sectionHeader}>Identificación y Propiedades</div>
                                <div className={s.grid}>
                                    <FormGroup label="Nombre Comercial" colSpan={2}>
                                        <input className={s.input} value={formData.name || ''} onChange={e => handleChange('name', e.target.value)} required />
                                    </FormGroup>
                                    <FormGroup label="Código SKU">
                                        <input className={s.input} value={formData.sku || ''} onChange={e => handleChange('sku', e.target.value)} disabled={!!article} />
                                    </FormGroup>
                                    <FormGroup label="Estado">
                                        <label className={s.checkbox} style={{ marginTop: 8 }}>
                                            <input type="checkbox" checked={formData.active} onChange={e => handleChange('active', e.target.checked)} />
                                            Producto Habilitado
                                        </label>
                                    </FormGroup>
                                </div>
                            </div>

                            <div className={s.section}>
                                <div className={s.sectionHeader}>Logística y Finanzas</div>
                                <div className={s.grid}>
                                    <FormGroup label="Tipo de Envase">
                                        <select className={s.input} value={formData.container_id || ''} onChange={e => handleContainerChange(e.target.value)}>
                                            <option value="">Seleccionar...</option>
                                            {Array.isArray(catalogs.containers) && catalogs.containers.map(c => (
                                                <option key={c.id} value={c.id}>{c.name} ({c.capacity} {c.unit?.short_name})</option>
                                            ))}
                                        </select>
                                    </FormGroup>
                                    <FormGroup label="Contenido Unitario">
                                        <input type="number" step="0.01" className={s.input} value={formData.quantity_per_container || ''} onChange={e => handleChange('quantity_per_container', parseFloat(e.target.value))} />
                                    </FormGroup>
                                    <FormGroup label="Unidad de Medida">
                                        <select className={s.input} value={formData.unit_of_measure || ''} onChange={e => handleChange('unit_of_measure', e.target.value)} required={formData.quantity_per_container > 1}>
                                            <option value="">Seleccionar...</option>
                                            {Array.isArray(catalogs.units) && catalogs.units.map(u => (
                                                <option key={u.id} value={u.short_name}>{u.name} ({u.short_name})</option>
                                            ))}
                                        </select>
                                        {formData.quantity_per_container > 1 && !formData.unit_of_measure && (
                                            <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>Requerido por tener envases</div>
                                        )}
                                    </FormGroup>
                                    <FormGroup label="Alícuota IVA">
                                        <select className={s.input} value={formData.tax_type_id || ''} onChange={e => handleChange('tax_type_id', e.target.value)}>
                                            <option value="">Seleccionar...</option>
                                            {Array.isArray(catalogs.taxTypes) && catalogs.taxTypes.map(t => (
                                                <option key={t.id} value={t.id}>{t.name}</option>
                                            ))}
                                        </select>
                                    </FormGroup>
                                    <FormGroup label="Costo Base">
                                        <input type="number" step="0.01" className={s.input} value={formData.cost_price || ''} onChange={e => handleChange('cost_price', parseFloat(e.target.value) || 0)} />
                                    </FormGroup>
                                </div>
                            </div>

                            <div className={`${s.section}`} style={{ gridColumn: 'span 2' }}>
                                <div className={s.sectionHeader}>Plano Contable</div>
                                <div className={s.grid} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                                    <FormGroup label="Cuenta de Venta">
                                        <AccountSelector value={formData.sales_account_id || ''} onChange={e => handleChange('sales_account_id', e.target.value)} />
                                    </FormGroup>
                                    <FormGroup label="Cuenta de Compra">
                                        <AccountSelector value={formData.purchase_account_id || ''} onChange={e => handleChange('purchase_account_id', e.target.value)} />
                                    </FormGroup>
                                    <FormGroup label="Cuenta de Stock">
                                        <AccountSelector value={formData.stock_account_id || ''} onChange={e => handleChange('stock_account_id', e.target.value)} disabled={formData.is_service} />
                                    </FormGroup>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'tecnico' && (
                        <div className={s.section}>
                            <div className={s.sectionHeader}>Especificaciones Técnicas</div>
                            <div className={s.grid}>
                                <FormGroup label="Principio Activo">
                                    <input className={s.input} value={formData.active_principle || ''} onChange={e => handleChange('active_principle', e.target.value)} />
                                </FormGroup>
                                <FormGroup label="Concentración">
                                    <input className={s.input} value={formData.concentration || ''} onChange={e => handleChange('concentration', e.target.value)} />
                                </FormGroup>
                                <FormGroup label="Notas Internas" colSpan={2}>
                                    <textarea className={s.input} style={{ height: 100, resize: 'none' }} placeholder="Observaciones adicionales..." />
                                </FormGroup>
                            </div>
                        </div>
                    )}

                    {activeTab === 'movimientos' && (
                        <div className={s.section}>
                            <div className={s.sectionHeader}>Kardex de Movimientos</div>
                            <div style={{ overflowX: 'auto' }}>
                                <table className={s.movementTable}>
                                    <thead>
                                        <tr>
                                            <th className={s.mth}>Fecha</th>
                                            <th className={s.mth}>Depósito</th>
                                            <th className={s.mth}>Motivo</th>
                                            <th className={s.mth}>Referencia</th>
                                            <th className={s.mth} style={{ textAlign: 'right' }}>Entrada</th>
                                            <th className={s.mth} style={{ textAlign: 'right' }}>Salida</th>
                                            <th className={s.mth} style={{ textAlign: 'right' }}>Saldo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {movements.length === 0 ? (
                                            <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Sin movimientos</td></tr>
                                        ) : (
                                            movements.map((m, i) => (
                                                <tr key={i}>
                                                    <td className={s.mtd}>{new Date(m.date).toLocaleDateString()}</td>
                                                    <td className={s.mtd}>{m.warehouse_name || '-'}</td>
                                                    <td className={s.mtd}><span style={{ color: '#64748b', fontSize: 10 }}>{m.notes || 'S/N'}</span></td>
                                                    <td className={s.mtd}>{m.reference_type === 'DELIVERY_NOTE' ? 'Remito' : m.reference_type || '-'}</td>
                                                    <td className={s.mtd} style={{ textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{m.qty > 0 ? m.qty : '-'}</td>
                                                    <td className={s.mtd} style={{ textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{m.qty < 0 ? Math.abs(m.qty) : '-'}</td>
                                                    <td className={s.mtd} style={{ textAlign: 'right', fontWeight: 700 }}>{m.balance_after || '-'}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </form>
            </div>

            {deleteReport && (
                <div style={reportOverlayStyle}>
                    <div style={reportContentStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h4 style={{ margin: 0, color: '#ef4444' }}>No se puede eliminar</h4>
                            <button onClick={() => setDeleteReport(null)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={18}/></button>
                        </div>
                        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>{deleteReport.message}</p>
                        <div style={{ maxHeight: 200, overflow: 'auto', background: '#fef2f2', padding: 12, borderRadius: 8 }}>
                            {deleteReport.links.map((l, i) => <div key={i} style={{ fontSize: 11, color: '#991b1b', padding: '4px 0' }}>• {l}</div>)}
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                            <Button variant="secondary" onClick={downloadReport} style={{ flex: 1 }}><Download size={14} /> Reporte</Button>
                            <Button variant="primary" onClick={() => setDeleteReport(null)} style={{ flex: 1, background: '#ef4444', color: 'white' }}>Entendido</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const FormGroup = ({ label, children, colSpan = 1 }) => (
    <div className={s.formGroup} style={{ gridColumn: `span ${colSpan}` }}>
        <label className={s.label}>{label}</label>
        {children}
    </div>
);

const reportOverlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' };
const reportContentStyle = { background: 'white', borderRadius: 16, padding: 24, maxWidth: 500, width: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' };

const initialState = (subId) => ({
    name: '', sku: '', subcategory_id: subId || '', container_id: '', tax_type_id: '',
    quantity_per_container: 1.0, cost_price: 0.0, active_principle: '', concentration: '',
    active: true, is_service: false, sales_account_id: '', purchase_account_id: '', stock_account_id: '',
    unit_of_measure: ''
});
