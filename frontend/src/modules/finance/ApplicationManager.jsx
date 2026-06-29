import React from 'react';
import SalesApplicationsPage from './SalesApplicationsPage';

// El antiguo ApplicationManager fue simplificado temporalmente para mostrar 
// unicamente la nueva pantalla de aplicaciones (SalesApplicationsPage) a nivel raiz.
// Las pestanas antiguas ("Vínculo de Origen", "Comisionistas") fueron ocultadas.

export default function ApplicationManager() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <SalesApplicationsPage mode="internal" />
    </div>
  );
}
