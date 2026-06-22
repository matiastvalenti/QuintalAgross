import React, { useState, useEffect, useRef } from 'react';
import { 
    Calendar, Users, MessageSquare, ClipboardList, 
    ChevronRight, Search, Filter, AlertCircle, 
    CheckCircle2, Clock, TrendingUp, ArrowUpRight, 
    MoreHorizontal, Send, RefreshCw, X, Plus, PhoneCall, Mail,
    Zap, ListFilter, LayoutGrid, Building2, UserCheck, PlusCircle,
    UserMinus, ArrowLeft
} from 'lucide-react';
import api from '../../services/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Autocomplete from '../../components/ui/Autocomplete';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useWindow } from '../../context/WindowContext';
import { openEntityDashboard } from '../../utils/openStandaloneWindow';
import s from './CRMDashboard.module.css';

export default function CRMDashboard() {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ pending: 0, overdue: 0, today: 0 });
    const [search, setSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState('all'); 
    const [moduleType, setModuleType] = useState('crm'); // 'crm' | 'srm'
    
    // Entity DrillDown / DrillUp
    const [selectedEntityId, setSelectedEntityId] = useState(null);
    const [selectedEntityObj, setSelectedEntityObj] = useState(null);

    // Search Suggestions
    const [suggestions, setSuggestions] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef(null);

    // New Note Modal
    const [showNoteModal, setShowNoteModal] = useState(false);
    const [modalEntity, setModalEntity] = useState(null);
    const [noteData, setNoteData] = useState({ category: 'Llamada', content: '', next_follow_up: '', is_completed: false });

    const { addToast } = useToast();
    const { openWindow } = useWindow();

    const fetchData = async () => {
        setLoading(true);
        try {
            const [tasksRes, entitiesRes] = await Promise.all([
                api.get('/entities/crm/tasks'),
                api.get('/entities/')
            ]);
            
            const eMap = {};
            // Using direct response since api.js returns data directly
            if (entitiesRes && Array.isArray(entitiesRes)) {
                entitiesRes.forEach(e => { eMap[e.id] = e; });
            }
            
            const rawTasks = Array.isArray(tasksRes) ? tasksRes : [];
            const allTasks = rawTasks.map(t => {
                const entity = eMap[t.entity_id];
                return { 
                    ...t, 
                    entity_name: entity?.name || 'Entidad ' + (t.entity_id ? t.entity_id.substring(0,4) : '????'),
                    entity_type: entity?.type || 'client'
                };
            });

            setTasks(allTasks);
        } catch (err) {
            console.error(err);
            setTasks([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchSuggestions = async (q = '') => {
        setIsSearching(true);
        try {
            const typeParam = moduleType === 'crm' ? 'client' : 'provider';
            const res = await api.get(`/entities/?q=${q}&type=${typeParam}&limit=10`);
            setSuggestions(Array.isArray(res) ? res : []);
        } catch (e) {
            console.error(e);
            setSuggestions([]);
        } finally {
            setIsSearching(false);
        }
    };

    useEffect(() => {
        fetchData();
        
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Search live
    useEffect(() => {
        const timer = setTimeout(() => {
            if (search.length >= 1 && showDropdown) {
                fetchSuggestions(search);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [search, moduleType]);

    const matchesModule = (entityType) => {
        if (!entityType) return true;
        const type = String(entityType).toLowerCase();
        if (moduleType === 'crm') return type === 'client' || type === 'mixed';
        if (moduleType === 'srm') return type === 'provider' || type === 'supplier' || type === 'mixed';
        return true;
    };

    const filteredTasks = (Array.isArray(tasks) ? tasks : []).filter(t => {
        // 1. Entity filter (DrillDown)
        if (selectedEntityId && t.entity_id !== selectedEntityId) return false;

        // 2. Module filter (crm/srm)
        if (!matchesModule(t.entity_type)) return false;
        
        // 3. Search filter
        const safeSearch = (search || '').toLowerCase();
        const safeName = (t.entity_name || '').toLowerCase();
        const matchesSearch = safeName.includes(safeSearch);
        if (!matchesSearch && safeSearch.length > 0 && !showDropdown) return false;

        // 4. Status chips filter
        const now = new Date();
        now.setHours(0,0,0,0);
        const due = t.next_follow_up ? new Date(t.next_follow_up) : null;

        if (activeFilter === 'overdue') return due && due < now;
        if (activeFilter === 'today') return due && due.toDateString() === new Date().toDateString();
        if (activeFilter === 'upcoming') return due && due > now && due.toDateString() !== new Date().toDateString();

        return true;
    });

    useEffect(() => {
        const modTasks = (Array.isArray(tasks) ? tasks : []).filter(t => matchesModule(t.entity_type));
        const now = new Date();
        now.setHours(0,0,0,0);
        
        setStats({
            pending: modTasks.length,
            overdue: modTasks.filter(t => t.next_follow_up && new Date(t.next_follow_up) < now).length,
            today: modTasks.filter(t => t.next_follow_up && new Date(t.next_follow_up).toDateString() === new Date().toDateString()).length
        });
    }, [tasks, moduleType]);

    const handleSelectEntity = (entity) => {
        setSelectedEntityId(entity.id);
        setSelectedEntityObj(entity);
        setSearch(''); 
        setShowDropdown(false);
        addToast(`Filtrando por: ${entity.name}`, 'info');
    };

    const handleOpenNoteModal = (entity) => {
        setModalEntity(entity);
        setShowNoteModal(true);
        setShowDropdown(false);
    };

    const handleSaveNote = async () => {
        if (!modalEntity) return;
        if (!noteData.content) return addToast('Ingresá una nota', 'error');

        try {
            await api.post(`/entities/${modalEntity.id}/notes`, noteData);
            addToast('Gestión guardada con éxito', 'success');
            setShowNoteModal(false);
            setNoteData({ category: 'Llamada', content: '', next_follow_up: '', is_completed: false });
            setModalEntity(null);
            fetchData();
        } catch (err) {
            addToast('Error al guardar', 'error');
        }
    };

    const handleComplete = async (id) => {
        try {
            await api.post(`/entities/crm/notes/${id}/complete`);
            addToast('Gestión completada', 'success');
            fetchData();
        } catch (err) {
            addToast('Error al completar tarea', 'error');
        }
    };

    const fmtDate = (d) => {
        if (!d) return '';
        const date = new Date(d);
        const now = new Date();
        if (date.toDateString() === now.toDateString()) return 'Hoy';
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
    };

    return (
        <div className={s.dashboard}>
            {/* Header / Tabs */}
            <div className={s.header} style={{ marginBottom: 40 }}>
                <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                     <div 
                        className={`${s.moduleTab} ${moduleType === 'crm' ? s.moduleTabActive : ''}`}
                        onClick={() => { setModuleType('crm'); setSelectedEntityId(null); setSelectedEntityObj(null); setSearch(''); }}
                    >
                        <UserCheck size={20} /> CRM Clientes
                    </div>
                    <div 
                        className={`${s.moduleTab} ${moduleType === 'srm' ? s.moduleTabActive : ''}`}
                        onClick={() => { setModuleType('srm'); setSelectedEntityId(null); setSelectedEntityObj(null); setSearch(''); }}
                    >
                        <Building2 size={20} /> SRM Proveedores
                    </div>
                </div>

                <div className={s.actions}>
                    {selectedEntityId ? (
                        <div className={s.searchWrapper} style={{ width: 440, display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{ flex: 1, padding: '0 24px', height: 52, background: 'rgba(36, 56, 156, 0.05)', borderRadius: 16, display: 'flex', alignItems: 'center', gap: 12, border: '1.5px solid var(--accent-indigo)' }}>
                                <UserCheck size={18} color="var(--accent-indigo)" />
                                <span style={{ fontWeight: 800, color: 'var(--accent-indigo)', fontSize: 13 }}>{selectedEntityObj?.name}</span>
                                <button onClick={() => { setSelectedEntityId(null); setSelectedEntityObj(null); }} style={{ all: 'unset', cursor: 'pointer', padding: 4, opacity: 0.5 }}>
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={s.searchWrapper} style={{ width: 440 }} ref={dropdownRef}>
                            <Search size={20} className={s.searchIcon} />
                            <input 
                                type="text" 
                                className={s.searchInput}
                                placeholder={moduleType === 'crm' ? "Buscar cliente o tareas..." : "Buscar proveedor o tareas..."}
                                value={search}
                                onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
                                onFocus={() => { setShowDropdown(true); if(!search) fetchSuggestions(''); }}
                            />
                            
                            {showDropdown && (
                                <div className={s.searchDropdown}>
                                    {isSearching ? (
                                        <div style={{ padding: 20, textAlign: 'center' }}><RefreshCw size={20} className="spin" style={{ color: 'var(--accent-indigo)', opacity: 0.2 }} /></div>
                                    ) : suggestions.length > 0 ? (
                                        <>
                                            <div style={{ fontSize: 10, fontWeight: 900, color: '#94a3b8', padding: '12px 18px 8px', textTransform: 'uppercase' }}>
                                                {moduleType === 'crm' ? 'Clientes (Directorio)' : 'Proveedores (Directorio)'}
                                            </div>
                                            {suggestions.map(e => (
                                                <div key={e.id} className={s.searchResult} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <div style={{ flex: 1 }} onClick={() => handleSelectEntity(e)}>
                                                        {e.name}
                                                    </div>
                                                    <button 
                                                        onClick={(ev) => { ev.stopPropagation(); handleOpenNoteModal(e); }}
                                                        style={{ all: 'unset', cursor: 'pointer', padding: '4px 8px', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 900 }}
                                                    >
                                                        <PlusCircle size={16} /> NUEVA
                                                    </button>
                                                </div>
                                            ))}
                                        </>
                                    ) : (
                                        <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#94a3b8', fontWeight: 700 }}>SIN RESULTADOS</div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Main Bento Grid */}
            <div className={s.filterRow} style={{ marginBottom: 32, marginTop: -20 }}>
                <div className={`${s.filterChip} ${activeFilter === 'all' ? s.filterChipActive : ''}`} onClick={() => setActiveFilter('all')}>Todos</div>
                <div className={`${s.filterChip} ${activeFilter === 'overdue' ? s.filterChipActive : ''}`} onClick={() => setActiveFilter('overdue')}><AlertCircle size={14} /> Vencidos</div>
                <div className={`${s.filterChip} ${activeFilter === 'today' ? s.filterChipActive : ''}`} onClick={() => setActiveFilter('today')}><Zap size={14} /> Para Hoy</div>
                <div className={`${s.filterChip} ${activeFilter === 'upcoming' ? s.filterChipActive : ''}`} onClick={() => setActiveFilter('upcoming')}>Próximos</div>
            </div>

            <div className={s.statsGrid} style={{ marginBottom: 40 }}>
                <StatCard label="Pendientes" value={stats.pending} icon={<ClipboardList size={28} />} color="var(--accent-indigo)" sub="Gestiones activas" />
                <StatCard label="Vencidos" value={stats.overdue} icon={<AlertCircle size={28} />} color="#ef4444" sub="Atención urgente" />
                <StatCard label="Para Hoy" value={stats.today} icon={<Zap size={28} />} color="var(--accent-amber)" sub="Compromisos activos" />
            </div>

            <div className={s.mainGrid}>
                <div className={s.panel}>
                    <div className={s.panelHeader}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <ListFilter size={20} color="var(--accent-indigo)" />
                            <h2 className={s.panelTitle}>Hoja de Ruta / Seguimientos</h2>
                        </div>
                        {selectedEntityId && (
                            <Button variant="outline" size="small" onClick={() => handleOpenNoteModal(selectedEntityObj)}>
                                <Plus size={16} /> Nueva Gestión
                            </Button>
                        )}
                    </div>

                    {loading ? (
                        <div className={s.emptyState}><RefreshCw size={40} className="spin" style={{ color: 'var(--accent-indigo)', opacity: 0.2 }} /></div>
                    ) : filteredTasks.length > 0 ? (
                        <div className={s.taskList}>
                            {filteredTasks.map((task) => (
                                <div key={task.id} className={taskItemClass(task)}>
                                    <div className={s.taskAvatar} style={{ background: getOverdueStatus(task.next_follow_up) === 'overdue' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(36, 56, 156, 0.05)', color: getOverdueStatus(task.next_follow_up) === 'overdue' ? '#ef4444' : 'var(--accent-indigo)' }}>
                                        {getOverdueStatus(task.next_follow_up) === 'overdue' ? <AlertCircle size={28} /> : <Clock size={28} />}
                                    </div>
                                    <div className={s.taskContent}>
                                        <div className={s.taskTop}>
                                            <div className={s.entityName} onClick={() => openEntityDashboard(task.entity_id, { title: 'Vista 360', width: 1300, height: 900 })}>
                                                {task.entity_name} <ArrowUpRight size={16} style={{ opacity: 0.3 }} />
                                            </div>
                                            <div className={s.taskDate} style={{ color: getOverdueStatus(task.next_follow_up) === 'overdue' ? '#ef4444' : '#94a3b8' }}>
                                                {task.next_follow_up ? fmtDate(task.next_follow_up) : 'Sin fecha'}
                                            </div>
                                        </div>
                                        <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
                                            <span className={`${s.taskBadge} ${s.categoryBadge}`}>{task.category}</span>
                                            {getOverdueStatus(task.next_follow_up) === 'overdue' && <span className={`${s.taskBadge} ${s.overdueBadge}`}>VENCIDO</span>}
                                        </div>
                                        <p className={s.taskDesc}>{task.content}</p>
                                    </div>
                                    <div style={{ paddingLeft: 24 }}>
                                        <button className={s.completeBtn} onClick={() => handleComplete(task.id)}><CheckCircle2 size={16} /> LISTO</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className={s.emptyState}>
                            <h3 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b' }}>Todo bajo control</h3>
                            <p style={{ color: '#94a3b8', fontSize: 13 }}>No hay gestiones pendientes{selectedEntityId ? ' para este cliente' : ''}.</p>
                        </div>
                    )}
                </div>

                <div className={s.panel}>
                    <div className={s.panelHeader}><h3 className={s.panelTitle} style={{ fontSize: 18 }}>Actividad Reciente</h3></div>
                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>En desarrollo...</div>
                </div>
            </div>

            {showNoteModal && (
                <Modal 
                    open={showNoteModal} 
                    onClose={() => setShowNoteModal(false)} 
                    title={`Nueva Gestión: ${modalEntity?.name}`}
                    footer={<Button onClick={handleSaveNote} variant="primary">Guardar Gestión</Button>}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '16px 0' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <Select label="Instancia" value={noteData.category} onChange={e => setNoteData({...noteData, category: e.target.value})}>
                                <option value="Llamada">Llamada</option>
                                <option value="Email">Email / WhatsApp</option>
                                <option value="Reunión">Reunión / Visita</option>
                                <option value="Promesa">Promesa (Pago/Entrega)</option>
                                <option value="Otro">Otro</option>
                            </Select>
                            <Input label="Próximo Seguimiento" type="date" value={noteData.next_follow_up} onChange={e => setNoteData({...noteData, next_follow_up: e.target.value})} />
                        </div>
                        <textarea value={noteData.content} onChange={e => setNoteData({...noteData, content: e.target.value})} style={{ width: '100%', minHeight: 120, padding: 16, borderRadius: 16, border: '1px solid #e2e8f0' }} placeholder="Escribí los detalles de la gestión..." />
                    </div>
                </Modal>
            )}
        </div>
    );
}

function StatCard({ label, value, icon, color, sub }) {
    return (
        <div className={s.statCard}>
            <div className={s.statIconBox} style={{ color: color }}>{icon}</div>
            <div>
                <div className={s.statLabel}>{label}</div>
                <div className={s.statValue}>{value}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 800, marginTop: 4 }}>{sub}</div>
            </div>
        </div>
    );
}

const taskItemClass = (task) => s.taskItem;
const getOverdueStatus = (d) => {
    if (!d) return 'pending';
    const now = new Date();
    now.setHours(0,0,0,0);
    return new Date(d) < now ? 'overdue' : 'pending';
};
