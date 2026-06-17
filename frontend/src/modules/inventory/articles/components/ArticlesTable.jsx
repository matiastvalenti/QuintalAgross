import React from 'react';
import Badge from '../../../../components/ui/Badge';
import { Edit2, Eye, Box, AlertTriangle, CheckCircle, Package, Activity, SearchX } from 'lucide-react';
import Skeleton from '../../../../components/ui/Skeleton';
import TableSkeleton from '../../../../components/ui/TableSkeleton';
import EmptyState from '../../../../components/ui/EmptyState';
import s from './ArticlesTable.module.css';

export default function ArticlesTable({ articles, loading, selectedId, onSelect, onEdit }) {
    if (loading && articles.length === 0) {
        return <TableSkeleton rows={10} cols={8} />;
    }

    return (
        <div className={s.tableContainer}>
            <table className={s.table}>
                <thead className={s.thead}>
                    <tr>
                        <th className={s.th} style={{ width: 80 }}>SKU</th>
                        <th className={s.th}>Producto</th>
                        <th className={s.th} style={{ width: 140 }}>Rubro / Sub</th>
                        <th className={s.th} style={{ width: 75, textAlign: 'right' }}>Ent.</th>
                        <th className={s.th} style={{ width: 75, textAlign: 'right' }}>Sal.</th>
                        <th className={s.th} style={{ width: 120, textAlign: 'right' }}>Stock Total</th>
                        <th className={s.th} style={{ width: 90, textAlign: 'center' }}>Estado</th>
                        <th className={s.th} style={{ width: 80, textAlign: 'center' }}>Acciones</th>
                    </tr>
                </thead>
                <tbody style={{ position: 'relative' }}>
                    {loading && (
                        <div className={s.loadingOverlay}>
                             <div className="spinner" />
                        </div>
                    )}
                    {articles.map((art, index) => {
                        const isSelected = selectedId === art.id;
                        const isLow = art.total_stock > 0 && art.total_stock <= (art.min_stock || 0);
                        const isOut = art.total_stock <= 0;
                        
                        return (
                            <tr 
                                key={art.id} 
                                onClick={() => onSelect(art)}
                                className={`${s.row} ${isSelected ? s.selected : ''}`}
                                style={{ animationDelay: `${index * 0.03}s` }}
                            >
                                <td className={s.td}>
                                    <span className={s.sku} style={{ whiteSpace: 'nowrap' }}>{art.sku || 'S/N'}</span>
                                </td>
                                <td className={s.td}>
                                    <div className={s.name}>{art.name}</div>
                                    {art.article_type && <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{art.article_type}</div>}
                                </td>
                                <td className={s.td}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{art.category?.name}</div>
                                    <div className={s.subcategory}>{art.subcategory?.name || '-'}</div>
                                </td>
                                <td className={s.td} style={{ textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                                    {art.in_qty || 0}
                                </td>
                                <td className={s.td} style={{ textAlign: 'right', fontWeight: 600, color: '#ef4444' }}>
                                    {art.out_qty || 0}
                                </td>
                                <td className={s.td}>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <div className={`${s.stockBadge} ${isOut ? s.stockOut : isLow ? s.stockLow : s.stockOk}`}>
                                            <span style={{ fontWeight: 800 }}>{art.total_stock || 0}</span>
                                        </div>
                                    </div>
                                </td>
                                <td className={s.td} style={{ textAlign: 'center' }}>
                                    <span className={art.active ? 'badge-success' : 'badge-danger'} style={{ fontSize: '0.6rem' }}>
                                        {art.active ? 'ACTIVO' : 'INACTIVO'}
                                    </span>
                                </td>
                                <td className={s.td}>
                                    <div className={s.actions} style={{ opacity: 1 }}>
                                        <button className={s.actionBtn} onClick={(e) => { e.stopPropagation(); onEdit(art); }} title="Editar">
                                            <Edit2 size={14} />
                                        </button>
                                        <button className={s.actionBtn} onClick={(e) => { e.stopPropagation(); onSelect(art, 'movimientos'); }} title="Historial">
                                            <Activity size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                    {articles.length === 0 && !loading && (
                        <tr>
                            <td colSpan={8}>
                                <EmptyState 
                                    icon={SearchX} 
                                    title="Catálogo vacío" 
                                    description="No hay artículos para mostrar con los filtros seleccionados." 
                                />
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            <style>{`
                .spinner {
                    width: 32px;
                    height: 32px;
                    border: 3px solid #e2e8f0;
                    border-top-color: #3b82f6;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
