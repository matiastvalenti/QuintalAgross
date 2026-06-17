import React from 'react';
import { Construction } from 'lucide-react';

export default function PlaceholderPage({ title }) {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100%',
      color: '#64748b'
    }}>
      <Construction size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#1e293b' }}>
        {title || 'En Construcción'}
      </h2>
      <p style={{ marginTop: 8, fontSize: 14 }}>
        Estamos trabajando en esta sección.
      </p>
    </div>
  );
}
