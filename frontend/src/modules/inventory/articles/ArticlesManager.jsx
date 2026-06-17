import React, { useState, useEffect, useMemo } from 'react';
import RubrosTree from './components/RubrosTree';
import ArticlesTable from './components/ArticlesTable';
import ArticleEditor from './components/ArticleEditor';
import ImportModal from './components/ImportModal';
import Button from '../../../components/ui/Button';
import { 
    Plus, Search, Upload, Filter, FilterX, Package, TrendingUp, AlertTriangle, 
    Layers, Activity, ChevronRight, X, RefreshCcw 
} from 'lucide-react';
import s from './ArticlesManager.module.css';

import api from '../../../services/api';

export default function ArticlesManager() {
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [selectedSubCategory, setSelectedSubCategory] = useState(null);
    const [articles, setArticles] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [sortBy, setSortBy] = useState('name');
    const [sortDir, setSortDir] = useState('asc');
    const [selectedArticle, setSelectedArticle] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingArticle, setEditingArticle] = useState(null);
    const [editorTab, setEditorTab] = useState('general');
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    useEffect(() => {
        api.get('/inventory/warehouses')
            .then(data => setWarehouses(Array.isArray(data) ? data : []))
            .catch(err => console.error(err));
    }, []);

    useEffect(() => {
        fetchArticles();
    }, [selectedCategory, selectedSubCategory, searchQuery, selectedWarehouse, sortBy, sortDir]);

    const fetchArticles = async () => {
        setLoading(true);
        const params = {};
        if (selectedSubCategory) params.subcategory_id = selectedSubCategory.id;
        else if (selectedCategory) params.category_id = selectedCategory.id;
        if (searchQuery) params.q = searchQuery;
        if (selectedWarehouse) params.warehouse_id = selectedWarehouse;
        params.sort_by = sortBy;
        params.sort_dir = sortDir;

        try {
            const data = await api.get('/inventory/products', { params });
            setArticles(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const stats = useMemo(() => {
        const total = articles.length;
        const lowStock = articles.filter(a => a.total_stock > 0 && a.total_stock <= (a.min_stock || 0)).length;
        const outOfStock = articles.filter(a => a.total_stock <= 0).length;
        const active = articles.filter(a => a.active).length;
        return { total, lowStock, outOfStock, active };
    }, [articles]);

    const handleTreeSelect = (item) => {
        if (item.type === 'category') {
            setSelectedCategory(item);
            setSelectedSubCategory(null);
        } else if (item.type === 'subcategory') {
            setSelectedSubCategory(item);
        }
        setIsEditing(false);
        setSelectedArticle(null);
    };

    const handleArticleAction = (article, tab) => {
        setSelectedArticle(article);
        setEditingArticle(article);
        setEditorTab(tab);
        setIsEditing(true);
    };

    const handleAdd = () => {
        setSelectedArticle(null);
        setEditingArticle(null);
        setEditorTab('general');
        setIsEditing(true);
    };

    const handleClearFilters = () => {
        setSearchQuery("");
        setSelectedWarehouse("");
        setSelectedCategory(null);
        setSelectedSubCategory(null);
        setSortBy('name');
        setSortDir('asc');
    };

    const handleSave = (savedArticle) => {
        fetchArticles();
        setIsEditing(false);
        setSelectedArticle(savedArticle);
    };

    return (
        <div className={s.pageLayout}>
            <div className={s.mainContent}>
                
                {/* SIDEBAR: Rubros */}
                <div className={s.sidebarPanel}>
                    <RubrosTree 
                        onSelect={handleTreeSelect} 
                        selectedId={selectedSubCategory?.id || selectedCategory?.id} 
                    />
                </div>

                {/* MAIN TABLE & DASHBOARD */}
                <div className={s.tablePanel}>
                    
                    {/* DASHBOARD */}
                    <div className={s.dashboard}>
                        <div className={`${s.bentoCard} ${s.cardPrimary}`}>
                            <div className={s.bentoHeader}><Package size={14} color="#3b82f6" /> <span>Catálogo</span></div>
                            <div className={s.bentoValue}>{stats.total}</div>
                            <div className={s.bentoSubtext}>Productos registrados</div>
                        </div>
                        <div className={`${s.bentoCard} ${s.cardWarning}`}>
                            <div className={s.bentoHeader}><AlertTriangle size={14} color="#f59e0b" /> <span>Stock Bajo</span></div>
                            <div className={s.bentoValue}>{stats.lowStock}</div>
                            <div className={s.bentoSubtext}>Requieren reposición</div>
                        </div>
                        <div className={`${s.bentoCard} ${s.cardDanger}`}>
                            <div className={s.bentoHeader}><Activity size={14} color="#ef4444" /> <span>Sin Stock</span></div>
                            <div className={s.bentoValue}>{stats.outOfStock}</div>
                            <div className={s.bentoSubtext}>Quiebre de inventario</div>
                        </div>
                        <div className={`${s.bentoCard} ${s.cardSuccess}`}>
                            <div className={s.bentoHeader}><TrendingUp size={14} color="#10b981" /> <span>Activos</span></div>
                            <div className={s.bentoValue}>{stats.active}</div>
                            <div className={s.bentoSubtext}>Artículos en venta</div>
                        </div>
                    </div>

                    {/* TOOLBAR */}
                    <div className={s.toolbar}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
                            <div className={s.searchWrap}>
                                <Search className={s.searchIcon} size={18} />
                                <input 
                                    type="text" 
                                    className={s.searchInput}
                                    placeholder="Buscar por nombre o código..." 
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                                {searchQuery && (
                                    <button 
                                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                                        onClick={() => setSearchQuery("")}
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            <select 
                                value={selectedWarehouse}
                                onChange={e => setSelectedWarehouse(e.target.value)}
                                style={{
                                    padding: '0.625rem 1rem',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '0.75rem',
                                    fontSize: '0.875rem',
                                    background: '#f8fafc',
                                    outline: 'none',
                                    cursor: 'pointer',
                                    minWidth: 180
                                }}
                            >
                                <option value="">Todos los Depósitos</option>
                                {warehouses.map(wh => (
                                    <option key={wh.id} value={wh.id}>{wh.name}</option>
                                ))}
                            </select>

                            {selectedSubCategory && (
                                <div style={{ 
                                    background: '#eff6ff', 
                                    color: '#2563eb', 
                                    padding: '0.5rem 1rem', 
                                    borderRadius: '2rem', 
                                    fontSize: '0.75rem', 
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    border: '1px solid rgba(37, 99, 235, 0.1)'
                                }}>
                                    <Layers size={14} />
                                    {selectedSubCategory.name}
                                    <X size={14} style={{ cursor: 'pointer', marginLeft: 4 }} onClick={() => setSelectedSubCategory(null)} />
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                            <Button variant="secondary" size="sm" onClick={handleClearFilters} title="Limpiar Filtros">
                                <FilterX size={16} />
                            </Button>
                            <Button variant="secondary" size="sm" onClick={fetchArticles} title="Refrescar">
                                <RefreshCcw size={16} />
                            </Button>
                            <Button variant="secondary" onClick={() => setIsImportModalOpen(true)} style={{ gap: 8 }}>
                                <Upload size={16} /> Importar
                            </Button>
                            <Button onClick={handleAdd} style={{ gap: 8, background: 'var(--primary)', color: 'white' }}>
                                <Plus size={18} /> Nuevo Artículo
                            </Button>
                        </div>
                    </div>

                    <div className={s.tableWrap}>
                        <ArticlesTable 
                            articles={articles} 
                            loading={loading}
                            selectedId={selectedArticle?.id} 
                            onSelect={(art) => handleArticleAction(art, 'movimientos')} 
                            onEdit={(art) => handleArticleAction(art, 'general')}
                        />
                    </div>
                </div>

                {isEditing && (
                    <div className={s.editorContainer}>
                        <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
                            <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                                <X size={20} />
                            </Button>
                        </div>
                        <ArticleEditor 
                            article={editingArticle} 
                            onSave={handleSave} 
                            onCancel={() => setIsEditing(false)}
                            currentSubcategoryId={selectedSubCategory?.id}
                            initialTab={editorTab}
                        />
                    </div>
                )}
            </div>

            <ImportModal 
                open={isImportModalOpen} 
                onClose={() => setIsImportModalOpen(false)} 
                onImportSuccess={fetchArticles}
            />
        </div>
    );
}
