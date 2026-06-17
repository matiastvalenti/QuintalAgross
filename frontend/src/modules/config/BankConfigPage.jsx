import React, { useState, useEffect } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Card from '../../components/ui/Card';
import { Plus, Trash2, Edit2, Check, X, Landmark, Search } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import EmptyState from '../../components/ui/EmptyState';

export default function BankConfigPage() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newName, setNewName] = useState('');
    const [newTaxId, setNewTaxId] = useState('');
    const [editingItem, setEditingItem] = useState(null); // { id, name, tax_id }
    const { showToast } = useToast();

    const endpoint = `/config/banks`;

    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            const data = await api.get(endpoint);
            setItems(data);
        } catch (e) {
            showToast("Error al cargar bancos", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async () => {
        if (!newName.trim()) return;
        try {
            await api.post(endpoint, { 
                name: newName, 
                tax_id: newTaxId,
                active: true 
            });
            showToast("Banco guardado correctamente", "success");
            setNewName('');
            setNewTaxId('');
            fetchItems();
        } catch (e) {
            showToast("Error al guardar banco", "error");
        }
    };

    const handleUpdate = async () => {
        if (!editingItem || !editingItem.name.trim()) return;
        try {
            await api.put(`${endpoint}/${editingItem.id}`, { 
                name: editingItem.name,
                tax_id: editingItem.tax_id
            });
            showToast("Banco actualizado correctamente", "success");
            setEditingItem(null);
            fetchItems();
        } catch (e) {
            showToast("Error al actualizar banco", "error");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿Está seguro de eliminar este banco?")) return;
        try {
            await api.delete(`${endpoint}/${id}`);
            showToast("Banco eliminado correctamente", "success");
            fetchItems();
        } catch (e) {
            showToast("Error al eliminar banco", "error");
        }
    };

    return (
        <div style={{ padding: 20 }}>
            <ContentHeader title="Configuración de Bancos" />
            
            <Card style={{ marginTop: 20, maxWidth: 800 }}>
                {/* Form Alta */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, marginBottom: 24, alignItems: 'flex-end' }}>
                    <div>
                        <Input 
                            label="Nombre del Banco"
                            placeholder="Ej: Banco Nación"
                            value={newName}
                            onChange={e => setNewName(e.target.value.toUpperCase())}
                        />
                    </div>
                    <div>
                        <Input 
                            label="CUIT del Banco"
                            placeholder="30-XXXXXXXX-X"
                            value={newTaxId}
                            onChange={e => setNewTaxId(e.target.value)}
                        />
                    </div>
                    <div>
                        <Button onClick={handleAdd} disabled={!newName}>
                            <Plus size={16} /> Agregar
                        </Button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {loading ? (
                        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando bancos...</div>
                    ) : items.length === 0 ? (
                        <EmptyState 
                            icon={Landmark}
                            title="Sin Bancos"
                            description="No hay bancos configurados aún."
                        />
                    ) : (
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead style={{ background: 'var(--bg-page)', borderBottom: '1px solid var(--border-color)' }}>
                                    <tr>
                                        <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600 }}>Nombre</th>
                                        <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600 }}>CUIT</th>
                                        <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 600 }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(item => {
                                        const isEditing = editingItem?.id === item.id;
                                        
                                        return (
                                            <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)', background: isEditing ? 'var(--primary-light)' : 'transparent' }}>
                                                <td style={{ padding: '8px 16px' }}>
                                                    {isEditing ? (
                                                        <input 
                                                            autoFocus
                                                            className="cell-input"
                                                            value={editingItem.name}
                                                            onChange={e => setEditingItem({...editingItem, name: e.target.value.toUpperCase()})}
                                                            style={{ width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--primary)' }}
                                                        />
                                                    ) : (
                                                        <span style={{ fontWeight: 600 }}>{item.name}</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '8px 16px' }}>
                                                    {isEditing ? (
                                                        <input 
                                                            className="cell-input"
                                                            value={editingItem.tax_id || ''}
                                                            onChange={e => setEditingItem({...editingItem, tax_id: e.target.value})}
                                                            style={{ width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--primary)' }}
                                                        />
                                                    ) : (
                                                        <span style={{ color: 'var(--text-secondary)' }}>{item.tax_id || '-'}</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
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
                                                                <Button size="sm" variant="ghost" onClick={() => setEditingItem({ id: item.id, name: item.name, tax_id: item.tax_id })} title="Editar">
                                                                    <Edit2 size={14} />
                                                                </Button>
                                                                <Button size="sm" variant="ghost" style={{ color: 'var(--bad)' }} onClick={() => handleDelete(item.id)} title="Eliminar">
                                                                    <Trash2 size={14} />
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}
