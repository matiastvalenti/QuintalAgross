import React, { useState, useEffect } from 'react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { API_URL } from '../../config';
import { useToast } from '../../context/ToastContext';
import { Link2, X, Check, AlertCircle, Receipt, FileText } from 'lucide-react';
import { TraceabilityStatusBadge } from '../../components/ui/TraceabilityStatusBadge';

export default function ManualLinkInvoiceModal({ open, onClose, orderId, entityId, onLinked }) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [availableDocs, setAvailableDocs] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const { showToast } = useToast();

    const fmt = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val || 0);

    useEffect(() => {
        if (open && entityId) {
            fetchPendingDocs();
        } else {
            setAvailableDocs([]);
            setSelectedIds([]);
        }
    }, [open, entityId]);

    const fetchPendingDocs = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            // Buscamos facturas que no tengan origin_reference o que el usuario quiera vincular
            const res = await fetch(`${API_URL}/accounting/documents?entity_id=${entityId}&doc_types=INVOICE,DEBIT_NOTE&limit=50`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                // Solo mostrar las que NO están vinculadas a esta OV ya (opcional)
                setAvailableDocs(data.filter(d => d.origin_reference !== orderId));
            }
        } catch (error) {
            console.error("Error fetching docs:", error);
        } finally {
            setLoading(false);
        }
    };

    const toggleSelection = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(x => x !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleConfirm = async () => {
        if (selectedIds.length === 0) return;
        setSaving(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_URL}/sales/sales-orders/${orderId}/manual-link-invoice`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    matches: selectedIds.map(id => ({ dn_line_id: id, ov_line_id: "CABECERA", qty: 0 }))
                })
            });

            if (res.ok) {
                showToast("Documentos vinculados correctamente", "success");
                onLinked();
                onClose();
            } else {
                const err = await res.json();
                showToast(err.detail || "Error al vincular", "error");
            }
        } catch {
            showToast("Error de conexión", "error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="Vincular Factura / Pago existente" wide>
            <div style={{ padding: '0 4px 4px' }}>
                <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10, color: '#64748b', fontSize: 12 }}>
                    <AlertCircle size={14} />
                    Seleccioná los comprobantes ya cargados que corresponden a esta Orden de Venta.
                </div>

                <div style={{ maxHeight: 400, overflowY: 'auto', padding: 20 }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Buscando comprobantes...</div>
                    ) : availableDocs.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 16 }}>
                            No se encontraron facturas pendientes para este cliente.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {availableDocs.map(doc => (
                                <div 
                                    key={doc.id} 
                                    onClick={() => toggleSelection(doc.id)}
                                    style={{
                                        padding: '12px 16px',
                                        borderRadius: 14,
                                        border: `2px solid ${selectedIds.includes(doc.id) ? '#24389c' : '#f1f5f9'}`,
                                        background: selectedIds.includes(doc.id) ? '#eff3ff' : '#fff',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 16,
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                                        <FileText size={20} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{doc.doc_type} #{doc.number}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(doc.date).toLocaleDateString()} · {doc.entity_name}</div>
                                    </div>
                                    <div style={{ textAlign: 'right', marginRight: 16 }}>
                                        <div style={{ fontSize: 14, fontWeight: 900, color: '#24389c' }}>{fmt(doc.total_amount)}</div>
                                        <TraceabilityStatusBadge status={doc.status} />
                                    </div>
                                    <div style={{ width: 24, height: 24, borderRadius: 6, border: '2px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: selectedIds.includes(doc.id) ? '#24389c' : 'transparent', borderColor: selectedIds.includes(doc.id) ? '#24389c' : '#cbd5e1' }}>
                                        {selectedIds.includes(doc.id) && <Check size={16} color="#fff" />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                        {selectedIds.length} documento(s) seleccionado(s)
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <Button variant="outline" onClick={onClose}>Cancelar</Button>
                        <Button onClick={handleConfirm} disabled={selectedIds.length === 0 || saving} loading={saving}>
                            Vincular Seleccionados
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
