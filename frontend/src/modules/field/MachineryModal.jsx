import React, { useState } from 'react';
import { X, Save, Tractor, Tag, Hash, Calendar, Settings } from 'lucide-react';
import s from './MachineryModal.module.css';
import api from '../../services/api';

const MachineryModal = ({ onClose, onSave, machinery = null }) => {
  const [formData, setFormData] = useState(machinery || {
    name: '',
    brand: '',
    model: '',
    serial_number: '',
    type: 'TRACTOR',
    purchase_date: null
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (machinery?.id) {
        await api.put(`/field/machinery/${machinery.id}`, formData);
      } else {
        await api.post('/field/machinery', formData);
      }
      onSave();
      onClose();
    } catch (err) {
      console.error('Error saving machinery:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={s.overlay}>
      <div className={s.modal}>
        <header className={s.header}>
          <h2>{machinery ? 'Editar Equipo' : 'Nuevo Equipo'}</h2>
          <button onClick={onClose} className={s.btnClose}><X size={20} /></button>
        </header>

        <form onSubmit={handleSubmit} className={s.form}>
          <div className={s.field}>
            <label>Nombre del Equipo *</label>
            <div className={s.inputWrapper}>
              <Settings size={18} />
              <input 
                type="text" 
                required 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="Ej: Tractor John Deere #1"
              />
            </div>
          </div>

          <div className={s.row}>
            <div className={s.field}>
              <label>Marca</label>
              <div className={s.inputWrapper}>
                <Tag size={18} />
                <input 
                  type="text" 
                  value={formData.brand}
                  onChange={e => setFormData({...formData, brand: e.target.value})}
                  placeholder="John Deere"
                />
              </div>
            </div>
            
            <div className={s.field}>
              <label>Modelo</label>
              <div className={s.inputWrapper}>
                <Hash size={18} />
                <input 
                  type="text" 
                  value={formData.model}
                  onChange={e => setFormData({...formData, model: e.target.value})}
                  placeholder="6150J"
                />
              </div>
            </div>
          </div>

          <div className={s.row}>
            <div className={s.field}>
              <label>Número de Serie</label>
              <div className={s.inputWrapper}>
                <Hash size={18} />
                <input 
                  type="text" 
                  value={formData.serial_number}
                  onChange={e => setFormData({...formData, serial_number: e.target.value})}
                />
              </div>
            </div>
            
            <div className={s.field}>
              <label>Tipo de Maquinaria</label>
              <select 
                value={formData.type}
                onChange={e => setFormData({...formData, type: e.target.value})}
              >
                <option value="TRACTOR">Tractor</option>
                <option value="COSECHADORA">Cosechadora</option>
                <option value="PULVERIZADORA">Pulverizadora</option>
                <option value="SEMBRADORA">Sembradora</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
          </div>

          <div className={s.field}>
            <label>Fecha de Compra</label>
            <div className={s.inputWrapper}>
              <Calendar size={18} />
              <input 
                type="date" 
                value={formData.purchase_date ? formData.purchase_date.split('T')[0] : ''}
                onChange={e => setFormData({...formData, purchase_date: e.target.value})}
              />
            </div>
          </div>

          <footer className={s.footer}>
            <button type="button" onClick={onClose} className={s.btnCancel}>Cancelar</button>
            <button type="submit" disabled={loading} className={s.btnSave}>
              <Save size={18} />
              {loading ? 'Guardando...' : 'Guardar Equipo'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default MachineryModal;
