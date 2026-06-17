import React from 'react';
import { useWindow } from '../../context/WindowContext';
import WindowFrame from './WindowFrame';
import Dock from './Dock';
import { registry } from './WindowRegistry.jsx';
import s from './WindowManager.module.css';
import ErrorBoundary from '../common/ErrorBoundary';

const FallbackComponent = ({ type }) => (
    <div style={{ padding: 20, color: 'var(--text-secondary)' }}>
        <h4>Ventana no encontrada</h4>
        <p>El tipo de ventana <code>{type}</code> no está registrado.</p>
    </div>
);

export default function WindowManager() {
    const { windows, closeWindow } = useWindow();

    return (
        <div className={s.desktopLayer}>
            {windows.map(w => {
                const Component = registry[w.type] || (() => <FallbackComponent type={w.type} />);
                
                return (
                    // Wrap individually so one crash doesn't kill all windows
                    <ErrorBoundary 
                        key={w.id} 
                        onReset={() => closeWindow(w.id)}
                        resetLabel="Cerrar Ventana"
                    >
                        <WindowFrame 
                            window={w} 
                            component={Component}
                        />
                    </ErrorBoundary>
                );
            })}
            <Dock />
        </div>
    );
}
