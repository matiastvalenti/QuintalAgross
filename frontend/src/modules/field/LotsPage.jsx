import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Layers, 
  Trash2, 
  Edit2, 
  Search,
  Filter,
  ArrowUpDown,
  Building2,
  Maximize
} from 'lucide-react';
import s from './LotsPage.module.css';
import api from '../../services/api';
import LotModal from './LotModal';
import { useLocation } from 'react-router-dom';

const LotsPage = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const initialFarmId = queryParams.get('farmId');

  const [lots, setLots] = useState([]);
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedFarm, setSelectedFarm] = useState(initialFarmId || '');
  const [showModal, setShowModal] = useState(false);
  const [editingLot, setEditingLot] = useState(null);

  useEffect(() => {
    fetchData();
  }, [selectedFarm]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [lotsRes, farmsRes] = await Promise.all([
        api.get('/field/lots', { params: { farm_id: selectedFarm || undefined } }),
        api.get('/field/farms')
      ]);
      setLots(lotsRes);
      setFarms(farmsRes);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Está seguro de eliminar este lote?')) return;
    try {
      await api.delete(`/field/lots/${id}`);
      fetchData();
    } catch (err) {
      console.error('Error deleting lot:', err);
    }
  };

  const handleEdit = (lot) => {
    setEditingLot(lot);
    setShowModal(true);
  };

  const filteredLots = lots.filter(l => 
    l.name.toLowerCase().includes(search.toLowerCase())
  );

  const getFarmName = (farmId) => {
    return farms.find(f => f.id === farmId)?.name || 'Desconocido';
  };

  return (
    <div className={s.container}>
      <header className={s.header}>
        <div className={s.titleArea}>
          <h1>Gestión de Lotes</h1>
          <p>Superficie productiva por establecimiento</p>
        </div>
        <button className={s.btnPrimary} onClick={() => { setEditingLot(null); setShowModal(true); }}>
          <Plus size={18} />
          Nuevo Lote
        </button>
      </header>

      <div className={s.statsSummary}>
        <div className={s.miniStat}>
          <Layers size={16} />
          <span>{lots.length} Lotes en total</span>
        </div>
        <div className={s.miniStat}>
          <Maximize size={16} />
          <span>{lots.reduce((acc, l) => acc + parseFloat(l.hectares || 0), 0).toLocaleString()} ha totales</span>
        </div>
      </div>

      <div className={s.filters}>
        <div className={s.searchBar}>
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar lote..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className={s.selectWrapper}>
          <Building2 size={18} />
          <select value={selectedFarm} onChange={(e) => setSelectedFarm(e.target.value)}>
            <option value="">Todos los establecimientos</option>
            {farms.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className={s.loading}>Cargando lotes...</div>
      ) : (
        <div className={s.tableContainer}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Lote</th>
                <th>Establecimiento</th>
                <th>Superficie</th>
                <th>Tipo de Suelo</th>
                <th className={s.actionsCol}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredLots.map(lot => (
                <tr key={lot.id}>
                  <td>
                    <div className={s.lotName}>
                      <div className={s.lotIcon}><Layers size={14} /></div>
                      {lot.name}
                    </div>
                  </td>
                  <td>
                    <span className={s.farmBadge}>{getFarmName(lot.farm_id)}</span>
                  </td>
                  <td>{parseFloat(lot.hectares || 0).toLocaleString()} ha</td>
                  <td>{lot.soil_type || '-'}</td>
                  <td className={s.actionsCol}>
                    <button className={s.btnAction} onClick={() => handleEdit(lot)} title="Editar"><Edit2 size={16} /></button>
                    <button className={s.btnAction} onClick={() => handleDelete(lot.id)} title="Eliminar"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredLots.length === 0 && (
            <div className={s.empty}>
              <Layers size={48} />
              <p>No se encontraron lotes registrados</p>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <LotModal 
          lot={editingLot} 
          farmId={selectedFarm}
          onClose={() => setShowModal(false)}
          onSave={fetchData}
        />
      )}
    </div>
  );
};

export default LotsPage;
