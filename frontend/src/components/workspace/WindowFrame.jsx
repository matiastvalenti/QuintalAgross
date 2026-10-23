import React, { useRef, useState, useEffect } from "react";
import { X, Minus, Square, Maximize2 } from "lucide-react";
import { useWindow } from "../../context/WindowContext";
import ErrorBoundary from "../common/ErrorBoundary";
import Badge from "../ui/Badge";
import s from "./WindowFrame.module.css";
import { clampWindowBounds, DOCK_HEIGHT, WINDOW_MARGIN } from "./windowGeometry";
import { WindowVisibilityContext } from "./WindowVisibilityContext";

export default function WindowFrame({ window: win, component: Component }) {
  const {
    focusWindow,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    updateWindow,
  } = useWindow();
  const frameRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  useEffect(() => {
    const handleResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Se calcula también al restaurar ventanas antiguas guardadas fuera de pantalla.
  const bounds = clampWindowBounds(win, viewport.width, viewport.height);

  // Handle Drag
  const handleMouseDownHeader = (e) => {
    if (e.button === 1) {
      // Middle click
      e.preventDefault();
      e.stopPropagation();
      closeWindow(win.id);
      return;
    }
    if (win.isMaximized) return; // Cannot drag if maximized
    e.preventDefault();
    focusWindow(win.id);
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - bounds.x,
      y: e.clientY - bounds.y,
    };
  };

  // Handle Resize
  const handleMouseDownResize = (e) => {
    if (win.isMaximized) return;
    e.preventDefault();
    e.stopPropagation();
    focusWindow(win.id);
    setIsResizing(true);
    dragOffset.current = {
      x: e.clientX - bounds.width,
      y: e.clientY - bounds.height,
    };
  };

  // Global Mouse Move/Up
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e) => {
      if (isDragging) {
        let newX = e.clientX - dragOffset.current.x;
        let newY = e.clientY - dragOffset.current.y;
        
        // Mantener visible el documento completo y el dock, no solo su título.
        const limit = clampWindowBounds({ ...win, x: newX, y: newY, width: bounds.width, height: bounds.height }, window.innerWidth, window.innerHeight);
        newX = limit.x;
        newY = limit.y;
        
        updateWindow(win.id, { x: newX, y: newY });
      }
      if (isResizing) {
        const minW = Math.min(win.minWidth || 300, window.innerWidth - WINDOW_MARGIN * 2);
        const minH = Math.min(win.minHeight || 200, window.innerHeight - DOCK_HEIGHT - WINDOW_MARGIN * 2);
        const newW = Math.max(minW, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - bounds.x - WINDOW_MARGIN));
        const newH = Math.max(minH, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - bounds.y - DOCK_HEIGHT - WINDOW_MARGIN));
        
        updateWindow(win.id, { width: newW, height: newH });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isResizing, win.id, win.minWidth, win.minHeight, updateWindow, bounds.width, bounds.height, bounds.x, bounds.y]);

  // quintal-hybrid-phase1: mantener montado el formulario al minimizar.

  const style = {
    left: win.isMaximized ? 0 : bounds.x,
    top: win.isMaximized ? 0 : bounds.y,
    width: win.isMaximized ? "100%" : bounds.width,
    height: win.isMaximized ? `calc(100% - ${DOCK_HEIGHT}px)` : bounds.height,
    zIndex: win.zIndex,
  };

  return (
    <div
      className={`${s.frame} ${win.isMaximized ? s.maximized : ""} animate-scale`}
      // display:none conserva el estado del formulario, pero evita que los controles
      // del frame sigan pintándose durante la minimización.
      style={{ ...style, ...(win.isMinimized ? { display: "none" } : {}) }}
      aria-hidden={win.isMinimized}
      onMouseDown={() => { if (!win.isMinimized) focusWindow(win.id); }}
      ref={frameRef}
    >
      <div
        className={s.header}
        onMouseDown={handleMouseDownHeader}
        onDoubleClick={() => maximizeWindow(win.id)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
          <span className={s.title}>{win.title}</span>
          {win.status && (
            <Badge variant={win.status} style={{ fontSize: '9px', padding: '1px 6px' }}>
              {win.status}
            </Badge>
          )}
        </div>
        <div className={s.controls}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              minimizeWindow(win.id);
            }}
            className={s.btn}
            title="Minimizar"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              maximizeWindow(win.id);
            }}
            className={s.btn}
            title="Maximizar"
          >
            {win.isMaximized ? (
              <Maximize2 size={12} />
            ) : (
              <Square size={12} />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeWindow(win.id);
            }}
            className={`${s.btn} ${s.close}`}
            title="Cerrar"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className={s.content}>
        <ErrorBoundary onClose={() => closeWindow(win.id)}>
          <WindowVisibilityContext.Provider value={{ isWindowMinimized: Boolean(win.isMinimized) }}>
            {Component ? (
              <Component
                {...win.props}
                isWindow
                windowId={win.id}
                onClose={() => closeWindow(win.id)}
              />
            ) : (
              <div>Component Not Found</div>
            )}
          </WindowVisibilityContext.Provider>
        </ErrorBoundary>
      </div>

      {!win.isMaximized && (
        <div className={s.resizeHandle} onMouseDown={handleMouseDownResize} />
      )}
    </div>
  );
}
