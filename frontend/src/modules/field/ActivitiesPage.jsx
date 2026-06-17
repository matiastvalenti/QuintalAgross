import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Search,
  Sprout,
  Droplets,
  Container,
  Calendar,
  Layers,
  Building2,
  ChevronRight,
  TrendingUp,
  LandPlot
} from 'lucide-react';
import s from './ActivitiesPage.module.css';
import api from '../../services/api';
import ActivityModal from './ActivityModal';
import UsagesModal from './UsagesModal';

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const d = new Date(dateString);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const ActivitiesPage = () => {
  const [activities, setActivities] = useState([]);
  const [lots, setLots] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    lot_id: '',
    harvest_id: ''
  });
  const [showModal, setShowModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [showUsages, setShowUsages] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);

  useEffect(() => {
    fetchData();
  }, [filters.lot_id, filters.harvest_id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [actRes, lotsRes, harvRes] = await Promise.all([
        api.get('/field/activities', { 
          params: { 
            lot_id: filters.lot_id || undefined,
            harvest_id: filters.harvest_id || undefined
          } 
        }),
        api.get('/field/lots'),
        api.get('/inventory/grains/harvests')
      ]);
      setActivities(actRes);
      setLots(lotsRes);
      setHarvests(harvRes);
    } catch (err) {
      console.error('Error fetching activities:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Está seguro de eliminar esta actividad?')) return;
    try {
      await api.delete(`/field/activities/${id}`);
      fetchData();
    } catch (err) {
      console.error('Error deleting activity:', err);
    }
  };

  const getActivityIcon = (status) => {
    switch (status) {
      case 'PLANNING': return <Calendar size={18} />;
      case 'IN_PROGRESS': return <Sprout size={18} />;
      case 'COMPLETED': return <TrendingUp size={18} />;
      default: return <LandPlot size={18} />;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'PLANNING': return 'Planificado';
      case 'IN_PROGRESS': return 'En curso';
      case 'COMPLETED': return 'Completado';
      default: return status;
    }
  };

  const getLotName = (id) => lots.find(l => l.id === id)?.name || 'S/D';
  const getHarvestName = (id) => harvests.find(h => h.id === id)?.name || 'S/D';

  const filtered = activities.filter(a => 
    getLotName(a.lot_id).toLowerCase().includes(filters.search.toLowerCase()) ||
    (a.observations && a.observations.toLowerCase().includes(filters.search.toLowerCase()))
  );

  return (
    <div className={s.container}>
      <header className={s.header}>
        <div className={s.titleArea}>
          <h1>Actividades Agrícolas</h1>
          <p>Registro de labores, siembras y aplicaciones</p>
        </div>
        <button className={s.btnPrimary} onClick={() => { setEditingActivity(null); setShowModal(true); }}>
          <Plus size={18} />
          Nueva Actividad
        </button>
      </header>

      <div className={s.filters}>
        <div className={s.searchBar}>
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar por lote u observación..." 
            value={filters.search}
            onChange={(e) => setFilters({...filters, search: e.target.value})}
          />
        </div>

        <div className={s.selects}>
          <div className={s.selectWrapper}>
            <Layers size={16} />
            <select value={filters.lot_id} onChange={(e) => setFilters({...filters, lot_id: e.target.value})}>
              <option value="">Todos los lotes</option>
              {lots.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          
          <div className={s.selectWrapper}>
            <Calendar size={16} />
            <select value={filters.harvest_id} onChange={(e) => setFilters({...filters, harvest_id: e.target.value})}>
              <option value="">Todas las campañas</option>
              {harvests.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className={s.loading}>Cargando actividades...</div>
      ) : (
        <div className={s.list}>
          {filtered.map(act => (
            <div key={act.id} className={s.card}>
              <div className={s.cardHeader}>
                <div className={`${s.statusIcon} ${s[act.status]}`}>
                  {getActivityIcon(act.status)}
                </div>
                <div className={s.info}>
                  <h3>{getLotName(act.lot_id)}</h3>
                  <div className={s.meta}>
                    <span className={s.harvestTag}>{getHarvestName(act.harvest_id)}</span>
                    <span className={s.statusTag}>{getStatusLabel(act.status)}</span>
                  </div>
                </div>
                <div className={s.actions}>
                  <button onClick={() => { setEditingActivity(act); setShowModal(true); }}><Edit2 size={16} /></button>
                  <button onClick={() => handleDelete(act.id)}><Trash2 size={16} /></button>
                </div>
              </div>

              <div className={s.cardBody}>
                <div className={s.dates}>
                   <div className={s.date}>
                      <label>Inicio</label>
                      <span>{formatDate(act.start_date)}</span>
                   </div>
                   <div className={s.date}>
                      <label>Fin</label>
                      <span>{formatDate(act.end_date)}</span>
                   </div>
                </div>
                {act.estimated_yield && (
                  <div className={s.yield}>
                    <label>Rinde Est.</label>
                    <span>{parseFloat(act.estimated_yield).toLocaleString()} kg/ha</span>
                  </div>
                )}
                {act.actual_yield && (
                  <div className={s.yieldActual}>
                    <label>Rinde Real</label>
                    <span>{parseFloat(act.actual_yield).toLocaleString()} kg/ha</span>
                  </div>
                )}
              </div>
              
              {act.observations && (
                <p className={s.obs}>{act.observations}</p>
              )}

              <div className={s.cardFooter}>
                <button 
                  className={s.btnUsages}
                  onClick={() => {
                    setSelectedActivity({...act, lot_name: getLotName(act.lot_id)});
                    setShowUsages(true);
                  }}
                >
                   <Container size={14} />
                   Ver Insumos
                   <ChevronRight size={12} />
                </button>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className={s.empty}>
              <Sprout size={48} />
              <p>No se encontraron actividades registradas</p>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <ActivityModal 
          activity={editingActivity}
          onClose={() => setShowModal(false)}
          onSave={fetchData}
        />
      )}

      {showUsages && (
        <UsagesModal
          activity={selectedActivity}
          onClose={() => setShowUsages(false)}
        />
      )}
    </div>
  );
};

export default ActivitiesPage;
