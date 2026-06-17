import { useState, useEffect } from 'react';
import { 
    Bell, 
    CheckCircle2, 
    AlertTriangle, 
    Clock, 
    ExternalLink, 
    Trash2, 
    CheckSquare,
    ChevronRight,
    Search
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import { API_URL } from '../../config';
import { useToast } from '../../context/ToastContext';
import s from './NotificationsPage.module.css';

export default function NotificationsPage() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('ALL'); // ALL, UNREAD, READ

    useEffect(() => {
        fetchNotifications();
    }, []);

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/tasks/notifications`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setNotifications(await res.json());
            }
        } catch (error) {
            showToast("Error al cargar notificaciones", "error");
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async (id) => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/tasks/notifications/${id}/read`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
                window.dispatchEvent(new Event('notifications-updated'));
            }
        } catch (e) {}
    };

    const markAsUnread = async (id) => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/tasks/notifications/${id}/unread`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: false } : n));
                window.dispatchEvent(new Event('notifications-updated'));
            }
        } catch (e) {}
    };

    const markAllAsRead = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/tasks/notifications/read-all`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
                window.dispatchEvent(new Event('notifications-updated'));
                showToast("Todas marcadas como leídas", "success");
            }
        } catch (e) {}
    };

    const filteredNotifs = notifications.filter(n => {
        if (filter === 'UNREAD') return !n.is_read;
        if (filter === 'READ') return n.is_read;
        return true;
    });

    const getIcon = (title) => {
        if (title.includes('Límite')) return <AlertTriangle size={20} color="var(--error)" />;
        if (title.includes('Factura Vencida')) return <Clock size={20} color="var(--warning)" />;
        return <Bell size={20} color="var(--primary)" />;
    };

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Cargando alertas...</div>;

    return (
        <div className={s.container}>
            <ContentHeader 
                title="Centro de Notificaciones" 
                subtitle="Alertas de sistema y avisos importantes"
                icon={<Bell />}
            >
                <div style={{ display: 'flex', gap: 12 }}>
                    <Button variant="outline" onClick={markAllAsRead} disabled={!notifications.some(n => !n.is_read)}>
                        <CheckSquare size={16} style={{ marginRight: 8 }} /> Marcar todas como leídas
                    </Button>
                </div>
            </ContentHeader>

            <div className={s.content}>
                <div className={s.filters}>
                    <button className={`${s.filterBtn} ${filter === 'ALL' ? s.active : ''}`} onClick={() => setFilter('ALL')}>Todas</button>
                    <button className={`${s.filterBtn} ${filter === 'UNREAD' ? s.active : ''}`} onClick={() => setFilter('UNREAD')}>
                        No leídas {notifications.filter(n => !n.is_read).length > 0 && <span className={s.count}>{notifications.filter(n => !n.is_read).length}</span>}
                    </button>
                    <button className={`${s.filterBtn} ${filter === 'READ' ? s.active : ''}`} onClick={() => setFilter('READ')}>Leídas</button>
                </div>

                <div className={s.list}>
                    {filteredNotifs.length === 0 && (
                        <div className={s.empty}>
                            <CheckCircle2 size={48} color="var(--muted)" strokeWidth={1} />
                            <p>No tienes notificaciones pendientes</p>
                        </div>
                    )}
                    
                    {filteredNotifs.map(n => (
                        <div key={n.id} className={`${s.item} ${n.is_read ? s.read : s.unread}`}>
                            <div className={s.iconArea}>
                                {getIcon(n.title)}
                            </div>
                            <div className={s.body}>
                                <div className={s.top}>
                                    <h4 className={s.title}>{n.title}</h4>
                                    <span className={s.date}>
                                        {new Date(n.created_at.endsWith('Z') ? n.created_at : n.created_at + 'Z').toLocaleString('es-AR', {
                                            year: 'numeric',
                                            month: '2-digit',
                                            day: '2-digit',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </span>
                                </div>
                                <p className={n.is_read ? s.msgRead : s.msg}>{n.message}</p>
                                <div className={s.actions}>
                                    {n.reference_url && (
                                        <Button variant="ghost" size="sm" onClick={() => {
                                            if (!n.is_read) markAsRead(n.id);
                                            navigate(n.reference_url);
                                        }}>
                                            Ver Detalle <ChevronRight size={14} />
                                        </Button>
                                    )}
                                    {n.is_read ? (
                                        <Button variant="ghost" size="sm" onClick={() => markAsUnread(n.id)}>
                                            Marcar no leída
                                        </Button>
                                    ) : (
                                        <Button variant="ghost" size="sm" onClick={() => markAsRead(n.id)} style={{ color: 'var(--primary)' }}>
                                            <CheckSquare size={14} style={{ marginRight: 6 }} /> Marcar leída
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
