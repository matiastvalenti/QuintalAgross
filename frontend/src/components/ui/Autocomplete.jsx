import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import s from './Autocomplete.module.css';

/**
 * Autocomplete Component
 * @param {string} label - Input label
 * @param {string} placeholder - Input placeholder
 * @param {Function} onSearch - Async function (query) => Promise<Array>
 * @param {Function} onSelect - Function (item) => void
 * @param {Function} renderItem - Function (item) => ReactNode (optional)
 * @param {string} valueDisplay - Key or function to display selected value
 * @param {Object} initialValue - Initial selected object
 */
export default function Autocomplete({
    label,
    placeholder = "Buscar...",
    onSearch,
    onSelect,
    renderItem = (item) => item.name || item.razon_social || item.label,
    valueDisplay = (item) => item.name || item.razon_social || item.label,
    initialValue = null,
    disabled = false,
    minChars = 0,
    clearOnSelect = false,
    onChange = null,
    variant = 'outline',
    icon = null
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(-1);
    
    // If we have an initial value (or selected), show it in input?
    // Usually for search-select, we want the input to show the selected name.
    const [selectedItem, setSelectedItem] = useState(initialValue);
    
    const wrapperRef = useRef(null);
    const dropdownRef = useRef(null);

    useEffect(() => {
        if (initialValue) {
            setSelectedItem(initialValue);
            setQuery(typeof valueDisplay === 'function' ? valueDisplay(initialValue) : initialValue[valueDisplay]);
        } else {
            setSelectedItem(null);
            setQuery('');
        }
    }, [initialValue]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            const clickedInWrapper = wrapperRef.current && wrapperRef.current.contains(event.target);
            const clickedInDropdown = dropdownRef.current && dropdownRef.current.contains(event.target);
            
            if (!clickedInWrapper && !clickedInDropdown) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSearch = async (val, keepSelection = false) => {
        setQuery(val);
        if (onChange) onChange(val); // Notify parent of text change
        if (!keepSelection) setSelectedItem(null); 
        
        if (val.length < minChars && val.length > 0) {
            setResults([]);
            setIsOpen(false);
            return;
        }

        setLoading(true);
        setIsOpen(val.length >= minChars); // Open if chars met
        try {
            const data = await onSearch(val);
            setResults(Array.isArray(data) ? data : []);
            setHighlightIndex(-1);
        } catch (err) {
            console.error("Autocomplete search error", err);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (item) => {
        if (clearOnSelect) {
            setSelectedItem(null);
            setQuery('');
        } else {
            setSelectedItem(item);
            setQuery(typeof valueDisplay === 'function' ? valueDisplay(item) : item[valueDisplay]);
        }
        setIsOpen(false);
        if (onSelect) onSelect(item);
    };

    const handleKeyDown = (e) => {
        if (!isOpen) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightIndex >= 0 && results[highlightIndex]) {
                handleSelect(results[highlightIndex]);
            }
        } else if (e.key === 'Escape' || e.key === 'Tab') {
            setIsOpen(false);
        }
    };

    const [dropdownStyle, setDropdownStyle] = useState({});

    const updatePosition = () => {
        if (isOpen && wrapperRef.current) {
            const rect = wrapperRef.current.getBoundingClientRect();
            setDropdownStyle({
                position: 'fixed',
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width,
                zIndex: 9999
            });
        }
    };

    useEffect(() => {
        updatePosition();
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [isOpen]);

    return (
        <div className={s.wrapper} ref={wrapperRef}>
            {label && <label className={s.label}>{label}</label>}
            <div className={`${s.inputWrapper} ${s[variant] || ''}`}>
                {icon && <div className={s.iconArea}>{icon}</div>}
                <input
                    type="text"
                    className={`${s.input} ${s[variant] || ''}`}
                    placeholder={placeholder}
                    value={query}
                    onChange={(e) => handleSearch(e.target.value)}
                    onFocus={() => {
                        // Always search on focus if empty or hasn't loaded
                        if (results.length === 0 && query.length < minChars) {
                            handleSearch("", true);
                        } else if (query.length >= minChars) {
                            handleSearch(query, true);
                        } else {
                            setIsOpen(true);
                        }
                    }}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                />
                {/* Dropdown Toggle / Indicator */}
                <div 
                    className={s.indicator} 
                    onClick={() => {
                        if (isOpen) {
                            setIsOpen(false);
                        } else {
                            handleSearch(query, true);
                        }
                    }}
                >
                    <ChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
                </div>
                {loading && <div className={s.spinner} />}
            </div>

            {isOpen && createPortal(
                <div ref={dropdownRef} className={`${s.dropdown} ${s.open}`} style={dropdownStyle}>
                    {results.length > 0 ? (
                        results.map((item, index) => (
                            <div
                                key={item.id || index}
                                className={`${s.item} ${index === highlightIndex ? s.highlighted : ''}`}
                                onClick={(e) => { e.stopPropagation(); handleSelect(item); }}
                                onMouseEnter={() => setHighlightIndex(index)}
                            >
                                {renderItem(item)}
                            </div>
                        ))
                    ) : loading ? (
                        <div className={s.empty}>Cargando...</div>
                    ) : (
                        <div className={s.empty}>No se encontraron resultados</div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}
