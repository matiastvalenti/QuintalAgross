import React, { useState, useEffect } from 'react';
import { 
  Package, TrendingUp, AlertTriangle, ShieldCheck, 
  Search, RefreshCcw, Download, Warehouse,
  BarChart2, PieChart as PieIcon, ChevronRight,
  ArrowRight, Truck, Database, Activity, Layout
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import api from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import s from './InventoryDashboard.module.css';

const fmtUSD = (v) => v !== undefined && v !== null ? `u$s ${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'u$s 0,00';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#0f172a', '#ef4444'];

export default function InventoryDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/inventory/dashboard/summary');
      setData(response);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div style={{ padding: 120, textAlign: 'center', background: '#f8fafc', minHeight: '100vh' }}>
      <RefreshCcw size={48} className="animate-spin" style={{ color: '#3b82f6', opacity: 0.5, margin: '0 auto' }} />
      <h2 style={{ marginTop: 24, fontWeight: 950, color: '#0f172a' }}>VALORIZANDO STOCK OPERATIVO...</h2>
    </div>
  );

  return (
    <div className={s.container}>
      <header className={s.header}>
        <div>
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 900, marginBottom: 4 }}>INTELIGENCIA LOGÍSTICA</div>
          <h1>Dashboard de Inventario</h1>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={fetchData} className={s.btnGhost} style={{ padding: 12, borderRadius: 16, border: '1px solid #f1f5f9', background: 'white' }}>
            <RefreshCcw size={20} color="#64748b" />
          </button>
          <button style={{ padding: '0 24px', borderRadius: 16, background: '#0f172a', color: 'white', fontWeight: 950, fontSize: 12, border: 'none' }}>
            REPORTES PDF
          </button>
        </div>
      </header>

      <div className={s.statsGrid}>
        <div className={s.kpiCard}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Database size={24} />
          </div>
          <span className={s.kpiLabel}>VALUACIÓN TOTAL (COSTO)</span>
          <div className={s.kpiValue}>{fmtUSD(data?.total_valuation_usd)}</div>
          <span className={s.kpiSub}>USD Consolidado operativo</span>
        </div>
        <div className={s.kpiCard}>
           <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <AlertTriangle size={24} />
          </div>
          <span className={s.kpiLabel}>CRÍTICOS</span>
          <div className={s.kpiValue} style={{ color: '#ef4444' }}>{data?.critical_count}</div>
          <span className={s.kpiSub}>SKUs por debajo del mínimo</span>
        </div>
        <div className={s.kpiCard}>
           <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f0fdf4', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Warehouse size={24} />
          </div>
          <span className={s.kpiLabel}> DEPÓSITOS</span>
          <div className={s.kpiValue}>{data?.by_warehouse.length}</div>
          <span className={s.kpiSub}>Locaciones activas</span>
        </div>
        <div className={s.kpiCard}>
           <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fffbeb', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Truck size={24} />
          </div>
          <span className={s.kpiLabel}>EN TRÁNSITO</span>
          <div className={s.kpiValue}>u$s 12.4K</div>
          <span className={s.kpiSub}>Pendientes de ingreso</span>
        </div>
      </div>

      <div className={s.bento}>
        {/* Distribución por Rubro */}
        <div className={s.card}>
          <h3 className={s.cardTitle}><PieIcon size={20} color="#3b82f6" /> COMPOSICIÓN DE STOCK</h3>
          <div className={s.chartContainer}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data?.by_category} innerRadius={80} outerRadius={120} paddingAngle={5} dataKey="value">
                  {data?.by_category.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val) => fmtUSD(val)} />
                <Legend layout="vertical" align="right" verticalAlign="middle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 5 Items */}
        <div className={s.card}>
           <h3 className={s.cardTitle}><Activity size={20} color="#8b5cf6" /> MAYOR VALOR INVERTIDO</h3>
           <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
             {data?.top_items.map((item, i) => (
               <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 13, fontWeight: 900 }}>{item.name}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 800 }}>{item.qty.toLocaleString()} unidades</span>
                 </div>
                 <div style={{ fontWeight: 950, color: '#0f172a' }}>{fmtUSD(item.value)}</div>
               </div>
             ))}
           </div>
        </div>

        {/* Depósitos */}
        <div className={s.card}>
           <h3 className={s.cardTitle}><BarChart2 size={20} color="#10b981" /> STOCK POR DEPÓSITO</h3>
           <div className={s.chartContainer} style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={data?.by_warehouse}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 900, fill: '#64748b' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 900, fill: '#64748b' }} tickFormatter={(val) => `u$s ${val/1000}k`} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(val) => fmtUSD(val)} />
                    <Bar dataKey="value" fill="#10b981" radius={[8, 8, 0, 0]} barSize={40} />
                 </BarChart>
              </ResponsiveContainer>
           </div>
        </div>

        {/* Críticos */}
        <div className={s.card}>
           <h3 className={s.cardTitle}><AlertTriangle size={20} color="#ef4444" /> ALERTAS DE REPOSICIÓN</h3>
           <table className={s.table}>
              <thead>
                <tr>
                   <th>PRODUCTO</th>
                   <th style={{ textAlign: 'right' }}>STOCK</th>
                   <th style={{ textAlign: 'right' }}>ACCION</th>
                </tr>
              </thead>
              <tbody>
                {data?.critical_items.map((item, i) => (
                  <tr key={i}>
                    <td>
                       <div style={{ fontWeight: 900 }}>{item.name}</div>
                       <div style={{ fontSize: 10, color: '#94a3b8' }}>Mínimo: {item.min}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 950, color: '#ef4444' }}>{item.qty}</td>
                    <td style={{ textAlign: 'right' }}>
                       <button style={{ padding: '6px 12px', borderRadius: 10, background: '#fef2f2', border: 'none', color: '#ef4444', fontWeight: 950, fontSize: 10, cursor: 'pointer' }}>
                          ORDENAR CC
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
           </table>
        </div>
      </div>
    </div>
  );
}
