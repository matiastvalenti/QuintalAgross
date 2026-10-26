import s from './Card.module.css';

export default function Card({ title, actions, headerActions, noPad, children, className = '', style, ...rest }) {
  return (
    <div {...rest} className={`${s.card} ${className}`} style={style}>
      {title && (
        <div className={s.header}>
          <h3>{title}</h3>
          {actions ?? headerActions}
        </div>
      )}
      <div className={`${s.body} ${noPad ? s.noPad : ''}`}>{children}</div>
    </div>
  );
}
