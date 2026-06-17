import React from 'react';
import { Users, Truck, UserCheck, ChevronRight } from 'lucide-react';

const ENTITY_TYPES = [
    { id: 'client', label: 'Clientes', icon: Users, color: 'var(--primary)' },
    { id: 'provider', label: 'Proveedores', icon: Truck, color: 'var(--success)' },
    { id: 'employee', label: 'Empleados', icon: UserCheck, color: '#ec4899' },
    { id: 'mixed', label: 'Mixtos / Cta Comp', icon: UserCheck, color: 'var(--warning)' },
];

export default function EntityTree({ onSelect, selectedId }) {
    return (
        <div style={{ padding: '24px 12px' }}>
            <h4 style={{ 
                fontSize: '11px', 
                fontWeight: 700,
                textTransform: 'uppercase', 
                color: '#94a3b8', 
                margin: '0 0 16px 16px', 
                letterSpacing: '0.1em' 
            }}>
                Categorías
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {ENTITY_TYPES.map(type => {
                    const Icon = type.icon;
                    const isActive = selectedId === type.id;
                    
                    return (
                        <button
                            key={type.id}
                            onClick={() => onSelect(type.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '10px 16px',
                                borderRadius: '10px',
                                background: isActive ? 'var(--primary-light)' : 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                width: '100%',
                                textAlign: 'left',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                color: isActive ? 'var(--primary-dark)' : '#64748b',
                                position: 'relative'
                            }}
                            onMouseEnter={e => {
                                if (!isActive) e.currentTarget.style.background = '#f1f5f9';
                            }}
                            onMouseLeave={e => {
                                if (!isActive) e.currentTarget.style.background = 'transparent';
                            }}
                        >
                            {isActive && (
                                <div style={{ 
                                    position: 'absolute', 
                                    left: 0, 
                                    top: '20%', 
                                    bottom: '20%', 
                                    width: '3px', 
                                    background: 'var(--primary)', 
                                    borderRadius: '0 4px 4px 0' 
                                }} />
                            )}
                            <Icon size={18} style={{ color: isActive ? 'var(--primary)' : '#94a3b8' }} />
                            <span style={{ flex: 1, fontSize: '14px', fontWeight: isActive ? 600 : 500 }}>
                                {type.label}
                            </span>
                            <ChevronRight 
                                size={14} 
                                style={{ 
                                    opacity: isActive ? 1 : 0, 
                                    transform: isActive ? 'translateX(0)' : 'translateX(-4px)',
                                    transition: 'all 0.2s'
                                }} 
                            />
                        </button>
                    );
                })}
            </div>
            
            <div style={{ 
                marginTop: 32, 
                padding: '16px', 
                borderRadius: '12px', 
                background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', 
                border: '1px solid #e2e8f0', 
                fontSize: '12px', 
                color: '#64748b', 
                lineHeight: 1.6,
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}>
                <div style={{ fontWeight: 700, color: '#475569', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Users size={14} /> Tip del día
                </div>
                <p style={{ margin: 0 }}>
                    Las entidades mixtas se sincronizan automáticamente entre las listas de compras y ventas.
                </p>
            </div>
        </div>
    );
}
