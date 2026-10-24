import React from 'react';
import { FileText, X } from 'lucide-react';
import { useWindow } from '../../context/WindowContext';
import s from './Dock.module.css';

/**
 * Barra permanente de tareas cuando hay varias ventanas (o alguna minimizada).
 * Una ventana minimizada nunca desaparece: queda disponible para restaurar.
 */
export default function Dock() {
  const { windows, activeId, focusWindow, closeWindow } = useWindow();
  if (!windows.length || (windows.length === 1 && !windows[0].isMinimized)) return null;

  return (
    <nav className={s.dockContainer} aria-label="Ventanas del ERP">
      <span className={s.dockLabel}>Ventanas</span>
      <div className={s.windowList}>
        {windows.map(win => (
          <div
            key={win.id}
            className={`${s.chip} ${win.isMinimized ? s.minimized : ''} ${activeId === win.id && !win.isMinimized ? s.active : ''}`}
          >
            <button
              type="button"
              className={s.windowButton}
              title={win.title}
              aria-label={`${win.isMinimized ? 'Restaurar' : 'Ir a'} ${win.title}`}
              onClick={() => focusWindow(win.id)}
            >
              <FileText size={14} aria-hidden="true" />
              <span className={s.title}>{win.title}</span>
              {win.isMinimized && <span className={s.minimizedBadge}>Min.</span>}
            </button>
            <button
              type="button"
              className={s.closeButton}
              aria-label={`Cerrar ${win.title}`}
              title={`Cerrar ${win.title}`}
              onClick={() => closeWindow(win.id)}
            ><X size={13} /></button>
          </div>
        ))}
      </div>
    </nav>
  );
}
