import React, { useEffect, useState } from 'react';
import { X, AlertCircle, AlertTriangle, Info, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import s from './OperationalCenter.module.css';
import { mockOperationalData } from '../../data/mockNotifications';

export default function OperationalCenter({ isOpen, onClose }) {
  const navigate = useNavigate();
  // TODO: Reemplazar estado local con llamada a API
  const [data] = useState(mockOperationalData);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const renderItem = (item, colorClass, IconComponent) => {
    // Basic missing route handling
    const isMissing = item.route === '/finanzas/gestor-mora' || item.route.includes('pendiente');
    
    return (
      <div key={item.id} className={s.notifCard}>
        <div className={`${s.notifIconWrap} ${s[colorClass]}`}>
          <IconComponent size={20} />
        </div>
        <div className={s.notifContent}>
          <div className={s.notifHeader}>
            <span className={s.notifTitle}>{item.title}</span>
            <div className={s.notifBadgeWrap}>
              <span className={`${s.notifQtyBadge} ${s[colorClass]}`}>{item.qty}</span>
              <span className={s.notifQtyLabel}>{item.qtyLabel}</span>
            </div>
          </div>
          <span className={s.notifDesc}>{item.description}</span>
          <button 
            className={`${s.notifActionBtn} ${isMissing ? s.btnDisabled : ''}`}
            onClick={() => {
              if (!isMissing) {
                onClose();
                navigate(item.route);
              }
            }}
            title={isMissing ? "Módulo pendiente" : ""}
          >
            {item.actionText}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.drawer} onClick={e => e.stopPropagation()}>
        <div className={s.drawerHeader}>
          <div className={s.titleBlock}>
            <h2 className={s.title}>Centro Operativo</h2>
            <span className={s.subtitle}>Pendientes y alertas del sistema</span>
          </div>
          <button className={s.closeBtn} onClick={onClose}><X size={20} /></button>
        </div>

        <div className={s.drawerBody}>
          <div className={s.section}>
            <h3 className={`${s.sectionTitle} ${s.textCritical}`}>ALTA PRIORIDAD</h3>
            {data.critical.map(item => renderItem(item, 'bgCritical', AlertCircle))}
          </div>

          <div className={s.section}>
            <h3 className={`${s.sectionTitle} ${s.textWarning}`}>MEDIA PRIORIDAD</h3>
            {data.warning.map(item => renderItem(item, 'bgWarning', AlertTriangle))}
          </div>

          <div className={s.section}>
            <h3 className={`${s.sectionTitle} ${s.textInfo}`}>INFORMATIVO</h3>
            {data.info.map(item => renderItem(item, 'bgInfo', Info))}
          </div>
        </div>
      </div>
    </div>
  );
}
