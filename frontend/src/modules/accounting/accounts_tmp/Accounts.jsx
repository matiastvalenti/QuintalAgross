import { useState, useEffect } from 'react';
import styles from './Accounts.module.css';

const API_URL = 'http://localhost:8000';

export default function Accounts() {
  const [entities, setEntities] = useState([]);
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchEntities();
  }, []);

  const fetchEntities = async () => {
    try {
      const res = await fetch(`${API_URL}/entities/`);
      const data = await res.json();
      setEntities(data);
    } catch (err) {
      console.error('Error fetching entities', err);
    }
  };

  const fetchLedger = async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/accounts/${id}/ledger`);
      const data = await res.json();
      setLedger(data);
    } catch (err) {
      console.error('Error fetching ledger', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEntityChange = (e) => {
    const id = e.target.value;
    setSelectedEntityId(id);
    fetchLedger(id);
  };

  return (
    <>
      <div className={styles.controls}>
        <select 
          className={styles.select} 
          value={selectedEntityId} 
          onChange={handleEntityChange}
        >
          <option value="">Seleccionar Entidad...</option>
          {entities.map(e => (
            <option key={e.id} value={e.id}>{e.name} ({e.type})</option>
          ))}
        </select>
      </div>

      {loading && <p>Cargando libro mayor...</p>}

      {ledger && (
        <div className={styles.ledger}>
          <div className={styles.summary}>
            <h3>{ledger.entity.name}</h3>
            <p className={styles.balance}>
              Saldo Actual: <span className={ledger.balance < 0 ? styles.negative : styles.positive}>
                ${ledger.balance.toFixed(2)}
              </span>
            </p>
          </div>

          <table className={styles.table}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Descripción</th>
                <th>Moneda</th>
                <th>Débito</th>
                <th>Crédito</th>
              </tr>
            </thead>
            <tbody>
              {ledger.movements.map(m => (
                <tr key={m.id}>
                  <td>{new Date(m.date).toLocaleDateString()}</td>
                  <td>{m.description}</td>
                  <td>{m.currency}</td>
                  <td className={styles.debit}>{m.debit > 0 ? `-${m.debit}` : '-'}</td>
                  <td className={styles.credit}>{m.credit > 0 ? `+${m.credit}` : '-'}</td>
                </tr>
              ))}
              {ledger.movements.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center' }}>No hay movimientos registrados</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
