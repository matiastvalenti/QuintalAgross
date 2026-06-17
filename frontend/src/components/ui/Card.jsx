import s from './Card.module.css';

export default function Card({ title, actions, noPad, children, className = '' }) {
  return (
    <div className={`${s.card} ${className}`}>
      {title && (
        <div className={s.header}>
          <h3>{title}</h3>
          {actions}
        </div>
      )}
      <div className={`${s.body} ${noPad ? s.noPad : ''}`}>{children}</div>
    </div>
  );
}
