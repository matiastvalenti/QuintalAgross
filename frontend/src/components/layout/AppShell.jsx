import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { WindowProvider, useWindow } from '../../context/WindowContext';
import WindowManager from '../workspace/WindowManager';
import s from './AppShell.module.css';
import ErrorBoundary from '../common/ErrorBoundary';
import DetailedErrorView from '../common/DetailedErrorView';
import CommandPalette from '../search/CommandPalette';
import { useSearch } from '../../context/SearchContext';

export default function AppShell({ children }) {
  const [openMobile, setOpenMobile] = useState(false);

  return (
    <AppShellContent openMobile={openMobile} setOpenMobile={setOpenMobile}>
        {children}
    </AppShellContent>
  );
}

function AppShellContent({ children, openMobile, setOpenMobile }) {
    const { globalError, setGlobalError } = useWindow();
    const { isOpen, closeSearch } = useSearch();

    useEffect(() => {
        const handleError = (e) => {
            setGlobalError(e.detail);
        };

        window.addEventListener('app-show-error', handleError);
        return () => window.removeEventListener('app-show-error', handleError);
    }, [setGlobalError]);

    useEffect(() => {
        if (!openMobile) return undefined;
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') setOpenMobile(false);
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [openMobile, setOpenMobile]);

    return (
        <div className={s.shell}>
            <Sidebar openMobile={openMobile} setOpenMobile={setOpenMobile} />
            {openMobile && (
              <button type="button" className={s.mobileBackdrop} aria-label="Cerrar menú lateral" onClick={() => setOpenMobile(false)} />
            )}
            <div className={s.mainArea}>
                <Topbar onMenuClick={() => setOpenMobile(!openMobile)} />
                <main className={s.content} style={globalError ? { display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}}>
                    {globalError ? (
                        <div style={{ maxWidth: '800px', width: '100%', background: 'white', borderRadius: '32px', boxShadow: '0 20px 50px rgba(0,0,0,0.1)' }}>
                            <DetailedErrorView 
                                title={globalError.title}
                                message={globalError.message}
                                cause={globalError.cause}
                                status={globalError.status}
                                onReset={() => setGlobalError(null)}
                                onHome={() => { setGlobalError(null); window.location.href = '/'; }}
                            />
                        </div>
                    ) : (
                        <>
                            {/* Main Content Boundary */}
                            <ErrorBoundary onReset={() => window.location.reload()}>
                                {children}
                            </ErrorBoundary>
                            
                            <ErrorBoundary onReset={() => console.error("Window System Crash")}>
                                <WindowManager />
                            </ErrorBoundary>

                            <CommandPalette 
                                isOpen={isOpen} 
                                onClose={closeSearch} 
                            />
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}
