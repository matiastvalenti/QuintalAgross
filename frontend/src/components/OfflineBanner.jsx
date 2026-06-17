import React, { useState, useEffect } from 'react';

export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
};

export const OfflineBanner = () => {
  const isOnline = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div style={{
      backgroundColor: '#ef4444',
      color: 'white',
      padding: '8px',
      textAlign: 'center',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      fontWeight: 'bold',
      fontSize: '14px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
    }}>
      ⚠️ Sin conexión a Internet. La aplicación está operando en modo lectura o bloqueada hasta que regrese la conexión.
    </div>
  );
};
