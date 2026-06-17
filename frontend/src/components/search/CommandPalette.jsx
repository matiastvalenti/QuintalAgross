import React, { useState, useEffect, useRef } from 'react';
import { Search, FileText, User, CreditCard, Building2, ChevronRight, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import s from './CommandPalette.module.css';

// MOCK RESULTS (Preparados para conectar con backend/SearchProvider global)
const MOCK_RESULTS = [
  {
    category: 'CLIENTES',
    items: [
      { id: 'c1', title: 'Mistrorigo', icon: User, route: '/configuracion/entidades' },
      { id: 'c2', title: 'Passaglia', icon: User, route: '/configuracion/entidades' },
      { id: 'c3', title: 'Agrohumboldt', icon: User, route: '/configuracion/entidades' }
    ]
  },
  {
    category: 'FACTURAS',
    items: [
      { id: 'f1', title: 'FC-0003-000123', subtitle: 'Mistrorigo - u$s 12.000', icon: FileText, route: '/ventas/facturas' },
      { id: 'f2', title: 'FC-0003-000124', subtitle: 'Passaglia - u$s 5.400', icon: FileText, route: '/ventas/facturas' }
    ]
  },
  {
    category: 'CHEQUES',
    items: [
      { id: 'ch1', title: 'CH-00451', subtitle: 'Banco Galicia - $ 1.200.000', icon: CreditCard, route: '/finanzas/cheques' },
      { id: 'ch2', title: 'CH-00452', subtitle: 'Banco Macro - $ 850.000', icon: CreditCard, route: '/finanzas/cheques' }
    ]
  }
];

export default function CommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const flatItems = MOCK_RESULTS.flatMap(cat => cat.items);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      document.body.style.overflow = 'hidden';
      setQuery('');
      setSelectedIndex(0);
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        setSelectedIndex(prev => (prev < flatItems.length - 1 ? prev + 1 : prev));
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
        e.preventDefault();
      } else if (e.key === 'Enter') {
        if (flatItems[selectedIndex]) {
          navigate(flatItems[selectedIndex].route);
          onClose();
        }
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, flatItems, navigate, onClose]);

  if (!isOpen) return null;

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.searchHeader}>
          <Search size={20} className={s.searchIcon} />
          <input
            ref={inputRef}
            className={s.searchInput}
            placeholder="Buscar por cliente, factura, cheque..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className={s.escBadge}>ESC</div>
        </div>

        <div className={s.resultsArea}>
          {MOCK_RESULTS.map((category) => (
            <div key={category.category} className={s.categoryGroup}>
              <div className={s.categoryTitle}>{category.category}</div>
              {category.items.map(item => {
                const isSelected = flatItems[selectedIndex]?.id === item.id;
                const Icon = item.icon;
                return (
                  <div 
                    key={item.id} 
                    className={`${s.resultItem} ${isSelected ? s.selected : ''}`}
                    onMouseEnter={() => {
                      const idx = flatItems.findIndex(i => i.id === item.id);
                      if (idx !== -1) setSelectedIndex(idx);
                    }}
                    onClick={() => {
                      navigate(item.route);
                      onClose();
                    }}
                  >
                    <div className={s.itemIconWrap}>
                      <Icon size={16} />
                    </div>
                    <div className={s.itemContent}>
                      <span className={s.itemTitle}>{item.title}</span>
                      {item.subtitle && <span className={s.itemSubtitle}>{item.subtitle}</span>}
                    </div>
                    {isSelected && <ChevronRight size={16} className={s.enterIcon} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
