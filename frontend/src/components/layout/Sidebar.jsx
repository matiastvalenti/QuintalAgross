import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Truck, Package, DollarSign,
  BarChart3, Settings, ChevronRight, Calculator, CalendarCheck,
  User as UserIcon, LogOut, LandPlot, Tractor, Sprout, CircleDollarSign, Wheat, Landmark, LineChart
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWindow } from '../../context/WindowContext';
import { openResumenCuenta, openEntitiesManager, openUsersManager, openAuditLogs, openFleetManager } from '../../utils/openStandaloneWindow';
import s from './Sidebar.module.css';

const NAV_GROUPS = [
  {
    title: 'DASHBOARD',
    items: [
      { label: 'Dashboard', to: '/', icon: LayoutDashboard },
      { label: 'Dashboard CRM', to: '/crm/dashboard', icon: LineChart },
    ]
  },
  {
    title: 'OPERACIONES',
    items: [
      {
        label: 'Campo', icon: Sprout, perm: 'items',
        children: [
          { label: 'Establecimientos', to: '/campo/establecimientos', perm: 'items' },
          { label: 'Lotes', to: '/campo/lotes', perm: 'items' },
          { label: 'Actividades', to: '/campo/actividades', perm: 'items' },
          { label: 'Maquinaria', to: '/campo/maquinaria', perm: 'items' },
          { label: 'Flota (Vehículos)', to: '/configuracion/flota', perm: 'items' },
          { label: 'Rentabilidad', to: '/campo/rentabilidad', perm: 'items' },
        ]
      },
      {
        label: 'Ventas', icon: CircleDollarSign, perm: 'sales_orders',
        badgeKey: 'ventas_pendientes', // TODO: Conectar con endpoint de estado operativo
        children: [
          { label: 'Orden de Venta', to: '/ventas/orden-venta', perm: 'sales_orders' },
          { label: 'Remitos', to: '/ventas/remitos', perm: 'sales_delivery' },
          { label: 'Facturas', to: '/ventas/facturas', perm: 'sales_invoices' },
          { label: 'Notas de Débito', to: '/ventas/notas-debito', perm: 'sales_invoices' },
          { label: 'Notas de Crédito', to: '/ventas/notas-credito', perm: 'sales_invoices' },
          { label: 'Comisiones', to: '/ventas/comisiones', perm: 'sales_orders' },
        ]
      },
      {
        label: 'Compras', icon: ShoppingCart, perm: 'purchase_orders',
        children: [
          { label: 'Orden de Compra', to: '/compras/orden-compra', perm: 'purchase_orders' },
          { label: 'Comparativa de Precios', to: '/compras/comparativa-precios', perm: 'purchase_orders' },
          { label: 'Remitos (Entrada)', to: '/compras/remitos', perm: 'purchase_orders' },
          { label: 'Facturas de Compra', to: '/compras/facturas', perm: 'purchase_invoices' },
          { label: 'Notas de Débito', to: '/compras/notas-debito', perm: 'purchase_invoices' },
          { label: 'Notas de Crédito', to: '/compras/notas-credito', perm: 'purchase_invoices' },
        ]
      },
      {
        label: 'Cereales', icon: Wheat, perm: 'sales_orders',
        children: [
          { label: 'Liq. Primarias (Compra)', to: '/cereales/liquidaciones-primarias', perm: 'sales_orders' },
          { label: 'Liq. Secundarias (Venta)', to: '/cereales/liquidaciones-secundarias', perm: 'sales_orders' },
          { label: 'Contratos', to: '/cereales/contratos', perm: 'sales_orders' },
          { label: 'Movimientos', to: '/cereales/movimientos', perm: 'sales_orders' },
          { label: 'Stock de Granos', to: '/cereales/stock', perm: 'sales_orders' },
        ]
      },
      {
        label: 'Inventario', icon: Package, perm: 'items',
        children: [
          { label: 'Dashboard Ejecutivo', to: '/inventario/dashboard', perm: 'items' },
          { label: 'Artículos', to: '/inventario/articulos', perm: 'items' },
          { label: 'Depósitos', to: '/inventario/depositos', perm: 'items' },
          { label: 'Movimientos / Ajustes', to: '/inventario/movimientos', perm: 'items' },
        ]
      }
    ]
  },
  {
    title: 'TESORERÍA',
    items: [
      {
        label: 'Finanzas', icon: Landmark, perm: 'cash',
        badgeKey: 'finanzas_pendientes', // TODO: Conectar con alertas operativas de finanzas
        children: [
          { label: 'Cajas', to: '/finanzas/cajas', perm: 'cash' },
          { label: 'Cheques', to: '/finanzas/cheques', perm: 'cheques' },
          { label: 'Recibos', to: '/finanzas/recibos', perm: 'payments' },
          { label: 'Pagos', to: '/finanzas/pagos', perm: 'payments' },
          { label: 'Aplicaciones', to: '/finanzas/aplicaciones', perm: 'payments' },
          { label: 'Gestor de Mora', to: '/finanzas/mora', perm: 'accounting_reports' },
          { label: 'Rendición de Gastos', to: '/finanzas/gastos', perm: 'cash' },
          { label: 'Antigüedad de Deuda', to: '/finanzas/antiguedad', perm: 'accounting_reports' },
        ]
      }
    ]
  },
  {
    title: 'ADMINISTRACIÓN',
    items: [
      {
        label: 'Contabilidad', icon: BarChart3, perm: 'accounting_reports',
        children: [
          { label: 'Resumen de Saldos', to: '/contabilidad/saldos', perm: 'accounting_reports' },
          { label: 'Resumen de Cuenta', to: '/contabilidad/cuenta-corriente', perm: 'accounting_reports' },
          { label: 'Libro Diario', to: '/contabilidad/libro-diario', perm: 'journal' },
          { label: 'Libro IVA Ventas/Compras', to: '/contabilidad/iva', perm: 'accounting_reports' },
          { label: 'Percepciones y Retenciones', to: '/contabilidad/impuestos', perm: 'accounting_reports' },
        ]
      }
    ]
  },
  {
    title: 'ORGANIZACIÓN',
    items: [
      { 
        label: 'Planificación', icon: CalendarCheck,
        children: [
            { label: 'Calendario Financiero', to: '/finanzas/calendario', perm: 'accounting_reports' },
            { label: 'Agenda de Tareas', to: '/planificacion', perm: 'items' },
        ]
      },
      {
        label: 'Configuración', icon: Settings, perm: 'users',
        children: [
          { label: 'General', to: '/configuracion', perm: 'users' },
          { label: 'Usuarios y Perfiles', to: '/configuracion/usuarios', perm: 'users' },
          { label: 'Entidades', to: '/configuracion/entidades', perm: 'users' },
          { label: 'Unidades de Negocio', to: '/configuracion/unidades-negocio', perm: 'users' },
          { label: 'Campañas', to: '/configuracion/campañas', perm: 'users' },
          { label: 'Puntos de Venta', to: '/configuracion/pos', perm: 'users' },
          { label: 'Condiciones de Venta', to: '/configuracion/condiciones-venta', perm: 'users' },
          { label: 'Auditoría de Sistema', to: '/configuracion/auditoria', perm: 'users' },
        ]
      }
    ]
  }
];

export default function Sidebar({ openMobile, setOpenMobile }) {
  const { user, logout, can } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState({});
  const location = useLocation();
  const navigate = useNavigate();
  const { openWindow } = useWindow();

  useEffect(() => {
    if (setOpenMobile) setOpenMobile(false);
  }, [location.pathname, setOpenMobile]);

  useEffect(() => {
    if (collapsed) return;
    const path = location.pathname;
    const newExpanded = { ...expanded };
    NAV_GROUPS.forEach(group => {
      group.items.forEach(item => {
        if (item.children) {
          const isActive = item.children.some(child => path.startsWith(child.to));
          if (isActive) newExpanded[item.label] = true;
        }
      });
    });
    setExpanded(newExpanded);
  }, [location.pathname, collapsed]);

  const toggleSection = (label) => {
    if (collapsed) setCollapsed(false);
    setExpanded(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const handleItemClick = (e, item) => {
      // Configuraciones en ventanas
      if (item.to === '/configuracion/entidades' || item.label === 'Entidades') {
          e.preventDefault();
          openEntitiesManager({ 
              title: 'Gestión de Entidades', 
              width: 1050, 
              height: 600,
          });
      }
      if (item.to === '/configuracion/flota') {
          e.preventDefault();
          openFleetManager({ title: 'Flota / Vehículos', width: 1050, height: 700 });
      }
      if (item.to === '/configuracion/pos') {
          e.preventDefault();
          openWindow('pos-config', {}, { title: 'Puntos de Venta', width: 1050, height: 700, singletonKey: 'config-pos' });
      }
      if (item.to === '/configuracion/unidades-negocio') {
          e.preventDefault();
          openWindow('simple-config', { type: 'business-units', title: 'Unidades de Negocio' }, { title: 'Unidades de Negocio', width: 1050, height: 700, singletonKey: 'config-bu' });
      }
      if (item.to === '/configuracion/campañas') {
          e.preventDefault();
          openWindow('simple-config', { type: 'campaigns', title: 'Campañas' }, { title: 'Campañas', width: 1050, height: 700, singletonKey: 'config-campaigns' });
      }
      if (item.to === '/configuracion/usuarios' || item.label === 'Usuarios y Perfiles') {
          e.preventDefault();
          openUsersManager({ 
              title: 'Gestión de Usuarios y Accesos', 
              width: 1100, 
              height: 700,
          });
      }
      
      if (item.to === '/contabilidad/cuenta-corriente') {
          e.preventDefault();
          openResumenCuenta(null, { 
              title: 'Resumen de Cuenta Corriente', 
              width: 1200, 
              height: 750,
          });
      }
      /* Removed application-manager window redirect, now a full page */

      if (item.to === '/configuracion/auditoria') {
          e.preventDefault();
          openAuditLogs({ 
              title: 'Visor de Auditoría', 
              width: 1200, 
              height: 750,
          });
      }
      if (item.to?.startsWith('/campo/')) {
          e.preventDefault();
          const route = item.to.split('/').pop();
          const config = {
              'establecimientos': { key: 'farms-manager', title: 'Gestión de Campos', w: 1100, h: 700 },
              'lotes': { key: 'lots-manager', title: 'Gestión de Lotes', w: 1000, h: 650 },
              'maquinaria': { key: 'machinery-manager', title: 'Maquinaria y Activos', w: 1100, h: 700 },
              'actividades': { key: 'activities-manager', title: 'Actividades Agrícolas', w: 1150, h: 750 },
              'rentabilidad': { key: 'field-dashboard', title: 'Dashboard de Rentabilidad', w: 1150, h: 750 }
          }[route];

          if (config) {
              openWindow(config.key, {}, {
                  title: config.title,
                  width: config.w,
                  height: config.h,
                  singletonKey: config.key
              });
          }
      }
  };

  return (
    <aside className={`${s.sidebar} ${collapsed ? s.collapsed : ''} ${openMobile ? s.openMobile : ''}`}>
      <div className={s.brandRow}>
        <div className={`${s.brand} ${!collapsed ? s.full : ''}`}>
          <div className={s.brandIcon}>QA</div>
          <span className={s.brandText}>Quintal Agross</span>
        </div>
        <button className={s.miniToggle} onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Expandir" : "Contraer"}>
          <ChevronRight size={16} style={{ transform: collapsed ? 'rotate(0)' : 'rotate(180deg)' }} />
        </button>
      </div>

      <nav className={s.nav}>
        {NAV_GROUPS.map((group, gIdx) => {
          // Filtrar items permitidos
          const allowedItems = group.items.filter(item => !item.perm || can(item.perm, 'view'));
          if (allowedItems.length === 0) return null;

          return (
            <div key={gIdx} className={s.navGroup}>
              {!collapsed && <div className={s.groupTitle}>{group.title}</div>}
              
              {allowedItems.map(item => {
                const Icon = item.icon;
                const visibleChildren = item.children?.filter(child => !child.perm || can(child.perm, 'view')) || [];

                if (item.children && visibleChildren.length === 0 && !item.to) return null;

                // MOCK BADGE: Aquí se conectará el estado global de notificaciones operativas.
                // Si el badgeCount es > 0 se muestra. Por ahora lo dejamos oculto.
                const badgeCount = 0; 

                if (!item.children || item.children.length === 0) {
                  return (
                    <NavLink
                      key={item.to || item.label}
                      to={item.to}
                      onClick={(e) => handleItemClick(e, item)}
                      className={({ isActive }) => `${s.item} ${isActive ? s.active : ''}`}
                      title={collapsed ? item.label : ''}
                    >
                      <span className={s.itemIcon}><Icon size={18} strokeWidth={2.5} /></span>
                      <span className={s.itemLabel}>{item.label}</span>
                      {badgeCount > 0 && !collapsed && <span className={s.badge}>{badgeCount}</span>}
                    </NavLink>
                  );
                }

                const isOpen = expanded[item.label];
                const isActiveGroup = visibleChildren.some(c => location.pathname.startsWith(c.to)) || (item.to && location.pathname === item.to);
                const ItemElement = item.to ? NavLink : 'button';
                const itemProps = item.to ? {
                  to: item.to,
                  className: ({ isActive }) => `${s.item} ${isActive || isActiveGroup ? s.active : ''} ${isOpen ? s.expanded : ''}`,
                  onClick: (e) => {
                    toggleSection(item.label);
                    handleItemClick(e, item);
                  }
                } : {
                  className: `${s.item} ${isActiveGroup ? s.active : ''} ${isOpen ? s.expanded : ''}`,
                  onClick: () => toggleSection(item.label)
                };

                return (
                  <div key={item.label} className={s.group}>
                    <ItemElement {...itemProps} title={collapsed ? item.label : ''}>
                      <span className={s.itemIcon}><Icon size={18} strokeWidth={2.5} /></span>
                      <span className={s.itemLabel}>{item.label}</span>
                      {badgeCount > 0 && !collapsed && <span className={s.badge}>{badgeCount}</span>}
                      <ChevronRight size={14} className={s.chevron} />
                    </ItemElement>

                    <div className={`${s.submenu} ${isOpen ? s.open : ''}`}>
                      {visibleChildren.map(child => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          onClick={(e) => handleItemClick(e, child)}
                          className={({ isActive }) => `${s.subItem} ${isActive ? s.active : ''}`}
                        >
                          <div className={s.dot} />
                          {child.label}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className={s.footer}>
        <div className={s.userCard}>
          <div className={s.avatar} onClick={() => navigate('/perfil')}>
            {user?.full_name?.charAt(0) || 'U'}
          </div>
          {!collapsed && (
            <div className={s.userInfo}>
              <div className={s.userName}>{user?.full_name || (user?.username ? `@${user.username}` : 'Usuario')}</div>
              <div className={s.userRole}>{user?.roles?.[0] || 'Miembro'}</div>
            </div>
          )}
          {!collapsed && (
            <button className={s.logoutBtn} onClick={logout} title="Cerrar Sesión">
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
