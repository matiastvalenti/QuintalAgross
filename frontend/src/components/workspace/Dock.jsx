import React from 'react';
import { useWindow } from '../../context/WindowContext';
import s from './Dock.module.css';

export default function Dock() {
    const { windows, focusWindow, closeWindow } = useWindow();
    const minimizedWindows = windows.filter(w => w.isMinimized);
    
    // No ocupar toda la parte inferior si las ventanas están abiertas.
    // El dock aparece únicamente cuando hay documentos minimizados.
    if (minimizedWindows.length === 0) return null;

    return (
        <div className={s.dockContainer}>
            {minimizedWindows.map(w => {
                 return (
                     <div 
                        key={w.id} 
                        className={`${s.chip} ${s.minimized}`}
                        onClick={() => focusWindow(w.id)}
                        onMouseDown={(e) => {
                            if (e.button === 1) { // Middle click
                                e.preventDefault();
                                closeWindow(w.id);
                            }
                        }}
                        title={w.title}
                     >
                        <span className={s.icon}>🗔</span>
                        <span className={s.title}>{w.title}</span>
                     </div>
                 );
            })}
        </div>
    );
}
