import { useState, useEffect } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import t from '../../components/ui/Table.module.css';
import { Truck, Car, Plane, Info, Plus, Edit2, Trash2, CheckCircle, XCircle, Package, AlertTriangle, FileText, Calendar as CalendarIcon, Search } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import api from '../../services/api';
import TableSkeleton from '../../components/ui/TableSkeleton';
import EmptyState from '../../components/ui/EmptyState';

const VEHICLE_TYPES = [
    { value: 'TRUCK', label: 'Camión', icon: Truck },
    { value: 'VAN', label: 'Camioneta', icon: Car },
    { value: 'CAR', label: 'Auto', icon: Car },
    { value: 'HARVESTER', label: 'Cosechadora', icon: Package },
    { value: 'PULVERIZER', label: 'Pulverizadora', icon: Info },
    { value: 'DRONE_AGRAS', label: 'Dron Agras', icon: Plane },
    { value: 'DRONE_MAVIC', label: 'Dron Mavic', icon: Plane },
    { value: 'OTHER', label: 'Otro', icon: Info }
];

export default function FleetPage() {
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
    });
    const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
    const [isEditing, setIsEditing] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState(null);
    const [formData, setFormData] = useState({ 
        name: '', 
        plate: '', 
        type: 'TRUCK', 
        driver_name: '',
        driver_id: '',
        active: true,
        notes: '',
        insurance_due: '',
        vtv_due: ''
    });
    const [viewingDetails, setViewingDetails] = useState(null);
    const [vehicleExpensesDetail, setVehicleExpensesDetail] = useState([]);
    const [loadingDetails, setLoadingDetails] = useState(false);

    useEffect(() => {
        fetchVehicles();
    }, [dateFrom, dateTo]);

    const fetchVehicles = async () => {
        setLoading(true);
        try {
            const data = await api.get('/vehicles/', { 
                params: { start_date: dateFrom, end_date: dateTo } 
            });
            setVehicles(data);
        } catch (e) {
            console.error("Error fetching vehicles", e);
            showToast("Error al cargar la flota", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (veh = null) => {
        if (veh) {
            setEditingVehicle(veh);
            setFormData({ 
                name: veh.name, 
                plate: veh.plate || '', 
                type: veh.type || 'TRUCK', 
                driver_name: veh.driver_name || '',
                driver_id: veh.driver_id || '',
                active: veh.active,
                notes: veh.notes || '',
                insurance_due: veh.insurance_due ? veh.insurance_due.split('T')[0] : '',
                vtv_due: veh.vtv_due ? veh.vtv_due.split('T')[0] : ''
            });
        } else {
            setEditingVehicle(null);
            setFormData({ 
                name: '', 
                plate: '', 
                type: 'TRUCK', 
                driver_name: '',
                driver_id: '',
                active: true,
                notes: '',
                insurance_due: '',
                vtv_due: ''
            });
        }
        setIsEditing(true);
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        try {
            if (editingVehicle) {
                await api.put(`/vehicles/${editingVehicle.id}`, formData);
                showToast("Vehículo actualizado", "success");
            } else {
                await api.post('/vehicles/', formData);
                showToast("Vehículo creado", "success");
            }
            setIsEditing(false);
            fetchVehicles();
        } catch (e) {
            console.error(e);
            showToast("Error al guardar vehículo", "error");
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("¿Está seguro de desactivar este vehículo?")) return;
        try {
            await api.delete(`/vehicles/${id}`);
            fetchVehicles();
            showToast("Vehículo desactivado", "success");
        } catch (e) {
            console.error(e);
            showToast("Error al eliminar", "error");
        }
    };
    const getTypeIcon = (type) => {
        const found = VEHICLE_TYPES.find(t => t.value === type);
        const Icon = found ? found.icon : Info;
        return <Icon size={16} color="var(--primary)" />;
    };

    const handleViewExpenses = async (veh) => {
        setViewingDetails(veh);
        setLoadingDetails(true);
        try {
            const data = await api.get(`/vehicles/${veh.id}/expenses`, {
                params: { start_date: dateFrom, end_date: dateTo }
            });
            setVehicleExpensesDetail(data);
        } catch (e) {
            console.error(e);
            showToast("Error al cargar detalles de gastos", "error");
        } finally {
            setLoadingDetails(false);
        }
    };

    const getAlertLevel = (date) => {
        if (!date) return null;
        const d = new Date(date);
        const today = new Date();
        const diff = (d - today) / (1000 * 60 * 60 * 24);
        if (diff < 0) return 'expired';
        if (diff < 30) return 'soon';
        return 'ok';
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-page)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px 0 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <ContentHeader 
                    title="Control Gastero de Flota" 
                    breadcrumbs={[{label: 'Configuración'}, {label: 'Flota'}]}
                    actions={<Button onClick={() => handleOpenModal()} icon={<Plus size={18}/>}>Nuevo Vehículo</Button>}
                />
                
                <div style={{ display: 'flex', gap: 12, background: 'white', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border-color)', alignItems: 'flex-end', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Desde</label>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', outline: 'none' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Hasta</label>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', outline: 'none' }} />
                    </div>
                </div>
            </div>

            <div style={{ 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 12, 
                padding: '12px 20px 20px 20px',
                overflow: 'hidden'
            }}>
                <div style={{ 
                    flex: isEditing ? '0 0 auto' : '1', 
                    height: isEditing ? '150px' : 'auto',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <Card noPad style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {loading ? (
                            <TableSkeleton rows={10} cols={8} />
                        ) : vehicles.length === 0 ? (
                            <EmptyState 
                                icon={Truck} 
                                title="Sin vehículos" 
                                description="Comenzá cargando tu flota de unidades (propias o terceros)."
                                actionLabel="Nuevo Vehículo"
                                onAction={() => handleOpenModal()}
                            />
                        ) : (
                            <div className={t.container} style={{ flex: 1, overflowY: 'auto' }}>
                                <table className={t.table}>
                                    <thead>
                                        <tr>
                                            <th>Vehículo</th>
                                            <th>Tipo</th>
                                            <th>Patente</th>
                                            <th>Alertas</th>
                                            <th>Total Gastos</th>
                                            <th>Chofer Principal</th>
                                            <th>Estado</th>
                                            <th style={{ textAlign: 'right' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {vehicles.map(veh => (
                                            <tr key={veh.id} style={{ background: editingVehicle?.id === veh.id ? 'var(--panel-2)' : 'transparent' }}>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        {getTypeIcon(veh.type)}
                                                        <strong>{veh.name}</strong>
                                                    </div>
                                                </td>
                                                <td>{veh.type}</td>
                                                <td><code style={{background: '#f1f5f9', padding: '2px 4px', borderRadius: 4}}>{veh.plate || '-'}</code></td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        {getAlertLevel(veh.insurance_due) === 'expired' && <Badge variant="red" title={`Seguro Vencido: ${new Date(veh.insurance_due).toLocaleDateString()}`}>SEG</Badge>}
                                                        {getAlertLevel(veh.insurance_due) === 'soon' && <Badge variant="yellow" title={`Vence Pronto: ${new Date(veh.insurance_due).toLocaleDateString()}`}>SEG</Badge>}
                                                        {getAlertLevel(veh.vtv_due) === 'expired' && <Badge variant="red" title={`VTV Vencida: ${new Date(veh.vtv_due).toLocaleDateString()}`}>VTV</Badge>}
                                                        {getAlertLevel(veh.vtv_due) === 'soon' && <Badge variant="yellow" title={`VTV Vence Pronto: ${new Date(veh.vtv_due).toLocaleDateString()}`}>VTV</Badge>}
                                                        {!veh.insurance_due && !veh.vtv_due && <span style={{color: 'var(--text-tertiary)', fontSize: 10}}>-</span>}
                                                    </div>
                                                </td>
                                                <td style={{ color: 'var(--bad)', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }} onClick={() => handleViewExpenses(veh)}>
                                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(veh.total_expenses || 0)}
                                                </td>
                                                <td>
                                                    <div style={{fontSize: 'var(--text-sm)'}}>{veh.driver_name || '-'}</div>
                                                    <div style={{fontSize: 'var(--text-xs)', color: 'var(--text-secondary)'}}>{veh.driver_id}</div>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: veh.active ? 'var(--ok)' : 'var(--muted)' }}>
                                                        {veh.active ? <CheckCircle size={14} /> : <XCircle size={14} />}
                                                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>{veh.active ? 'ACTIVO' : 'INACTIVO'}</span>
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                                        <Button variant="ghost" size="sm" onClick={() => handleOpenModal(veh)}>
                                                            <Edit2 size={16} />
                                                        </Button>
                                                        <Button variant="ghost" size="sm" onClick={() => handleDelete(veh.id)} style={{ color: 'var(--bad)' }}>
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

                {isEditing && (
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        <Card 
                            title={editingVehicle ? 'Editar Vehículo' : 'Nuevo Vehículo'}
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
                                    gridTemplateColumns: '1fr 1fr', 
                                    gap: '12px 20px' 
                                }}>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <Input 
                                            label="Nombre del Vehículo / Identificación" 
                                            required 
                                            value={formData.name} 
                                            onChange={e => setFormData({...formData, name: e.target.value})} 
                                            placeholder="Ej: Mercedes Benz 1634 - Interno 04"
                                        />
                                    </div>
                                    
                                    <Select 
                                        label="Tipo de Vehículo" 
                                        value={formData.type} 
                                        onChange={e => setFormData({...formData, type: e.target.value})}
                                    >
                                        {VEHICLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </Select>

                                    <Input 
                                        label="Patente / Dominio" 
                                        value={formData.plate} 
                                        onChange={e => setFormData({...formData, plate: e.target.value})} 
                                        placeholder="Ej: ABC-123"
                                    />

                                    <Input 
                                        label="Chofer Principal" 
                                        value={formData.driver_name} 
                                        onChange={e => setFormData({...formData, driver_name: e.target.value})} 
                                        placeholder="Nombre y Apellido"
                                    />

                                    <Input 
                                        label="DNI / Licencia del Chofer" 
                                        value={formData.driver_id} 
                                        onChange={e => setFormData({...formData, driver_id: e.target.value})} 
                                        placeholder="Opcional"
                                    />

                                    <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                                        <Input 
                                            label="Vencimiento Seguro" 
                                            type="date"
                                            value={formData.insurance_due} 
                                            onChange={e => setFormData({...formData, insurance_due: e.target.value})} 
                                        />
                                        <Input 
                                            label="Vencimiento VTV" 
                                            type="date"
                                            value={formData.vtv_due} 
                                            onChange={e => setFormData({...formData, vtv_due: e.target.value})} 
                                        />
                                    </div>

                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <Input 
                                            label="Notas / Observaciones" 
                                            value={formData.notes} 
                                            onChange={e => setFormData({...formData, notes: e.target.value})} 
                                            placeholder="Detalles adicionales..."
                                        />
                                    </div>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <input 
                                            type="checkbox" 
                                            id="veh-active"
                                            checked={formData.active} 
                                            onChange={e => setFormData({...formData, active: e.target.checked})} 
                                        />
                                        <label htmlFor="veh-active" style={{ fontSize: 'var(--text-sm)' }}>Vehículo Disponible</label>
                                    </div>

                                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 10, gridColumn: '1 / -1' }}>
                                        <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancelar</Button>
                                        <Button type="submit">{editingVehicle ? 'Guardar Cambios' : 'Crear Vehículo'}</Button>
                                    </div>
                                </form>
                            </div>
                        </Card>
                    </div>
                )}
            </div>

            {viewingDetails && (
                <Modal 
                    title={`Detalle de Gastos: ${viewingDetails.name}`}
                    onClose={() => setViewingDetails(null)}
                    width={800}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-page)', padding: '12px 16px', borderRadius: 8 }}>
                            <div style={{ display: 'flex', gap: 20 }}>
                                <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>PERÍODO</div>
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>{new Date(dateFrom).toLocaleDateString()} - {new Date(dateTo).toLocaleDateString()}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>TOTAL ACUMULADO</div>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--bad)' }}>
                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(viewingDetails.total_expenses || 0)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                            <table className={t.table}>
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Concepto / Comprobante</th>
                                        <th>Categoría</th>
                                        <th style={{ textAlign: 'right' }}>Monto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingDetails ? (
                                        <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20 }}>Cargando detalles...</td></tr>
                                    ) : vehicleExpensesDetail.length === 0 ? (
                                        <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>No hay gastos en este período.</td></tr>
                                    ) : vehicleExpensesDetail.map((exp, idx) => (
                                        <tr key={idx}>
                                            <td style={{ fontSize: 12 }}>{new Date(exp.date).toLocaleDateString()}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {exp.type === 'Factura' ? <FileText size={14} color="var(--primary)" /> : <AlertTriangle size={14} color="var(--warning)" />}
                                                    <div style={{ fontSize: 13, fontWeight: 500 }}>{exp.description}</div>
                                                </div>
                                            </td>
                                            <td><Badge variant="gray">{exp.category || 'Varios'}</Badge></td>
                                            <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(exp.amount)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                            <Button onClick={() => setViewingDetails(null)}>Cerrar</Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
