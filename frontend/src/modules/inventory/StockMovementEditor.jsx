import { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import t from '../../components/ui/Table.module.css';
import { Package, Plus, Trash2, Save, X, Search, ArrowRight, Printer, Copy, Ban, Edit3 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { API_URL } from '../../config';

export default function StockMovementEditor({ movementId = null, initialType = 'ADJUSTMENT', onSave, onCancel }) {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [catalogs, setCatalogs] = useState({ products: [], warehouses: [] });
    
    const [header, setHeader] = useState({
        number: '',
        date: new Date().toISOString().split('T')[0],
        movement_type: initialType,
        from_warehouse_id: '',
        to_warehouse_id: '',
        transporter: '',
        driver: '',
        cost_center: localStorage.getItem('costCenter') || '1',
        notes: '',
        status: 'DRAFT'
    });

    const [lines, setLines] = useState([]);
    const [newLine, setNewLine] = useState({
        product_id: '',
        qty: '',
        batch: '',
        expiry_date: '',
        container_qty: '',
        container_type: '',
        notes: ''
    });

    useEffect(() => {
        fetchCatalogs();
        if (movementId) fetchMovement(movementId);
    }, [movementId]);

    const fetchCatalogs = async () => {
        try {
            const [products, warehouses] = await Promise.all([
                api.get('/inventory/products/'),
                api.get('/inventory/warehouses/')
            ]);
            setCatalogs({ products, warehouses });
        } catch (e) {
            console.error(e);
        }
    };

    const fetchMovement = async (id) => {
        setLoading(true);
        try {
            const data = await api.get(`/inventory/stock/movements/${id}`);
            setHeader(data);
            setLines(data.lines);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const addLine = () => {
        if (!newLine.product_id || !newLine.qty) {
            showToast("Seleccione producto y cantidad", "error");
            return;
        }
        const product = catalogs.products.find(p => p.id === newLine.product_id);
        const line = {
            ...newLine,
            id: Date.now().toString(),
            product_name: product?.name || '?',
            sku: product?.sku || ''
        };
        setLines([...lines, line]);
        setNewLine({
            product_id: '',
            qty: '',
            batch: '',
            expiry_date: '',
            container_qty: '',
            container_type: '',
            notes: ''
        });
    };

    const removeLine = (id) => {
        setLines(lines.filter(l => l.id !== id));
    };

    const handleSave = async () => {
        if (lines.length === 0) {
            showToast("Debe agregar al menos un ítem", "error");
            return;
        }
        
        setLoading(true);
        try {
            await api.post(`/inventory/stock/movements`, { ...header, lines });
            showToast("Movimiento registrado", "success");
            onSave();
        } catch (e) {
            console.error(e);
            showToast(e.message || "Error al guardar", "error");
        } finally {
            setLoading(false);
        }
    };

    if (loading && movementId) return <div style={{ padding: 40, textAlign: 'center' }}>Cargando datos...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
            {/* Header Section as in Screenshot */}
            <Card title="Detalle del movimiento" noPad>
                <div style={{ padding: '16px 24px', background: 'var(--panel-2)' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 16 }}>
                        <Button variant="primary" size="sm" icon={<Plus size={14}/>}>Agregar</Button>
                        <Button variant="secondary" size="sm" icon={<Edit3 size={14}/>}>Editar</Button>
                        <Button variant="danger" size="sm" icon={<Ban size={14}/>}>Anular</Button>
                        <Button variant="secondary" size="sm" icon={<Copy size={14}/>}>Copiar</Button>
                        <Button variant="secondary" size="sm" icon={<Printer size={14}/>}>Imprimir</Button>
                    </div>

                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(6, 1fr)', 
                        gap: '12px 16px',
                        fontSize: 'var(--text-xs)'
                    }}>
                        <div style={{ gridColumn: 'span 1' }}>
                            <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: 4 }}>Número</label>
                            <input 
                                className="mov-input"
                                value={header.number}
                                onChange={e => setHeader({...header, number: e.target.value})}
                                style={inputStyle}
                                placeholder="0"
                            />
                        </div>
                        <div style={{ gridColumn: 'span 1' }}>
                            <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: 4 }}>Fecha</label>
                            <input 
                                type="date"
                                className="mov-input"
                                value={header.date?.split('T')[0]}
                                onChange={e => setHeader({...header, date: e.target.value})}
                                style={inputStyle}
                            />
                        </div>
                        <div style={{ gridColumn: 'span 1' }}>
                            <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: 4 }}>Ctro. Costo</label>
                            <input 
                                className="mov-input"
                                value={header.cost_center}
                                onChange={e => setHeader({...header, cost_center: e.target.value})}
                                style={inputStyle}
                            />
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: 4 }}>Deposito Origen:</label>
                            <Select 
                                value={header.from_warehouse_id}
                                onChange={e => setHeader({...header, from_warehouse_id: e.target.value})}
                                style={selectStyle}
                            >
                                <option value="">Seleccione...</option>
                                {catalogs.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </Select>
                        </div>
                        <div style={{ gridColumn: 'span 1' }}>
                            <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: 4 }}>N° Movimiento</label>
                            <input style={inputStyle} disabled value="00000468" />
                        </div>

                        {/* Line 2 */}
                        <div style={{ gridColumn: 'span 1' }}>
                            <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: 4 }}>Transportista</label>
                            <input 
                                style={inputStyle}
                                value={header.transporter}
                                onChange={e => setHeader({...header, transporter: e.target.value})}
                            />
                        </div>
                        <div style={{ gridColumn: 'span 1' }}>
                            <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: 4 }}>Chofer</label>
                            <input 
                                style={inputStyle}
                                value={header.driver}
                                onChange={e => setHeader({...header, driver: e.target.value})}
                            />
                        </div>
                        <div style={{ gridColumn: 'span 1' }}>
                             <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: 4 }}>Tipo</label>
                             <Select 
                                value={header.movement_type}
                                onChange={e => setHeader({...header, movement_type: e.target.value})}
                                style={selectStyle}
                             >
                                <option value="ADJUSTMENT">Ajuste</option>
                                <option value="TRANSFER">Transferencia</option>
                                <option value="INGRESS">Ingreso</option>
                                <option value="EGRESS">Egreso</option>
                             </Select>
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: 4 }}>Deposito Destino:</label>
                            <Select 
                                value={header.to_warehouse_id}
                                onChange={e => setHeader({...header, to_warehouse_id: e.target.value})}
                                style={selectStyle}
                            >
                                <option value="">Seleccione...</option>
                                {catalogs.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </Select>
                        </div>
                        <div style={{ gridColumn: 'span 1' }}></div>
                        
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: 4 }}>Observación:</label>
                            <input 
                                style={{ ...inputStyle, width: '100%' }}
                                value={header.notes}
                                onChange={e => setHeader({...header, notes: e.target.value})}
                            />
                        </div>
                    </div>
                </div>
            </Card>

            {/* Items Table */}
            <Card title="Items" noPad style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <table className={t.table} style={{ borderCollapse: 'collapse' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--panel-bg)'}}>
                            <tr style={{ fontSize: 'var(--text-xs)' }}>
                                <th style={{ width: '40%' }}>Artículo</th>
                                <th>Lote</th>
                                <th>Vencimiento</th>
                                <th style={{ textAlign: 'right' }}>Cant. Cont.</th>
                                <th>Contenedor</th>
                                <th style={{ textAlign: 'right' }}>Cant. Total</th>
                                <th style={{ width: 40 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map(line => (
                                <tr key={line.id} style={{ fontSize: 'var(--text-xs)' }}>
                                    <td>{line.product_name} {line.sku ? `(${line.sku})` : ''}</td>
                                    <td>{line.batch || '-'}</td>
                                    <td>{line.expiry_date ? new Date(line.expiry_date).toLocaleDateString() : '00/00/0000'}</td>
                                    <td style={{ textAlign: 'right' }}>{line.container_qty || '-'}</td>
                                    <td>{line.container_type || '-'}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{line.qty}</td>
                                    <td>
                                        <Button variant="ghost" size="sm" onClick={() => removeLine(line.id)} style={{ padding: 2, color: 'var(--error)' }}>
                                            <Trash2 size={12} />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {/* New Line Input Row */}
                            <tr style={{ background: 'var(--panel-2)' }}>
                                <td>
                                    <select 
                                        value={newLine.product_id}
                                        onChange={e => setNewLine({...newLine, product_id: e.target.value})}
                                        style={tableInputStyle}
                                    >
                                        <option value="">Producto...</option>
                                        {catalogs.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </td>
                                <td>
                                    <input 
                                        placeholder="Lote"
                                        value={newLine.batch}
                                        onChange={e => setNewLine({...newLine, batch: e.target.value})}
                                        style={tableInputStyle}
                                    />
                                </td>
                                <td>
                                    <input 
                                        type="date"
                                        value={newLine.expiry_date}
                                        onChange={e => setNewLine({...newLine, expiry_date: e.target.value})}
                                        style={tableInputStyle}
                                    />
                                </td>
                                <td>
                                    <input 
                                        type="number"
                                        placeholder="0.00"
                                        value={newLine.container_qty}
                                        onChange={e => setNewLine({...newLine, container_qty: e.target.value})}
                                        style={{...tableInputStyle, textAlign: 'right'}}
                                    />
                                </td>
                                <td>
                                    <input 
                                        placeholder="Envase"
                                        value={newLine.container_type}
                                        onChange={e => setNewLine({...newLine, container_type: e.target.value})}
                                        style={tableInputStyle}
                                    />
                                </td>
                                <td>
                                    <input 
                                        type="number"
                                        placeholder="Cant"
                                        value={newLine.qty}
                                        onChange={e => setNewLine({...newLine, qty: e.target.value})}
                                        style={{...tableInputStyle, textAlign: 'right', fontWeight: 600}}
                                    />
                                </td>
                                <td>
                                    <Button variant="primary" size="sm" onClick={addLine} style={{ padding: 4 }}>
                                        <Plus size={14} />
                                    </Button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--panel-bg)'}}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Total de registros: {lines.length}</div>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
                        <Button variant="primary" onClick={handleSave} loading={loading}>Guardar Movimiento</Button>
                    </div>
                </div>
            </Card>
        </div>
    );
}

const inputStyle = {
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid var(--border-light)',
    fontSize: 'var(--text-sm)',
    outline: 'none',
    width: '100%',
    background: 'white'
};

const selectStyle = {
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid var(--border-light)',
    fontSize: 'var(--text-sm)',
    outline: 'none',
    width: '100%',
    background: 'white'
};

const tableInputStyle = {
    width: '100%',
    border: 'none',
    background: 'transparent',
    padding: '4px',
    fontSize: 'var(--text-xs)',
    outline: 'none'
};
