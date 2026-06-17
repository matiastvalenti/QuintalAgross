import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, X, Users, Package, FileText, 
  ArrowRight, Command, CornerDownLeft, ArrowUp, ArrowDown, Truck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import s from './GlobalSearch.module.css';

const ICON_MAP = {
  entity: Users,
  product: Package,
  document: FileText,
  vehicle: Truck
};

export default function GlobalSearch({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.get(`/search/global?q=${encodeURIComponent(query)}`);
        setResults(data);
        setSelectedIndex(0);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleSelect = (item) => {
    onClose();
    navigate(item.route);
    // Optionally trigger a specific detail view if the system supports it
  };

  if (!isOpen) return null;

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className={s.searchHeader}>
          <Search size={20} className={s.searchIcon} />
          <input 
            ref={inputRef}
            className={s.input}
            placeholder="Lo que busques... (Enter para navegar)"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className={s.shortcutHint}>ESC</div>
        </div>

        <div className={s.results}>
          {loading && <div className={s.empty}>Buscando...</div>}
          
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className={s.empty}>
              <Search size={40} style={{ opacity: 0.2 }} />
              <p>No encontramos nada que coincida con "{query}"</p>
            </div>
          )}

          {!loading && results.length > 0 && results.map((item, idx) => {
            const IconComp = ICON_MAP[item.type] || FileText;
            return (
              <div 
                key={`${item.type}-${item.id}`} 
                className={`${s.resultItem} ${idx === selectedIndex ? s.selected : ''}`}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => handleSelect(item)}
              >
                <div className={s.resultIcon}><IconComp size={18} /></div>
                <div className={s.resultContent}>
                  <div className={s.resultLabel}>{item.label}</div>
                  <div className={s.resultSublabel}>{item.sublabel}</div>
                </div>
                <ArrowRight size={16} style={{ opacity: idx === selectedIndex ? 0.3 : 0 }} />
              </div>
            );
          })}

          {!query && (
            <div className={s.empty}>
              <Search size={40} style={{ opacity: 0.1 }} />
              <p>Escribe algo para empezar a buscar...</p>
            </div>
          )}
        </div>

        <div className={s.footer}>
          <div className={s.footerItem}>
             <span className={s.footerKey}><CornerDownLeft size={10} /></span> Seleccionar
          </div>
          <div className={s.footerItem}>
             <span className={s.footerKey}><ArrowUp size={10} /></span>
             <span className={s.footerKey}><ArrowDown size={10} /></span> Navegar
          </div>
          <div className={s.footerItem}>
             <span className={s.footerKey}>ESC</span> Cerrar
          </div>
        </div>
      </div>
    </div>
  );
}
