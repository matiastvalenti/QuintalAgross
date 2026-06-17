import React, { useState, useEffect } from 'react';
import { X, Save, Layers, Calendar, TrendingUp, Info } from 'lucide-react';
import s from './ActivityModal.module.css';
import api from '../../services/api';

const ActivityModal = ({ onClose, onSave, activity = null }) => {
  const [formData, setFormData] = useState(activity || {
    lot_id: '',
    harvest_id: '',
    grain_type_id: null,
    status: 'PLANNING',
    start_date: null,
    end_date: null,
    estimated_yield: 0,
    actual_yield: 0,
    observations: ''
  });
  
  const [lots, setLots] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [grainTypes, setGrainTypes] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [lotsRes, harvRes, grainRes] = await Promise.all([
        api.get('/field/lots'),
        api.get('/inventory/grains/harvests'),
        api.get('/inventory/grains/types')
      ]);
      setLots(lotsRes.data);
      setHarvests(harvRes.data);
      setGrainTypes(grainRes.data);
    } catch (err) {
      console.error('Error fetching modal data:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.lot_id || !formData.harvest_id) {
      alert('Lote y Campaña son obligatorios');
      return;
    }
    try {
      setLoading(true);
      if (activity?.id) {
        await api.put(`/field/activities/${activity.id}`, formData);
      } else {
        await api.post('/field/activities', formData);
      }
      onSave();
      onClose();
    } catch (err) {
      console.error('Error saving activity:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={s.overlay}>
      <div className={s.modal}>
        <header className={s.header}>
          <h2>{activity ? 'Editar Actividad' : 'Nueva Actividad'}</h2>
          <button onClick={onClose} className={s.btnClose}><X size={20} /></button>
        </header>

        <form onSubmit={handleSubmit} className={s.form}>
          <div className={s.row}>
            <div className={s.field}>
              <label>Lote *</label>
              <select 
                required
                value={formData.lot_id}
                onChange={e => setFormData({...formData, lot_id: e.target.value})}
              >
                <option value="">Seleccione lote...</option>
                {lots.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className={s.field}>
              <label>Campaña *</label>
              <select 
                required
                value={formData.harvest_id}
                onChange={e => setFormData({...formData, harvest_id: e.target.value})}
              >
                <option value="">Seleccione campaña...</option>
                {harvests.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
          </div>

          <div className={s.row}>
            <div className={s.field}>
              <label>Cultivo</label>
              <select 
                value={formData.grain_type_id || ''}
                onChange={e => setFormData({...formData, grain_type_id: e.target.value || null})}
              >
                <option value="">Seleccione cultivo...</option>
                {grainTypes.map(gt => <option key={gt.id} value={gt.id}>{gt.name}</option>)}
              </select>
            </div>
            <div className={s.field}>
              <label>Estado</label>
              <select 
                value={formData.status}
                onChange={e => setFormData({...formData, status: e.target.value})}
              >
                <option value="PLANNING">Planificado</option>
                <option value="IN_PROGRESS">En Curso</option>
                <option value="COMPLETED">Completado</option>
              </select>
            </div>
          </div>

          <div className={s.row}>
            <div className={s.field}>
              <label>Fecha Inicio</label>
              <input 
                type="date" 
                value={formData.start_date ? formData.start_date.split('T')[0] : ''}
                onChange={e => setFormData({...formData, start_date: e.target.value})}
              />
            </div>
            <div className={s.field}>
              <label>Fecha Fin</label>
              <input 
                type="date" 
                value={formData.end_date ? formData.end_date.split('T')[0] : ''}
                onChange={e => setFormData({...formData, end_date: e.target.value})}
              />
            </div>
          </div>

          <div className={s.row}>
            <div className={s.field}>
              <label>Rinde Estimado (kg/ha)</label>
              <input 
                type="number" 
                value={formData.estimated_yield}
                onChange={e => setFormData({...formData, estimated_yield: e.target.value})}
              />
            </div>
            <div className={s.field}>
              <label>Rinde Real (kg/ha)</label>
              <input 
                type="number" 
                value={formData.actual_yield}
                onChange={e => setFormData({...formData, actual_yield: e.target.value})}
              />
            </div>
          </div>

          <div className={s.field}>
            <label>Observaciones</label>
            <textarea 
              rows="3"
              value={formData.observations || ''}
              onChange={e => setFormData({...formData, observations: e.target.value})}
              placeholder="Detalles sobre la labor, clima, etc."
            />
          </div>

          <footer className={s.footer}>
            <button type="button" onClick={onClose} className={s.btnCancel}>Cancelar</button>
            <button type="submit" disabled={loading} className={s.btnSave}>
              <Save size={18} />
              {loading ? 'Guardando...' : 'Guardar Actividad'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default ActivityModal;
