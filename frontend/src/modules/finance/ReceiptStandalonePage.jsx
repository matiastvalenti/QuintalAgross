import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useLocation } from 'react-router-dom';
import api from '../../services/api';
import LoadingScreen from '../../components/ui/LoadingScreen';
import { useToast } from '../../context/ToastContext';
import ReceiptCollectionForm from './ReceiptCollectionForm';
import ReceiptForm from './ReceiptForm';

export default function ReceiptStandalonePage() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const isPayment = pathname.startsWith('/standalone/pagos');
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || (id ? 'view' : 'new');
  
  const [loading, setLoading] = useState(!!id && !isPayment);
  const [receipt, setReceipt] = useState(null);
  const { showToast } = useToast();

  useEffect(() => {
    let mounted = true;
    if (id && !isPayment) {
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

  if (isPayment) return <ReceiptForm mode={mode} id={id} isPayment />;
  if (loading) return <LoadingScreen message="Cargando recibo..." />;

  return <ReceiptCollectionForm mode={mode} source="manual" initialData={receipt} />;
}
