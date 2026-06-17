import s from './Button.module.css';

export default function Button({
  children, variant = 'primary', size = 'md',
  icon, iconOnly, fullWidth, loading = false, className = '', ...rest
}) {
  const cls = [
    s.btn,
    s[variant],
    s[size],
    iconOnly && s.iconOnly,
    loading && s.loading,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button className={cls} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className={s.spinner} /> : icon}
      {children}
    </button>
  );
}
