import React from 'react';
import { Users, Truck, UserCheck, ChevronRight } from 'lucide-react';

const ENTITY_TYPES = [
    { id: 'client', label: 'Clientes', icon: Users, color: 'var(--primary)' },
    { id: 'provider', label: 'Proveedores', icon: Truck, color: 'var(--success)' },
    { id: 'mixed', label: 'Mixtos', icon: UserCheck, color: 'var(--warning)' },
    { id: 'employee', label: 'Empleados', icon: UserCheck, color: '#ec4899' },
];

export default function EntityTree({ onSelect, selectedId }) {
    return (
        <div style={{ padding: '12px 8px' }}>
            <h4 style={{ 
                fontSize: '10px', 
                fontWeight: 700,
                textTransform: 'uppercase', 
                color: '#94a3b8', 
                margin: '0 0 10px 10px', 
                letterSpacing: '0.1em' 
            }}>
                Categorías
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                                gap: 10,
                                padding: '6px 12px',
                                borderRadius: '8px',
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
                            <Icon size={16} style={{ color: isActive ? 'var(--primary)' : '#94a3b8' }} />
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '13px', fontWeight: isActive ? 600 : 500 }}>
                                    {type.label}
                                </span>
                                {type.id === 'mixed' && (
                                    <span style={{ fontSize: '9px', color: '#94a3b8', marginTop: -2 }}>
                                        Cliente y proveedor
                                    </span>
                                )}
                            </div>
                            <ChevronRight 
                                size={12} 
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
                marginTop: 20, 
                padding: '10px', 
                borderRadius: '8px', 
                background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', 
                border: '1px solid #e2e8f0', 
                fontSize: '11px', 
                color: '#64748b', 
                lineHeight: 1.5,
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}>
                <div style={{ fontWeight: 700, color: '#475569', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Users size={12} /> Tip del día
                </div>
                <p style={{ margin: 0 }}>
                    Las entidades mixtas se sincronizan en compras y ventas.
                </p>
            </div>
        </div>
    );
}
