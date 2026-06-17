import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DetailedErrorView from '../../components/common/DetailedErrorView';

export default function ErrorPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const query = new URLSearchParams(location.search);
    
    // Try to get detailed error from sessionStorage first (avoids URL length limits)
    const storedError = JSON.parse(sessionStorage.getItem('errorDetails') || '{}');
    
    const errorTitle = storedError.title || query.get('title') || 'Ocurrió un error inesperado';
    const errorMessage = storedError.message || query.get('message') || 'Algo salió mal mientras procesábamos tu solicitud.';
    const errorCause = storedError.cause || query.get('cause') || 'Error interno del servidor o de conexión.';
    const statusCode = storedError.status || query.get('status') || '500';

    // Cleanup session storage to not show the same error if navigating back later
    React.useEffect(() => {
        return () => sessionStorage.removeItem('errorDetails');
    }, []);

    return (
        <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <div style={{ maxWidth: '900px', width: '100%', background: 'white', borderRadius: '32px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.1)', overflow: 'hidden' }}>
                <DetailedErrorView 
                    title={errorTitle}
                    message={errorMessage}
                    cause={errorCause}
                    status={statusCode}
                    onReset={() => window.location.reload()}
                    onBack={() => navigate(-1)}
                    onHome={() => navigate('/')}
                />
            </div>
        </div>
    );
}
