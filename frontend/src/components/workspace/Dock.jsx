import React from 'react';
import { useWindow } from '../../context/WindowContext';
import s from './Dock.module.css';

export default function Dock() {
    const { windows, focusWindow, activeId, minimizeWindow, closeWindow } = useWindow();
    
    // Only show if there are windows? Or always?
    // User requested "Al minimizar, debe aparecer un dock inferior"
    // Let's show it if any window is open or minimized to access them.
    if (windows.length === 0) return null;

    return (
        <div className={s.dockContainer}>
            {windows.map(w => {
                 const isActive = w.id === activeId && !w.isMinimized;
                 return (
                     <div 
                        key={w.id} 
                        className={`${s.chip} ${isActive ? s.active : ''} ${w.isMinimized ? s.minimized : ''}`}
                        onClick={() => {
                            if (isActive) {
                                minimizeWindow(w.id);
                            } else {
                                focusWindow(w.id);
                            }
                        }}
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
