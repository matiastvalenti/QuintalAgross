import React, { createContext, useContext, useState, useCallback } from 'react';

const CostCenterContext = createContext();

export function CostCenterProvider({ children }) {
  const [costCenter, setCostCenterState] = useState(() => {
    return parseInt(localStorage.getItem('costCenter') || '1', 10);
  });

  const setCostCenter = useCallback((val) => {
    const num = parseInt(val, 10);
    setCostCenterState(num);
    localStorage.setItem('costCenter', String(num));
    // Dispatch event so any open listeners can refresh their data
    window.dispatchEvent(new CustomEvent('cost-center-changed', { detail: { costCenter: num } }));
  }, []);

  // Helper to build a URL param string for the current cost center
  const ccParam = `cost_center=${costCenter}`;

  return (
    <CostCenterContext.Provider value={{ costCenter, setCostCenter, ccParam }}>
      {children}
    </CostCenterContext.Provider>
  );
}

export const useCostCenter = () => useContext(CostCenterContext);
