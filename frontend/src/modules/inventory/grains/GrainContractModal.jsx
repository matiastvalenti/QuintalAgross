import { useState, useEffect } from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import Autocomplete from '../../../components/ui/Autocomplete';
import { useToast } from '../../../context/ToastContext';
import { API_URL } from '../../../config';
import { Save, X, Target, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { navigateToError } from '../../../utils/errorNavigation';
import api from '../../../services/api';

export default function GrainContractModal({ open, onClose, onSaved }) {
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    
    // Form State
    const [number, setNumber] = useState('');
    const [entity, setEntity] = useState(null);
    const [grainType, setGrainType] = useState('');
    const [harvest, setHarvest] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [type, setType] = useState('PURCHASE');
    const [totalKilos, setTotalKilos] = useState('');
    const [pricePerTon, setPricePerTon] = useState('');
    const [currency, setCurrency] = useState('USD');
    const [observations, setObservations] = useState('');
    const [costCenter, setCostCenter] = useState(localStorage.getItem('costCenter') || '1');

    // Master Data
    const [grainTypes, setGrainTypes] = useState([]);
    const [harvests, setHarvests] = useState([]);

    useEffect(() => {
        if (open) {
            const token = localStorage.getItem('token');
            const headers = { 'Authorization': `Bearer ${token}` };
            
            const loadMasters = async () => {
                try {
                    const [types, harvests] = await Promise.all([
                        api.get('/grains/types'),
                        api.get('/grains/harvests')
                    ]);
                    setGrainTypes(types);
                    setHarvests(harvests);
                } catch (e) {
                    console.error(e);
                    navigateToError(navigate, {
                        title: 'Error Cargando Contratos',
                        message: 'No se pudieron obtener los datos base para el contrato.',
                        cause: e.message,
                        status: 500
                    });
                }
            };
            loadMasters();
        }
    }, [open, navigate]);

    const handleSearchEntities = async (query) => {
        try {
            const res = await api.get('/entities/', { params: { q: query } });
            return res;
        } catch (e) {
            console.error(e);
            return [];
        }
    };

    const handleSave = async () => {
        if (!entity || !number || !grainType || !harvest || !totalKilos) {
            return showToast("Complete todos los campos obligatorios", "warning");
        }

        setLoading(true);
        try {
            await api.post('/grains/contracts', {
                number,
                entity_id: entity.id,
                grain_type_id: grainType,
                harvest_id: harvest,
                date: new Date(date).toISOString(),
                type,
                total_kilos: Number(totalKilos),
                price_per_ton: pricePerTon ? Number(pricePerTon) : null,
                currency,
                observations,
                cost_center: Number(costCenter)
            });

            showToast("Contrato guardado con éxito", "success");
            onSaved();
            onClose();
        } catch (e) {
            showToast(e.message || "Error al guardar contrato", "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="Nuevo Contrato de Grano" wide>
            <div style={{ padding: '10px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                    <Input 
                        label="N° de Contrato" 
                        value={number} 
                        onChange={e => setNumber(e.target.value)} 
                        placeholder="Ej: 800123"
                        required
                    />
                    <Input 
                        label="Fecha" 
                        type="date" 
                        value={date} 
                        onChange={e => setDate(e.target.value)} 
                        required
                    />
                </div>

                <div style={{ marginBottom: 20 }}>
                    <Autocomplete 
                        label="Productor / Cliente"
                        initialValue={entity}
                        onSearch={handleSearchEntities}
                        onSelect={setEntity}
                        renderItem={e => `${e.name} (${e.tax_id || 'S/C'})`}
                        valueDisplay={e => e.name}
                        placeholder="Buscar entidad..."
                        required
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 20 }}>
                    <Select label="Grano" value={grainType} onChange={e => setGrainType(e.target.value)} required>
                        <option value="">Seleccione...</option>
                        {grainTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </Select>
                    <Select label="Campaña" value={harvest} onChange={e => setHarvest(e.target.value)} required>
                        <option value="">Seleccione...</option>
                        {harvests.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </Select>
                    <Select label="Tipo Operación" value={type} onChange={e => setType(e.target.value)}>
                        <option value="PURCHASE">COMPRA</option>
                        <option value="SALE">VENTA</option>
                    </Select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 20 }}>
                     <Input 
                        label="Kilos Totales" 
                        type="number" 
                        value={totalKilos} 
                        onChange={e => setTotalKilos(e.target.value)} 
                        placeholder="Ej: 30000"
                        required
                    />
                    <Input 
                        label="Precio x Ton" 
                        type="number" 
                        value={pricePerTon} 
                        onChange={e => setPricePerTon(e.target.value)} 
                        placeholder="USD"
                    />
                    <Select label="Moneda" value={currency} onChange={e => setCurrency(e.target.value)}>
                        <option value="USD">USD</option>
                        <option value="ARS">ARS</option>
                    </Select>
                </div>

                <Input 
                    label="Observaciones" 
                    value={observations} 
                    onChange={e => setObservations(e.target.value)} 
                    placeholder="Detalles adicionales..."
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 30 }}>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSave} disabled={loading}>
                        <Save size={18} style={{ marginRight: 8 }} />
                        {loading ? 'Guardando...' : 'Guardar Contrato'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
