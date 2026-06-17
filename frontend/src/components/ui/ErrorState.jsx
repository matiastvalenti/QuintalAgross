import React from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import Button from './Button';

const ErrorState = ({ 
    title = "Ocurrió un error", 
    message = "No pudimos cargar la información en este momento.",
    onRetry,
    style
}) => {
    return (
        <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '60px 24px', 
            textAlign: 'center',
            backgroundColor: 'var(--panel-bg)',
            borderRadius: 'var(--r-lg)',
            border: '2px solid var(--error-light)',
            gap: 16,
            ...style
        }}>
            <div style={{ 
                background: 'var(--error-light)', 
                padding: 24, 
                borderRadius: '50%',
                color: 'var(--error)'
            }}>
                <AlertCircle size={48} strokeWidth={1} />
            </div>
            <div style={{ maxWidth: 360 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{message}</p>
            </div>
            {onRetry && (
                <Button variant="secondary" onClick={onRetry} icon={<RefreshCcw size={16} />}>
                    Reintentar conexión
                </Button>
            )}
        </div>
    );
};

export default ErrorState;
