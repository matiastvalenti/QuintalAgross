import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import DeliveryNoteForm from './DeliveryNoteForm';
import LoadingScreen from '../../components/ui/LoadingScreen';

const StandaloneProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) return <LoadingScreen message="Iniciando documento..." />;
  
  if (!user) {
    return (
      <div style={{ padding: 40, fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
        <h2>Acceso Denegado</h2>
        <p>No se pudo cargar Nuevo Remito. Sesión expirada o inválida.</p>
      </div>
    );
  }
  
  return <>{children}</>;
};

export default function DeliveryNoteStandalonePage() {
  // Obtenemos ovId y draft_key de forma robusta (soporta hash o query normal)
  const queryString = window.location.search || (window.location.hash.includes('?') ? window.location.hash.substring(window.location.hash.indexOf('?')) : '');
  const params = new URLSearchParams(queryString);
  const ovId = params.get('ov_id');
  const draftKey = params.get('draft_key');

  // Leer preselectedLines UNA SOLA VEZ usando useState con inicializador
  // (la IIFE en el cuerpo se re-ejecutaba en cada render, borrando el dato antes de usarlo)
  const [preselectedLines] = useState(() => {
    if (!draftKey) return null;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        localStorage.removeItem(draftKey); // limpiar después de leer
        return JSON.parse(raw);
      }
    } catch (e) { /* ignorar */ }
    return null;
  });

  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    console.log("URL actual:", window.location.href);
    console.log("ov_id leído:", ovId);
    console.log("draft_key:", draftKey, "| líneas pre-seleccionadas:", preselectedLines?.length ?? 0);
    console.time("load-remito-data");
    requestAnimationFrame(() => {
      setTimeout(() => setIsReady(true), 50);
    });
  }, []);

  return (
    <div style={{ minHeight: '100vh', width: '100vw', background: 'var(--bg-app)', display: 'block', overflowY: 'auto', boxSizing: 'border-box' }}>
      <StandaloneProtectedRoute>
        {isReady ? (
          ovId ? (
            <DeliveryNoteForm
              mode="new"
              isStandalone={true}
              ov_id={ovId}
              preselectedLines={preselectedLines}
              autoOpenSelector={false}
            />
          ) : (
            <div style={{ padding: 40, fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
              <h2>Error de Parámetros</h2>
              <p>No se recibió una Orden de Venta para generar el remito.</p>
            </div>
          )
        ) : (
          <LoadingScreen message="Cargando remito..." />
        )}
      </StandaloneProtectedRoute>
    </div>
  );
}
