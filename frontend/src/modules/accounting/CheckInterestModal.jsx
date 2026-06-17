import React, { useState, useEffect } from "react";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { useToast } from "../../context/ToastContext";
import { API_URL } from "../../config";
import t from "../../components/ui/Table.module.css";
import { AlertCircle, FilePlus, Loader2 } from "lucide-react";

export default function CheckInterestModal({ receiptId, onClose, onConfirmed }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [monthlyRate, setMonthlyRate] = useState(8.5); // Sugerido inicial
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");

  const fetchPreview = async (rate) => {
    try {
      setLoading(true);
      // Necesitamos los cheques del recibo. 
      // Podríamos pasarlos por props, pero mejor consultamos al backend por el recibo completo.
      const resDoc = await fetch(`${API_URL}/accounting/documents/${receiptId}`);
      if (!resDoc.ok) throw new Error("No se pudo cargar el recibo");
      const doc = await resDoc.json();
      
      const res = await fetch(`${API_URL}/financial-automation/interest/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receipt_date: doc.date,
          checks: doc.payments?.filter(p => p.type === "CHECK") || [],
          monthly_rate: rate
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch (e) {
      showToast("Error al calcular intereses", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (receiptId) fetchPreview(monthlyRate);
  }, [receiptId]);

  const handleConfirm = async () => {
    if (!data || data.total_interest <= 0) return;
    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/financial-automation/interest/generate-dn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receipt_id: receiptId,
          monthly_rate: monthlyRate,
          interest_amount: data.total_interest,
          notes: notes
        }),
      });
      if (res.ok) {
        showToast("Nota de Débito por intereses generada", "success");
        onConfirmed();
      } else {
        const err = await res.json();
        showToast(err.detail || "Error al generar ND", "error");
      }
    } catch (e) {
      showToast("Error de conexión", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return null;

  const hasFutureChecks = data?.items?.some(i => i.days > 0);

  return (
    <Modal open={!!receiptId} onClose={onClose} title="Intereses por Cheques Diferidos" wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        {!hasFutureChecks ? (
          <div style={{ textAlign: 'center', padding: 40, opacity: 0.6 }}>
            <AlertCircle size={48} style={{ marginBottom: 16 }} />
            <p>No se detectaron cheques con vencimiento posterior a la fecha del recibo.</p>
            <Button onClick={onClose} style={{ marginTop: 20 }}>Cerrar</Button>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, background: '#f8fafc', padding: 16, borderRadius: 8 }}>
              <Input 
                label="Tasa Mensual (%)" 
                type="number" 
                value={monthlyRate} 
                onChange={(e) => setMonthlyRate(Number(e.target.value))}
                onBlur={() => fetchPreview(monthlyRate)}
              />
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>TOTAL INTERESES SUGERIDOS</span>
                <span style={{ fontSize: 24, fontWeight: 'bold', color: '#2563eb' }}>
                  {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(data.total_interest)}
                </span>
              </div>
            </div>

            <table className={t.table}>
              <thead>
                <tr>
                  <th>Cheque N°</th>
                  <th>Vencimiento</th>
                  <th style={{ textAlign: 'right' }}>Importe</th>
                  <th style={{ textAlign: 'right' }}>Días</th>
                  <th style={{ textAlign: 'right' }}>Interés</th>
                </tr>
              </thead>
              <tbody>
                {data.items.filter(i => i.days > 0).map((i, idx) => (
                  <tr key={idx}>
                    <td>{i.reference_number}</td>
                    <td>{new Date(i.due_date).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'right' }}>{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(i.amount)}</td>
                    <td style={{ textAlign: 'right' }}>{i.days}</td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(i.interest_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Input 
                label="Observaciones para la ND" 
                value={notes} 
                onChange={e => setNotes(e.target.value)}
                placeholder="Ej: Intereses financieros..."
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
              <Button variant="outline" onClick={onClose} disabled={saving}>No generar</Button>
              <Button 
                onClick={handleConfirm} 
                disabled={saving || data.total_interest <= 0}
                style={{ background: '#2563eb', color: 'white' }}
              >
                {saving ? <Loader2 className="animate-spin" size={18} /> : <FilePlus size={18} style={{ marginRight: 8 }} />}
                Generar Nota de Débito
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
