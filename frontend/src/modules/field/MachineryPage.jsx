import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Search,
  Tractor,
  Calendar,
  Settings2,
  Tag
} from 'lucide-react';
import s from './MachineryPage.module.css';
import api from '../../services/api';
import MachineryModal from './MachineryModal';

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const d = new Date(dateString);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const MachineryPage = () => {
  const [machinery, setMachinery] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingMac, setEditingMac] = useState(null);

  useEffect(() => {
    fetchMachinery();
  }, []);

  const fetchMachinery = async () => {
    try {
      setLoading(true);
      const res = await api.get('/field/machinery');
      setMachinery(res);
    } catch (err) {
      console.error('Error fetching machinery:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Desea dar de baja esta maquinaria?')) return;
    try {
      await api.delete(`/field/machinery/${id}`);
      fetchMachinery();
    } catch (err) {
      console.error('Error deleting machinery:', err);
    }
  };

  const handleEdit = (mac) => {
    setEditingMac(mac);
    setShowModal(true);
  };

  const filtered = machinery.filter(m => 
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.brand && m.brand.toLowerCase().includes(search.toLowerCase())) ||
    (m.model && m.model.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className={s.container}>
      <header className={s.header}>
        <div className={s.titleArea}>
          <h1>Maquinaria y Activos</h1>
          <p>Gestión de flota y equipos agrícolas</p>
        </div>
        <button className={s.btnPrimary} onClick={() => { setEditingMac(null); setShowModal(true); }}>
          <Plus size={18} />
          Nuevo Equipo
        </button>
      </header>

      <div className={s.stats}>
        <div className={s.statItem}>
          <Tractor size={20} />
          <span>{machinery.length} Equipos registrados</span>
        </div>
      </div>

      <div className={s.controls}>
        <div className={s.searchBar}>
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nombre, marca o modelo..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className={s.loading}>Cargando flota...</div>
      ) : (
        <div className={s.grid}>
          {filtered.map(mac => (
            <div key={mac.id} className={s.card}>
              <div className={s.cardHeader}>
                <div className={s.iconWrapper}>
                  <Tractor size={24} />
                </div>
                <div className={s.macInfo}>
                  <h3>{mac.name}</h3>
                  <span className={s.typeTag}>{mac.type || 'S/D'}</span>
                </div>
                <div className={s.cardActions}>
                  <button onClick={() => handleEdit(mac)}><Edit2 size={16} /></button>
                  <button onClick={() => handleDelete(mac.id)}><Trash2 size={16} /></button>
                </div>
              </div>

              <div className={s.cardBody}>
                <div className={s.attr}>
                  <Tag size={14} />
                  <span>{mac.brand} {mac.model}</span>
                </div>
                <div className={s.attr}>
                  <Settings2 size={14} />
                  <span>SN: {mac.serial_number || 'S/D'}</span>
                </div>
                {mac.purchase_date && (
                  <div className={s.attr}>
                    <Calendar size={14} />
                    <span>Compra: {format(new Date(mac.purchase_date), 'dd/MM/yyyy')}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {filtered.length === 0 && (
            <div className={s.empty}>
              <Tractor size={48} />
              <p>No se encontraron equipos</p>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <MachineryModal 
          machinery={editingMac} 
          onClose={() => setShowModal(false)}
          onSave={fetchMachinery}
        />
      )}
    </div>
  );
};

export default MachineryPage;
