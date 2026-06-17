import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Package, Tractor, DollarSign, Scale } from 'lucide-react';
import s from './UsagesModal.module.css';
import api from '../../services/api';

const UsagesModal = ({ activity, onClose }) => {
  const [usages, setUsages] = useState([]);
  const [products, setProducts] = useState([]);
  const [machinery, setMachinery] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  
  const [newUsage, setNewUsage] = useState({
    product_id: '',
    machinery_id: '',
    quantity: 0,
    unit_price: 0,
    date: new Date().toISOString()
  });

  useEffect(() => {
    fetchData();
  }, [activity.id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usagesRes, prodRes, macRes] = await Promise.all([
        api.get(`/field/activities/${activity.id}/usages`),
        api.get('/inventory/products'),
        api.get('/field/machinery')
      ]);
      setUsages(usagesRes.data);
      setProducts(prodRes.data.filter(p => !p.is_service)); // Filtramos solo productos/insumos físicos
      setMachinery(macRes.data);
    } catch (err) {
      console.error('Error fetching usages data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUsage = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...newUsage,
        activity_id: activity.id,
        total_cost: newUsage.quantity * newUsage.unit_price
      };
      await api.post('/field/input-usages', payload);
      setShowAddForm(false);
      setNewUsage({
        product_id: '',
        machinery_id: '',
        quantity: 0,
        unit_price: 0,
        date: new Date().toISOString()
      });
      fetchData();
    } catch (err) {
      console.error('Error adding usage:', err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este registro de consumo?')) return;
    try {
      await api.delete(`/field/input-usages/${id}`);
      fetchData();
    } catch (err) {
      console.error('Error deleting usage:', err);
    }
  };

  const getProductName = (id) => products.find(p => p.id === id)?.name || 'Producto Desconocido';
  const getMachineryName = (id) => machinery.find(m => m.id === id)?.name || 'Ninguna';

  return (
    <div className={s.overlay}>
      <div className={s.modal}>
        <header className={s.header}>
          <div className={s.titleGroup}>
            <h2>Insumos y Gastos</h2>
            <span>Actividad en {activity.lot_name || 'Lote'}</span>
          </div>
          <button onClick={onClose} className={s.btnClose}><X size={20} /></button>
        </header>

        <div className={s.content}>
          <div className={s.actionsBar}>
            <button className={s.btnAdd} onClick={() => setShowAddForm(true)}>
              <Plus size={16} />
              Registrar Consumo
            </button>
            <div className={s.totalSummary}>
              <label>Costo Total:</label>
              <span>${usages.reduce((acc, u) => acc + parseFloat(u.total_cost || 0), 0).toLocaleString()}</span>
            </div>
          </div>

          {showAddForm && (
            <form className={s.addForm} onSubmit={handleAddUsage}>
              <div className={s.formRow}>
                <div className={s.formField}>
                  <label>Insumo / Producto</label>
                  <select 
                    required 
                    value={newUsage.product_id}
                    onChange={e => {
                        const prod = products.find(p => p.id === e.target.value);
                        setNewUsage({...newUsage, product_id: e.target.value, unit_price: prod?.price || 0});
                    }}
                  >
                    <option value="">Seleccione insumo...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                  </select>
                </div>
                <div className={s.formField}>
                  <label>Maquinaria</label>
                  <select 
                    value={newUsage.machinery_id}
                    onChange={e => setNewUsage({...newUsage, machinery_id: e.target.value})}
                  >
                    <option value="">Opcional...</option>
                    {machinery.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>

              <div className={s.formRow}>
                <div className={s.formField}>
                  <label>Cantidad</label>
                  <div className={s.inputIcon}>
                    <Scale size={16} />
                    <input 
                      type="number" 
                      step="0.01" 
                      required 
                      value={newUsage.quantity}
                      onChange={e => setNewUsage({...newUsage, quantity: e.target.value})}
                    />
                  </div>
                </div>
                <div className={s.formField}>
                  <label>Precio Unit. ($)</label>
                  <div className={s.inputIcon}>
                    <DollarSign size={16} />
                    <input 
                      type="number" 
                      step="0.01" 
                      required 
                      value={newUsage.unit_price}
                      onChange={e => setNewUsage({...newUsage, unit_price: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className={s.formActions}>
                <button type="button" className={s.btnCancel} onClick={() => setShowAddForm(false)}>Cancelar</button>
                <button type="submit" className={s.btnConfirm}>Guardar</button>
              </div>
            </form>
          )}

          <div className={s.tableWrapper}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th>Maquinaria</th>
                  <th>Cant.</th>
                  <th>Unit.</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {usages.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className={s.itemCell}>
                        <Package size={14} />
                        {getProductName(u.product_id)}
                      </div>
                    </td>
                    <td>
                      <div className={s.itemCell}>
                        <Tractor size={14} />
                        {getMachineryName(u.machinery_id)}
                      </div>
                    </td>
                    <td>{parseFloat(u.quantity).toLocaleString()}</td>
                    <td>${parseFloat(u.unit_price).toLocaleString()}</td>
                    <td className={s.totalCell}>${parseFloat(u.total_cost).toLocaleString()}</td>
                    <td className={s.actionsCell}>
                      <button title="Eliminar" onClick={() => handleDelete(u.id)}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
                {usages.length === 0 && !loading && (
                  <tr>
                    <td colSpan="6" className={s.emptyCell}>No hay insumos registrados para esta actividad</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UsagesModal;
