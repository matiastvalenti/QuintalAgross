import React from 'react';
import { Package, SearchX } from 'lucide-react';
import Button from './Button';

const EmptyState = ({ 
    icon: Icon = Package, 
    title = "Sin información", 
    description = "No se encontraron registros en esta vista.",
    actionLabel,
    onAction,
    style
}) => {
    return (
        <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '80px 24px', 
            textAlign: 'center',
            backgroundColor: 'var(--panel-bg)',
            borderRadius: 'var(--r-lg)',
            border: '2px border-dashed var(--border-light)',
            gap: 16,
            ...style
        }}>
            <div style={{ 
                background: 'var(--panel-2)', 
                padding: 24, 
                borderRadius: '50%',
                color: 'var(--text-tertiary)'
            }}>
                <Icon size={48} strokeWidth={1} />
            </div>
            <div style={{ maxWidth: 320 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{description}</p>
            </div>
            {actionLabel && onAction && (
                <Button variant="primary" onClick={onAction} style={{ marginTop: 8 }}>
                    {actionLabel}
                </Button>
            )}
        </div>
    );
};

export default EmptyState;
