import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import LoadingScreen from '../../components/ui/LoadingScreen';
import { useToast } from '../../context/ToastContext';
import ReceiptCollectionForm from './ReceiptCollectionForm';

export default function ReceiptStandalonePage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || (id ? 'view' : 'new');
  
  const [loading, setLoading] = useState(!!id);
  const [receipt, setReceipt] = useState(null);
  const { showToast } = useToast();

  useEffect(() => {
    let mounted = true;
    if (id) {
      api.get(`/accounting/documents/${id}`)
        .then(res => {
          if (mounted) {
            setReceipt(res);
            setLoading(false);
          }
        })
        .catch(err => {
          console.error(err);
          if (mounted) {
            showToast("Error al cargar el recibo", "error");
            setLoading(false);
          }
        });
    } else {
      setLoading(false);
    }
    return () => { mounted = false; };
  }, [id, showToast]);

  if (loading) return <LoadingScreen message="Cargando recibo..." />;

  // En el futuro si es un pago (proveedor), se puede derivar a otro formulario aquí.
  // Por ahora asume recibo manual (cliente).
  return <ReceiptCollectionForm mode={mode} source="manual" initialData={receipt} />;
}
