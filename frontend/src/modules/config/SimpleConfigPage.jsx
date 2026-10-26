import React, { useState, useEffect } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import { Plus, Trash2, Edit2, Check, X, Tag, Briefcase, Search, Landmark } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import TableSkeleton from '../../components/ui/TableSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import m from './ManagementWorkspace.module.css';

export default function SimpleConfigPage({ type = 'campaigns', title = 'Campañas' }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [query, setQuery] = useState('');
    const [newItemName, setNewItemName] = useState('');
    const [editingItem, setEditingItem] = useState(null); // { id, name }
    const { showToast } = useToast();

    const endpoint = `/config/${type}`;
    const filteredItems = items.filter(item => String(item.name || '').toLocaleLowerCase('es-AR').includes(query.trim().toLocaleLowerCase('es-AR')));
    const duplicated = (name, id) => items.some(item => item.id !== id && item.name.trim().toLocaleLowerCase('es-AR') === name.trim().toLocaleLowerCase('es-AR'));

    useEffect(() => {
        fetchItems(items.length === 0); // Only loud load if we have nothing
        setEditingItem(null);
        setNewItemName('');
        setQuery('');
    }, [type]);

    const fetchItems = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            const data = await api.get(endpoint);
            setItems(data);
        } catch (e) {
            showToast("Error al cargar datos", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async () => {
        if (saving || !newItemName.trim()) return;
        if (duplicated(newItemName)) { showToast('Ya existe un registro con ese nombre', 'error'); return; }
        setSaving(true);
        try {
            await api.post(endpoint, { name: newItemName.trim(), active: true });
            showToast("Guardado correctamente", "success");
            setNewItemName('');
            fetchItems();
        } catch (e) {
            showToast("Error al guardar", "error");
        } finally { setSaving(false); }
    };

    const handleUpdate = async () => {
        if (saving || !editingItem || !editingItem.name.trim()) return;
        if (duplicated(editingItem.name, editingItem.id)) { showToast('Ya existe un registro con ese nombre', 'error'); return; }
        setSaving(true);
        try {
            await api.put(`${endpoint}/${editingItem.id}`, { name: editingItem.name.trim() });
            showToast("Actualizado correctamente", "success");
            setEditingItem(null);
            fetchItems();
        } catch (e) {
            console.error(e);
            showToast("Error al actualizar", "error");
        } finally { setSaving(false); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿Está seguro de eliminar este registro?")) return;
        try {
            await api.delete(`${endpoint}/${id}`);
            showToast("Eliminado correctamente", "success");
            fetchItems();
        } catch (e) {
            console.error(e);
            showToast("Error al eliminar (puede tener registros vinculados)", "error");
        }
    };

    // if (loading) return <div className={`${m.root} ${m.scroller}`}>Cargando...</div>;

    const labelStr = title.endsWith('s') ? title.slice(0, -1) : title;

    return (
        <div style={{ padding: 20 }}>
            <ContentHeader title={title} breadcrumbs={[{ label: "Configuración" }, { label: title }]} />
            <div className={m.stats}><span className={m.stat}><strong>{items.length}</strong> registrados</span><span className={m.stat}><strong>{filteredItems.length}</strong> resultados</span></div>
            
            <Card style={{ marginTop: 12, maxWidth: 960 }}>
                {/* Form Alta */}
                <div className={m.toolbar} style={{ marginBottom: 22 }}>
                    <div style={{ flex: 1 }}>
                        <Input 
                            label={`Nueva ${labelStr}`}
                            placeholder={`Ej: ${labelStr} 2025`}
                            value={newItemName}
                            onChange={e => setNewItemName(e.target.value)}
                        />
                    </div>
                    <div>
                        <Button size="sm" onClick={handleAdd} disabled={saving || !newItemName.trim()} loading={saving}>
                            <Plus size={14} /> Agregar
                        </Button>
                    </div>
                </div>

                <label className={m.searchField} style={{ marginBottom: 18 }}><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} aria-label={`Buscar ${title}`} placeholder={`Buscar ${title.toLowerCase()}...`}/></label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {[1,2,3].map(i => (
                                <div key={i} style={{ height: 48, background: 'var(--panel-2)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
                            ))}
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <EmptyState 
                            icon={type === 'campaigns' ? Tag : (type === 'banks' ? Landmark : Briefcase)}
                            title={`Sin ${title}`}
                            description={query ? 'No hay resultados para esa búsqueda.' : `No hay ${title.toLowerCase()} configuradas aún.`}
                        />
                    ) : (
                        filteredItems.map(item => {
                            const isEditing = editingItem?.id === item.id;
                            
                            return (
                                <div key={item.id} style={{ 
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '8px 12px', background: isEditing ? 'var(--primary-light)' : 'var(--bg-page)', 
                                    borderRadius: 8, border: `1px solid ${isEditing ? 'var(--primary)' : 'var(--border-color)'}`,
                                    transition: 'all 0.2s'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                                        {type === 'campaigns' ? <Tag size={14} className="text-secondary" /> : 
                                         type === 'banks' ? <Landmark size={14} className="text-secondary" /> :
                                         <Briefcase size={14} className="text-secondary" />}
                                        
                                        {isEditing ? (
                                            <input 
                                                autoFocus
                                                value={editingItem.name}
                                                onChange={e => setEditingItem({...editingItem, name: e.target.value})}
                                                onKeyDown={e => e.key === 'Enter' && handleUpdate()}
                                                style={{
                                                    flex: 1,
                                                    padding: '4px 8px',
                                                    border: '1px solid var(--primary)',
                                                    borderRadius: 4,
                                                    fontSize: '13px',
                                                    outline: 'none'
                                                }}
                                            />
                                        ) : (
                                            <span style={{ fontWeight: 600, fontSize: '13px' }}>{item.name}</span>
                                        )}
                                    </div>
                                    
                                    <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
                                        {isEditing ? (
                                            <>
                                                <Button size="sm" variant="success" onClick={handleUpdate} disabled={saving} loading={saving} title="Guardar">
                                                    <Check size={14} />
                                                </Button>
                                                <Button size="sm" variant="ghost" onClick={() => setEditingItem(null)} title="Cancelar">
                                                    <X size={14} />
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <Button size="sm" variant="ghost" onClick={() => setEditingItem({ id: item.id, name: item.name })} title="Editar">
                                                    <Edit2 size={14} />
                                                </Button>
                                                <Button size="sm" variant="ghost" style={{ color: 'var(--bad)' }} onClick={() => handleDelete(item.id)} title="Eliminar">
                                                    <Trash2 size={14} />
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </Card>
        </div>
    );
}
