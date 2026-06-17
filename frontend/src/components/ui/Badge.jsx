import s from "./Badge.module.css";

const VARIANT_MAP = {
  DRAFT: "",
  OPEN: s.ok,
  CONFIRMED: s.ok,
  PARTIAL: s.warn,
  PARTIALLY_DELIVERED: s.warn,
  CLOSED: s.accent,
  FULLY_DELIVERED: s.accent,
  DISPATCHED: s.ok,
  INVOICED: s.accent,
  CANCELLED: s.bad,
};

export default function Badge({ children, variant, className = "" }) {
  const v = variant ? s[variant] || VARIANT_MAP[variant] || "" : "";
  return <span className={`${s.badge} ${v} ${className}`}>{children}</span>;
}
