import React, { useEffect, useMemo } from 'react';
import { AuthProvider, useAuth } from '../../context/AuthContext';
import { WindowProvider } from '../../context/WindowContext';
import SalesOrderForm from './SalesOrderForm';
import LoadingScreen from '../../components/ui/LoadingScreen';

const StandaloneProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) return <LoadingScreen message="Iniciando documento..." />;
  
  if (!user) {
    return (
      <div style={{ padding: 40, fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
        <h2>Acceso Denegado</h2>
        <p>No se pudo cargar Nueva Orden de Venta. Sesión expirada o inválida.</p>
      </div>
    );
  }
  
  return <>{children}</>;
};

export default function SalesOrderStandalonePage() {
  const draftId = new URLSearchParams(window.location.search).get('draft_id');
  const initialData = useMemo(() => {
    if (!draftId) return null;
    try {
      const value = localStorage.getItem('sales_order_draft_' + draftId);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }, [draftId]);

  return (
    <div style={{ height: '100vh', width: '100vw', background: 'var(--bg-app)', display: 'flex', overflow: 'hidden', boxSizing: 'border-box' }}>
      <StandaloneProtectedRoute>
        <SalesOrderForm mode="new" isStandalone={true} initialData={initialData} />
      </StandaloneProtectedRoute>
    </div>
  );
}
