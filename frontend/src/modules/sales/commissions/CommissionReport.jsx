import React, { useState, useEffect, useMemo } from "react";
import { 
  Search, RefreshCw, FileText, ChevronRight, DollarSign, Wallet, Users, Settings
} from "lucide-react";
import ContentHeader from "../../../components/layout/ContentHeader";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import { useToast } from "../../../context/ToastContext";
import api from "../../../services/api";
import { openStandaloneWindow } from "../../../utils/openStandaloneWindow";
import s from "./Commissions.module.css";

export default function CommissionReport() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { showToast } = useToast();

  const fetchSellers = async () => {
    setLoading(true);
    try {
      const data = await api.get("/commissions/sellers");
      setSellers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error loading sellers:", err);
      showToast("Error al cargar vendedores", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post("/commissions/applications/sync");
      showToast("Comisiones sincronizadas exitosamente", "success");
      fetchSellers();
    } catch (err) {
      console.error(err);
      showToast("Error sincronizando comisiones", "error");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchSellers();
  }, []);

  const openDetail = (sellerId) => {
    openStandaloneWindow(`/standalone/comisiones/vendedor/${sellerId}`);
  };

  const fmt = (val, cur = "USD") => {
    if (!val && val !== 0) return cur === "ARS" ? "$ 0.00" : "USD 0.00";
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: cur }).format(val);
  };

  const filteredSellers = useMemo(() => {
    if (!searchTerm) return sellers;
    const lower = searchTerm.toLowerCase();
    return sellers.filter(s => s.name.toLowerCase().includes(lower));
  }, [sellers, searchTerm]);

  // Global KPIs (Suma de todo en USD)
  const kpis = useMemo(() => {
    return sellers.reduce((acc, s) => {
      acc.sales += (s.sales_invoiced_usd || 0);
      acc.generated += (s.commission_generated_usd || 0);
      acc.paid += (s.commission_paid_usd || 0);
      acc.pending += (s.commission_pending_usd || 0);
      return acc;
    }, { sales: 0, generated: 0, paid: 0, pending: 0, count: sellers.length });
  }, [sellers]);

  const KPICard = ({ title, value, icon: Icon, color }) => (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '20px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px',
        background: `var(--${color})`
      }} />
      <div style={{
        width: '48px', height: '48px',
        borderRadius: '12px',
        background: `var(--${color}-light, rgba(79, 70, 229, 0.1))`,
        color: `var(--${color})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <Icon size={24} />
      </div>
      <div>
        <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
          {title}
        </div>
        <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>
          {value}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc' }}>
      <ContentHeader 
        title="Gestión de Comisiones"
        actions={
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button
              variant="outline"
              icon={<RefreshCw size={16} />}
              onClick={handleSync}
              loading={syncing}
            >
              Sincronizar
            </Button>
          </div>
        }
      />

      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, overflowY: 'auto' }}>
        
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
          <KPICard title="Ventas Comisionables" value={fmt(kpis.sales, "USD")} icon={FileText} color="primary" />
          <KPICard title="Comisión Generada" value={fmt(kpis.generated, "USD")} icon={DollarSign} color="info" />
          <KPICard title="Comisión Pagada" value={fmt(kpis.paid, "USD")} icon={Wallet} color="success" />
          <KPICard title="Comisión Pendiente" value={fmt(kpis.pending, "USD")} icon={DollarSign} color="warning" />
          <KPICard title="Vendedores Activos" value={kpis.count} icon={Users} color="secondary" />
        </div>

        {/* Filters & Table */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '300px' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input 
                  type="text"
                  placeholder="Buscar vendedor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px 8px 36px',
                    borderRadius: '8px', border: '1px solid #e2e8f0',
                    fontSize: '14px', outline: 'none'
                  }}
                />
              </div>
            </div>
            <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
              {filteredSellers.length} vendedores encontrados
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Vendedor</th>
                  <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Modalidad</th>
                  <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Ventas Facturadas</th>
                  <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Generado</th>
                  <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Disponible</th>
                  <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Pagado</th>
                  <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Pendiente</th>
                  <th style={{ padding: '12px 20px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'center' }}>Estado</th>
                  <th style={{ padding: '12px 20px', width: '50px' }}></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                      <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto', marginBottom: '12px' }} />
                      Cargando comisiones...
                    </td>
                  </tr>
                ) : filteredSellers.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                      No se encontraron vendedores activos.
                    </td>
                  </tr>
                ) : (
                  filteredSellers.map(seller => {
                    const hasMovements = seller.doc_count > 0 || seller.sales_invoiced_usd > 0;
                    
                    let status = "SIN MOVIMIENTOS";
                    let statusType = "neutral";

                    if (hasMovements) {
                      if (seller.commission_pending_usd > 0) {
                        status = "CON DEUDA";
                        statusType = "warning";
                      } else {
                        status = "AL DÍA";
                        statusType = "success";
                      }
                    }

                    return (
                      <tr 
                        key={seller.id} 
                        style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s', cursor: 'pointer' }}
                        onClick={() => openDetail(seller.id)}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <td style={{ padding: '16px 20px' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{seller.name}</div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                            {seller.commission_pct}% • {seller.commission_currency}
                          </div>
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Settings size={14} color="#64748b" />
                            <span style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>
                              {seller.commission_mode_label}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: 500, color: '#334155' }}>
                          {fmt(seller.sales_invoiced_usd, seller.commission_currency)}
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#0f172a' }}>
                          {fmt(seller.commission_generated_usd, seller.commission_currency)}
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                          {fmt(seller.commission_available_usd, seller.commission_currency)}
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#475569' }}>
                          {fmt(seller.commission_paid_usd, seller.commission_currency)}
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: 600, color: seller.commission_pending_usd > 0 ? '#ef4444' : '#64748b' }}>
                          {fmt(seller.commission_pending_usd, seller.commission_currency)}
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                          <Badge type={statusType}>{status}</Badge>
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                          <ChevronRight size={18} color="#94a3b8" />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
