import React, { useState, useEffect } from 'react';
import { X, Save, Layers, Maximize, Type as TypeIcon } from 'lucide-react';
import s from './LotModal.module.css';
import api from '../../services/api';

const LotModal = ({ onClose, onSave, lot = null, farmId = null }) => {
  const [formData, setFormData] = useState(lot || {
    farm_id: farmId || '',
    name: '',
    hectares: 0,
    soil_type: ''
  });
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchFarms();
  }, []);

  const fetchFarms = async () => {
    try {
      const res = await api.get('/field/farms');
      setFarms(res.data);
    } catch (err) {
      console.error('Error fetching farms:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.farm_id) {
      alert('Debe seleccionar un establecimiento');
      return;
    }
    try {
      setLoading(true);
      if (lot?.id) {
        await api.put(`/field/lots/${lot.id}`, formData);
      } else {
        await api.post('/field/lots', formData);
      }
      onSave();
      onClose();
    } catch (err) {
      console.error('Error saving lot:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={s.overlay}>
      <div className={s.modal}>
        <header className={s.header}>
          <h2>{lot ? 'Editar Lote' : 'Nuevo Lote'}</h2>
          <button onClick={onClose} className={s.btnClose}><X size={20} /></button>
        </header>

        <form onSubmit={handleSubmit} className={s.form}>
          <div className={s.field}>
            <label>Establecimiento *</label>
            <select 
              required
              value={formData.farm_id}
              onChange={e => setFormData({...formData, farm_id: e.target.value})}
              disabled={!!farmId && !lot}
            >
              <option value="">Seleccione un campo...</option>
              {farms.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <div className={s.field}>
            <label>Nombre del Lote *</label>
            <div className={s.inputWrapper}>
              <Layers size={18} />
              <input 
                type="text" 
                required 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="Ej: Lote 1, El Bajo, etc."
              />
            </div>
          </div>

          <div className={s.row}>
            <div className={s.field}>
              <label>Superficie (ha)</label>
              <div className={s.inputWrapper}>
                <Maximize size={18} />
                <input 
                  type="number" 
                  step="0.01"
                  required
                  value={formData.hectares}
                  onChange={e => setFormData({...formData, hectares: e.target.value})}
                />
              </div>
            </div>
            
            <div className={s.field}>
              <label>Tipo de Suelo</label>
              <div className={s.inputWrapper}>
                <TypeIcon size={18} />
                <input 
                  type="text" 
                  value={formData.soil_type}
                  onChange={e => setFormData({...formData, soil_type: e.target.value})}
                  placeholder="Ej: Clase I, Arenoso"
                />
              </div>
            </div>
          </div>

          <footer className={s.footer}>
            <button type="button" onClick={onClose} className={s.btnCancel}>Cancelar</button>
            <button type="submit" disabled={loading} className={s.btnSave}>
              <Save size={18} />
              {loading ? 'Guardando...' : lot ? 'Actualizar Lote' : 'Crear Lote'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default LotModal;
