import { useState, useEffect, useMemo } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { TableRowSkeleton } from '../../components/ui/TableSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Autocomplete from '../../components/ui/Autocomplete';
import api from '../../services/api';
import t from '../../components/ui/Table.module.css';
import s from '../../components/layout/DocumentListPage.module.css';
import compStyle from './PriceComparisonPage.module.css';
import { 
  TrendingUp, 
  Search, 
  Filter, 
  X, 
  DollarSign, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight, 
  Package,
  History,
  Info
} from 'lucide-react';

export default function PriceComparisonPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filtros
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [showFilters, setShowFilters] = useState(true);

  // Cargar datos
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (selectedProduct) params.product_id = selectedProduct.id;
      if (selectedProvider) params.entity_id = selectedProvider.id;

      const results = await api.get('/purchases/price-comparison/', { params });
      setData(results);
    } catch (err) {
      console.error(err);
      setError("Error al cargar la comparativa de precios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedProduct, selectedProvider]);

  // Funciones de búsqueda para Autocomplete
  const searchProducts = async (query) => {
    try {
      const res = await api.get('/purchases/price-comparison/autocomplete/products', { 
        params: { q: query || '' } 
      });
      return res;
    } catch (e) {
      console.error("Product search error:", e);
      return [];
    }
  };

  const searchEntities = async (query) => {
    try {
      const res = await api.get('/purchases/price-comparison/autocomplete/entities', { 
        params: { q: query || '', type: 'provider' } 
      });
      return res;
    } catch (e) {
      console.error("Provider search error:", e);
      return [];
    }
  };

  // El sistema garantiza que el primero es el último usado
  const lastPrice = useMemo(() => data[0] || null, [data]);

  const stats = useMemo(() => {
    if (data.length < 2) return null;
    const current = data[0].unit_price;
    const previous = data[1].unit_price;
    const diff = current - previous;
    const pct = previous !== 0 ? (diff / previous) * 100 : 0;
    return { diff, pct };
  }, [data]);

  const fmt = (val, cur = 'USD') => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: 2
    }).format(val || 0);
  };

  return (
    <div className={s.pageLayout}>
      <ContentHeader
        breadcrumbs={[{ label: 'Compras' }, { label: 'Comparativa de Precios' }]}
        title="Comparativa de Precios"
        actions={
          <Button variant="ghost" onClick={() => {
            setSelectedProduct(null);
            setSelectedProvider(null);
          }}>
            <X size={16} /> Limpiar Filtros
          </Button>
        }
      />

      {/* DASHBOARD DE ÚLTIMA COMPRA */}
      {selectedProduct && lastPrice && (
        <div className={compStyle.heroSection}>
          <div className={`${compStyle.featuredCard} ${stats?.diff > 0 ? compStyle.priceUp : stats?.diff < 0 ? compStyle.priceDown : ''}`}>
             <div className={compStyle.lastPurchaseBadge}>
               <History size={14} /> ÚLTIMA REFERENCIA
             </div>
             
             <div className={compStyle.heroMain}>
                <div className={compStyle.heroInfo}>
                   <h2 className={compStyle.productTitle}>{lastPrice.product_name}</h2>
                   <div className={compStyle.providerSub}>
                     <Package size={14} /> {lastPrice.provider_name}
                   </div>
                   <div className={compStyle.dateRef}>
                     <Calendar size={14} /> {new Date(lastPrice.date).toLocaleDateString()} • {lastPrice.order_number}
                   </div>
                </div>

                <div className={compStyle.heroValueWrap}>
                   <div className={compStyle.heroLabel}>Precio Unitario</div>
                   <div className={compStyle.heroValue}>{fmt(lastPrice.unit_price, lastPrice.currency)}</div>
                   {stats && (
                     <div className={`${compStyle.heroStats} ${stats.diff > 0 ? compStyle.textDanger : compStyle.textSuccess}`}>
                       {stats.diff > 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                       {Math.abs(stats.pct).toFixed(1)}% vs anterior ({fmt(data[1].unit_price, data[1].currency)})
                     </div>
                   )}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* TOOLBAR CON AUTOCOMPLETES - Premium Layout */}
      <div className={compStyle.searchBarSection}>
        <div className={compStyle.searchBarContent}>
          <div className={compStyle.mainAutocomplete}>
            <Autocomplete
              placeholder="Escribe o haz clic para ver productos..."
              onSearch={searchProducts}
              onSelect={setSelectedProduct}
              initialValue={selectedProduct}
              icon={<Package size={20} />}
              variant="glass"
              minChars={0}
            />
          </div>
          
          <div className={compStyle.divider} />

          <div className={compStyle.secondaryAutocomplete}>
            <Autocomplete
              placeholder="Buscar por proveedor..."
              onSearch={searchEntities}
              onSelect={setSelectedProvider}
              initialValue={selectedProvider}
              icon={<Search size={18} />}
              variant="glass"
              minChars={0}
            />
          </div>
        </div>
      </div>

      {/* TABLA DE RESULTADOS */}
      <div className={s.cardTable}>
        <div className={s.tableWrap}>
          <table className={t.table}>
            <thead>
              <tr>
                <th className={s.th}>Fecha</th>
                <th className={s.th}>Orden</th>
                <th className={s.th}>Proveedor</th>
                <th className={s.th}>Producto</th>
                <th className={s.th} style={{ textAlign: 'right' }}>Cantidad</th>
                <th className={s.th} style={{ textAlign: 'right' }}>Precio Unit.</th>
                <th className={s.th} style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableRowSkeleton rows={10} cols={7} />
              ) : error ? (
                <tr>
                  <td colSpan="7"><ErrorState message={error} onRetry={fetchData} /></td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan="7">
                    <EmptyState 
                      icon={DollarSign}
                      title="Sin historial de precios"
                      description="No se encontraron compras registradas con los filtros seleccionados."
                    />
                  </td>
                </tr>
              ) : (
                data.map((row, idx) => (
                  <tr key={idx} className={`${s.row} ${idx === 0 ? compStyle.latestRow : ''}`}>
                    <td className={s.td}>{new Date(row.date).toLocaleDateString()}</td>
                    <td className={`${s.td} ${s.numberCell}`}>{row.order_number}</td>
                    <td className={s.td}>{row.provider_name}</td>
                    <td className={s.td} style={{ fontWeight: 500 }}>{row.product_name}</td>
                    <td className={s.td} style={{ textAlign: 'right' }}>{row.qty.toLocaleString()}</td>
                    <td className={s.td} style={{ textAlign: 'right', fontWeight: 600, color: 'var(--primary)' }}>
                      {fmt(row.unit_price, row.currency)}
                    </td>
                    <td className={s.td} style={{ textAlign: 'right', color: '#64748b' }}>
                      {fmt(row.unit_price * row.qty, row.currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {!loading && data.length > 0 && (
        <div className={compStyle.footerHint}>
          <Info size={14} /> Se muestran los últimos 100 registros. {selectedProduct ? `Analizando historial para ${selectedProduct.label}` : 'Historial general de compras.'}
        </div>
      )}
    </div>
  );
}
