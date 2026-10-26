import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, FileSpreadsheet, FilterX, MapPin, Pencil, Plus, Search, ShieldAlert, Wallet, LayoutDashboard, RefreshCw, Download } from 'lucide-react';
import { useWindow } from '../../../context/WindowContext';
import s from '../EntitiesWorkspace.module.css';

const PAGE_SIZE = 50;
const labelByType = { client: 'Cliente', provider: 'Proveedor', mixed: 'Mixto', employee: 'Empleado' };
const newByType = { client: 'Nuevo cliente', provider: 'Nuevo proveedor', mixed: 'Nueva entidad', employee: 'Nuevo empleado' };
const collator = new Intl.Collator('es-AR', { numeric: true, sensitivity: 'base' });

export default function EntitiesTable({ entities = [], loading, error = '', selectedType, onSearch, searchQuery, onSelect, onNew, onImport, onRefresh }) {
    const { openWindow } = useWindow();
    const [sortField, setSortField] = useState('name');
    const [sortDirection, setSortDirection] = useState('asc');
    const [onlyIncomplete, setOnlyIncomplete] = useState(false);
    const [page, setPage] = useState(1);

    useEffect(() => { setPage(1); }, [entities, selectedType, searchQuery, sortField, sortDirection, onlyIncomplete]);

    const orderedEntities = useMemo(() => {
        const filtered = onlyIncomplete
            ? entities.filter(e => !e.tax_id || !e.city || !e.state)
            : entities;
        return [...filtered].sort((a, b) => {
            const left = String(a?.[sortField] ?? '');
            const right = String(b?.[sortField] ?? '');
            const result = collator.compare(left, right);
            return sortDirection === 'asc' ? result : -result;
        });
    }, [entities, onlyIncomplete, sortField, sortDirection]);
    const pages = Math.max(1, Math.ceil(orderedEntities.length / PAGE_SIZE));
    const safePage = Math.min(page, pages);
    const rows = orderedEntities.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
    const start = orderedEntities.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
    const end = Math.min(safePage * PAGE_SIZE, orderedEntities.length);

    const sortBy = field => {
        if (sortField === field) setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDirection('asc'); }
    };
    const SortHeader = ({ field, children, className = '' }) => (
        <button type="button" onClick={() => sortBy(field)} className={s.sortControl} aria-label={'Ordenar por ' + children}>
            {children}
            {sortField === field && (sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
        </button>
    );
    const openDashboard = entity => openWindow('entity-dashboard', { entityId: entity.id }, {
        title: 'Ficha 360 · ' + entity.name, width: 1160, height: 750, minWidth: 720, minHeight: 450,
        singletonKey: 'entity-dashboard-' + entity.id
    });
    const openStatement = entity => openWindow('statement-page', { entityId: entity.id }, {
        title: 'Cuenta corriente · ' + entity.name, width: 1200, height: 740, minWidth: 720, minHeight: 450,
        singletonKey: 'entity-statement-' + entity.id
    });
    const exportCsv = () => {
        if (!orderedEntities.length) return;
        const safeCell = value => {
            let cell = String(value ?? '');
            if (/^\s*[=+@-]/.test(cell)) cell = "'" + cell;
            return '"' + cell.replace(/"/g, '""') + '"';
        };
        const headers = ['Código', 'Razón social', 'Tipo', 'CUIT', 'Condición IVA', 'Teléfono', 'Correo', 'Dirección', 'Localidad', 'Provincia', 'Código postal'];
        const fields = ['code', 'name', 'type', 'tax_id', 'tax_category', 'phone', 'email', 'address', 'city', 'state', 'zip_code'];
        const csv = [headers.map(safeCell).join(';'), ...orderedEntities.map(entity => fields.map(field => safeCell(entity[field])).join(';'))].join('\r\n');
        const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'entidades-' + selectedType + '.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };
    const canImport = selectedType === 'client' || selectedType === 'provider';

    return (
        <div className={s.listSurface}>
            <div className={s.tableTop}>
                <div className={s.titleBlock}>
                    <h2>{selectedType === 'provider' ? 'Proveedores' : selectedType === 'mixed' ? 'Entidades mixtas' : selectedType === 'employee' ? 'Empleados' : 'Clientes'}</h2>
                    <p>Consultá, actualizá y gestioná cada ficha desde un solo lugar.</p>
                </div>
                <div className={s.topButtons}>
                    <button type="button" className={s.secondaryButton} onClick={exportCsv} disabled={loading || !orderedEntities.length} title="Descargar las fichas filtradas en CSV"><Download size={16} /> Exportar CSV</button>
                    {canImport && (
                        <button type="button" className={s.secondaryButton} onClick={onImport} title="Importación Excel con vista previa">
                            <FileSpreadsheet size={16} /> Importar Excel
                        </button>
                    )}
                    <button type="button" className={s.primaryButton} onClick={onNew}>
                        <Plus size={17} /> {newByType[selectedType] || 'Nueva entidad'}
                    </button>
                </div>
            </div>

            <div className={s.filterBar}>
                <div className={s.searchBox}>
                    <Search size={18} aria-hidden="true" />
                    <input type="search" aria-label="Buscar entidades" placeholder="Nombre, razón social, código o CUIT..." value={searchQuery} onChange={event => onSearch(event.target.value)} />
                    {searchQuery && <button className={s.clearSearch} onClick={() => onSearch('')} aria-label="Limpiar búsqueda" title="Limpiar búsqueda"><FilterX size={15} /></button>}
                </div>
                <button type="button" className={onlyIncomplete ? s.activeFilter : s.filterButton} aria-pressed={onlyIncomplete} onClick={() => setOnlyIncomplete(v => !v)} title="Mostrar fichas sin CUIT, localidad o provincia">
                    <ShieldAlert size={15} /> Fichas incompletas
                </button>
                <button type="button" className={s.refreshButton} onClick={onRefresh} disabled={loading} title="Recargar entidades"><RefreshCw size={16} /></button>
            </div>

            <div className={s.listMeta}>
                <span>{loading ? 'Consultando padrón...' : `${orderedEntities.length.toLocaleString('es-AR')} ${orderedEntities.length === 1 ? 'registro' : 'registros'}`}</span>
                <span className={s.listHint}>Hacé clic en una fila para editarla · Ordená desde los encabezados</span>
            </div>

            <div className={s.tableScroll}>
                {loading ? (
                    <div className={s.statePanel} role="status">Cargando entidades…</div>
                ) : error ? (
                    <div className={s.errorPanel} role="alert"><ShieldAlert size={20} /> <span>{error}</span><button onClick={onRefresh}>Reintentar</button></div>
                ) : orderedEntities.length === 0 ? (
                    <div className={s.statePanel}>
                        <Search size={27} />
                        <h3>{searchQuery || onlyIncomplete ? 'No hay coincidencias' : 'Todavía no hay registros'}</h3>
                        <p>{searchQuery || onlyIncomplete ? 'Probá con otros términos o quitá el filtro.' : 'Podés dar de alta una ficha o importar un listado desde Excel.'}</p>
                        {(searchQuery || onlyIncomplete) ? <button className={s.secondaryButton} onClick={() => { onSearch(''); setOnlyIncomplete(false); }}>Limpiar filtros</button> : <button className={s.primaryButton} onClick={onNew}>Crear entidad</button>}
                    </div>
                ) : (
                    <table className={s.dataTable}>
                        <thead>
                            <tr>
                                <th><SortHeader field="code">Código</SortHeader></th>
                                <th className={s.entityCol}><SortHeader field="name">Razón social / Nombre</SortHeader></th>
                                <th><SortHeader field="type">Tipo</SortHeader></th>
                                <th><SortHeader field="tax_id">CUIT</SortHeader></th>
                                <th><SortHeader field="city">Localidad / Provincia</SortHeader></th>
                                <th className={s.actionsHeading}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(entity => (
                                <tr key={entity.id} className={s.dataRow} tabIndex={0} onClick={() => onSelect(entity)} onKeyDown={event => { if (event.key === 'Enter' && event.target === event.currentTarget) onSelect(entity); }} aria-label={'Editar ' + entity.name}>
                                    <td><span className={s.codeCell}>{entity.code || '—'}</span></td>
                                    <td className={s.entityCol}>
                                        <div className={s.entityName} title={entity.name}>{entity.name || 'Sin nombre'}</div>
                                        {entity.email && <div className={s.secondaryCell} title={entity.email}>{entity.email}</div>}
                                    </td>
                                    <td><span className={s['badge_' + entity.type] || s.badge_generic}>{labelByType[entity.type] || entity.type}</span></td>
                                    <td><span className={entity.tax_id ? s.taxId : s.missingValue}>{entity.tax_id || 'Sin CUIT'}</span></td>
                                    <td>{entity.city || entity.state ? <span className={s.locationCell}><MapPin size={14} /> {[entity.city, entity.state].filter(Boolean).join(', ')}</span> : <span className={s.missingValue}>Sin ubicación</span>}</td>
                                    <td onClick={event => event.stopPropagation()}>
                                        <div className={s.rowActions}>
                                            <button type="button" title="Abrir ficha 360 dentro del sistema" aria-label={'Ficha 360 de ' + entity.name} onClick={() => openDashboard(entity)}><LayoutDashboard size={16} /></button>
                                            <button type="button" title="Abrir cuenta corriente dentro del sistema" aria-label={'Cuenta corriente de ' + entity.name} onClick={() => openStatement(entity)}><Wallet size={16} /></button>
                                            <button type="button" title="Editar entidad" aria-label={'Editar ' + entity.name} onClick={() => onSelect(entity)}><Pencil size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {!loading && !error && orderedEntities.length > 0 && (
                <div className={s.footerBar}>
                    <span>Mostrando {start.toLocaleString('es-AR')}–{end.toLocaleString('es-AR')} de {orderedEntities.length.toLocaleString('es-AR')}</span>
                    <div className={s.pagination}>
                        <button type="button" aria-label="Página anterior" disabled={safePage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft size={17} /></button>
                        <span>Página {safePage} de {pages}</span>
                        <button type="button" aria-label="Página siguiente" disabled={safePage >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}><ChevronRight size={17} /></button>
                    </div>
                </div>
            )}
        </div>
    );
}
