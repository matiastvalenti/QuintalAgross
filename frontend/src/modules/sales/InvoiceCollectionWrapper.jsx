import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useLocation } from 'react-router-dom';
import api from '../../services/api';
import LoadingScreen from '../../components/ui/LoadingScreen';
import { useToast } from '../../context/ToastContext';
import ReceiptCollectionForm from '../finance/ReceiptCollectionForm';

export default function InvoiceCollectionWrapper() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const isInvoiceRoute = location.pathname.includes('/factura/');
  const mode = searchParams.get('mode') || (isInvoiceRoute ? 'new' : 'view');

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const { showToast } = useToast();

  useEffect(() => {
    let mounted = true;
    if (id) {
      api.get(`/accounting/documents/${id}`)
        .then(res => {
          if (mounted) {
            setData(res);
            setLoading(false);
          }
        })
        .catch(err => {
          console.error(err);
          if (mounted) {
            showToast("Error al cargar datos", "error");
            setLoading(false);
          }
        });
    } else {
      setLoading(false);
    }
    return () => { mounted = false; };
  }, [id, showToast]);

  if (loading) return <LoadingScreen message="Cargando..." />;
  if (!data) return <div style={{ padding: 20 }}>No se encontraron datos.</div>;

  return (
    <ReceiptCollectionForm 
      mode={mode} 
      source="invoice" 
      initialData={isInvoiceRoute ? null : data} 
      initialInvoice={isInvoiceRoute ? data : null} 
    />
  );
}
