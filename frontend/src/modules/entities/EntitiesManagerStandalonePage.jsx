/**
 * Ruta histórica: las entidades ya no se muestran en un popup de Chrome.
 * Conservamos la URL antigua para llevar cualquier acceso guardado al
 * módulo integrado en /configuracion/entidades.
 */
import { useEffect, useRef } from 'react';
import { openEntitiesManager } from '../../utils/openStandaloneWindow';

export default function EntitiesManagerStandalonePage() {
  const redirected = useRef(false);

  useEffect(() => {
    if (redirected.current) return;
    redirected.current = true;
    openEntitiesManager();
  }, []);

  return (
    <div role="status" style={{
      position: 'fixed',
      inset: 0,
      display: 'grid',
      placeItems: 'center',
      background: '#101729',
      color: '#cbd5e1',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 14
    }}>
      Abriendo Entidades dentro del sistema…
    </div>
  );
}
