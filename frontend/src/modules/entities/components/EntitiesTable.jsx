import React from 'react';
import { 
    Search as SearchIcon, Wallet, FileSpreadsheet, MapPin, Layout, Edit 
} from 'lucide-react';
import t from '../../../components/ui/Table.module.css';
import Badge from '../../../components/ui/Badge';
import { useWindow } from '../../../context/WindowContext';
import { openResumenCuenta, openEntityDashboard } from '../../../utils/openStandaloneWindow';
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
                <div style={{ position: 'relative', width: '380px' }}>
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
                     <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '4px 10px', borderRadius: '20px' }}>
                        {entities.length} resultados
                    </div>
                    <button 
                        onClick={onImportSaldos}
                        title="Carga masiva de saldos históricos"
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
                            padding: '6px 16px',
                            background: 'linear-gradient(135deg, var(--primary) 0%, #4338ca 100%)',
                            border: 'none',
                            borderRadius: '8px',
                            color: 'white',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            transition: 'all 0.2s ease',
                            boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.25)'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.opacity = '0.9';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.opacity = '1';
                        }}
                    >
                        <span style={{ fontSize: '15px', lineHeight: 1, fontWeight: 700 }}>+</span> Nuevo
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
                                <th style={{ paddingLeft: 16, background: '#f8fafc', color: '#64748b', fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', width: '80px', height: '32px' }}>Código</th>
                                <th style={{ background: '#f8fafc', color: '#64748b', fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', height: '32px' }}>Entidad</th>
                                <th style={{ background: '#f8fafc', color: '#64748b', fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', width: '100px', height: '32px' }}>Tipo</th>
                                <th style={{ background: '#f8fafc', color: '#64748b', fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', width: '130px', height: '32px' }}>CUIT</th>
                                <th style={{ background: '#f8fafc', color: '#64748b', fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', height: '32px' }}>Ubicación</th>
                                <th style={{ width: '120px', background: '#f8fafc', height: '32px' }}></th>
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
                                    onMouseEnter={el => {
                                        if (selectedEntity?.id !== e.id) {
                                            el.currentTarget.style.background = '#f8fafc';
                                        }
                                    }}
                                    onMouseLeave={el => {
                                        if (selectedEntity?.id !== e.id) {
                                            el.currentTarget.style.background = 'transparent';
                                        }
                                    }}
                                    id={e.id}
                                >
                                    <td style={{ padding: '8px 12px', paddingLeft: 16, fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
                                        {e.code || '---'}
                                    </td>
                                    <td style={{ padding: '8px 12px', fontSize: '13px', fontWeight: 600, color: '#1e293b', maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.name}>
                                        {e.name}
                                    </td>
                                    <td style={{ padding: '8px 12px' }}>
                                        {e.type === 'mixed' && <Badge variant="accent">Mixto</Badge>}
                                        {e.type === 'client' && <Badge variant="primary">Cliente</Badge>}
                                        {e.type === 'provider' && <Badge variant="success">Proveedor</Badge>}
                                        {e.type === 'employee' && <Badge variant="info">Empleado</Badge>}
                                    </td>
                                    <td style={{ padding: '8px 12px', fontSize: '12px', color: '#475569', fontWeight: 500 }}>
                                        {e.tax_id || 'Sin CUIT'}
                                    </td>
                                    <td style={{ padding: '8px 12px', fontSize: '12px', color: '#64748b' }}>
                                        {e.city ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                                                <MapPin size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />
                                                <span>{e.city}, {e.state}</span>
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: '11px', color: '#cbd5e1', fontStyle: 'italic' }}>No definida</span>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'right', padding: '4px 16px 4px 4px' }} onClick={evt => evt.stopPropagation()}>
                                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                            <button 
                                                title="Ver detalle / 360"
                                                onClick={() => {
                                                    openEntityDashboard(e.id, { 
                                                        title: `Vista 360: ${e.name}`, 
                                                        width: 1100, 
                                                        height: 750 
                                                    });
                                                }}
                                                style={{
                                                    width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent',
                                                    color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}
                                                onMouseEnter={el => el.currentTarget.style.color = 'var(--primary)'}
                                                onMouseLeave={el => el.currentTarget.style.color = '#94a3b8'}
                                            >
                                                <Layout size={15} />
                                            </button>
                                            <button 
                                                title="Ver resumen / cuenta corriente"
                                                onClick={() => {
                                                    openResumenCuenta(e.id, { 
                                                        title: `Resumen: ${e.name}`, 
                                                        width: 1200, 
                                                        height: 700 
                                                    });
                                                }}
                                                style={{
                                                    width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent',
                                                    color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}
                                                onMouseEnter={el => el.currentTarget.style.color = 'var(--primary)'}
                                                onMouseLeave={el => el.currentTarget.style.color = '#94a3b8'}
                                            >
                                                <Wallet size={15} />
                                            </button>
                                            <button 
                                                title="Editar"
                                                onClick={() => {
                                                    onSelect(e);
                                                }}
                                                style={{
                                                    width: 26, height: 26, borderRadius: 6, border: 'none',
                                                    background: selectedEntity?.id === e.id ? 'white' : 'transparent',
                                                    boxShadow: selectedEntity?.id === e.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                    color: selectedEntity?.id === e.id ? 'var(--primary)' : '#cbd5e1',
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}
                                                onMouseEnter={el => el.currentTarget.style.color = 'var(--primary)'}
                                                onMouseLeave={el => {
                                                    if (selectedEntity?.id !== e.id) {
                                                        el.currentTarget.style.color = '#cbd5e1';
                                                    }
                                                }}
                                            >
                                                <Edit size={15} />
                                            </button>
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
