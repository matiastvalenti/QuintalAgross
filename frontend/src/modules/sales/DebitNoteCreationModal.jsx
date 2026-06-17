import React, { useState, useEffect } from 'react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { ShoppingBag, Search, FileText } from 'lucide-react';
import api from '../../services/api';
import { openNuevaNotaDebito } from '../../utils/openStandaloneWindow';

export default function DebitNoteCreationModal({ open, onClose }) {
  const [step, setStep] = useState(1); 
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (open && step === 2) {
      fetchInvoices();
    } else if (!open) {
      setStep(1);
      setInvoices([]);
      setSearchTerm('');
      setError(null);
    }
  }, [open, step]);

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/accounting/documents/');
      const validInvoices = data.filter(doc => doc.doc_type === 'INVOICE' && doc.status !== 'CANCELLED');
      setInvoices(validInvoices);
    } catch (err) {
      console.error("Error fetching invoices:", err);
      setError("Error al cargar las facturas");
    } finally {
      setLoading(false);
    }
  };

  const handleManual = () => {
    openNuevaNotaDebito();
    onClose();
  };

  const handleSelectInvoice = (inv) => {
    openNuevaNotaDebito({ factura_id: inv.id });
    onClose();
  };

  const filteredInvoices = invoices.filter(inv => {
    const s = searchTerm.toLowerCase();
    const cust = (inv.entity_name || '').toLowerCase();
    const num = (inv.number || '').toLowerCase();
    return cust.includes(s) || num.includes(s);
  });

  return (
    <Modal open={open} onClose={onClose} title={step === 1 ? "Nueva Nota de Débito" : "Seleccionar Factura Origen"} width="800px">
      {step === 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', padding: '20px' }}>
          {/* Opción Manual */}
          <div 
            onClick={handleManual}
            style={{ 
              border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', 
              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', 
              transition: 'all 0.2s', backgroundColor: '#fff', textAlign: 'center'
            }}
            onMouseOver={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
            onMouseOut={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
          >
            <div style={{ width: '48px', height: '48px', borderRadius: '24px', backgroundColor: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <FileText size={24} />
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#0f172a' }}>Directa / Manual</h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Crea una nota de débito libre, sin vincular a una factura previa.</p>
          </div>

          {/* Opción Desde Factura */}
          <div 
            onClick={() => setStep(2)}
            style={{ 
              border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', 
              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', 
              transition: 'all 0.2s', backgroundColor: '#fff', textAlign: 'center'
            }}
            onMouseOver={(e) => e.currentTarget.style.borderColor = '#10b981'}
            onMouseOut={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
          >
            <div style={{ width: '48px', height: '48px', borderRadius: '24px', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <ShoppingBag size={24} />
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#0f172a' }}>Desde Factura Existente</h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Selecciona una Factura para generar la Nota de Débito asociada.</p>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '500px', backgroundColor: '#f8fafc' }}>
          {/* Header Búsqueda */}
          <div style={{ padding: '16px 20px', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input 
                type="text"
                placeholder="Buscar por cliente o número..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '10px 10px 10px 36px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
              />
            </div>
            <Button variant="secondary" onClick={() => setStep(1)}>Volver</Button>
          </div>

          {/* Listado */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: '#64748b' }}>Cargando facturas...</div>
            ) : error ? (
              <div style={{ color: '#ef4444', textAlign: 'center', padding: '20px' }}>{error}</div>
            ) : filteredInvoices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No se encontraron facturas.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredInvoices.map(inv => (
                  <div 
                    key={inv.id}
                    onClick={() => handleSelectInvoice(inv)}
                    style={{
                      backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                      transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = '#cbd5e1';
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>{inv.entity_name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                        <span>FC {inv.number}</span>
                        <span>•</span>
                        <span>{new Date(inv.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>$ {inv.total_amount?.toLocaleString()}</div>
                      <div style={{ fontSize: '12px', color: '#10b981', fontWeight: 600 }}>{inv.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
