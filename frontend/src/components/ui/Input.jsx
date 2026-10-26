import { useId } from 'react';
import s from './Input.module.css';

export default function Input({ label, className = '', variant = 'outline', ...rest }) {
  const generatedId = useId();
  const inputId = rest.id || generatedId;
  return (
    <div className={`${s.group} ${className}`}>
      {label && <label htmlFor={inputId} className={s.label}>{label}</label>}
      <input id={inputId} className={`${s.input} ${s[variant] || ''}`} {...rest} />
    </div>
  );
}
