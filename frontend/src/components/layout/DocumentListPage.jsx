import React from 'react';
import ContentHeader from './ContentHeader';
import s from './DocumentListPage.module.css';

/**
 * Componente base para listados estilo ERP (Órdenes, Facturas, Remitos, etc).
 * Estandariza la disposición visual de KPIs, Toolbar y Tabla.
 *
 * @param {Object} props
 * @param {String} props.title
 * @param {Array} props.breadcrumbs
 * @param {Array} props.kpis - Array of { label, value, sub, type: 'Primary' | 'Warning' | 'Info' | 'Success' | 'Default' }
 * @param {Object} props.toolbar
 * @param {React.ReactNode} props.toolbar.searchWrap - Input de búsqueda
 * @param {React.ReactNode} props.toolbar.filtersToggle - Botón para abrir/cerrar filtros
 * @param {React.ReactNode} props.toolbar.actions - Acciones generales (Exportar, Columnas, Limpiar, Nuevo)
 * @param {React.ReactNode} props.toolbar.massActions - Acciones masivas (solo se muestran si hay elementos seleccionados)
 * @param {React.ReactNode} props.toolbar.filtersArea - Fila de selectores y filtros extra (renderizado condicionalmente)
 * @param {Object} props.table
 * @param {Array} props.table.columns - Array de headers
 * @param {React.ReactNode} props.table.body - Contenido tbody (tr, td, Skeleton, Error, Empty)
 * @param {Object} props.pagination
 * @param {String} props.pagination.infoText - Texto de reporte ("REPORTE: X ÓRDENES LOCALIZADAS")
 * @param {Number} props.pagination.totalPages
 * @param {Number} props.pagination.currentPage
 * @param {Function} props.pagination.onPageChange
 */
export default function DocumentListPage({
  title,
  breadcrumbs,
  kpis = [],
  toolbar,
  table,
  pagination
}) {
  return (
    <div className={s.pageLayout}>
      <ContentHeader breadcrumbs={breadcrumbs} title={title} />

      {/* KPI Row */}
      {kpis && kpis.length > 0 && (
        <div className={s.kpiRow}>
          {kpis.map((kpi, index) => {
            let kpiClass = s.kpiCard;
            if (kpi.type === 'Primary') kpiClass += ` ${s.kpiPrimary}`;
            if (kpi.type === 'Warning') kpiClass += ` ${s.kpiWarning}`;
            if (kpi.type === 'Info') kpiClass += ` ${s.kpiInfo}`;
            if (kpi.type === 'Success') kpiClass += ` ${s.kpiSuccess}`;

            return (
              <div key={index} className={kpiClass}>
                <div className={s.kpiHeader}>
                  <span>{kpi.label}</span>
                </div>
                <div className={s.kpiValue}>{kpi.value}</div>
                <div className={s.kpiSub}>{kpi.sub}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Toolbar */}
      {toolbar && (
        <div className={s.toolbar}>
          <div className={s.toolbarMain}>
            {toolbar.searchWrap}
            {toolbar.filtersToggle}

            <div className={s.actionGroup}>
              {toolbar.massActions}
              {toolbar.actions}
            </div>
          </div>
          {toolbar.filtersArea}
        </div>
      )}

      {/* Table */}
      {table && (
        <div className={s.cardTable}>
          <div className={s.tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  {table.columns}
                </tr>
              </thead>
              <tbody>
                {table.body}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className={s.paginationBar}>
          <div className={s.paginationInfo}>
            {pagination.infoText}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[...Array(pagination.totalPages)].map((_, i) => (
              <div
                key={i}
                className={`${s.pageNum} ${pagination.currentPage === i + 1 ? s.active : ""}`}
                onClick={() => pagination.onPageChange(i + 1)}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
