import React from 'react';
import { ChevronRight, Handshake, Truck, UserRoundCheck, UsersRound } from 'lucide-react';
import s from '../EntitiesWorkspace.module.css';

const types = [
    { id: 'client', label: 'Clientes', detail: 'Ventas y cobranzas', icon: UsersRound },
    { id: 'provider', label: 'Proveedores', detail: 'Compras y pagos', icon: Truck },
    { id: 'mixed', label: 'Mixtos', detail: 'Ambos circuitos', icon: Handshake },
    { id: 'employee', label: 'Empleados', detail: 'Personal y gastos', icon: UserRoundCheck }
];

export default function EntityTree({ selectedId, onSelect }) {
    return (
        <div className={s.tree}>
            <div className={s.treeHeading}>DIRECTORIO</div>
            <nav className={s.treeNav} aria-label="Tipos de entidades">
                {types.map(({ id, label, detail, icon: Icon }) => (
                    <button
                        type="button"
                        key={id}
                        className={selectedId === id ? s.treeItemActive : s.treeItem}
                        onClick={() => onSelect(id)}
                        aria-current={selectedId === id ? 'page' : undefined}
                    >
                        <span className={s.treeIcon}><Icon size={18} /></span>
                        <span className={s.treeText}><strong>{label}</strong><small>{detail}</small></span>
                        <ChevronRight size={15} className={s.treeChevron} />
                    </button>
                ))}
            </nav>
            <div className={s.treeHelp}>
                <Handshake size={18} />
                <div>
                    <strong>Un solo padrón</strong>
                    <p>Las entidades mixtas comparten su ficha y su CUIT entre compras y ventas.</p>
                </div>
            </div>
        </div>
    );
}
