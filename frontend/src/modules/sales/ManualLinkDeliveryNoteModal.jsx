import React, { useState, useEffect } from 'react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { API_URL } from '../../config';
import { useToast } from '../../context/ToastContext';
import { Link2, X, Check, AlertCircle, ChevronDown, ChevronUp, Package, Truck } from 'lucide-react';

export default function ManualLinkDeliveryNoteModal({ open, onClose, orderId, entityId, orderLines, onLinked }) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deliveryNotes, setDeliveryNotes] = useState([]);
    const [expandedDN, setExpandedDN] = useState(null);
    // matches: { key: `${dn_line_id}__${ov_line_id}`, dn_line_id, ov_line_id, qty, maxQty, dnNumber, productName }
    const [matches, setMatches] = useState([]);
    const { showToast } = useToast();

    useEffect(() => {
        if (open && entityId) {
            fetchPendingDeliveryNotes();
        } else {
            setDeliveryNotes([]);
            setExpandedDN(null);
            setMatches([]);
        }
    }, [open, entityId]);

    const fetchPendingDeliveryNotes = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_URL}/sales/delivery-notes/pending-link?entity_id=${entityId}${orderId ? `&sales_order_id=${orderId}` : ""}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setDeliveryNotes(data);
                // Auto-expand first DN
                if (data.length === 1) setExpandedDN(data[0].id);
            }
        } catch (error) {
            console.error("Error fetching pending delivery notes:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleUnlinkLive = async (dnLine, ovLineId) => {
        if (!window.confirm(`¿Seguro que querés descruzar este ítem de la Orden de Venta?`)) return;
        setSaving(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_URL}/sales/delivery-notes/adjust-link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    line_id: dnLine.id,
                    new_qty: 0,
                    source_sales_line_id: ovLineId
                })
            });
            if (res.ok) {
                showToast("Ítem descruzado correctamente", "success");
                fetchPendingDeliveryNotes();
                onLinked(); // Actualiza la OV del fondo
            } else {
                showToast("Error al descruzar", "error");
            }
        } catch {
            showToast("Error de conexión", "error");
        } finally {
            setSaving(false);
        }
    };

    const toggleMatch = (dnLine, dn, ovLine) => {
        const key = `${dnLine.id}__${ovLine.id}`;
        const existing = matches.find(m => m.key === key);
        if (existing) {
            setMatches(matches.filter(m => m.key !== key));
        } else {
            setMatches([...matches, {
                key,
                dn_line_id: dnLine.id,
                ov_line_id: ovLine.id,
                qty: dnLine.qty,
                maxQty: dnLine.qty,
                dnNumber: dn.number,
                productName: dnLine.product?.name || dnLine.description
            }]);
        }
    };

    const updateQty = (key, qty) => {
        setMatches(matches.map(m => m.key === key ? { ...m, qty: parseFloat(qty) || 0 } : m));
    };

    const handleConfirm = async () => {
        if (matches.length === 0) return;
        setSaving(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_URL}/sales/sales-orders/${orderId}/manual-link-remito`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    matches: matches.map(({ dn_line_id, ov_line_id, qty }) => ({ dn_line_id, ov_line_id, qty }))
                })
            });

            if (res.ok) {
                showToast(`${matches.length} vínculo(s) creado(s) correctamente`, "success");
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

    // For each OV line, find which DN lines match by product
    const getMatchesForOVLine = (ovLineId) => matches.filter(m => m.ov_line_id === ovLineId);

    return (
        <Modal open={open} onClose={onClose} title="Vincular Remito a Orden de Venta" wide>
            <div style={{ padding: '0 4px 4px' }}>

                {/* Header instruction */}
                <div style={{ padding: '0 20px 16px', display: 'flex', alignItems: 'center', gap: 10, color: '#64748b', fontSize: 12 }}>
                    <AlertCircle size={14} />
                    Expandí cada remito para ver sus ítems y cruzarlos con las líneas de esta OV o descruzar los existentes.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 0, minHeight: 320, borderTop: '1px solid #f1f5f9' }}>

                    {/* LEFT: OV Lines summary */}
                    <div style={{ borderRight: '1px solid #f1f5f9', padding: '16px 20px', overflowY: 'auto', maxHeight: 500 }}>
                        <div style={{ fontSize: 10, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                            Ítems de la Orden de Venta
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {orderLines.map(ovl => {
                                const linked = getMatchesForOVLine(ovl.id);
                                return (
                                    <div key={ovl.id} style={{
                                        padding: '10px 14px',
                                        borderRadius: 12,
                                        border: `1.5px solid ${linked.length > 0 ? '#bbf7d0' : '#e2e8f0'}`,
                                        background: linked.length > 0 ? '#f0fdf4' : '#f8fafc',
                                        transition: 'all 0.2s'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>
                                                    {ovl.product?.name || ovl.description || 'Sin descripción'}
                                                </div>
                                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                                    Pedido: <b style={{ color: '#475569' }}>{ovl.qty}</b> u.
                                                </div>
                                            </div>
                                            {linked.length > 0 && (
                                                <div style={{ background: '#dcfce7', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 800, color: '#15803d', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                                                    <Check size={10} />
                                                    {linked.reduce((s, m) => s + m.qty, 0)} u.
                                                </div>
                                            )}
                                        </div>
                                        {linked.map(m => (
                                            <div key={m.key} style={{ marginTop: 6, fontSize: 10, color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <Truck size={10} />
                                                Remito #{m.dnNumber} — {m.qty} u.
                                                <button
                                                    onClick={() => setMatches(matches.filter(x => x.key !== m.key))}
                                                    style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}
                                                >
                                                    <X size={11} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* RIGHT: Available Delivery Notes */}
                    <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 500 }}>
                        <div style={{ fontSize: 10, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                            Remitos disponibles / vinculados
                        </div>

                        {loading ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Buscando remitos...</div>
                        ) : deliveryNotes.length === 0 ? (
                            <div style={{ padding: 30, textAlign: 'center', border: '1.5px dashed #e2e8f0', borderRadius: 12 }}>
                                <Package size={28} color="#cbd5e1" style={{ marginBottom: 10 }} />
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>Sin remitos pendientes</div>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>No hay remitos sin vincular para este cliente.</div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {deliveryNotes.map(dn => {
                                    const isExpanded = expandedDN === dn.id;
                                    const linkedCount = matches.filter(m => dn.lines.some(l => l.id === m.dn_line_id)).length;

                                    return (
                                        <div key={dn.id} style={{
                                            border: `1.5px solid ${isExpanded ? '#24389c' : linkedCount > 0 ? '#bbf7d0' : '#e2e8f0'}`,
                                            borderRadius: 14,
                                            overflow: 'hidden',
                                            transition: 'border-color 0.2s'
                                        }}>
                                            {/* DN Header */}
                                            <button
                                                onClick={() => setExpandedDN(isExpanded ? null : dn.id)}
                                                style={{
                                                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '12px 16px', background: isExpanded ? '#eff3ff' : '#f8fafc',
                                                    border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.2s'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div style={{
                                                        width: 32, height: 32, borderRadius: 8,
                                                        background: isExpanded ? '#24389c' : '#e2e8f0',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        transition: 'all 0.2s'
                                                    }}>
                                                        <Truck size={16} color={isExpanded ? '#fff' : '#94a3b8'} />
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: 13, fontWeight: 800, color: isExpanded ? '#24389c' : '#1e293b' }}>
                                                            #{dn.number}
                                                        </div>
                                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                                            {new Date(dn.date).toLocaleDateString('es-AR')} · {dn.lines.length} ítem{dn.lines.length !== 1 ? 's' : ''}
                                                            {linkedCount > 0 && <span style={{ margin: '0 0 0 8px', color: '#059669', fontWeight: 800 }}>· {linkedCount} cruzado{linkedCount !== 1 ? 's' : ''}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                {isExpanded ? <ChevronUp size={16} color="#24389c" /> : <ChevronDown size={16} color="#94a3b8" />}
                                            </button>

                                            {/* DN Lines (expanded) */}
                                            {isExpanded && (
                                                <div style={{ background: '#fff', borderTop: '1px solid #e2e8f0' }}>
                                                    {dn.lines.map((dnLine, idx) => {
                                                        const isAlreadyLinked = !!dnLine.source_sales_line_id;
                                                        const productName = dnLine.product?.name || dnLine.description || 'Sin descripción';

                                                        return (
                                                            <div key={dnLine.id} style={{
                                                                padding: '12px 16px',
                                                                borderBottom: idx < dn.lines.length - 1 ? '1px solid #f1f5f9' : 'none',
                                                                background: isAlreadyLinked ? '#fafafa' : '#fff'
                                                            }}>
                                                                {/* Line info */}
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                                    <div>
                                                                        <div style={{ fontSize: 13, fontWeight: 700, color: isAlreadyLinked ? '#24389c' : '#1e293b' }}>
                                                                            {productName}
                                                                            {isAlreadyLinked && (
                                                                                <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 900, color: '#24389c', background: '#eff3ff', padding: '1px 7px', borderRadius: 20, border: '1px solid #dbeafe' }}>
                                                                                    Ya vinculado a esta OV
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                                                            Cantidad en remito: <b style={{ color: '#475569' }}>{dnLine.qty}</b> u.
                                                                        </div>
                                                                    </div>
                                                                    {isAlreadyLinked && (
                                                                        <button
                                                                            onClick={() => handleUnlinkLive(dnLine, dnLine.source_sales_line_id)}
                                                                            style={{ background: '#fee2e2', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 10, fontWeight: 800, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}
                                                                        >
                                                                            <X size={12} /> DESCRUZAR
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {/* OV Line matching buttons */}
                                                                {!isAlreadyLinked && (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                        {orderLines.length === 0 ? (
                                                                            <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>La OV no tiene ítems.</div>
                                                                        ) : (
                                                                            <>
                                                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 2 }}>
                                                                                    Cruzar con ítem de la OV:
                                                                                </div>
                                                                                {orderLines.map(ovl => {
                                                                                    const key = `${dnLine.id}__${ovl.id}`;
                                                                                    const matchEntry = matches.find(m => m.key === key);
                                                                                    const isSelected = !!matchEntry;
                                                                                    const isSameProduct = ovl.product_id === dnLine.product_id;

                                                                                    return (
                                                                                        <div key={ovl.id} style={{
                                                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                                                            padding: '8px 12px',
                                                                                            borderRadius: 10,
                                                                                            border: `1.5px solid ${isSelected ? '#24389c' : isSameProduct ? '#bfdbfe' : '#e2e8f0'}`,
                                                                                            background: isSelected ? '#eff3ff' : isSameProduct ? '#f0f9ff' : '#f8fafc',
                                                                                            transition: 'all 0.15s',
                                                                                            cursor: 'pointer',
                                                                                            opacity: (isSelected || isSameProduct) ? 1 : 0.6
                                                                                        }}
                                                                                            onClick={() => !isSelected && toggleMatch(dnLine, dn, ovl)}
                                                                                        >
                                                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                                                <div style={{ fontSize: 11, fontWeight: 700, color: isSelected ? '#24389c' : '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                                    {ovl.product?.name || ovl.description || 'Sin descripción'}
                                                                                                    {isSameProduct && !isSelected && (
                                                                                                        <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: '#3b82f6', background: '#dbeafe', padding: '1px 6px', borderRadius: 20 }}>
                                                                                                            Sugerido
                                                                                                        </span>
                                                                                                    )}
                                                                                                </div>
                                                                                                <div style={{ fontSize: 10, color: '#94a3b8' }}>
                                                                                                    Pendiente: <b style={{ color: '#64748b' }}>{ovl.qty - (ovl.qty_delivered || 0)}</b> u.
                                                                                                </div>
                                                                                            </div>
                                                                                            
                                                                                            {isSelected ? (
                                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                                                    <input 
                                                                                                        type="number"
                                                                                                        value={matchEntry.qty}
                                                                                                        onChange={(e) => updateQty(key, e.target.value)}
                                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                                        style={{ width: 60, height: 26, borderRadius: 6, border: '1px solid #24389c', textAlign: 'center', fontSize: 11, fontWeight: 800 }}
                                                                                                    />
                                                                                                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#24389c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                                                        <Check size={12} />
                                                                                                    </div>
                                                                                                </div>
                                                                                            ) : (
                                                                                                <Link2 size={14} color={isSameProduct ? '#3b82f6' : '#cbd5e1'} />
                                                                                            )}
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Actions */}
                <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 13 }}>
                        <b>{matches.length}</b> cruce(s) pendiente(s) de confirmar.
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
                        <Button 
                            onClick={handleConfirm} 
                            disabled={matches.length === 0 || saving}
                            loading={saving}
                        >
                            Confirmar Cruces
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
