import React, { createContext, useContext, useState, useEffect } from 'react';

const SearchContext = createContext();

export function SearchProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);

  const openSearch = () => setIsOpen(true);
  const closeSearch = () => setIsOpen(false);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setIsOpen(true);
      }
    };
    
    const handleCustomEvent = () => setIsOpen(true);

    document.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('open-global-search', handleCustomEvent);

    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('open-global-search', handleCustomEvent);
    };
  }, []);

  return (
    <SearchContext.Provider value={{ isOpen, openSearch, closeSearch }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  return useContext(SearchContext);
}
