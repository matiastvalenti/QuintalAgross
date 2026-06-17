import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  Clock, 
  AlertCircle, 
  Plus, 
  User as UserIcon, 
  Filter,
  Check,
  X,
  Bell,
  Trash2,
  Calendar as CalendarIcon,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  LayoutGrid,
  ArrowLeft,
  Edit2,
  Search,
  CheckSquare
} from 'lucide-react';
import { API_URL } from '../../config';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

// --- CONFIG ---
const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0:00 to 23:00
const SLOT_HEIGHT = 40; // px per hour

const CATEGORY_COLORS = {
    'Cobranza': { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' }, // Blue
    'Visita': { bg: '#f5f3ff', border: '#8b5cf6', text: '#5b21b6' },   // Purple
    'Entrega': { bg: '#fff7ed', border: '#f97316', text: '#9a3412' },  // Orange
    'Urgente': { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },  // Red
    'Otro': { bg: '#f0fdf4', border: '#22c55e', text: '#166534' }      // Green
};

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null); // The user being viewed in planner
  const [editingTask, setEditingTask] = useState(null); // The task currently being edited
  const [viewMode, setViewMode] = useState('planner'); // 'planner' or 'list'

  // New task form state
  const [formData, setFormData] = useState({
    title: '', description: '', assignee_id: '', priority: 'MEDIUM',
    due_date: '', start_time: '', end_time: '', category: 'Otro',
    address: '', additional_notes: ''
  });

  const { showToast } = useToast();
  const { user: currentUser } = useAuth();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, usersRes, notifRes] = await Promise.all([
        api.get(`/tasks?date=${currentDate}`),
        api.get('/tasks/employees'),
        api.get('/tasks/notifications?unread_only=true')
      ]);

      setTasks(tasksRes || []);
      setUsers(usersRes || []);
      setNotifications(notifRes || []);

    } catch (error) {
      showToast("Error al cargar datos", "error");
    } finally {
      setLoading(false);
    }
  }, [currentDate, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Drag selection state
  const [selection, setSelection] = useState(null); 

  const handleMouseDown = (userId, hour) => setSelection({ userId, startHour: hour, endHour: hour + 0.5 });
  const handleMouseEnter = (userId, hour) => {
    if (selection && selection.userId === userId) {
        setSelection(prev => ({ ...prev, endHour: hour >= prev.startHour ? hour + 0.5 : hour }));
    }
  };
  const handleMouseUp = () => {
    if (!selection) return;
    const start = Math.min(selection.startHour, selection.endHour);
    const end = Math.max(selection.startHour, selection.endHour);
    setFormData({
      title: '', description: '', assignee_id: selection.userId, priority: 'MEDIUM',
      start_time: formatHour(start), end_time: formatHour(end), due_date: currentDate,
      category: 'Otro', address: '', additional_notes: ''
    });
    setEditingTask(null); setIsCreating(true); setSelection(null);
  };

  const formatHour = (h) => {
    const hh = Math.floor(h).toString().padStart(2, '0');
    const mm = (h % 1 === 0 ? '00' : '30');
    return `${hh}:${mm}`;
  };

  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (!formData.title) return;
    try {
      const token = localStorage.getItem('token');
      const payload = { ...formData };
      if (payload.due_date && !payload.due_date.includes('T')) payload.due_date = `${payload.due_date}T12:00:00`;
      const url = editingTask ? `${API_URL}/tasks/${editingTask.id}` : `${API_URL}/tasks`;
      const res = await fetch(url, {
        method: editingTask ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast(editingTask ? "Tarea actualizada" : "Tarea creada", "success");
        setIsCreating(false); setEditingTask(null); 
        await fetchData();
      }
    } catch (error) { showToast("Error al guardar", "error"); }
  };

  const handleToggleStatus = async (task) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED' })
      });
      if (res.ok) { showToast("Estado actualizado", "success"); fetchData(); if(editingTask) setIsCreating(false); }
    } catch (e) { showToast("Error", "error"); }
  };

  const handleDeleteTask = async (taskId) => {
    if (!confirm("¿Eliminar tarea?")) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) { showToast("Eliminada", "success"); setIsCreating(false); fetchData(); }
    } catch (e) {}
  };

  const getTaskStyle = (task) => {
    if (!task.start_time || !task.end_time) return { display: 'none' };
    const [sH, sM] = task.start_time.split(':').map(Number);
    const [eH, eM] = task.end_time.split(':').map(Number);
    const top = (sH + sM/60) * SLOT_HEIGHT;
    const height = ((eH + eM/60) - (sH + sM/60)) * SLOT_HEIGHT;
    const colors = CATEGORY_COLORS[task.category] || CATEGORY_COLORS['Otro'];
    const isCompleted = task.status === 'COMPLETED';

    return {
      position: 'absolute', top: `${top}px`, height: `${height}px`, left: '4px', right: '4px',
      backgroundColor: isCompleted ? '#f1f5f9' : colors.bg,
      borderLeft: `5px solid ${isCompleted ? '#94a3b8' : colors.border}`,
      borderRadius: '8px', padding: '8px 12px', fontSize: '11px', 
      color: isCompleted ? '#64748b' : colors.text,
      zIndex: 10, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '2px',
      boxShadow: '0 2px 5px rgba(0,0,0,0.06)', border: `1px solid ${isCompleted ? '#e2e8f0' : colors.border + '33'}`
    };
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {selectedUser && <button onClick={() => setSelectedUser(null)} style={backBtn}><ArrowLeft size={18}/></button>}
          <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>
             {selectedUser ? `Agenda de ${selectedUser.name}` : 'Planificación Diaria'}
          </h1>
          <div style={datePickerContainer}>
            <button onClick={() => { let d=new Date(currentDate); d.setDate(d.getDate()-1); setCurrentDate(d.toISOString().split('T')[0]); }} style={navBtn}><ChevronLeft size={16}/></button>
            <input type="date" value={currentDate} onChange={e=>setCurrentDate(e.target.value)} style={dateInput} />
            <button onClick={() => { let d=new Date(currentDate); d.setDate(d.getDate()+1); setCurrentDate(d.toISOString().split('T')[0]); }} style={navBtn}><ChevronRight size={16}/></button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="secondary" onClick={() => setViewMode(viewMode === 'planner' ? 'list' : 'planner')}>
             {viewMode === 'planner' ? <LayoutGrid size={18} /> : <CheckSquare size={18} />}
          </Button>
          <Button onClick={() => { setFormData({title:'', description:'', assignee_id:selectedUser?.id||'', priority:'MEDIUM', due_date:currentDate, start_time:'08:00', end_time:'09:00', category:'Otro', address:'', additional_notes:'' }); setEditingTask(null); setIsCreating(true); }} variant="primary">
            <Plus size={18} /> Nueva tarea
          </Button>
        </div>
      </div>

      <div style={mainContentWrapper}>
        {/* Left Sidebar Info (Only in individual view) */}
        {selectedUser && viewMode === 'planner' && (
           <div style={sidebarInfo}>
              <div style={miniCard}>
                 <h4 style={miniHeader}>Recordatorios Hoy</h4>
                 <div style={statGrid}>
                    <div style={statBox}><span>{tasks.filter(t=>t.assignee_id===selectedUser.id).length}</span><p>Total</p></div>
                    <div style={statBox} className="green"><span>{tasks.filter(t=>t.assignee_id===selectedUser.id && t.status==='COMPLETED').length}</span><p>Hechas</p></div>
                 </div>
              </div>
              <div style={notifList}>
                 <h4 style={miniHeader}><Bell size={14} style={{marginRight:'6px'}}/> Actividad</h4>
                 {notifications.length === 0 ? <p style={emptyNotif}>Sin novedades</p> : 
                  notifications.slice(0,5).map(n => (
                    <div key={n.id} style={notifItem}>
                       <strong>{n.title}</strong>
                       <p>{n.message}</p>
                    </div>
                  ))
                 }
              </div>
           </div>
        )}

        <div style={dataArea}>
           {viewMode === 'list' ? (
              /* LIST VIEW for direct readability */
              <div style={listViewContainer}>
                 {users.map(u => {
                    const uTasks = tasks.filter(t => t.assignee_id === u.id);
                    if (uTasks.length === 0) return null;
                    return (
                       <div key={u.id} style={listEmployeeSection}>
                          <h3 style={listEmployeeName}>{u.name}</h3>
                          {uTasks.map(t => (
                             <div key={t.id} style={listItem} onClick={() => { setEditingTask(t); setFormData({...t}); setIsCreating(true); }}>
                                <span style={{...listCategory, color: CATEGORY_COLORS[t.category]?.text, background: CATEGORY_COLORS[t.category]?.bg}}>{t.category}</span>
                                <div style={listText}><b>{t.title}</b><p>{t.start_time} - {t.end_time} {t.address && `| ${t.address}`}</p></div>
                                <button style={listCheck} onClick={(e) => { e.stopPropagation(); handleToggleStatus(t); }}>
                                   {t.status === 'COMPLETED' ? <CheckCircle2 color="#22c55e"/> : <Circle color="#cbd5e1"/>}
                                </button>
                             </div>
                          ))}
                       </div>
                    );
                 })}
                 {tasks.length === 0 && <div style={emptyView}>No hay tareas planificadas para hoy.</div>}
              </div>
           ) : (
              /* PLANNER VIEW */
              !selectedUser ? (
                 <div style={cardsGrid}>
                    {users.map(u => {
                       const uTasks = tasks.filter(t => t.assignee_id === u.id);
                       return (
                          <div key={u.id} style={userCard} onClick={() => setSelectedUser(u)}>
                             <div style={cardTop}>
                                <div style={avatar}>{u.name?.substring(0,2)}</div>
                                <div><h3 style={uName}>{u.name}</h3><span style={uCode}>{u.code}</span></div>
                             </div>
                             <div style={uStats}>
                                <div><p>Hacer</p><b>{uTasks.length}</b></div>
                                <div><p>Hecho</p><b style={{color:'#22c55e'}}>{uTasks.filter(t=>t.status==='COMPLETED').length}</b></div>
                             </div>
                             <button style={btnSmall}>Ver Ficha Diaria</button>
                          </div>
                       );
                    })}
                 </div>
              ) : (
                 <div style={plannerTable}>
                    <div style={plannerBody}>
                       <div style={timeCol}>
                          {HOURS.map(h => <div key={h} style={{height:SLOT_HEIGHT, position:'relative'}}><span style={timeText}>{h}:00</span></div>)}
                       </div>
                       <div style={userColGrid} onMouseUp={handleMouseUp}>
                          {HOURS.map(h => (
                             <div key={h} style={{height:SLOT_HEIGHT, borderBottom:'1px solid #f1f5f9', position:'relative'}}>
                                <div style={{position:'absolute', top:'50%', left:0, right:0, borderTop:'1px dashed #f1f5f9'}}></div>
                                <div style={{position:'absolute', top:0, height:'50%', width:'100%'}} onMouseDown={()=>handleMouseDown(selectedUser.id, h)} onMouseEnter={()=>handleMouseEnter(selectedUser.id, h)}></div>
                                <div style={{position:'absolute', top:'50%', height:'50%', width:'100%'}} onMouseDown={()=>handleMouseDown(selectedUser.id, h+0.5)} onMouseEnter={()=>handleMouseEnter(selectedUser.id, h+0.5)}></div>
                             </div>
                          ))}
                          {selection && <div style={{position:'absolute',left:'4px',right:'4px',background:'rgba(59,130,246,0.2)',border:'2px dashed #3b82f6',borderRadius:'8px',zIndex:5,top:`${selection.startHour*SLOT_HEIGHT}px`,height:`${Math.abs(selection.endHour-selection.startHour)*SLOT_HEIGHT}px`}}></div>}
                          {tasks.filter(t=>t.assignee_id===selectedUser.id).map(t => (
                             <div key={t.id} style={getTaskStyle(t)} onClick={(e)=> { e.stopPropagation(); setEditingTask(t); setFormData({...t}); setIsCreating(true); }}>
                                <div style={{fontWeight:800,fontSize:'12px'}}>{t.title}</div>
                                <div style={{fontSize:'10px',opacity:0.8}}>{t.category}</div>
                                <div style={{marginTop:'auto',fontWeight:600,fontSize:'10px'}}>{t.start_time} - {t.end_time}</div>
                             </div>
                          ))}
                       </div>
                    </div>
                 </div>
              )
           )}
        </div>
      </div>

      {/* MODAL */}
      {isCreating && (
        <div style={modalOverlay}>
           <div style={modalBox}>
              <div style={modalHeader}>
                 <h3>{editingTask ? 'Detalle de Importante' : 'Nuevo Aviso/Recordatorio'}</h3>
                 <button onClick={()=>{setIsCreating(false); setEditingTask(null);}}><X size={20}/></button>
              </div>
              <form onSubmit={handleSaveTask} style={form}>
                 <div style={inputGroup}><label>¿Qué hay que hacer? *</label><input value={formData.title} onChange={e=>setFormData({...formData,title:e.target.value})} placeholder="Ej: Cobrar cheque vencido" required /></div>
                 <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px'}}>
                    <div style={inputGroup}><label>Categoría</label>
                      <select value={formData.category} onChange={e=>setFormData({...formData,category:e.target.value})}>
                         {Object.keys(CATEGORY_COLORS).map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div style={inputGroup}><label>Prioridad</label>
                      <select value={formData.priority} onChange={e=>setFormData({...formData,priority:e.target.value})}>
                         <option value="LOW">Baja</option><option value="MEDIUM">Normal</option><option value="HIGH">Alta / Urgente</option>
                      </select>
                    </div>
                 </div>
                 <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px'}}>
                    <div style={inputGroup}><label>Desde</label><input type="time" value={formData.start_time} onChange={e=>setFormData({...formData,start_time:e.target.value})} /></div>
                    <div style={inputGroup}><label>Hasta</label><input type="time" value={formData.end_time} onChange={e=>setFormData({...formData,end_time:e.target.value})} /></div>
                 </div>
                 <div style={inputGroup}><label>Lugar / Dirección</label><input value={formData.address} onChange={e=>setFormData({...formData,address:e.target.value})} placeholder="Opcional" /></div>
                 <div style={inputGroup}><label>Notas / Instrucciones</label><textarea value={formData.additional_notes} onChange={e=>setFormData({...formData,additional_notes:e.target.value})} placeholder="Detalles importantes..." /></div>
                 
                 <div style={formFooter}>
                    {editingTask && (
                       <div style={{display:'flex', gap:'8px'}}>
                          <button type="button" onClick={()=>handleDeleteTask(editingTask.id)} style={btnDel}><Trash2 size={18}/></button>
                          <button type="button" onClick={()=>handleToggleStatus(editingTask)} style={btnToggle}>{editingTask.status==='COMPLETED'?'Pendiente':'¡Listo!'}</button>
                       </div>
                    )}
                    <div style={{marginLeft:'auto', display:'flex', gap:'10px'}}>
                       <button type="button" onClick={()=>{setIsCreating(false); setEditingTask(null);}} style={btnCancel}>Cerrar</button>
                       <button type="submit" style={{...btnSave, background:formData.title?'#2563eb':'#e2e8f0'}}>{editingTask?'Guardar':'Publicar'}</button>
                    </div>
                 </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
}

// --- NEW STYLES ---
const containerStyle = { height: '100%', display: 'flex', flexDirection: 'column', background: '#f8fafc' };
const headerStyle = { padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' };
const mainContentWrapper = { flex:1, display:'flex', overflow:'hidden' };
const sidebarInfo = { width:'240px', borderRight:'1px solid #e2e8f0', background:'#fff', padding:'20px', display:'flex', flexDirection:'column', gap:'24px', overflow:'auto' };
const miniCard = { background:'#f8fafc', padding:'16px', borderRadius:'12px', border:'1px solid #e2e8f0' };
const miniHeader = { fontSize:'12px', fontWeight:700, color:'#64748b', textTransform:'uppercase', marginBottom:'12px', display:'flex', alignItems:'center' };
const statGrid = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' };
const statBox = { textAlign:'center', span:{fontSize:'18px', fontWeight:800}, p:{fontSize:'10px', color:'#64748b'} };
const dataArea = { flex:1, overflow:'auto', padding:'24px' };
const cardsGrid = { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:'20px' };
const userCard = { background:'#fff', padding:'24px', borderRadius:'16px', border:'1px solid #e2e8f0', cursor:'pointer', display:'flex', flexDirection:'column', gap:'16px', transition:'all 0.2s' };
const cardTop = { display:'flex', gap:'12px', alignItems:'center' };
const avatar = { width:'44px', height:'44px', borderRadius:'12px', background:'#f1f5f9', color:'#3b82f6', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800 };
const uName = { fontSize:'15px', fontWeight:800, margin:0 };
const uCode = { fontSize:'12px', color:'#94a3b8' };
const uStats = { display:'flex', gap:'24px', borderTop:'1px solid #f1f5f9', paddingTop:'16px', p:{fontSize:'11px', color:'#64748b', margin:0} };
const btnSmall = { width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #e2e8f0', background:'transparent', fontWeight:700, fontSize:'12px', color:'#3b82f6' };
const plannerTable = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:'16px', overflow:'hidden' };
const plannerBody = { display:'flex', paddingTop:'24px', paddingBottom:'24px' };
const timeCol = { width:'70px', borderRight:'1px solid #f1f5f9', position:'relative' };
const timeText = { position:'absolute', top:'-8px', right:'12px', fontSize:'10px', color:'#94a3b8', fontWeight:700 };
const userColGrid = { flex:1, position:'relative' };
const datePickerContainer = { display:'flex', alignItems:'center', background:'#f1f5f9', borderRadius:'10px', padding:'2px', marginLeft:'12px' };
const dateInput = { border:'none', background:'none', padding:'6px 12px', fontSize:'14px', fontWeight:700, outline:'none' };
const navBtn = { padding:'6px', background:'none', border:'none', cursor:'pointer', color:'#64748b' };
const modalOverlay = { position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(15,23,42,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000 };
const modalBox = { background:'#fff', width:'540px', borderRadius:'20px', padding:'24px', boxShadow:'0 25px 50px -12px rgba(0,0,0,0.25)' };
const modalHeader = { display:'flex', justifyContent:'space-between', marginBottom:'20px', h3:{margin:0, fontSize:'18px', fontWeight:800} };
const form = { display:'flex', flexDirection:'column', gap:'16px' };
const inputGroup = { display:'flex', flexDirection:'column', gap:'6px', label:{fontSize:'13px', fontWeight:700, color:'#475569'}, input:{padding:'10px 14px', borderRadius:'10px', border:'1px solid #e2e8f0', outline:'none'}, select:{padding:'10px 14px', borderRadius:'10px', border:'1px solid #e2e8f0'}, textarea:{padding:'10px 14px', borderRadius:'10px', border:'1px solid #e2e8f0', minHeight:'80px'} };
const formFooter = { display:'flex', borderTop:'1px solid #f1f5f9', paddingTop:'20px', marginTop:'10px' };
const btnSave = { padding:'10px 24px', borderRadius:'10px', border:'none', color:'#fff', fontWeight:700 };
const btnCancel = { padding:'10px 24px', borderRadius:'10px', border:'1px solid #e2e8f0', background:'#fff', fontWeight:700 };
const btnDel = { padding:'10px', background:'#fee2e2', color:'#ef4444', border:'none', borderRadius:'10px' };
const btnToggle = { padding:'10px 16px', background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:'10px', fontWeight:700, fontSize:'13px' };
const backBtn = { padding:'8px', borderRadius:'10px', border:'1px solid #e2e8f0', background:'#fff', marginRight:'12px' };
const notifList = { display:'flex', flexDirection:'column', gap:'12px' };
const notifItem = { padding:'12px', background:'#f8fafc', borderRadius:'10px', borderLeft:'3px solid #3b82f6', strong:{fontSize:'12px', display:'block'}, p:{fontSize:'11px', color:'#64748b', margin:0} };
const emptyNotif = { fontSize:'11px', color:'#94a3b8', textAlign:'center', marginTop:'10px' };
const listViewContainer = { background:'#fff', padding:'24px', borderRadius:'16px', border:'1px solid #e2e8f0' };
const listEmployeeSection = { marginBottom:'32px' };
const listEmployeeName = { fontSize:'16px', fontWeight:800, marginBottom:'16px', borderBottom:'1px solid #f1f5f9', paddingBottom:'8px', color:'#334155' };
const listItem = { display:'flex', alignItems:'center', gap:'16px', padding:'12px', borderRadius:'12px', background:'#f8fafc', marginBottom:'8px', cursor:'pointer' };
const listCategory = { fontSize:'10px', fontWeight:800, padding:'4px 8px', borderRadius:'6px' };
const listText = { flex:1, b:{display:'block', fontSize:'14px'}, p:{fontSize:'12px', color:'#94a3b8', margin:0} };
const listCheck = { background:'none', border:'none', cursor:'pointer' };
const emptyView = { textAlign:'center', color:'#94a3b8', padding:'40px' };
