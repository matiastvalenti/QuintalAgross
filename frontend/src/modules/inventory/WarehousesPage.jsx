import { useState, useEffect } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import AccountSelector from '../../components/ui/AccountSelector';
import t from '../../components/ui/Table.module.css';
import { Package, MapPin, Building2, Plus, Edit2, Trash2, Eye, Search } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import TableSkeleton from '../../components/ui/TableSkeleton';
import EmptyState from '../../components/ui/EmptyState';

export default function WarehousesPage() {
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [editingWarehouse, setEditingWarehouse] = useState(null);
    const [formData, setFormData] = useState({ 
        name: '', 
        code: '', 
        address: '', 
        active: true,
        ownership: 'PROPIO',
        low_stock_control: 'WARNING',
        no_stock_control: 'STRICT',
        account_code: ''
    });
    
    // Stock View State
    const [selectedStockWh, setSelectedStockWh] = useState(null);
    const [stockItems, setStockItems] = useState([]);
    const [loadingStock, setLoadingStock] = useState(false);

    useEffect(() => {
        fetchWarehouses();
    }, []);

    const fetchWarehouses = async () => {
        setLoading(true);
        try {
            const data = await api.get('/inventory/warehouses/');
            setWarehouses(data);
        } catch (e) {
            console.error("Error fetching warehouses", e);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (wh = null) => {
        if (wh) {
            setFormData({ 
                name: wh.name, 
                code: wh.code || '', 
                address: wh.address || '', 
                active: wh.active,
                ownership: wh.ownership || 'PROPIO',
                low_stock_control: wh.low_stock_control || 'WARNING',
                no_stock_control: wh.no_stock_control || 'STRICT',
                account_code: wh.account_code || ''
            });
        } else {
            setEditingWarehouse(null);
            setFormData({ 
                name: '', 
                code: '', 
                address: '', 
                active: true,
                ownership: 'PROPIO',
                low_stock_control: 'WARNING',
                no_stock_control: 'STRICT',
                account_code: ''
            });
        }
        setIsEditing(true);
        setSelectedStockWh(null); // Close stock view when editing
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        try {
            if (editingWarehouse) {
                await api.put(`/inventory/warehouses/${editingWarehouse.id}`, formData);
                showToast("Depósito actualizado", "success");
            } else {
                await api.post('/inventory/warehouses/', formData);
                showToast("Depósito creado", "success");
            }
            setIsEditing(false);
            fetchWarehouses();
        } catch (e) {
            console.error(e);
            showToast("Error al guardar", "error");
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("¿Está seguro de eliminar este depósito?")) return;
        try {
            await api.delete(`/inventory/warehouses/${id}`);
            fetchWarehouses();
            showToast("Depósito eliminado", "success");
        } catch (e) {
            console.error(e);
            showToast("Error al eliminar", "error");
        }
    };

    const viewStock = async (wh) => {
        setSelectedStockWh(wh);
        setIsEditing(false); // Close editor when viewing stock
        setLoadingStock(true);
        try {
            const data = await api.get(`/inventory/warehouses/${wh.id}/stock`);
            setStockItems(data);
        } catch (e) {
            console.error(e);
            showToast("Error al cargar stock", "error");
        } finally {
            setLoadingStock(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-page)', overflow: 'hidden' }}>
            {!(isEditing || selectedStockWh) && (
                <div style={{ padding: '16px 20px 0 20px' }}>
                    <ContentHeader 
                        title="Gestión de Depósitos" 
                        breadcrumbs={[{label: 'Configuración'}, {label: 'Depósitos'}]}
                        actions={<Button onClick={() => handleOpenModal()} icon={<Plus size={18}/>}>Nuevo Depósito</Button>}
                    />
                </div>
            )}

            <div style={{ 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                gap: (isEditing || selectedStockWh) ? 8 : 12, 
                padding: (isEditing || selectedStockWh) ? '8px 20px 20px 20px' : '12px 20px 20px 20px',
                overflow: 'hidden'
            }}>
                {/* Warehouses List Section */}
                <div style={{ 
                    flex: (isEditing || selectedStockWh) ? '0 0 auto' : '1', 
                    height: (isEditing || selectedStockWh) ? '100px' : 'auto',
                    minHeight: (isEditing || selectedStockWh) ? '100px' : 'none',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <Card noPad style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {loading ? (
                            <TableSkeleton rows={8} cols={6} />
                        ) : warehouses.length === 0 ? (
                            <EmptyState 
                                icon={Building2} 
                                title="Sin depósitos" 
                                description="Comenzá creando tu primer depósito para gestionar el inventario."
                                actionLabel="Nuevo Depósito"
                                onAction={() => handleOpenModal()}
                            />
                        ) : (
                            <div className={t.container} style={{ flex: 1, overflowY: 'auto' }}>
                                <table className={t.table}>
                                    <thead>
                                        <tr>
                                            <th>Nombre</th>
                                            <th>Código</th>
                                            <th>Origen</th>
                                            <th>Dirección</th>
                                            <th>Estado</th>
                                            <th style={{ textAlign: 'right' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {warehouses.map(wh => (
                                            <tr key={wh.id} style={{ background: (selectedStockWh?.id === wh.id || editingWarehouse?.id === wh.id) ? 'var(--panel-2)' : 'transparent' }}>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <Building2 size={16} color="var(--primary)" />
                                                        <strong>{wh.name}</strong>
                                                    </div>
                                                </td>
                                                <td><code>{wh.code}</code></td>
                                                <td>
                                                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: wh.ownership === 'PROPIO' ? 'var(--primary)' : 'var(--text-secondary)' }}>
                                                        {wh.ownership || 'PROPIO'}
                                                    </div>
                                                </td>
                                                <td>{wh.address || '-'}</td>
                                                <td>
                                                    <span style={{ 
                                                        padding: '2px 8px', 
                                                        borderRadius: 'var(--r-md)', 
                                                        fontSize: 'var(--text-xs)', 
                                                        background: wh.active ? 'var(--primary-light)' : 'var(--bg-page)',
                                                        color: wh.active ? 'var(--primary)' : 'var(--text-secondary)',
                                                        fontWeight: 600,
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        {wh.active ? 'Activo' : 'Inactivo'}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                                        <Button variant="ghost" size="sm" onClick={() => viewStock(wh)} title="Ver Stock">
                                                            <Eye size={16} />
                                                        </Button>
                                                        <Button variant="ghost" size="sm" onClick={() => handleOpenModal(wh)}>
                                                            <Edit2 size={16} />
                                                        </Button>
                                                        <Button variant="ghost" size="sm" onClick={() => handleDelete(wh.id)} style={{ color: 'var(--error)' }}>
                                                            <Trash2 size={16} />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </div>

                {/* Bottom Panel (Edit or Stock) */}
                {(isEditing || selectedStockWh) && (
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        {isEditing ? (
                            <Card 
                                title={editingWarehouse ? 'Editar Depósito' : 'Nuevo Depósito'}
                                headerActions={<Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>Cancelar</Button>}
                                noPad
                                style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                            >
                                <div style={{ 
                                    flex: 1, 
                                    overflowY: 'auto', 
                                    padding: '16px 20px',
                                    maxHeight: '100%' 
                                }}>
                                    <form onSubmit={handleSave} style={{ 
                                        display: 'grid', 
                                        gridTemplateColumns: '1fr 1fr 1.5fr', 
                                        gap: '8px 12px',
                                        width: '100%' 
                                    }}>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <Input 
                                            label="Nombre del Depósito" 
                                            required 
                                            value={formData.name} 
                                            onChange={e => setFormData({...formData, name: e.target.value})} 
                                            placeholder="Ej: Depósito Central"
                                        />
                                    </div>
                                    
                                    <Input 
                                        label="Código (Auto)" 
                                        value={formData.code} 
                                        onChange={e => setFormData({...formData, code: e.target.value})} 
                                        placeholder="WH-001"
                                    />

                                    <Select 
                                        label="Propiedad" 
                                        value={formData.ownership} 
                                        onChange={e => setFormData({...formData, ownership: e.target.value})}
                                    >
                                        <option value="PROPIO">Propio</option>
                                        <option value="TERCERO">Tercero</option>
                                    </Select>

                                    <Input 
                                        label="Ubicación / Dirección" 
                                        value={formData.address} 
                                        onChange={e => setFormData({...formData, address: e.target.value})} 
                                        placeholder="Calle, Ciudad, etc."
                                    />
                                    
                                    <AccountSelector 
                                        label="Cuenta de Stock (Contable)"
                                        value={formData.account_code}
                                        onChange={e => setFormData({...formData, account_code: e.target.value})}
                                    />

                                    {/* Stock Control Policies */}
                                    <div style={{ 
                                        gridColumn: '1 / -1', 
                                        marginTop: 4, 
                                        padding: '12px', 
                                        background: 'var(--panel-2)', 
                                        borderRadius: 'var(--r-md)',
                                        border: '1px dotted var(--border-hover)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 12
                                    }}>
                                        <Select 
                                            label="Si el stock es insuficiente (debajo del mínimo):" 
                                            value={formData.low_stock_control} 
                                            onChange={e => setFormData({...formData, low_stock_control: e.target.value})}
                                        >
                                            <option value="NONE">No quiero que haga control de stock</option>
                                            <option value="WARNING">Si quiero que me alerte y me deje seguir</option>
                                            <option value="STRICT">Si quiero que me alerte y no me deje seguir</option>
                                        </Select>

                                        <Select 
                                            label="Si directamente NO hay stock (en cero o menos):" 
                                            value={formData.no_stock_control} 
                                            onChange={e => setFormData({...formData, no_stock_control: e.target.value})}
                                        >
                                            <option value="NONE">No quiero que haga control de stock</option>
                                            <option value="WARNING">Si quiero que me alerte y me deje seguir</option>
                                            <option value="STRICT">Si quiero que me alerte y no me deje seguir</option>
                                        </Select>
                                        
                                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontStyle: 'italic', opacity: 0.8 }}>
                                            Estas opciones definen cómo responderá el sistema al cargar ventas de este depósito.
                                        </p>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', gridColumn: '1 / -1' }}>
                                        <input 
                                            type="checkbox" 
                                            id="wh-active"
                                            checked={formData.active} 
                                            onChange={e => setFormData({...formData, active: e.target.checked})} 
                                        />
                                        <label htmlFor="wh-active" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Depósito Activo para operaciones</label>
                                    </div>

                                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12, gridColumn: '1 / -1' }}>
                                        <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancelar</Button>
                                        <Button type="submit">{editingWarehouse ? 'Guardar Cambios' : 'Crear Depósito'}</Button>
                                    </div>
                                </form>
                            </div>
                        </Card>
                        ) : (
                            <Card 
                                title={`Stock en ${selectedStockWh.name}`} 
                                headerActions={<Button variant="ghost" size="sm" onClick={() => setSelectedStockWh(null)}>Cerrar</Button>}
                                style={{ flex: 1, overflowY: 'auto' }}
                            >
                                {loadingStock ? (
                                    <div style={{ padding: 40, textAlign: 'center' }}>Consultando stock...</div>
                                ) : stockItems.length === 0 ? (
                                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        <Package size={40} strokeWidth={1} style={{ marginBottom: 12, opacity: 0.5 }} />
                                        <p>Este depósito no tiene artículos con stock registrado.</p>
                                    </div>
                                ) : (
                                    <div className={t.container}>
                                        <table className={t.table}>
                                            <thead>
                                                <tr>
                                                    <th>Producto</th>
                                                    <th style={{ textAlign: 'right' }}>Disponible</th>
                                                    <th style={{ textAlign: 'right' }}>Reservado</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {stockItems.map(item => (
                                                    <tr key={item.id}>
                                                        <td>{item.product_name}</td>
                                                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{item.qty_on_hand}</td>
                                                        <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{item.qty_reserved}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </Card>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
