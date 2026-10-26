import React, { useState, useEffect } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { Plus, Trash2, Save, Edit2, X, Search, Clock } from 'lucide-react';
import api from '../../services/api';
import TableSkeleton from '../../components/ui/TableSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import { useToast } from '../../context/ToastContext';
import m from '../config/ManagementWorkspace.module.css';


export default function SaleConditionsPage() {
    const [conditions, setConditions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [query, setQuery] = useState('');
    const { showToast } = useToast();
    const filteredConditions = conditions.filter(c => String(c.description || '').toLocaleLowerCase('es-AR').includes(query.trim().toLocaleLowerCase('es-AR')));
    const [formData, setFormData] = useState({
        description: '',
        due_days: 0,
        interest_rate: 0,
        financing_rate: 0
    });

    useEffect(() => {
        fetchConditions();
    }, []);

    const fetchConditions = async () => {
        setLoading(true);
        try {
            const data = await api.get('/sales/sale-conditions/');
            setConditions(data);
        } catch (e) {
            console.error(e);
            showToast('No se pudieron cargar las condiciones de venta', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (c) => {
        setEditingId(c.id);
        setFormData({
            description: c.description,
            due_days: c.due_days,
            interest_rate: c.interest_rate,
            financing_rate: c.financing_rate
        });
    };

    const handleSave = async () => {
        if (saving) return;
        const desc = formData.description.trim();
        if (!desc) { showToast('Ingresá una descripción para la condición', 'error'); return; }
        if (conditions.some(c => c.id !== editingId && c.description.trim().toLocaleLowerCase('es-AR') === desc.toLocaleLowerCase('es-AR'))) { showToast('Ya existe una condición con ese nombre', 'error'); return; }
        if (!Number.isInteger(Number(formData.due_days)) || Number(formData.due_days) < 0 || [formData.interest_rate, formData.financing_rate].some(v => !Number.isFinite(Number(v)) || Number(v) < 0)) { showToast('Plazo y tasas deben ser números válidos, sin valores negativos', 'error'); return; }
        setSaving(true);
        try {
            if (editingId) {
                await api.put(`/sales/sale-conditions/${editingId}`, { ...formData, description: desc });
            } else {
                await api.post('/sales/sale-conditions/', { ...formData, description: desc });
            }
            
            setEditingId(null);
            setFormData({ description: '', due_days: 0, interest_rate: 0, financing_rate: 0 });
            showToast(editingId ? 'Condición actualizada' : 'Condición creada', 'success');
            fetchConditions();
        } catch (e) {
            console.error(e);
            showToast('No se pudo guardar la condición de venta', 'error');
        } finally { setSaving(false); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('¿Seguro que desea eliminar esta condición?')) return;
        try {
            await api.delete(`/sales/sale-conditions/${id}`);
            showToast('Condición eliminada', 'success');
            fetchConditions();
        } catch (e) {
            console.error(e);
            showToast('No se pudo eliminar. Puede haber documentos vinculados.', 'error');
        }
    };

    return (
    <div className={`${m.root} ${m.scroller}`}>
        <ContentHeader 
            title="Condiciones de Venta" 
            breadcrumbs={[{label:'Configuración'}, {label:'Condiciones de Venta'}]}
        />

        <div className={m.toolbar} style={{ marginTop: 16 }}><label className={m.searchField} style={{ flex: '1 1 270px' }}><Search size={16} /><input aria-label="Buscar condiciones de venta" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por descripción" /></label><span className={m.stat}><strong>{filteredConditions.length}</strong> de {conditions.length} condiciones</span></div>
        {/* Editor Card */}
        <div style={{ 
            background: 'var(--bg-card)', 
            borderRadius: 'var(--r-lg)', 
            border: '1px solid var(--border-color)', 
            padding: '20px', 
            marginTop: '20px', 
            boxShadow: 'var(--shadow-md)',
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 4, height: 16, background: 'var(--primary)', borderRadius: 2 }}></div>
                <h3 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text)' }}>
                    {editingId ? 'Editar Condición' : 'Nueva Condición de Venta'}
                </h3>
            </div>

            <div className={m.formGrid} style={{ alignItems: 'end' }}>
                <Input 
                    label="Descripción Comercial" 
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    placeholder="Ej: Neto 30 días"
                />
                <Input 
                    label="Días Vto" 
                    type="number" 
                    value={formData.due_days} 
                    onChange={e => setFormData({...formData, due_days: parseInt(e.target.value) || 0})}
                />
                <Input 
                    label="% Mora" 
                    type="number" 
                    value={formData.interest_rate} 
                    onChange={e => setFormData({...formData, interest_rate: parseFloat(e.target.value) || 0})}
                />
                <Input 
                    label="% Finan." 
                    type="number" 
                    value={formData.financing_rate} 
                    onChange={e => setFormData({...formData, financing_rate: parseFloat(e.target.value) || 0})}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button onClick={handleSave} disabled={saving} loading={saving} style={{ whiteSpace: 'nowrap' }}>
                        {editingId ? <Save size={16} style={{marginRight:8}}/> : <Plus size={16} style={{marginRight:8}}/>} 
                        {editingId ? 'Guardar Cambios' : 'Agregar'}
                    </Button>
                    {editingId && (
                        <Button variant="ghost" onClick={() => {
                            setEditingId(null);
                            setFormData({ description: '', due_days: 0, interest_rate: 0, financing_rate: 0 });
                        }}>
                            <X size={18} />
                        </Button>
                    )}
                </div>
            </div>
        </div>

        {/* List Card */}
        <div className={m.tableScroll} style={{ 
            background: 'var(--bg-card)', 
            borderRadius: 'var(--r-lg)', 
            border: '1px solid var(--border-color)', 
            marginTop: '20px', 
            overflow: 'hidden', 
            boxShadow: 'var(--shadow-lg)' 
        }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                    <tr style={{ background: 'var(--bg-page)' }}>
                        <th style={thStyle}>Descripción de la Condición</th>
                        <th style={thStyle}>Plazo (Días)</th>
                        <th style={thStyle}>Tasa Mora</th>
                        <th style={thStyle}>Financiamiento</th>
                        <th style={{...thStyle, textAlign: 'right'}}>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr>
                            <td colSpan="5" style={{ padding: 0 }}>
                                <TableSkeleton rows={5} cols={5} />
                            </td>
                        </tr>
                    ) : filteredConditions.length === 0 ? (
                        <tr>
                            <td colSpan="5" style={{ padding: 0 }}>
                                <EmptyState 
                                    icon={Clock}
                                    title="Sin condiciones"
                                    description={query ? "Ninguna condición coincide con la búsqueda." : "No hay condiciones de venta configuradas aún."}
                                />
                            </td>
                        </tr>
                    ) : (
                        filteredConditions.map(c => {
                            const isEditing = editingId === c.id;
                            return (
                                <tr key={c.id} style={{ 
                                    transition: 'background 0.2s',
                                    background: isEditing ? 'var(--primary-light)' : 'transparent'
                                }}>
                                    <td style={{...tdStyle, fontWeight: 600}}>{c.description}</td>
                                    <td style={tdStyle}>
                                        <span style={{ color: 'var(--text-secondary)' }}>{c.due_days}</span> días
                                    </td>
                                    <td style={tdStyle}>{c.interest_rate}%</td>
                                    <td style={tdStyle}>{c.financing_rate}%</td>
                                    <td style={{...tdStyle, textAlign: 'right'}}>
                                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                            <button onClick={() => handleEdit(c)} style={iconBtnStyle} title="Editar" aria-label={`Editar ${c.description}`}>
                                                <Edit2 size={14} />
                                            </button>
                                            <button onClick={() => handleDelete(c.id)} style={{...iconBtnStyle, color: 'var(--bad)'}} title="Eliminar" aria-label={`Eliminar ${c.description}`}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    </div>
    );
}

const thStyle = {
    padding: '6px 12px',
    textAlign: 'left',
    fontSize: 'var(--text-xs)',
    fontWeight: 700,
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    letterSpacing: '0.05em'
};

const tdStyle = {
    padding: '6px 12px',
    fontSize: 'var(--text-md)',
    color: 'var(--text-primary)'
};

const iconBtnStyle = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-tertiary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    borderRadius: 'var(--r-md)',
    transition: 'all 0.1s'
};
