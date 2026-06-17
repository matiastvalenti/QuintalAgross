import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const WindowContext = createContext();

export const useWindow = () => useContext(WindowContext);

const STORAGE_KEY = 'quintal_workspace_windows';

export const WindowProvider = ({ children }) => {
    const [windows, setWindows] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [globalError, setGlobalError] = useState(null);
    const zIndexRef = useRef(100);

    // Restore from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    // Sanitation: Remove windows with complex props if needed, or keeping them simple.
                    // For safety, we could filter out any window that looks corrupt.
                    setWindows(parsed);
                    if (parsed.length > 0) {
                        const maxZ = Math.max(...parsed.map(w => w.zIndex || 100));
                        zIndexRef.current = maxZ + 1;
                    }
                }
            }
        } catch (e) {
            console.error("Failed to restore windows", e);
            localStorage.removeItem(STORAGE_KEY); // Clean corrupt state
        }
    }, []);

    // Save to localStorage
    useEffect(() => {
        try {
            const toSave = windows.map(w => {
                 // Clone to avoid mutating state
                 const { props, ...rest } = w;
                 // sanitize props: exclude known non-serializable keys if any, 
                 // or just trust that they are simple. 
                 // If SalesOrderForm.props has functions, it will crash JSON.stringify or be ignored.
                 // We'll keep props for now but handle the error.
                 return { ...rest, props };
            });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        } catch(e) {
            console.error("Failed to save windows state", e);
        }
    }, [windows]);

    const bringToFront = useCallback((id) => {
        zIndexRef.current += 1;
        const newZ = zIndexRef.current;
        
        setWindows(prev => prev.map(w => 
            w.id === id ? { ...w, zIndex: newZ, isMinimized: false } : w
        ));
        setActiveId(id);
    }, []);

    const openWindow = useCallback((type, props = {}, options = {}) => {
        const { 
            title = 'Ventana', 
            width = 600, 
            height = 500, 
            minWidth = 300, 
            minHeight = 200,
            id: forceId, 
            allowMultiple = false, 
            singletonKey 
        } = options;
        
        setWindows(prev => {
            // 0. Check singletonKey (Strict Singleton)
            if (singletonKey) {
                const existingByKey = prev.find(w => w.singletonKey === singletonKey);
                if (existingByKey) {
                   zIndexRef.current += 1;
                   const newZ = zIndexRef.current;
                   setActiveId(existingByKey.id);
                   return prev.map(w =>
                       w.id === existingByKey.id ? { ...w, zIndex: newZ, isMinimized: false } : w
                   );
                }
            }

            // 1. Singleton Check by TYPE (Legacy/Default behavior if allowMultiple is false)
            // But we prioritize singletonKey if provided.
            if (!allowMultiple && !singletonKey) {
                const existing = prev.find(w => w.type === type);
                if (existing) {
                    zIndexRef.current += 1;
                    const newZ = zIndexRef.current;
                    setActiveId(existing.id); 
                    return prev.map(w => 
                        w.id === existing.id ? { ...w, zIndex: newZ, isMinimized: false } : w
                    );
                }
            }

            // 2. Force ID check
            if (forceId) {
                 const existing = prev.find(w => w.id === forceId);
                 if (existing) {
                    zIndexRef.current += 1;
                    const newZ = zIndexRef.current;
                    setActiveId(forceId);
                    return prev.map(w => 
                        w.id === forceId ? { ...w, zIndex: newZ, isMinimized: false } : w
                    );
                 }
            }

            // 3. Create New
            const newId = forceId || crypto.randomUUID();
            zIndexRef.current += 1;
            const newZ = zIndexRef.current;
            setActiveId(newId);

            // Cascade position
            const startX = 50 + (prev.length * 20);
            const startY = 50 + (prev.length * 20);

            // Clamp initial size to viewport
            const actualWidth = Math.min(width, window.innerWidth - 40);
            const actualHeight = Math.min(height, window.innerHeight - 100);

            const newWindow = {
                id: newId,
                type,
                title,
                props,
                x: Math.min(startX, window.innerWidth - actualWidth),
                y: Math.min(startY, window.innerHeight - actualHeight - 40),
                width: actualWidth,
                height: actualHeight,
                minWidth,
                minHeight,
                isMinimized: false,
                isMaximized: false,
                zIndex: newZ,
                singletonKey // Store it for future checks
            };

            return [...prev, newWindow];
        });
    }, []);

    const closeWindow = useCallback((id) => {
        setWindows(prev => prev.filter(w => w.id !== id));
        setActiveId(prev => prev === id ? null : prev);
    }, []);

    const minimizeWindow = useCallback((id) => {
        setWindows(prev => prev.map(w => 
            w.id === id ? { ...w, isMinimized: true } : w
        ));
        setActiveId(prev => prev === id ? null : prev);
    }, []);

    const maximizeWindow = useCallback((id) => {
        // First bring to front, then toggle max
        zIndexRef.current += 1;
        const newZ = zIndexRef.current;
        
        setWindows(prev => prev.map(w => 
            w.id === id ? { 
                ...w, 
                isMaximized: !w.isMaximized, 
                isMinimized: false,
                zIndex: newZ 
            } : w
        ));
        setActiveId(id);
    }, []);

    const updateWindow = useCallback((id, patch) => {
        setWindows(prev => prev.map(w => 
            w.id === id ? { ...w, ...patch } : w
        ));
    }, []);

    return (
        <WindowContext.Provider value={{
            windows,
            openWindow,
            closeWindow,
            focusWindow: bringToFront,
            minimizeWindow,
            maximizeWindow,
            updateWindow,
            activeId,
            globalError,
            setGlobalError
        }}>
            {children}
        </WindowContext.Provider>
    );
};
