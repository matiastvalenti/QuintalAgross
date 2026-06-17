import React from 'react';
import { Truck, Receipt, CheckCircle, AlertCircle, Clock, Layers, XCircle } from 'lucide-react';

const STATUS_MAP = {
  DRAFT: { label: 'Borrador', color: '#64748b', bg: '#f1f5f9', icon: Clock },
  CONFIRMED: { label: 'Pendiente', color: '#2563eb', bg: '#eff6ff', icon: AlertCircle },
  PARTIALLY_DELIVERED: { label: 'Remitido Parcial', color: '#d97706', bg: '#fffbeb', icon: Truck },
  FULLY_DELIVERED: { label: 'Remitido Total', color: '#d97706', bg: '#fffbeb', icon: Truck },
  PARTIALLY_INVOICED: { label: 'Facturado Parcial', color: '#0891b2', bg: '#ecfeff', icon: Receipt },
  INVOICED: { label: 'Facturado Total', color: '#0891b2', bg: '#ecfeff', icon: Receipt },
  REMITIDO_PARCIAL_FACTURADO_PARCIAL: { label: 'Remit. Parcial / Fact. Parcial', color: '#7c3aed', bg: '#f5f3ff', icon: Layers },
  REMITIDO_TOTAL_FACTURADO_PARCIAL: { label: 'Remitido / Fact. Parcial', color: '#7c3aed', bg: '#f5f3ff', icon: Layers },
  REMITIDO_PARCIAL_FACTURADO_TOTAL: { label: 'Remit. Parcial / Facturado', color: '#059669', bg: '#ecfdf5', icon: CheckCircle },
  COMPLETED: { label: 'Remitido y Facturado', color: '#059669', bg: '#ecfdf5', icon: CheckCircle },
  CANCELLED: { label: 'Anulado', color: '#dc2626', bg: '#fef2f2', icon: XCircle },
  // Additional Document Statuses
  DISPATCHED: { label: 'Despachado', color: '#d97706', bg: '#fffbeb', icon: Truck },
  PARTIAL: { label: 'Parcial', color: '#7c3aed', bg: '#f5f3ff', icon: Layers },
  OPEN: { label: 'Pend./Abierto', color: '#2563eb', bg: '#eff6ff', icon: AlertCircle },
  PARTIALLY_PAID: { label: 'Pago Parcial', color: '#059669', bg: '#ecfdf5', icon: CheckCircle },
  CLOSED: { label: 'Cerrado', color: '#059669', bg: '#ecfdf5', icon: CheckCircle },
  PAID: { label: 'Pagado', color: '#0f766e', bg: '#f0fdf4', icon: CheckCircle },
};

export const TraceabilityStatusBadge = ({ status }) => {
  if (!status || String(status).toUpperCase() === 'DRAFT' || String(status).toUpperCase() === 'BORRADOR') return null;
  
  const config = STATUS_MAP[String(status).toUpperCase()];
  if (!config) return null; // NO FALLBACK TO DRAFT!
  
  const Icon = config.icon;

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 20,
      backgroundColor: config.bg,
      color: config.color,
      fontSize: '11px',
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.02em',
      border: `1px solid ${config.color}20`,
      boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
    }}>
      <Icon size={14} strokeWidth={2.5} />
      {config.label}
    </div>
  );
};

export const TraceabilityProgress = ({ delivered, invoiced, paid = 0 }) => {
  return (
    <div style={{ display: 'flex', gap: 6, width: '100%', alignItems: 'center', justifyContent: 'center', opacity: 0.85 }}>
      {/* Delivery Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }} title={`Remitido: ${Math.round(delivered)}%`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Truck size={10} color="var(--warn)" opacity={0.7} />
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)' }}>{Math.round(delivered)}%</span>
        </div>
        <div style={{ width: '100%', height: 3, background: 'var(--border-color)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ 
            width: `${Math.min(100, delivered)}%`, 
            height: '100%', 
            background: 'var(--warn)',
            opacity: 0.8,
            borderRadius: 2
          }} />
        </div>
      </div>

      {/* Invoice Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }} title={`Facturado: ${Math.round(invoiced)}%`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Receipt size={10} color="var(--info)" opacity={0.7} />
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)' }}>{Math.round(invoiced)}%</span>
        </div>
        <div style={{ width: '100%', height: 3, background: 'var(--border-color)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ 
            width: `${Math.min(100, invoiced)}%`, 
            height: '100%', 
            background: 'var(--info)',
            opacity: 0.8,
            borderRadius: 2
          }} />
        </div>
      </div>

      {/* Paid Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }} title={`Cobrado: ${Math.round(paid)}%`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <CheckCircle size={10} color="var(--ok)" opacity={0.7} />
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)' }}>{Math.round(paid)}%</span>
        </div>
        <div style={{ width: '100%', height: 3, background: 'var(--border-color)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ 
            width: `${Math.min(100, paid)}%`, 
            height: '100%', 
            background: 'var(--ok)',
            opacity: 0.8,
            borderRadius: 2
          }} />
        </div>
      </div>
    </div>
  );
};
