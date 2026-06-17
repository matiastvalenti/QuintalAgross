import s from './Input.module.css';

export default function Input({ label, className = '', variant = 'outline', ...rest }) {
  return (
    <div className={`${s.group} ${className}`}>
      {label && <label className={s.label}>{label}</label>}
      <input className={`${s.input} ${s[variant] || ''}`} {...rest} />
    </div>
  );
}
