import React from 'react';
import s from './DocumentFormShell.module.css';

export default function DocumentFormShell({
  title,
  subtitle,
  badges = null,
  headerActions = null,
  leftPanel = null,
  rightPanel = null,
  bottomSection = null,
  footerActions = null,
  isStandalone = true,
}) {
  return (
    <div className={`${s.formCard} ${isStandalone ? s.formCardStandalone : ''}`}>
      {/* Header Area */}
      <div className={s.headerLine}>
        <div className={s.titleGroup}>
          <div className={s.compactHeaderTitle}>
            <h1>{title}</h1>
            {badges && <div className={s.headerMeta}>{badges}</div>}
          </div>
          {subtitle && <div className={s.subtitle}>{subtitle}</div>}
        </div>
        <div className={s.headerActions}>{headerActions}</div>
      </div>

      {/* Main Content Grid */}
      <div className={s.mainGrid}>
        {/* Left Column (Items / Main Content) */}
        <div className={s.leftColumn}>
          {leftPanel}
        </div>

        {/* Right Column (Logistics / Metadata) */}
        <div className={s.rightColumn}>
          <div className={s.rightColumnScrollable}>
            {rightPanel}
          </div>
        </div>
      </div>

      {/* Bottom Section (Status / Tracking / Flow) */}
      {bottomSection && (
        <div className={s.bottomSection}>
          {bottomSection}
        </div>
      )}

      {/* Footer Area */}
      <div className={s.bottomActions}>
        {footerActions}
      </div>
    </div>
  );
}
