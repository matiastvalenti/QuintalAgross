/**
 * Triggers a detailed error UI in-place within the AppShell instead of navigating away.
 * This avoids HTTP 431 (URL length) and provides a better UX by keeping context.
 */
export function navigateToError(navigate_unused, { title, message, cause, statusCount = 500 }) {
  // We dispatch a custom event that AppShell listens to, showing the error "aca" (in-place)
  window.dispatchEvent(new CustomEvent('app-show-error', { 
    detail: { 
      title: title || 'Error del Sistema', 
      message: message || 'Ocurrió un error inesperado.', 
      cause: cause || 'No hay detalles adicionales.', 
      status: statusCount 
    } 
  }));
}
