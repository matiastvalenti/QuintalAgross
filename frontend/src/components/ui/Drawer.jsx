import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import s from './Drawer.module.css';
import { createPortal } from 'react-dom';
import { useWindowVisibility } from '../workspace/WindowVisibilityContext';

export default function Drawer({ open, onClose, title, children }) {
  const [isClosing, setIsClosing] = useState(false);
  const { isWindowMinimized } = useWindowVisibility();

  useEffect(() => {
    if (open && !isWindowMinimized) {
      document.body.style.overflow = 'hidden';
      setIsClosing(false);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open, isWindowMinimized]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 200);
  };

  // El Drawer también usa document.body: al minimizar su ventana no debe quedar flotando.
  if (isWindowMinimized || (!open && !isClosing)) return null;

  return createPortal(
    <div className={`${s.overlay} ${isClosing ? s.closing : ''}`} onClick={handleClose}>
      <div className={s.drawer} onClick={e => e.stopPropagation()}>
        <div className={s.header}>
          <div className={s.title}>{title}</div>
          <button className={s.closeButton} onClick={handleClose}>
            <X size={20} />
          </button>
        </div>
        <div className={s.content}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
