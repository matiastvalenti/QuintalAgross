import s from './Select.module.css';

export default function Select({ label, children, className = '', variant = 'outline', readOnly, ...rest }) {
  return (
    <div className={`${s.group} ${className}`}>
      {label && <label className={s.label}>{label}</label>}
      <select className={`${s.select} ${s[variant] || ''}`} disabled={readOnly} {...rest}>{children}</select>
    </div>
  );
}
