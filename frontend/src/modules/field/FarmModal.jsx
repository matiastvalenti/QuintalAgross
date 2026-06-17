import React, { useState } from 'react';
import { X, Save, MapPin, LandPlot, Building2 } from 'lucide-react';
import s from './FarmModal.module.css';
import api from '../../services/api';

const FarmModal = ({ onClose, onSave, farm = null }) => {
  const [formData, setFormData] = useState(farm || {
    name: '',
    location: '',
    total_hectares: 0,
    ownership_type: 'PROPIO',
    province_id: null,
    locality_id: null
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (farm?.id) {
        await api.put(`/field/farms/${farm.id}`, formData);
      } else {
        await api.post('/field/farms', formData);
      }
      onSave();
      onClose();
    } catch (err) {
      console.error('Error saving farm:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={s.overlay}>
      <div className={s.modal}>
        <header className={s.header}>
          <h2>{farm ? 'Editar Establecimiento' : 'Nuevo Establecimiento'}</h2>
          <button onClick={onClose} className={s.btnClose}><X size={20} /></button>
        </header>

        <form onSubmit={handleSubmit} className={s.form}>
          <div className={s.field}>
            <label>Nombre del Campo *</label>
            <div className={s.inputWrapper}>
              <Building2 size={18} />
              <input 
                type="text" 
                required 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="Ej: La Estancia"
              />
            </div>
          </div>

          <div className={s.field}>
            <label>Ubicación / Dirección</label>
            <div className={s.inputWrapper}>
              <MapPin size={18} />
              <input 
                type="text" 
                value={formData.location}
                onChange={e => setFormData({...formData, location: e.target.value})}
                placeholder="Localidad, departamento o coordenadas"
              />
            </div>
          </div>

          <div className={s.row}>
            <div className={s.field}>
              <label>Superficie Total (ha)</label>
              <div className={s.inputWrapper}>
                <LandPlot size={18} />
                <input 
                  type="number" 
                  step="0.01"
                  value={formData.total_hectares}
                  onChange={e => setFormData({...formData, total_hectares: e.target.value})}
                />
              </div>
            </div>
            
            <div className={s.field}>
              <label>Tipo de Tenencia</label>
              <select 
                value={formData.ownership_type}
                onChange={e => setFormData({...formData, ownership_type: e.target.value})}
              >
                <option value="PROPIO">Propio</option>
                <option value="ARRENDADO">Arrendado</option>
                <option value="MIXTO">Mixto</option>
              </select>
            </div>
          </div>

          <footer className={s.footer}>
            <button type="button" onClick={onClose} className={s.btnCancel}>Cancelar</button>
            <button type="submit" disabled={loading} className={s.btnSave}>
              <Save size={18} />
              {loading ? 'Guardando...' : 'Guardar Campo'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default FarmModal;
