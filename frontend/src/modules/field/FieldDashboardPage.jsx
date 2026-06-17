import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingDown, 
  TrendingUp, 
  DollarSign, 
  Leaf, 
  Droplets, 
  Tractor,
  Layers,
  Scale
} from 'lucide-react';
import s from './FieldDashboardPage.module.css';
import api from '../../services/api';

const FieldDashboardPage = () => {
  const [data, setData] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHarvest, setSelectedHarvest] = useState('');

  useEffect(() => {
    fetchHarvests();
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [selectedHarvest]);

  const fetchHarvests = async () => {
    try {
      const res = await api.get('/inventory/grains/harvests');
      setHarvests(res || []);
      if (res && res.length > 0) {
        setSelectedHarvest(res[0].id);
      }
    } catch (err) {
      console.error('Error fetching harvests:', err);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/field/dashboard/profitability', {
        params: { harvest_id: selectedHarvest || undefined }
      });
      setData(res || []);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val);

  const calculateTotals = () => {
    return data.reduce((acc, curr) => ({
      totalHectares: acc.totalHectares + curr.hectares,
      totalCost: acc.totalCost + curr.total_cost,
      totalRevenue: acc.totalRevenue + curr.total_revenue,
      totalMargin: acc.totalMargin + curr.margin,
      totalYield: acc.totalYield + curr.actual_yield * curr.hectares,
    }), { totalHectares: 0, totalCost: 0, totalRevenue: 0, totalMargin: 0, totalYield: 0 });
  };

  const totals = calculateTotals();
  const avgYield = totals.totalHectares > 0 ? totals.totalYield / totals.totalHectares : 0;
  const avgCostPerHa = totals.totalHectares > 0 ? totals.totalCost / totals.totalHectares : 0;
  const avgMarginPerHa = totals.totalHectares > 0 ? totals.totalMargin / totals.totalHectares : 0;

  return (
    <div className={s.container}>
      <header className={s.header}>
        <div className={s.titleArea}>
          <h1>Dashboard de Rentabilidad</h1>
          <p>Análisis de márgenes por hectárea y consumos</p>
        </div>
        <div className={s.filters}>
          <Layers size={18} className={s.filterIcon} />
          <select 
            value={selectedHarvest} 
            onChange={e => setSelectedHarvest(e.target.value)}
            className={s.harvestSelect}
          >
            <option value="">Todas las Campañas</option>
            {harvests.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
      </header>

      {loading ? (
        <div className={s.loading}>Calculando rentabilidad...</div>
      ) : (
        <>
          <div className={s.summaryCards}>
            <div className={s.card}>
              <div className={s.cardIcon} style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                <Scale size={24} />
              </div>
              <div className={s.cardData}>
                <span>Costo Total Insumos</span>
                <h3>{formatCurrency(totals.totalCost)}</h3>
                <p>Promedio: {formatCurrency(avgCostPerHa)} / ha</p>
              </div>
            </div>

            <div className={s.card}>
              <div className={s.cardIcon} style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
                <TrendingUp size={24} />
              </div>
              <div className={s.cardData}>
                <span>Ingreso Estimado</span>
                <h3>{formatCurrency(totals.totalRevenue)}</h3>
                <p>Rinde Prom: {avgYield.toLocaleString()} kg/ha</p>
              </div>
            </div>

            <div className={s.card}>
              <div className={s.cardIcon} style={{ background: totals.totalMargin >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: totals.totalMargin >= 0 ? '#10b981' : '#ef4444' }}>
                <DollarSign size={24} />
              </div>
              <div className={s.cardData}>
                <span>Margen Bruto</span>
                <h3>{formatCurrency(totals.totalMargin)}</h3>
                <p>Margen: {formatCurrency(avgMarginPerHa)} / ha</p>
              </div>
            </div>
          </div>

          <div className={s.tableSection}>
            <h2 className={s.sectionTitle}>Rentabilidad por Lote</h2>
            <div className={s.tableWrapper}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Lote</th>
                    <th>Superficie</th>
                    <th>Rinde Real (kg/ha)</th>
                    <th>Costo Total</th>
                    <th>Costo / ha</th>
                    <th>Margen / ha</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(row => (
                    <tr key={row.activity_id}>
                      <td style={{ fontWeight: 600 }}>{row.lot_name}</td>
                      <td>{row.hectares} ha</td>
                      <td>{row.actual_yield.toLocaleString()}</td>
                      <td>{formatCurrency(row.total_cost)}</td>
                      <td>{formatCurrency(row.cost_per_ha)}</td>
                      <td style={{ color: (row.margin / row.hectares) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                        {formatCurrency(row.margin / row.hectares)}
                      </td>
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr>
                      <td colSpan="6" className={s.emptyCell}>No hay actividades completadas para analizar en esta campaña.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FieldDashboardPage;
