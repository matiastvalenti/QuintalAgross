import React from 'react';
import { 
  Building2, CreditCard, Tag, Briefcase, 
  Warehouse, Settings2, ShieldCheck, MapPin,
  Users, Truck, Receipt, Landmark
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWindow } from '../../context/WindowContext';
import s from './SystemConfigPage.module.css';

const CONFIG_GROUPS = [
  {
    name: "Maestros Generales",
    options: [
      {
        id: 'entities',
        title: 'Entidades',
        description: 'Gestión de Clientes, Proveedores y Mixtos.',
        icon: Building2,
        window: 'entities-manager',
        color: '#3b82f6'
      },
      {
        id: 'employees',
        title: 'Empleados',
        description: 'Gestión del personal para rendiciones y logística.',
        icon: Users,
        window: 'entities-manager',
        props: { initialType: 'employee' },
        color: '#ec4899'
      },
      {
        id: 'warehouses',
        title: 'Depósitos',
        description: 'Gestión de almacenes propios y de terceros.',
        icon: Warehouse,
        window: 'warehouses-manager',
        color: '#8b5cf6'
      },
      {
        id: 'banks',
        title: 'Bancos',
        description: 'Catálogo de entidades bancarias del sistema.',
        icon: Landmark,
        window: 'bank-config',
        color: '#0ea5e9'
      }
    ]
  },
  {
    name: "Comercial / Ventas",
    options: [
      {
        id: 'pos',
        title: 'Puntos de Venta',
        description: 'Configuración de PVs y correlatividad.',
        icon: MapPin,
        window: 'pos-config',
        color: '#6366f1'
      },
      {
        id: 'conditions',
        title: 'Condiciones de Venta',
        description: 'Plazos, intereses y vencimientos.',
        icon: CreditCard,
        window: 'sale-conditions',
        color: '#10b981'
      }
    ]
  },
  {
    name: "Logística y Otros",
    options: [
      {
        id: 'fleet',
        title: 'Flota / Vehículos',
        description: 'Administración de camiones y utilitarios.',
        icon: Truck,
        window: 'fleet-manager',
        color: '#f59e0b'
      },
      {
        id: 'bu',
        title: 'Unidades de Negocio',
        description: 'Divisiones comerciales de la empresa.',
        icon: Briefcase,
        window: 'simple-config',
        props: { type: 'business-units', title: 'Unidades de Negocio' },
        color: '#64748b'
      },
      {
        id: 'campaigns',
        title: 'Campañas',
        description: 'Definición de periodos productivos.',
        icon: Tag,
        window: 'simple-config',
        props: { type: 'campaigns', title: 'Campañas' },
        color: '#f43f5e'
      }
    ]
  },
  {
    name: "Seguridad y Personal",
    options: [
      {
        id: 'users',
        title: 'Usuarios y Permisos',
        description: 'Administración de accesos y roles de usuario.',
        icon: ShieldCheck,
        window: 'users-manager',
        color: '#f59e0b'
      }
    ]
  }
];

export default function SystemConfigPage() {
  const { openWindow } = useWindow();

  const handleOpen = (opt) => {
    openWindow(opt.window, opt.props || {}, {
      title: opt.title,
      width: 1050,
      height: 700,
      minWidth: 1000,
      minHeight: 600,
      singletonKey: `config-${opt.id}`
    });
  };

  return (
    <div className={s.container}>
      <header className={s.header}>
        <div className={s.headerContent}>
          <div className={s.headerBadge}>
             <Settings2 size={24} />
          </div>
          <div>
            <h1>Configuración</h1>
            <p>Maestros, parámetros del sistema y preferencias generales.</p>
          </div>
        </div>
      </header>

      {CONFIG_GROUPS.map(group => (
        <div key={group.name} className={s.section}>
          <h2 className={s.sectionTitle}>{group.name}</h2>
          <div className={s.grid}>
            {group.options.map(opt => (
              <div key={opt.id} className={s.card} onClick={() => handleOpen(opt)}>
                <div className={s.iconWrapper} style={{ backgroundColor: `${opt.color}15`, color: opt.color }}>
                  <opt.icon size={28} />
                </div>
                <div className={s.cardContent}>
                  <h3>{opt.title}</h3>
                  <p>{opt.description}</p>
                </div>
                <div className={s.cardFooter}>
                  <span>Gestionar</span>
                  <ShieldCheck size={14} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
