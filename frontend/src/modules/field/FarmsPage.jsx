import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  MapPin, 
  Grid, 
  Trash2, 
  Edit2, 
  Search,
  ChevronRight,
  TrendingUp,
  LandPlot
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import s from './FarmsPage.module.css';
import api from '../../services/api';
import FarmModal from './FarmModal';

const FarmsPage = () => {
  const navigate = useNavigate();
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingFarm, setEditingFarm] = useState(null);

  useEffect(() => {
    fetchFarms();
  }, []);

  const fetchFarms = async () => {
    try {
      setLoading(true);
      const res = await api.get('/field/farms');
      setFarms(res);
    } catch (err) {
      console.error('Error fetching farms:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (farm) => {
    setEditingFarm(farm);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Está seguro de eliminar este establecimiento?')) return;
    try {
      await api.delete(`/field/farms/${id}`);
      fetchFarms();
    } catch (err) {
      console.error('Error deleting farm:', err);
    }
  };

  const filteredFarms = farms.filter(f => 
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    (f.location && f.location.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className={s.container}>
      <header className={s.header}>
        <div className={s.titleArea}>
          <h1>Gestión de Campos</h1>
          <p>Administra tus establecimientos agropecuarios y lotes</p>
        </div>
        <button className={s.btnPrimary} onClick={() => { setEditingFarm(null); setShowModal(true); }}>
          <Plus size={18} />
          Nuevo Campo
        </button>
      </header>

      <div className={s.statsGrid}>
        <div className={s.statCard}>
          <div className={s.statIcon} style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
            <LandPlot size={24} />
          </div>
          <div className={s.statInfo}>
            <span className={s.statLabel}>Total Hectáreas</span>
            <span className={s.statValue}>{farms.reduce((acc, f) => acc + parseFloat(f.total_hectares || 0), 0).toLocaleString()} ha</span>
          </div>
        </div>
        <div className={s.statCard}>
          <div className={s.statIcon} style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
            <MapPin size={24} />
          </div>
          <div className={s.statInfo}>
            <span className={s.statLabel}>Establecimientos</span>
            <span className={s.statValue}>{farms.length}</span>
          </div>
        </div>
      </div>

      <div className={s.controls}>
        <div className={s.searchBar}>
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar establecimiento..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className={s.loading}>Cargando campos...</div>
      ) : (
        <div className={s.farmsGrid}>
          {filteredFarms.map(farm => (
            <div key={farm.id} className={s.farmCard}>
              <div className={s.farmHeader}>
                <div className={s.farmAvatar}>
                  {farm.name.substring(0, 2).toUpperCase()}
                </div>
                <div className={s.farmTitle}>
                  <h3>{farm.name}</h3>
                  <span>{farm.location || 'Sin ubicación'}</span>
                </div>
                <div className={s.farmActions}>
                  <button title="Editar" onClick={() => handleEdit(farm)}><Edit2 size={16} /></button>
                  <button title="Eliminar" onClick={() => handleDelete(farm.id)}><Trash2 size={16} /></button>
                </div>
              </div>
              
              <div className={s.farmContent}>
                <div className={s.farmStat}>
                  <label>Superficie</label>
                  <p>{parseFloat(farm.total_hectares || 0).toLocaleString()} ha</p>
                </div>
                <div className={s.farmStat}>
                  <label>Tipo</label>
                  <p>{farm.ownership_type || 'No def.'}</p>
                </div>
              </div>

              <div className={s.farmFooter}>
                <button className={s.btnLots} onClick={() => navigate(`/campo/lotes?farmId=${farm.id}`)}>
                  <Grid size={16} />
                  Ver Lotes
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ))}
          
          {filteredFarms.length === 0 && (
            <div className={s.emptyState}>
              <LandPlot size={48} />
              <p>No se encontraron establecimientos</p>
              <button className={s.btnSecondary} onClick={() => setShowModal(true)}>Crear el primero</button>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <FarmModal 
          farm={editingFarm} 
          onClose={() => setShowModal(false)} 
          onSave={fetchFarms} 
        />
      )}
    </div>
  );
};

export default FarmsPage;
