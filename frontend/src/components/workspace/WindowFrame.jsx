import React, { useRef, useState, useEffect } from "react";
import { X, Minus, Square, Maximize2, ArrowUpRight } from "lucide-react";
import { useWindow } from "../../context/WindowContext";
import ErrorBoundary from "../common/ErrorBoundary";
import Badge from "../ui/Badge";
import s from "./WindowFrame.module.css";

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
      x: e.clientX - win.x,
      y: e.clientY - win.y,
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
      x: e.clientX - win.width,
      y: e.clientY - win.height,
    };
  };

  // Global Mouse Move/Up
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e) => {
      if (isDragging) {
        let newX = e.clientX - dragOffset.current.x;
        let newY = e.clientY - dragOffset.current.y;
        
        // Constrain to viewport
        newX = Math.max(0, Math.min(newX, window.innerWidth - 100));
        newY = Math.max(0, Math.min(newY, window.innerHeight - 80));
        
        updateWindow(win.id, { x: newX, y: newY });
      }
      if (isResizing) {
        const minW = win.minWidth || 300;
        const minH = win.minHeight || 200;
        
        let newW = Math.max(minW, e.clientX - dragOffset.current.x);
        let newH = Math.max(minH, e.clientY - dragOffset.current.y);
        
        // Constrain W/H to viewport
        newW = Math.min(newW, window.innerWidth - (win.x || 0));
        newH = Math.min(newH, window.innerHeight - (win.y || 0) - 40); // 40 for Dock
        
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
  }, [isDragging, isResizing, win.id, updateWindow]); // dependencies

  if (win.isMinimized) return null;

  const style = {
    left: win.isMaximized ? 0 : win.x,
    top: win.isMaximized ? 0 : win.y,
    width: win.isMaximized ? "100%" : win.width,
    height: win.isMaximized ? "calc(100% - 40px)" : win.height,
    zIndex: win.zIndex,
  };

  return (
    <div
      className={`${s.frame} ${win.isMaximized ? s.maximized : ""} animate-scale`}
      style={style}
      onMouseDown={() => focusWindow(win.id)}
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
        </ErrorBoundary>
      </div>

      {!win.isMaximized && (
        <div className={s.resizeHandle} onMouseDown={handleMouseDownResize} />
      )}
    </div>
  );
}
