import React, { useState } from 'react';
import { 
  ShieldAlert, RefreshCw, ChevronDown, ChevronRight, 
  Home, ChevronLeft, AlertCircle 
} from 'lucide-react';
import Button from '../ui/Button';

export default function DetailedErrorView({ 
    title = 'Ocurrió un error inesperado', 
    message = 'Algo salió mal mientras procesábamos tu solicitud.', 
    cause = 'Error interno del sistema.', 
    status = '500',
    onReset,
    onBack,
    onHome
}) {
    const [showDetails, setShowDetails] = useState(false);

    return (
        <div style={{ 
            padding: '40px 24px', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            minHeight: '100%',
            background: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(8px)',
            borderRadius: '24px',
            textAlign: 'center',
            fontFamily: 'inherit'
        }}>
            <div style={{
                background: '#fff1f2',
                padding: '24px',
                borderRadius: '50%',
                color: '#e11d48',
                marginBottom: '32px',
                boxShadow: '0 10px 30px rgba(225, 29, 72, 0.1)'
            }}>
                <ShieldAlert size={56} />
            </div>

            <div style={{
                display: 'inline-block',
                background: '#fee2e2',
                color: '#b91c1c',
                padding: '4px 16px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: 800,
                marginBottom: '24px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
            }}>
                Error {status}
            </div>
            
            <h1 style={{ 
                fontSize: '32px', 
                fontWeight: 800, 
                marginBottom: '16px', 
                color: '#1e293b' 
            }}>
                {title}
            </h1>
            
            <p style={{ 
                fontSize: '18px', 
                color: '#475569', 
                marginBottom: '40px', 
                lineHeight: '1.6',
                maxWidth: '600px'
            }}>
                {message}
            </p>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '40px' }}>
                {onReset && (
                    <Button variant="primary" onClick={onReset} style={{ padding: '12px 24px', borderRadius: '12px', height: 'auto' }}>
                        <RefreshCw size={20} /> Reintentar
                    </Button>
                )}
                {onHome && (
                    <Button variant="secondary" onClick={onHome} style={{ padding: '12px 24px', borderRadius: '12px', height: 'auto' }}>
                        <Home size={20} /> Ir al Inicio
                    </Button>
                )}
                <Button 
                    variant="outline" 
                    onClick={() => setShowDetails(!showDetails)}
                    style={{ padding: '12px 24px', borderRadius: '12px', height: 'auto', background: 'white' }}
                >
                    {showDetails ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    Detalles Técnicos
                </Button>
            </div>

            {showDetails && (
                <div style={{
                    width: '100%',
                    maxWidth: '800px',
                    textAlign: 'left',
                    background: '#0f172a',
                    padding: '24px',
                    borderRadius: '16px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    marginBottom: '32px'
                }}>
                    <h3 style={{ color: '#94a3b8', fontSize: '13px', textTransform: 'uppercase', margin: '0 0 12px 0', letterSpacing: '0.05em' }}>
                        Trazado del Error:
                    </h3>
                    <pre style={{
                        margin: 0,
                        fontFamily: '"Fira Code", monospace',
                        fontSize: '12px',
                        color: '#cbd5e1',
                        lineHeight: '1.6',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        maxHeight: '300px',
                        overflowY: 'auto'
                    }}>
                        {cause}
                    </pre>
                </div>
            )}

            {onBack && (
                <button 
                    onClick={onBack}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#64748b',
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 16px',
                        transition: 'color 0.2s'
                    }}
                >
                    <ChevronLeft size={16} /> Volver atrás
                </button>
            )}

            <div style={{ marginTop: 'auto', padding: '32px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                Quintal Agross &copy; {new Date().getFullYear()} - Soporte Técnico
            </div>
        </div>
    );
}
