import React from 'react';
import { DollarSign } from 'lucide-react';
import s from './ReceiptShell.module.css';

export function ReceiptShell({ 
  headerTitle = "Comprobante", 
  headerSubtitle = "Documento principal", 
  headerStats = [], // { label, value, color, key }
  topLeftContent,
  summaryContent,
  summaryFooter,
  bottomContent
}) {
  return (
    <div className={s.container}>
      
      {/* HEADER */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <div className={s.iconWrap}>
            <DollarSign size={20} />
          </div>
          <div className={s.headerTitle}>
            <h2>{headerTitle}</h2>
            <span>{headerSubtitle}</span>
          </div>
        </div>
        <div className={s.headerRight}>
          {headerStats.map((stat, idx) => (
            <div key={stat.key || idx} className={s.headerStat}>
              <span>{stat.label}</span>
              <strong style={{ color: stat.color || 'inherit' }}>
                {stat.value}
              </strong>
            </div>
          ))}
        </div>
      </div>

      <div className={s.collectionBody}>
        {/* ZONA SUPERIOR IZQUIERDA: Parámetros */}
        <div className={s.topLeft}>
          {topLeftContent}
        </div>

        {/* ZONA SUPERIOR DERECHA: Resumen */}
        <div className={s.summaryPanel}>
          <div className={s.summaryBlock}>
            <div className={s.summaryContent}>
              {summaryContent}
            </div>
            
            {summaryFooter && (
              <div className={s.summaryFooter} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {summaryFooter}
              </div>
            )}
          </div>
        </div>

        {/* ZONA INFERIOR */}
        {bottomContent}

      </div>
    </div>
  );
}

// ------------------------------------
// Exportamos también algunas cajas útiles para estandarizar los "sections" (ej. Payments Area, Params)
// ------------------------------------

export function ShellSection({ icon: Icon, title, children, toolbar, noPadding = false, style = {} }) {
  return (
    <div className={s.sectionBox} style={style}>
      <div className={s.sectionHeader}>
        <h3>{Icon && <Icon size={16} />} {title}</h3>
      </div>
      <div className={noPadding ? '' : s.parametersBody}>
        {children}
      </div>
      {toolbar && (
        <div className={s.paymentToolbar} style={{ borderTop: '1px solid var(--border-color)', borderBottom: 'none' }}>
          {toolbar}
        </div>
      )}
    </div>
  );
}
