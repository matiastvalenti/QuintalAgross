import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder, Tag, Plus, Trash2, Edit2, X, Check, Search, RefreshCw } from 'lucide-react';
import Modal from '../../../../components/ui/Modal';
import Button from '../../../../components/ui/Button';
import Input from '../../../../components/ui/Input';
import s from './RubrosTree.module.css';

import api from '../../../../services/api';

export default function RubrosTree({ onSelect, selectedId }) {
    const [categories, setCategories] = useState([]);
    const [expanded, setExpanded] = useState({});
    const [subcategories, setSubcategories] = useState({});
    const [loading, setLoading] = useState(false);
    const [isCreatingInline, setIsCreatingInline] = useState(false);
    const [inlineName, setInlineName] = useState('');
    const [isCreatingSubInline, setIsCreatingSubInline] = useState(null);
    const [inlineSubName, setInlineSubName] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');

    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        setLoading(true);
        try {
            const data = await api.get('/inventory/rubros', { params: { active_only: false } });
            setCategories(data);
        } catch (err) {
            console.error("Error fetching categories:", err);
        } finally {
            setLoading(false);
        }
    };

    const toggleData = async (catId, forceOpen = false) => {
        const isExpanded = !!expanded[catId];
        if (isExpanded && !forceOpen) {
            setExpanded(prev => ({ ...prev, [catId]: false }));
            return;
        }

        if (!subcategories[catId]) {
            try {
                const data = await api.get(`/inventory/rubros/${catId}/subcategories`, { params: { active_only: false } });
                setSubcategories(prev => ({ ...prev, [catId]: data }));
            } catch (err) {
                console.error("Error fetching subcategories:", err);
            }
        }
        setExpanded({ [catId]: true });
    };

    const handleCreate = async () => {
        const name = isCreatingSubInline ? inlineSubName : inlineName;
        if (!name.trim()) return;
        
        try {
            const createType = isCreatingSubInline ? 'subcategory' : 'category';
            const parentId = isCreatingSubInline;

            if (createType === 'category') {
                await api.post('/inventory/rubros', { name: name, active: true });
                fetchCategories();
                setIsCreatingInline(false);
                setInlineName('');
            } else if (createType === 'subcategory') {
                await api.post(`/inventory/rubros/${parentId}/subcategories`, { name: name, active: true });
                const data = await api.get(`/inventory/rubros/${parentId}/subcategories`, { params: { active_only: false } });
                setSubcategories(prev => ({ ...prev, [parentId]: data }));
                setExpanded(prev => ({ ...prev, [parentId]: true }));
                setIsCreatingSubInline(null);
                setInlineSubName('');
            }
        } catch(err) {
            console.error(err);
        }
    };

    const handleUpdate = async (id, type, parentId = null) => {
        if (!editName.trim()) return;
        try {
            const url = type === 'category' ? `/inventory/rubros/${id}` : `/inventory/rubros/subcategories/${id}`;
            await api.patch(url, { name: editName, active: true });

            if (type === 'category') fetchCategories();
            else {
                const data = await api.get(`/inventory/rubros/${parentId}/subcategories`, { params: { active_only: false } });
                setSubcategories(prev => ({ ...prev, [parentId]: data }));
            }
            setEditingId(null);
        } catch (err) {
            console.error(err);
        }
    };

    const handleDelete = async (id, type, parentId = null) => {
        if (!window.confirm(`¿Seguro que quieres eliminar este ${type === 'category' ? 'rubro' : 'subrubro'}?`)) return;
        try {
            const url = type === 'category' ? `/inventory/rubros/${id}` : `/inventory/rubros/subcategories/${id}`;
            await api.delete(url);

            if (type === 'category') {
                fetchCategories();
                if (selectedId === id) onSelect(null);
            } else {
                const data = await api.get(`/inventory/rubros/${parentId}/subcategories`, { params: { active_only: false } });
                setSubcategories(prev => ({ ...prev, [parentId]: data }));
                if (selectedId === id) onSelect(null);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleSelect = (item, type, parentId = null) => {
        if (type === 'category') toggleData(item.id, true);
        if (onSelect) onSelect({ ...item, type, parentId });
    };

    return (
        <div className={s.container}>
            <div className={s.header}>
                <span className={s.headerTitle}>Productos</span>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button 
                        className={s.actionBtn}
                        title="Nuevo Rubro" 
                        onClick={() => {
                            setIsCreatingSubInline(null);
                            setIsCreatingInline(!isCreatingInline);
                            setInlineName('');
                        }}
                    >
                        {isCreatingInline ? <X size={15} /> : <Plus size={15} />}
                    </button>
                    <button className={s.actionBtn} title="Recargar" onClick={fetchCategories}>
                        <RefreshCw size={15} />
                    </button>
                </div>
            </div>
            
            <div className={s.treeContent}>
                {isCreatingInline && (
                    <div className={s.inlineForm}>
                        <div style={{ position: 'relative' }}>
                            <input 
                                autoFocus
                                value={inlineName}
                                onChange={e => setInlineName(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleCreate();
                                    if (e.key === 'Escape') setIsCreatingInline(false);
                                }}
                                placeholder="Nombre..."
                                className={s.inlineInput}
                            />
                            <Check size={16} style={{ position: 'absolute', right: 8, top: 4, cursor: 'pointer', color: '#10b981' }} onClick={handleCreate} />
                        </div>
                    </div>
                )}

                {loading && categories.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>Buscando categorías...</div>}
                
                {categories.map(cat => {
                    const isOpen = expanded[cat.id];
                    const subs = subcategories[cat.id] || [];
                    const isSelected = selectedId === cat.id;

                    return (
                        <div key={cat.id} className={s.category}>
                            <div 
                                className={`${s.categoryItem} ${isSelected ? s.selected : ''}`}
                                onClick={() => handleSelect(cat, 'category')}
                            >
                                <div 
                                    className={s.chevron}
                                    onClick={(e) => { e.stopPropagation(); toggleData(cat.id); }}
                                >
                                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </div>
                                <div className={s.icon}>
                                    <Folder size={18} fill={isOpen ? "#3b82f6" : "none"} color={isOpen ? "#3b82f6" : "#64748b"} />
                                </div>
                                
                                {editingId === cat.id ? (
                                    <input 
                                        autoFocus
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') handleUpdate(cat.id, 'category');
                                            if (e.key === 'Escape') setEditingId(null);
                                        }}
                                        onClick={e => e.stopPropagation()}
                                        className={s.inlineInput}
                                        style={{ height: 28, padding: '0 8px' }}
                                    />
                                ) : (
                                    <span className={s.label}>{cat.name}</span>
                                )}
                                
                                <div className={s.actions}>
                                    {editingId === cat.id ? (
                                        <button onClick={(e) => { e.stopPropagation(); handleUpdate(cat.id, 'category'); }} className={s.actionBtn} style={{color: '#10b981'}}>
                                            <Check size={14} />
                                        </button>
                                    ) : (
                                        <>
                                            <button 
                                                onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    setIsCreatingSubInline(cat.id); 
                                                    setInlineSubName('');
                                                    setExpanded(prev => ({ ...prev, [cat.id]: true }));
                                                }} 
                                                className={`${s.actionBtn} s.add`} 
                                                title="Agregar Subrubro"
                                            >
                                                <Plus size={14} />
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); setEditingId(cat.id); setEditName(cat.name); }} className={s.actionBtn}>
                                                <Edit2 size={13} />
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDelete(cat.id, 'category'); }} className={`${s.actionBtn} s.delete`}>
                                                <Trash2 size={13} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {isOpen && (
                                <div className={s.subcategories}>
                                    {isCreatingSubInline === cat.id && (
                                        <div style={{ padding: '4px 8px', position: 'relative' }}>
                                            <input 
                                                autoFocus
                                                value={inlineSubName}
                                                onChange={e => setInlineSubName(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') handleCreate();
                                                    if (e.key === 'Escape') setIsCreatingSubInline(null);
                                                }}
                                                placeholder="Subrubro..."
                                                className={s.inlineInput}
                                                style={{ height: 26, fontSize: 11 }}
                                            />
                                            <Check size={14} style={{ position: 'absolute', right: 16, top: 10, cursor: 'pointer', color: '#10b981' }} onClick={handleCreate} />
                                        </div>
                                    )}
                                    {subs.map(sub => {
                                        const isSubSelected = selectedId === sub.id;
                                        return (
                                            <div 
                                                key={sub.id} 
                                                className={`${s.subcategoryItem} ${isSubSelected ? s.selected : ''}`}
                                                onClick={() => handleSelect(sub, 'subcategory', cat.id)}
                                            >
                                                <Tag size={12} style={{ opacity: isSubSelected ? 1 : 0.4 }} />
                                                
                                                {editingId === sub.id ? (
                                                    <input 
                                                        autoFocus
                                                        value={editName}
                                                        onChange={e => setEditName(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') handleUpdate(sub.id, 'subcategory', cat.id);
                                                            if (e.key === 'Escape') setEditingId(null);
                                                        }}
                                                        onClick={e => e.stopPropagation()}
                                                        className={s.inlineInput}
                                                        style={{ height: 24, fontSize: 11, padding: '0 4px' }}
                                                    />
                                                ) : (
                                                    <span style={{ flex: 1 }}>{sub.name}</span>
                                                )}

                                                <div className={s.actions}>
                                                    <button onClick={(e) => { e.stopPropagation(); setEditingId(sub.id); setEditName(sub.name); }} className={s.actionBtn}>
                                                        <Edit2 size={11} />
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(sub.id, 'subcategory', cat.id); }} className={`${s.actionBtn} s.delete`}>
                                                        <Trash2 size={11} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
