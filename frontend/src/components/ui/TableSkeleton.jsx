import React from 'react';
import Skeleton from './Skeleton';
import t from './Table.module.css';

const TableSkeleton = ({ rows = 5, cols = 4 }) => {
  const rowElements = Array.from({ length: rows });
  const colElements = Array.from({ length: cols });

  return (
    <div className={t.container}>
      <table className={t.table}>
        <thead>
          <tr>
            {colElements.map((_, i) => (
              <th key={i}>
                <Skeleton width="60%" height="12px" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowElements.map((_, ri) => (
            <tr key={ri}>
              {colElements.map((_, ci) => (
                <td key={ci}>
                  <Skeleton width="80%" height="16px" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const TableRowSkeleton = ({ rows = 5, cols = 4 }) => {
  const rowElements = Array.from({ length: rows });
  const colElements = Array.from({ length: cols });

  return (
    <>
      {rowElements.map((_, ri) => (
        <tr key={ri}>
          {colElements.map((_, ci) => (
            <td key={ci} style={{ padding: '16px' }}>
              <Skeleton width="100%" height="20px" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
};

export default TableSkeleton;
