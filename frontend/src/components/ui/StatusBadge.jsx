import React from 'react';
import s from './StatusBadge.module.css';

// Mapeo maestro de todos los estados del ERP a los 6 estados oficiales
const parseStatus = (rawStatus) => {
  if (!rawStatus) return { label: 'Desconocido', variant: 'unknown' };

  const status = String(rawStatus).toUpperCase();

  // 1. ANULADO
  if (['ANULADO', 'CANCELLED', 'VOID'].includes(status)) {
    return { label: 'Anulado', variant: 'cancelled' };
  }

  // 2. VENCIDO
  if (['VENCIDO', 'OVERDUE', 'EXPIRED'].includes(status)) {
    return { label: 'Vencido', variant: 'overdue' };
  }

  // 3. OBSERVADO
  if (['OBSERVADO', 'OBSERVED', 'REJECTED', 'DISPUTED'].includes(status)) {
    return { label: 'Observado', variant: 'observed' };
  }

  // 4. COMPLETADO
  if ([
    'COMPLETADO', 'COMPLETED', 
    'REMITIDO TOTAL', 'FULLY_DELIVERED', 
    'FACTURADO', 'INVOICED', 
    'REMITIDO Y FACTURADO', 'PAID', 'PAGADO', 'SETTLED'
  ].includes(status)) {
    return { label: 'Completado', variant: 'completed' };
  }

  // 5. EN PROCESO
  if ([
    'EN PROCESO', 'PROCESSING', 
    'PDTE. LOGÍSTICA', 'PENDING_DELIVERY', 
    'REMITIDO', 'PARTIALLY_DELIVERED',
    'PARTIALLY_INVOICED', 'REMITIDO_PARCIAL_FACTURADO_PARCIAL',
    'REMITIDO_TOTAL_FACTURADO_PARCIAL', 'REMITIDO_PARCIAL_FACTURADO_TOTAL'
  ].includes(status)) {
    return { label: 'En proceso', variant: 'processing' };
  }

  // 6. PENDIENTE (Default fallback para DRAFT, CONFIRMED, PENDING, etc)
  if ([
    'PENDIENTE', 'PENDING', 
    'A CONFIRMAR', 'DRAFT', 
    'CONFIRMADO', 'CONFIRMED'
  ].includes(status)) {
    return { label: 'Pendiente', variant: 'pending' };
  }

  // Fallback si no machea nada, lo tratamos como pendiente
  return { label: 'Pendiente', variant: 'pending' };
};

export default function StatusBadge({ status, className = '' }) {
  const { label, variant } = parseStatus(status);
  
  return (
    <div className={`${s.badge} ${s[variant]} ${className}`}>
      <span className={s.dot}></span>
      {label}
    </div>
  );
}
