import { useId } from 'react';
import s from './Select.module.css';

export default function Select({ label, children, className = '', variant = 'outline', readOnly, ...rest }) {
  const generatedId = useId();
  const selectId = rest.id || generatedId;
  return (
    <div className={`${s.group} ${className}`}>
      {label && <label htmlFor={selectId} className={s.label}>{label}</label>}
      <select id={selectId} className={`${s.select} ${s[variant] || ''}`} {...rest} disabled={Boolean(readOnly || rest.disabled)}>{children}</select>
    </div>
  );
}
