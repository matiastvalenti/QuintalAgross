import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import s from './ContentHeader.module.css';

export default function ContentHeader({ breadcrumbs = [], title, actions, onBack }) {
  return (
    <div className={s.header}>
      <div className={s.left}>
        {onBack && (
          <button type="button" className={s.backButton} onClick={onBack}>
            <ArrowLeft size={15} /> Volver
          </button>
        )}
        {breadcrumbs.length > 0 && (
          <div className={s.breadcrumbs}>
            {breadcrumbs.map((bc, i) => (
              <span key={i}>
                {i > 0 && <span className={s.sep}>/</span>}
                {bc.to ? <Link to={bc.to}>{bc.label}</Link> : <span>{bc.label}</span>}
              </span>
            ))}
          </div>
        )}
        <h1 className={s.title}>{title}</h1>
      </div>
      {actions && <div className={s.actions}>{actions}</div>}
    </div>
  );
}
