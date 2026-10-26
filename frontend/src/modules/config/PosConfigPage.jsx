import React, { useState, useEffect } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import { Plus, Trash2, Save, Store, FileText, Receipt, Hash, Search } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { padPV } from '../../utils/formatters';
import api from '../../services/api';
import TableSkeleton from '../../components/ui/TableSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import m from './ManagementWorkspace.module.css';

const DOC_TYPES = [
    { value: 'OV', label: 'Orden de Venta' },
    { value: 'OC', label: 'Orden de Compra' },
    { value: 'RE', label: 'Remito' },
    { value: 'FA', label: 'Factura A' },
    { value: 'FB', label: 'Factura B' },
    { value: 'NCA', label: 'Nota de Crédito A' },
    { value: 'NCB', label: 'Nota de Crédito B' },
    { value: 'NDA', label: 'Nota de Débito A' },
    { value: 'NDB', label: 'Nota de Débito B' },
];

export default function PosConfigPage() {
    const [pvs, setPvs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null); // { id, pv, name, document_configs: [] }
    const { showToast } = useToast();
    const [saving, setSaving] = useState(false);
    const [query, setQuery] = useState('');
    const matchingPvs = pvs.filter(p => [p.pv, p.name].some(v => String(v || '').toLocaleLowerCase('es-AR').includes(query.trim().toLocaleLowerCase('es-AR'))));

    useEffect(() => {
        fetchPvs();
    }, []);

    const fetchPvs = async () => {
        try {
            const data = await api.get('/config/pos');
            setPvs(data);
        } catch (e) {
            console.error(e);
            showToast("Error al cargar puntos de venta", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (saving || !editing) return;
        if (!String(editing.pv).trim() || !String(editing.name).trim() || !/^\d{1,5}$/.test(String(editing.pv).trim())) {
            showToast('Ingresá un punto de venta numérico de 1 a 5 dígitos y una descripción.', 'error'); return;
        }
        if (pvs.some(p => p.id !== editing.id && Number(p.pv) === Number(editing.pv))) { showToast('Ya existe ese número de punto de venta', 'error'); return; }
        const configs = editing.document_configs || [];
        if (new Set(configs.map(c => c.document_type)).size !== configs.length) { showToast('Un tipo de comprobante está repetido', 'error'); return; }
        if (configs.some(c => !DOC_TYPES.some(t => t.value === c.document_type) || !Number.isSafeInteger(Number(c.last_number)) || Number(c.last_number) < 0)) { showToast('Los últimos números deben ser enteros y mayores o iguales a cero', 'error'); return; }
        const original = pvs.find(p => p.id === editing.id);
        const decreased = configs.some(c => { const old = (original?.document_configs || []).find(o => o.document_type === c.document_type); return old && Number(c.last_number) < Number(old.last_number); });
        if (decreased && !window.confirm('Estás reduciendo el último número de un comprobante. Podrías duplicar numeración ya utilizada. ¿Confirmás?')) return;
        setSaving(true);
        try {
            if (editing.id) {
                await api.put(`/config/pos/${editing.id}`, { ...editing, pv: padPV(editing.pv), document_configs: configs });
            } else {
                await api.post('/config/pos', { ...editing, pv: padPV(editing.pv), document_configs: configs });
            }
            showToast("Punto de venta guardado", "success");
            setEditing(null);
            fetchPvs();
        } catch (e) {
            showToast("Error al guardar", "error");
        } finally { setSaving(false); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿Eliminar este punto de venta?")) return;
        try {
            await api.delete(`/config/pos/${id}`);
            showToast("Punto de venta eliminado", "success");
            fetchPvs();
        } catch (e) {
            showToast("Error al eliminar", "error");
        }
    };

    const addDocConfig = () => {
        const nextType = DOC_TYPES.find(t => !(editing.document_configs || []).some(c => c.document_type === t.value));
        if (!nextType) { showToast('Ya configuraste todos los tipos disponibles', 'info'); return; }
        setEditing({
            ...editing,
            document_configs: [
                ...editing.document_configs,
                { document_type: nextType.value, last_number: 0 }
            ]
        });
    };

    const removeDocConfig = (index) => {
        const configs = [...editing.document_configs];
        configs.splice(index, 1);
        setEditing({ ...editing, document_configs: configs });
    };

    const updateDocConfig = (index, field, value) => {
        const configs = [...editing.document_configs];
        configs[index] = { ...configs[index], [field]: value };
        setEditing({ ...editing, document_configs: configs });
    };

    // if (loading) return <div style={{ padding: 20 }}>Cargando...</div>;

    if (editing) {
        return (
            <div className={`${m.root} ${m.scroller}`} style={{ paddingInline: 'clamp(14px, 3vw, 30px)' }}>
                <ContentHeader 
                    title={editing.id ? "Editar Punto de Venta" : "Nuevo Punto de Venta"} 
                    onBack={() => setEditing(null)}
                />

                <Card style={{ marginTop: 20 }}>
                    <div className={m.flexGrid}>
                        <Input 
                            label="Punto de Venta" 
                            placeholder="0001"
                            value={editing.pv} 
                            onChange={e => setEditing({...editing, pv: e.target.value})}
                            onBlur={() => setEditing({...editing, pv: padPV(editing.pv)})}
                        />
                        <Input 
                            label="Nombre / Descripción" 
                            placeholder="Agronomía Casa Central"
                            value={editing.name} 
                            onChange={e => setEditing({...editing, name: e.target.value})}
                        />
                    </div>

                    <div style={{ marginTop: 24 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h4 style={{ margin: 0, fontSize: 14 }}>Configuración de Comprobantes</h4>
                            <Button size="sm" variant="ghost" disabled={(editing.document_configs || []).length >= DOC_TYPES.length} onClick={addDocConfig}>
                                <Plus size={14} /> Agregar Tipo
                            </Button>
                        </div>

                        {(editing.document_configs || []).length === 0 ? (
                            <div style={{ padding: 30, textAlign: 'center', background: 'var(--bg-page)', borderRadius: 8, opacity: 0.6, fontSize: 13 }}>
                                No hay tipos de comprobantes configurados para este PV.
                            </div>
                        ) : (
                            <div className={m.tableScroll}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', fontSize: 12, color: 'var(--text-secondary)' }}>
                                        <th style={{ padding: '8px 4px' }}>Tipo de Comprobante</th>
                                        <th style={{ padding: '8px 4px', width: 150 }}>Último Número</th>
                                        <th style={{ padding: '8px 4px', width: 180 }}>Próximo a Generar</th>
                                        <th style={{ width: 40 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(editing.document_configs || []).map((cfg, idx) => (
                                        <tr key={idx} style={{ borderTop: '1px solid var(--border-color)' }}>
                                            <td style={{ padding: '8px 4px' }}>
                                                <select 
                                                    value={cfg.document_type}
                                                    onChange={e => updateDocConfig(idx, 'document_type', e.target.value)}
                                                    style={{ 
                                                        width: '100%', padding: '4px 8px', borderRadius: 4, 
                                                        border: '1px solid var(--border-color)', fontSize: 13 
                                                    }}
                                                >
                                                    {DOC_TYPES.map(t => (
                                                        <option key={t.value} value={t.value} disabled={(editing.document_configs || []).some((existing, i) => i !== idx && existing.document_type === t.value)}>{t.label}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td style={{ padding: '8px 4px' }}>
                                                <Input 
                                                    type="number"
                                                    value={cfg.last_number}
                                                    onChange={e => updateDocConfig(idx, 'last_number', Math.max(0, parseInt(e.target.value, 10) || 0))}
                                                    style={{ marginBottom: 0 }}
                                                />
                                            </td>
                                            <td style={{ padding: '8px 4px', fontSize: 13, fontWeight: 600, color: 'var(--primary)' }}>
                                                {editing.pv}-{String((parseInt(cfg.last_number) || 0) + 1).padStart(8, '0')}
                                            </td>
                                            <td style={{ padding: '8px 4px' }}>
                                                <button 
                                                    onClick={() => removeDocConfig(idx)}
                                                    style={{ background: 'none', border: 'none', color: 'var(--bad)', cursor: 'pointer' }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table></div>
                        )}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, color: 'var(--text-secondary)' }}><input type="checkbox" checked={editing.active !== false} onChange={e => setEditing({ ...editing, active: e.target.checked })} />Punto de venta activo</label>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--border-color)' }}>
                        <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                        <Button onClick={handleSave} disabled={saving} loading={saving}><Save size={16} /> Guardar Cambios</Button>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className={`${m.root} ${m.scroller}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <ContentHeader 
                    title="Puntos de Venta" 
                    breadcrumbs={[{ label: 'Configuración' }, { label: 'Puntos de Venta' }]}
                />
                <Button onClick={() => setEditing({ pv: '', name: '', active: true, document_configs: [] })}>
                    <Plus size={16} /> Nuevo PV
                </Button>
            </div>

            <div className={m.toolbar} style={{ marginBottom: 20 }}><label className={m.searchField} style={{ flex: '1 1 260px' }}><Search size={16}/><input aria-label="Buscar puntos de venta" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por número o nombre" /></label><span className={m.stat}><strong>{matchingPvs.length}</strong> de {pvs.length} puntos de venta</span></div>
            <div className={m.flexGrid} style={{ alignItems: 'stretch' }}>
                {loading ? (
                    [1,2,3].map(i => (
                        <Card key={i} style={{ height: 140, background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-color)', animation: 'pulse 1.5s infinite' }} />
                    ))
                ) : matchingPvs.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1' }}>
                        <EmptyState 
                            icon={Store}
                            title="No hay puntos de venta"
                            description="Cree su primer punto de venta para comenzar a facturar."
                        />
                    </div>
                ) : (
                    matchingPvs.map(p => (
                        <Card key={p.id} title={`${p.pv} - ${p.name}`} 
                            actions={
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <Badge variant={p.active ? 'success' : 'gray'}>{p.active ? 'Activo' : 'Inactivo'}</Badge>
                                    <Button size="sm" variant="ghost" onClick={() => setEditing({ ...p, document_configs: Array.isArray(p.document_configs) ? p.document_configs : [] })}>Editar</Button>
                                    <button onClick={() => handleDelete(p.id)} style={{ background: 'none', border: 'none', color: 'var(--bad)', cursor: 'pointer', padding: 4 }}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            }
                        >
                            <div style={{ fontSize: 13 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', marginBottom: 8 }}>
                                    <FileText size={14} /> {(p.document_configs || []).length} comprobantes configurados
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                    {(p.document_configs || []).map(c => (
                                        <Badge key={c.document_type} variant="info" style={{ fontSize: 10 }}>
                                            {c.document_type}: {String(c.last_number + 1).padStart(8, '0')}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
