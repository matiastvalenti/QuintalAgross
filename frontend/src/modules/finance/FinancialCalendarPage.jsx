import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Info, DollarSign, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import api from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import s from './ChequesPage.module.css'; // Better base styles for Bento cards

export default function FinancialCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchFinancialData();
  }, [currentDate]);

  const fetchFinancialData = async () => {
    setLoading(true);
    try {
      // Get documents with payments to see what's pending and when it's due
      const data = await api.get(`/accounting/documents/`);
      const mapped = data.map(doc => ({
        id: doc.id,
        date: doc.due_date || doc.date,
        type: doc.doc_type,
        label: `${doc.number} (${doc.entity_id})`,
        amount: doc.total_amount,
        currency: doc.currency,
        color: doc.doc_type?.includes('SALE') || doc.doc_type === 'INVOICE' ? 'green' : 'red'
      })).filter(e => {
          const d = new Date(e.date);
          return d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
      });
      setEvents(mapped);
    } catch (e) {
      console.error("Error fetching calendar data", e);
    } finally {
      setLoading(false);
    }
  };

  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0 (Dom) a 6 (Sab)
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    // Espaciado inicial (ajustar si se quiere Lunes como primer día)
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= totalDays; i++) {
        days.push(i);
    }
    return days;
  }, [currentDate]);

  const goToPrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const getEventsForDay = (day) => {
    if (!day) return [];
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return events.filter(e => e.date === dateStr);
  };

  const monthName = currentDate.toLocaleString('es-AR', { month: 'long', year: 'numeric' });

  return (
    <>
      <ContentHeader
        breadcrumbs={[{ label: 'Finanzas' }, { label: 'Calendario' }]}
        title="Calendario de Vencimientos"
        actions={
          <div style={{ display: 'flex', gap: 12 }}>
             <Button variant="secondary" onClick={() => setCurrentDate(new Date())}>Hoy</Button>
             <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden' }}>
                <Button variant="ghost" onClick={goToPrevMonth} style={{ borderRadius: 0 }}><ChevronLeft size={18} /></Button>
                <div style={{ background: 'white', display: 'flex', alignItems: 'center', padding: '0 16px', fontWeight: 700, fontSize: 13, textTransform: 'capitalize' }}>
                  {monthName}
                </div>
                <Button variant="ghost" onClick={goToNextMonth} style={{ borderRadius: 0 }}><ChevronRight size={18} /></Button>
             </div>
          </div>
        }
      />

      <style>{`
        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          background: var(--border-color);
          gap: 1px;
          border: 1px solid var(--border-color);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: var(--shadow-md);
        }
        .calendar-header-day {
          background: #f8fafc;
          padding: 12px;
          text-align: center;
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .calendar-day {
          background: white;
          min-height: 140px;
          padding: 8px;
          transition: all 0.2s;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .calendar-day:hover {
          background: #f8fafc;
        }
        .calendar-day.today {
          background: #eff6ff;
        }
        .calendar-day.empty {
          background: #f1f5f9;
        }
        .day-number {
          font-size: 14px;
          font-weight: 700;
          color: #94a3b8;
          margin-bottom: 4px;
        }
        .calendar-day.today .day-number {
          color: var(--primary);
        }
        .event-item {
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.1s;
        }
        .event-item:hover {
          transform: scale(1.02);
        }
        .event-green { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
        .event-red { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
        .event-blue { background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; }
        
        .totals-strip {
          display: flex;
          gap: 20px;
          margin-bottom: 20px;
          background: white;
          padding: 16px 24px;
          border-radius: 16px;
          border: 1px solid var(--border-color);
          box-shadow: var(--shadow-sm);
        }
        .total-item {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .total-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ti-green { background: #dcfce7; color: #166534; }
        .ti-red { background: #fee2e2; color: #991b1b; }
        .total-info { display: flex; flex-direction: column; }
        .ti-label { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; }
        .ti-val { font-size: 16px; font-weight: 800; color: #1e293b; }
      `}</style>

      <div className="totals-strip">
          <div className="total-item">
            <div className="total-icon ti-green"><ArrowDownLeft size={20} /></div>
            <div className="total-info">
              <span className="ti-label">Cobros Previstos</span>
              <span className="ti-val">{formatCurrency(events.filter(e => e.color === 'green').reduce((acc, e) => acc + e.amount, 0))}</span>
            </div>
         </div>
         <div className="total-item" style={{ marginLeft: 'auto' }}>
            <div className="total-icon ti-red"><ArrowUpRight size={20} /></div>
            <div className="total-info" style={{ textAlign: 'right' }}>
              <span className="ti-label">Pagos Previstos</span>
              <span className="ti-val">{formatCurrency(events.filter(e => e.color === 'red').reduce((acc, e) => acc + e.amount, 0))}</span>
            </div>
         </div>
      </div>

      <div className="calendar-grid">
        {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
          <div key={day} className="calendar-header-day">{day}</div>
        ))}
        {daysInMonth.map((day, i) => {
          const dayEvents = getEventsForDay(day);
          const isToday = day && day === new Date().getDate() && currentDate.getMonth() === new Date().getMonth() && currentDate.getFullYear() === new Date().getFullYear();
          
          return (
            <div key={i} className={`calendar-day ${!day ? 'empty' : ''} ${isToday ? 'today' : ''}`}>
              {day && (
                <>
                  <div className="day-number">{day}</div>
                  {dayEvents.map(e => (
                    <div key={e.id} className={`event-item event-${e.color}`} title={`${e.label} - $${e.amount.toLocaleString()}`}>
                        {e.color === 'green' ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}
                        {e.label}
                    </div>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
