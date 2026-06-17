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

export default function SimpleConfigPage({ type = 'campaigns', title = 'Campañas' }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const [editingItem, setEditingItem] = useState(null); // { id, name }
    const { showToast } = useToast();

    const endpoint = `/config/${type}`;

    useEffect(() => {
        fetchItems(items.length === 0); // Only loud load if we have nothing
        setEditingItem(null);
        setNewItemName('');
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
        if (!newItemName.trim()) return;
        try {
            await api.post(endpoint, { name: newItemName, active: true });
            showToast("Guardado correctamente", "success");
            setNewItemName('');
            fetchItems();
        } catch (e) {
            showToast("Error al guardar", "error");
        }
    };

    const handleUpdate = async () => {
        if (!editingItem || !editingItem.name.trim()) return;
        try {
            await api.put(`${endpoint}/${editingItem.id}`, { name: editingItem.name });
            showToast("Actualizado correctamente", "success");
            setEditingItem(null);
            fetchItems();
        } catch (e) {
            console.error(e);
            showToast("Error al actualizar", "error");
        }
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

    // if (loading) return <div style={{ padding: 20 }}>Cargando...</div>;

    const labelStr = title.endsWith('s') ? title.slice(0, -1) : title;

    return (
        <div style={{ padding: 20 }}>
            <ContentHeader title={title} />
            
            <Card style={{ marginTop: 20, maxWidth: 600 }}>
                {/* Form Alta */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                        <Input 
                            label={`Nueva ${labelStr}`}
                            placeholder={`Ej: ${labelStr} 2025`}
                            value={newItemName}
                            onChange={e => setNewItemName(e.target.value)}
                        />
                    </div>
                    <div>
                        <Button size="sm" onClick={handleAdd} disabled={!newItemName}>
                            <Plus size={14} /> Agregar
                        </Button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {[1,2,3].map(i => (
                                <div key={i} style={{ height: 48, background: 'var(--panel-2)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
                            ))}
                        </div>
                    ) : items.length === 0 ? (
                        <EmptyState 
                            icon={type === 'campaigns' ? Tag : (type === 'banks' ? Landmark : Briefcase)}
                            title={`Sin ${title}`}
                            description={`No hay ${title.toLowerCase()} configuradas aún.`}
                        />
                    ) : (
                        items.map(item => {
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
                                                <Button size="sm" variant="success" onClick={handleUpdate} title="Guardar">
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
