import React, { useState } from "react";
import { X, DollarSign } from "lucide-react";
import Button from "../../../components/ui/Button";
import { useToast } from "../../../context/ToastContext";
import api from "../../../services/api";

export default function CommissionPaymentModal({ open, context, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState(context.original_currency);
  const [amount, setAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [notes, setNotes] = useState("");
  
  const { showToast } = useToast();

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      return showToast("Ingrese un monto válido", "error");
    }

    setLoading(true);
    try {
      await api.post("/commissions/pay", {
        seller_id: context.seller_id,
        document_ids: context.document_ids || [],
        currency: currency,
        amount: parseFloat(amount),
        exchange_rate: currency !== context.original_currency ? parseFloat(exchangeRate) : 1,
        payment_method: paymentMethod,
        notes: notes,
        original_currency: context.original_currency
      });
      showToast("Pago registrado correctamente", "success");
      onSuccess();
    } catch (err) {
      showToast(err.response?.data?.detail || "Error al registrar pago", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>Registrar Pago de Comisión</h2>
          <button onClick={onClose} className="modal-close"><X size={20} /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-body">
          <p style={{ marginBottom: '16px', fontSize: '14px', color: '#64748b' }}>
            Moneda original de la comisión: <strong>{context.original_currency}</strong>
            {context.document_ids && ` • Pagando ${context.document_ids.length} documento(s)`}
          </p>

          <div className="form-grid">
            <div className="form-group">
              <label>Moneda de Pago</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)}>
                <option value="ARS">Pesos (ARS)</option>
                <option value="USD">Dólares (USD)</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Monto</label>
              <div style={{ position: 'relative' }}>
                <DollarSign size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                <input 
                  type="number" 
                  step="0.01"
                  value={amount} 
                  onChange={e => setAmount(e.target.value)} 
                  style={{ paddingLeft: '32px' }}
                  required
                />
              </div>
            </div>

            {currency !== context.original_currency && (
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Tipo de Cambio Utilizado</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={exchangeRate} 
                  onChange={e => setExchangeRate(e.target.value)} 
                  required
                />
              </div>
            )}

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Método de Pago</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                <option value="CASH">Efectivo</option>
                <option value="TRANSFER">Transferencia</option>
                <option value="CHECK">Cheque</option>
                <option value="OTHER">Otro</option>
              </select>
            </div>
            
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Notas / Referencia</label>
              <input 
                type="text" 
                value={notes} 
                onChange={e => setNotes(e.target.value)} 
                placeholder="Ej. Transferencia Banco Nación #12345"
              />
            </div>
          </div>

          <div className="modal-footer" style={{ marginTop: '24px' }}>
            <Button variant="outline" type="button" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={loading}>Registrar Pago</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
