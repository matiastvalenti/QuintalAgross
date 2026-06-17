import React from 'react';
import { 
    Search as SearchIcon, Wallet, FileSpreadsheet, MapPin, Layout, Eye 
} from 'lucide-react';
import t from '../../../components/ui/Table.module.css';
import Badge from '../../../components/ui/Badge';
import { useWindow } from '../../../context/WindowContext';
import TableSkeleton from '../../../components/ui/TableSkeleton';
import EmptyState from '../../../components/ui/EmptyState';

export default function EntitiesTable({ 
    entities, 
    loading, 
    selectedEntity, 
    onSearch, 
    searchQuery,
    onSelect,
    onNew,
    onImport,
    onImportSaldos
}) {
    const { openWindow } = useWindow();
    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'white', borderRadius: 'var(--r-md) var(--r-md) 0 0', overflow: 'hidden' }}>
            {/* Table Header / Toolbar */}
            <div style={{ 
                padding: '8px 16px', 
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'white'
            }}>
                <div style={{ position: 'relative', width: '300px' }}>
                    <SearchIcon 
                        size={15} 
                        style={{ 
                            position: 'absolute', 
                            left: 10, 
                            top: '50%', 
                            transform: 'translateY(-50%)', 
                            color: '#94a3b8' 
                        }} 
                    />
                    <input 
                        type="text"
                        placeholder="Buscar..."
                        value={searchQuery}
                        onChange={(e) => onSearch(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0 10px 0 28px',
                            height: 'var(--input-h)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--r-md)',
                            fontSize: 'var(--text-sm)',
                            outline: 'none',
                            transition: 'all 0.2s ease',
                            background: 'var(--bg-page)',
                        }}
                        onFocus={e => {
                            e.target.style.borderColor = 'var(--primary)';
                            e.target.style.background = 'white';
                            e.target.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.1)';
                        }}
                        onBlur={e => {
                            e.target.style.borderColor = '#e2e8f0';
                            e.target.style.background = '#f8fafc';
                            e.target.style.boxShadow = 'none';
                        }}
                    />
                </div>
                
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                     <div style={{ fontSize: '12px', fontWeight: 500, color: '#64748b', background: '#f1f5f9', padding: '4px 10px', borderRadius: '20px' }}>
                        {entities.length} res
                    </div>
                    <button 
                        onClick={onImportSaldos}
                        title="Carga masiva de saldos históricos"
                        style={{
                            padding: '6px 14px',
                            background: 'var(--primary-light)',
                            border: '1px solid var(--primary)',
                            borderRadius: '8px',
                            color: 'var(--primary)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            transition: 'all 0.2s ease',
                        }}
                    >
                        <Wallet size={16} /> Cargar Saldos
                    </button>
                    <button 
                        onClick={onImport}
                        style={{
                            padding: '6px 14px',
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
                            transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.borderColor = '#cbd5e1';
                            e.currentTarget.style.background = '#f8fafc';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.borderColor = '#e2e8f0';
                            e.currentTarget.style.background = 'white';
                        }}
                    >
                        <FileSpreadsheet size={16} /> Importar Excel
                    </button>
                    <button 
                        onClick={onNew}
                        style={{
                            padding: '6px 14px',
                            background: 'white',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            color: 'var(--primary)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            transition: 'all 0.2s ease',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.borderColor = 'var(--primary)';
                            e.currentTarget.style.background = '#f8fafc';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.borderColor = '#e2e8f0';
                            e.currentTarget.style.background = 'white';
                        }}
                    >
                        <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span> Nuevo
                    </button>
                </div>
            </div>

            {/* Table Body */}
            <div style={{ flex: 1, overflowY: 'auto' }} className={t.container}>
                {loading ? (
                    <TableSkeleton rows={10} cols={4} />
                ) : entities.length === 0 ? (
                    <EmptyState 
                        icon={SearchIcon} 
                        title="Sin resultados" 
                        description={searchQuery ? `No hay entidades que coincidan con "${searchQuery}"` : "No hay entidades cargadas en esta categoría."}
                        actionLabel={!searchQuery ? "Nueva Entidad" : null}
                        onAction={!searchQuery ? onNew : null}
                    />
                ) : (
                    <table className={t.table} style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'white', zIndex: 1, boxShadow: '0 1px 0 #e2e8f0' }}>
                            <tr>
                                <th style={{ paddingLeft: 24, background: '#f8fafc', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Entidad</th>
                                <th style={{ background: '#f8fafc', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Identificación</th>
                                <th style={{ background: '#f8fafc', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Ubicación</th>
                                <th style={{ width: 60, background: '#f8fafc' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {entities.map((e, index) => (
                                <tr 
                                    key={e.id}
                                    className="animate-slide-up"
                                    onClick={() => onSelect(e)}
                                    style={{ 
                                        cursor: 'pointer',
                                        background: selectedEntity?.id === e.id ? 'var(--primary-light)' : 'transparent',
                                        transition: 'all 0.1s ease',
                                        borderBottom: '1px solid #f1f5f9',
                                        animationDelay: `${index * 0.05}s`
                                    }}
                                    onMouseEnter={e => {
                                        if (selectedEntity?.id !== e.currentTarget.id) {
                                            e.currentTarget.style.background = '#f8fafc';
                                        }
                                    }}
                                    onMouseLeave={e => {
                                        if (selectedEntity?.id !== e.currentTarget.id) {
                                            e.currentTarget.style.background = selectedEntity?.id === e.currentTarget.id ? 'var(--primary-light)' : 'transparent';
                                        }
                                    }}
                                    id={e.id}
                                >
                                    <td style={{ padding: '16px 24px' }}>
                                        <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '14px' }}>
                                            {e.name}
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                            {e.type === 'mixed' && <Badge variant="accent">Mixto</Badge>}
                                            {e.type === 'client' && <Badge variant="primary">Cliente</Badge>}
                                            {e.type === 'provider' && <Badge variant="success">Proveedor</Badge>}
                                            {e.type === 'employee' && <Badge variant="info">Empleado</Badge>}
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px 0' }}>
                                        <div style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>
                                            {e.tax_id || 'Sin CUIT'}
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 2 }}>
                                            Interno: <span style={{ fontWeight: 600 }}>{e.code || '---'}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px 0' }}>
                                        {e.city ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '13px', color: '#64748b' }}>
                                                <MapPin size={14} style={{ color: '#94a3b8' }} />
                                                {e.city}, {e.state}
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: '12px', color: '#cbd5e1', fontStyle: 'italic' }}>No definida</span>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'right', paddingRight: 24 }}>
                                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                            <button 
                                                title="Vista 360 / CRM"
                                                onClick={(evt) => {
                                                    evt.stopPropagation();
                                                    openWindow('entity-dashboard', { entityId: e.id, entityName: e.name }, { 
                                                        title: `Vista 360: ${e.name}`, 
                                                        width: 1100, 
                                                        height: 750 
                                                    });
                                                }}
                                                style={{
                                                    width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent',
                                                    color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}
                                                onMouseEnter={el => el.currentTarget.style.color = 'var(--primary)'}
                                                onMouseLeave={el => el.currentTarget.style.color = '#94a3b8'}
                                            >
                                                <Layout size={18} />
                                            </button>
                                            <button 
                                                title="Resumen de Cuenta"
                                                onClick={(evt) => {
                                                    evt.stopPropagation();
                                                    openWindow('statement-page', { entityId: e.id }, { 
                                                        title: `Resumen: ${e.name}`, 
                                                        width: 1200, 
                                                        height: 700 
                                                    });
                                                }}
                                                style={{
                                                    width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent',
                                                    color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}
                                                onMouseEnter={el => el.currentTarget.style.color = 'var(--primary)'}
                                                onMouseLeave={el => el.currentTarget.style.color = '#94a3b8'}
                                            >
                                                <Wallet size={18} />
                                            </button>
                                            <div style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center',
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '8px',
                                                background: selectedEntity?.id === e.id ? 'white' : 'transparent',
                                                boxShadow: selectedEntity?.id === e.id ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                                                color: selectedEntity?.id === e.id ? 'var(--primary)' : '#cbd5e1'
                                            }}>
                                                <Eye size={18} />
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
