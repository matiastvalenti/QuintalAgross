import s from './Modal.module.css';

export default function Modal({ open, onClose, title, footer, children, wide, noPadding, style = {} }) {
  if (!open) return null;
  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className={s.panel} style={{ ...(wide ? { maxWidth: 880 } : {}), ...style }}>
        {title && (
          <div className={s.header}>
            <h3>{title}</h3>
            <button className={s.close} onClick={onClose}>✕</button>
          </div>
        )}
        <div className={s.body} style={noPadding ? { padding: 0 } : {}}>{children}</div>
        {footer && <div className={s.footer}>{footer}</div>}
      </div>
    </div>
  );
}
