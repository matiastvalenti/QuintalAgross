import React, { useState, useEffect } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Plus, Trash2, Edit2, Shield, User as UserIcon, Check, X, Users, Settings, ArrowRight, Lock, Key, Eye, Edit3, ChevronRight, UserPlus, ShieldPlus, Search, ShieldCheck, UserCheck, ShieldAlert } from 'lucide-react';
import { getInitials } from '../../utils/formatters';
import t from '../../components/ui/Table.module.css';
import TableSkeleton from '../../components/ui/TableSkeleton';
import EmptyState from '../../components/ui/EmptyState';

const ACTIONS = [
    { id: 'view', label: 'Ver', icon: Eye, color: '#3b82f6' },
    { id: 'create', label: 'Crear', icon: Plus, color: '#10b981' },
    { id: 'edit', label: 'Editar', icon: Edit3, color: '#f59e0b' },
    { id: 'delete', label: 'Borrar', icon: Trash2, color: '#ef4444' },
];

const PERMISSION_GROUPS = [
    {
        title: "Ventas (Comercial)",
        items: [
            { id: "sales_orders", label: "Orden de Ventas" },
            { id: "sales_delivery", label: "Remitos (Venta)" },
            { id: "sales_invoices", label: "Facturas" },
            { id: "sales_notes", label: "Notas de Débito/Crédito" },
            { id: "customers", label: "Clientes / Entidades" }
        ]
    },
    {
        title: "Compras (Gestión de Proveedores)",
        items: [
            { id: "purchase_orders", label: "Orden de Compra" },
            { id: "purchase_delivery", label: "Remitos (Compra)" },
            { id: "purchase_invoices", label: "Facturas de Compra" },
            { id: "suppliers", label: "Proveedores" }
        ]
    },
    {
        title: "Inventario y Depósitos",
        items: [
            { id: "products", label: "Artículos y Productos" },
            { id: "items", label: "Listado de Items" },
            { id: "stock_moves", label: "Ajustes y Movimientos" },
            { id: "warehouses", label: "Depósitos" }
        ]
    },
    {
        title: "Finanzas y Tesorería",
        items: [
            { id: "cash", label: "Cajas" },
            { id: "cheques", label: "Cheques" },
            { id: "payments", label: "Recibos y Pagos" },
            { id: "banks", label: "Bancos" }
        ]
    },
    {
        title: "Contabilidad y Sistema",
        items: [
            { id: "ledger", label: "Plan de Cuentas" },
            { id: "journal", label: "Libro Diario" },
            { id: "accounting_reports", label: "Balances y Reportes" },
            { id: "users", label: "Usuarios y Permisos" }
        ]
    }
];


export default function UsersManager() {
    const { user: currentUser, can } = useAuth();
    const { showToast } = useToast();
    
    const [activeTab, setActiveTab] = useState('users'); // users | roles
    const [view, setView] = useState('list'); // list | editUser | editRole
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Form State
    const [editingId, setEditingId] = useState(null);
    const [userForm, setUserForm] = useState({
        email: "", username: "", full_name: "", password: "", roles: [], active: true
    });
    const [roleForm, setRoleForm] = useState({
        name: "", description: "", permissions: {}
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [usersRes, rolesRes] = await Promise.all([
                api.get('/auth/users'),
                api.get('/auth/roles')
            ]);
            setUsers(usersRes);
            setRoles(rolesRes);
        } catch (e) {
            showToast("Error al cargar datos", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleSaveUser = async () => {
        try {
            // Si es nuevo y no hay username, generamos uno por las dudas
            const finalForm = { ...userForm };
            if (!editingId && !finalForm.username && finalForm.full_name) {
                finalForm.username = finalForm.full_name.trim().toLowerCase().replace(/\s+/g, '_');
            }

            if (editingId) {
                await api.put(`/auth/users/${editingId}`, finalForm);
            } else {
                await api.post('/auth/users', finalForm);
            }
            
            showToast("Usuario guardado", "success");
            setView('list');
            setEditingId(null);
            setUserForm({ username: '', full_name: '', email: '', role_id: '', password: '', active: true });
            fetchData();
        } catch (e) {
            showToast("Error al guardar", "error");
        }
    };

    const handleToggleActive = async (u) => {
        if (u.id === currentUser.id) return showToast("No puedes deshabilitarte a ti mismo", "error");
        const action = u.active ? 'deshabilitar' : 'habilitar';
        if (!window.confirm(`¿${action.charAt(0).toUpperCase() + action.slice(1)} al usuario ${u.full_name}?`)) return;
        try {
            await api.put(`/auth/users/${u.id}`, { active: !u.active });
            showToast(`Usuario ${u.active ? 'deshabilitado' : 'habilitado'} correctamente`, u.active ? 'warning' : 'success');
            fetchData();
        } catch(e) {
            showToast(e.message || 'Error', 'error');
        }
    };

    const handleDeleteUser = async (id) => {
        if (id === currentUser.id) return showToast("No puedes eliminarte", "error");
        if (!window.confirm("¿Eliminar usuario?")) return;
        try {
            await api.delete(`/auth/users/${id}`);
            showToast("Usuario eliminado", "success");
            fetchData();
        } catch (e) {
            showToast(e.message || "Error al eliminar", "error");
        }
    };

    const handleSaveRole = async () => {
        try {
            if (editingId) {
                await api.put(`/auth/roles/${editingId}`, roleForm);
            } else {
                await api.post('/auth/roles', roleForm);
            }
            showToast("Perfil guardado", "success");
            setView('list');
            fetchData();
        } catch (e) {
            showToast(e.message || "Error al guardar", "error");
        }
    };

    const handleDeleteRole = async (id, is_system) => {
        if (is_system) return showToast("No se puede eliminar un perfil de sistema", "error");
        if (!window.confirm("¿Eliminar este perfil de acceso?")) return;
        try {
            await api.delete(`/auth/roles/${id}`);
            showToast("Perfil eliminado", "success");
            fetchData();
        } catch (e) {
            showToast(e.message || "Error al eliminar", "error");
        }
    };

    const toggleUserRole = (roleName) => {
        const newRoles = userForm.roles.includes(roleName)
            ? userForm.roles.filter(r => r !== roleName)
            : [...userForm.roles, roleName];
        setUserForm({ ...userForm, roles: newRoles });
    };

    const togglePermissionAction = (itemId, actionId) => {
        const currentItem = roleForm.permissions[itemId] || { view: false, create: false, edit: false, delete: false };
        const newItem = { ...currentItem, [actionId]: !currentItem[actionId] };
        setRoleForm({
            ...roleForm,
            permissions: { ...roleForm.permissions, [itemId]: newItem }
        });
    };

    if (view === 'editUser') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-page)', padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                    <Button variant="ghost" onClick={() => setView('list')}>
                        <ArrowRight size={18} style={{ transform: 'rotate(180deg)' }} /> Volver
                    </Button>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                        {editingId ? 'Configurar Usuario' : 'Nuevo Usuario'}
                    </h2>
                </div>

                <div style={{ maxWidth: 800, background: 'white', borderRadius: 16, border: '1px solid var(--border-color)', padding: 32, boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Datos del Empleado
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                            <Input 
                                label="Nombre Completo" 
                                value={userForm.full_name} 
                                onChange={e => {
                                    const name = e.target.value;
                                    const generated = name.trim().toLowerCase()
                                        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                                        .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                                    setUserForm({ 
                                        ...userForm, 
                                        full_name: name,
                                        username: editingId ? userForm.username : generated,
                                    });
                                }} 
                            />
                            <Input label="Email" value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Credenciales de Acceso
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <Input 
                                    label="Nombre de Usuario (Login)" 
                                    value={userForm.username} 
                                    onChange={e => setUserForm({ ...userForm, username: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })} 
                                    placeholder="ej: tomas_quintal"
                                />
                                {userForm.username ? (
                                    <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Check size={11} /> Iniciará sesión como: <strong>@{userForm.username}</strong>
                                    </span>
                                ) : (
                                    <span style={{ fontSize: 11, color: 'var(--warning, #f59e0b)', fontWeight: 600 }}>
                                        ⚠ Completá el nombre para auto-generar el usuario
                                    </span>
                                )}
                            </div>
                            <Input label={editingId ? "Nueva Contraseña (dejar vacío para no cambiar)" : "Contraseña"} type="password" value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} placeholder={editingId ? "Dejar vacío para no cambiar" : "Contraseña de acceso"} />
                        </div>
                    </div>
                    
                    <div>
                        <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, display: 'block', color: 'var(--text-secondary)' }}>Asignar Perfiles de Acceso</label>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {roles.map(r => (
                                <button
                                    key={r.id}
                                    onClick={() => toggleUserRole(r.name)}
                                    style={{
                                        border: '1px solid',
                                        borderColor: userForm.roles.includes(r.name) ? 'var(--primary)' : 'var(--border-color)',
                                        background: userForm.roles.includes(r.name) ? 'var(--primary-light)' : 'transparent',
                                        color: userForm.roles.includes(r.name) ? 'var(--primary)' : 'var(--text-main)',
                                        padding: '10px 16px', borderRadius: 12, fontSize: 13, cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8
                                    }}
                                >
                                    {userForm.roles.includes(r.name) ? <Check size={14} /> : <Plus size={14} />} {r.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12, padding: '12px 16px', background: 'var(--bg-app)', borderRadius: 12, border: '1px solid var(--border-color)', alignItems: 'center', cursor: 'pointer' }} onClick={() => setUserForm({ ...userForm, active: !userForm.active })}>
                         <div style={{ width: 40, height: 20, background: userForm.active ? 'var(--success)' : '#cbd5e1', borderRadius: 10, position: 'relative', transition: 'all 0.2s' }}>
                             <div style={{ width: 14, height: 14, background: 'white', borderRadius: '50%', position: 'absolute', top: 3, left: userForm.active ? 23 : 3, transition: 'all 0.2s' }} />
                         </div>
                         <span style={{ fontSize: 13, fontWeight: 700 }}>Usuario Activo (Permitir acceso al sistema)</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12, borderTop: '1px solid var(--border-color)', paddingTop: 24 }}>
                        <Button variant="secondary" onClick={() => setView('list')}>Cancelar</Button>
                        <Button onClick={handleSaveUser}>Confirmar y Guardar</Button>
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'editRole') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-page)', padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                    <Button variant="ghost" onClick={() => setView('list')}>
                        <ArrowRight size={18} style={{ transform: 'rotate(180deg)' }} /> Volver
                    </Button>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                        {editingId ? `Editar Perfil: ${roleForm.name}` : 'Crear Nuevo Perfil'}
                    </h2>
                </div>

                <div style={{ maxWidth: 1000, background: 'white', borderRadius: 16, border: '1px solid var(--border-color)', padding: 32, boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
                        <Input label="Nombre del Perfil" value={roleForm.name} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })} disabled={roleForm.is_system} />
                        <Input label="Descripción Corta" value={roleForm.description} onChange={e => setRoleForm({ ...roleForm, description: e.target.value })} />
                    </div>

                    <div>
                        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '12px 0 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Settings size={18} /> Matriz de Permisos por Funcionalidad
                        </h3>
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: 16, overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ background: 'var(--bg-app)' }}>
                                    <tr>
                                        <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Submódulo / Pantalla</th>
                                        {ACTIONS.map(a => (
                                            <th key={a.id} style={{ padding: '16px 8px', textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                                    <a.icon size={14} color={a.color} />
                                                    {a.label}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {PERMISSION_GROUPS.map(group => (
                                        <React.Fragment key={group.title}>
                                            <tr style={{ background: '#f8fafc' }}>
                                                <td colSpan={5} style={{ padding: '8px 20px', fontSize: 11, fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group.title}</td>
                                            </tr>
                                            {group.items.map(item => (
                                                <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '12px 20px 12px 32px', fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>{item.label}</td>
                                                    {ACTIONS.map(a => {
                                                        const isSelected = roleForm.permissions[item.id]?.[a.id];
                                                        return (
                                                            <td key={a.id} style={{ textAlign: 'center' }}>
                                                                <div 
                                                                    onClick={() => togglePermissionAction(item.id, a.id)}
                                                                    style={{
                                                                        width: 20, height: 20, borderRadius: 4, border: '2px solid',
                                                                        borderColor: isSelected ? a.color : '#e2e8f0',
                                                                        background: isSelected ? a.color : 'transparent',
                                                                        cursor: 'pointer', transition: 'all 0.1s', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                                        margin: '0 auto'
                                                                    }}
                                                                >
                                                                    {isSelected && <Check size={14} color="white" />}
                                                                </div>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12, borderTop: '1px solid var(--border-color)', paddingTop: 24 }}>
                        <Button variant="secondary" onClick={() => setView('list')}>Cancelar</Button>
                        <Button onClick={handleSaveRole}>Guardar Configuración de Perfil</Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-page)' }}>
            <div style={{ padding: '16px 20px 8px 20px' }}>
                <ContentHeader 
                    title="Control de Accesos" 
                    breadcrumbs={[{ label: 'Sistema' }, { label: 'Usuarios y Perfiles' }]}
                    actions={
                        <div style={{ display: 'flex', gap: 12 }}>
                            {can('users', 'create') && (
                                <Button 
                                    variant={activeTab === 'users' ? 'primary' : 'secondary'}
                                    onClick={() => {
                                        setEditingId(null);
                                        setUserForm({ email: "", username: "", full_name: "", password: "", roles: [], active: true });
                                        setRoleForm({ name: "", description: "", permissions: {} });
                                        setView(activeTab === 'users' ? 'editUser' : 'editRole');
                                    }}
                                    style={{ borderRadius: 12, height: 44, padding: '0 20px', fontWeight: 700 }}
                                >
                                    {activeTab === 'users' ? <UserPlus size={18} style={{ marginRight: 8 }} /> : <ShieldPlus size={18} style={{ marginRight: 8 }} />}
                                    Nuevo {activeTab === 'users' ? 'Usuario' : 'Perfil'}
                                </Button>
                            )}
                        </div>
                    }
                />
            </div>

            {/* Main Tabs */}
            <div style={{ display: 'flex', padding: '0 20px', borderBottom: '1px solid var(--border-color)', gap: 20 }}>
                <button 
                    onClick={() => setActiveTab('users')}
                    style={{
                        padding: '12px 4px', background: 'transparent', border: 'none',
                        borderBottom: activeTab === 'users' ? '3px solid var(--primary)' : '3px solid transparent',
                        color: activeTab === 'users' ? 'var(--primary)' : 'var(--text-secondary)',
                        fontWeight: activeTab === 'users' ? 700 : 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
                    }}
                >
                    <Users size={18} /> Gestión de Usuarios
                </button>
                <button 
                    onClick={() => setActiveTab('roles')}
                    style={{
                        padding: '12px 4px', background: 'transparent', border: 'none',
                        borderBottom: activeTab === 'roles' ? '3px solid var(--primary)' : '3px solid transparent',
                        color: activeTab === 'roles' ? 'var(--primary)' : 'var(--text-secondary)',
                        fontWeight: activeTab === 'roles' ? 700 : 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
                    }}
                >
                    <Shield size={18} /> Perfiles y Permisos
                </button>
            </div>

            <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
                {loading ? (
                    <TableSkeleton rows={10} cols={4} />
                ) : activeTab === 'users' ? (
                    <div style={{ background: 'white', borderRadius: 'var(--r-md)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                        <table className={t.table}>
                            <thead>
                                <tr>
                                    <th>Usuario</th>
                                    <th>Perfiles Asignados</th>
                                    <th>Estado</th>
                                    <th style={{ textAlign: 'right' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id} style={{ opacity: u.active ? 1 : 0.55 }}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ width: 36, height: 36, borderRadius: '50%', background: u.active ? 'var(--primary-light)' : '#f1f5f9', color: u.active ? 'var(--primary)' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
                                                    {getInitials(u.full_name)}
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: 600 }}>{u.full_name}</span>
                                                    <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                                                        <span style={{ color: 'var(--primary)', fontWeight: 600 }}>@{u.username}</span>
                                                        <span>•</span>
                                                        <span>{u.email}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                {u.roles.length > 0 ? u.roles.map(r => (
                                                    <span key={r} style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, color: 'var(--text-main)' }}>
                                                        {r}
                                                    </span>
                                                )) : <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Sin perfiles</span>}
                                            </div>
                                        </td>
                                        <td>
                                            {can('users', 'edit') && u.id !== currentUser.id ? (
                                                <button
                                                    onClick={() => handleToggleActive(u)}
                                                    title={u.active ? 'Deshabilitar acceso' : 'Habilitar acceso'}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 6,
                                                        background: u.active ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                                        border: `1px solid ${u.active ? 'var(--success)' : 'var(--danger)'}`,
                                                        color: u.active ? 'var(--success)' : 'var(--danger)',
                                                        borderRadius: 20, padding: '4px 12px',
                                                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    {u.active ? <Check size={13} /> : <X size={13} />}
                                                    {u.active ? 'Activo' : 'Inactivo'}
                                                </button>
                                            ) : (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: u.active ? 'var(--success)' : 'var(--danger)' }}>
                                                    {u.active ? <Check size={14} /> : <X size={14} />} {u.active ? 'Activo' : 'Inactivo'}
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                                {can('users', 'edit') && (
                                                    <Button variant="ghost" size="sm" style={{ padding: 8, color: 'var(--primary)' }} 
                                                        onClick={() => {
                                                            setEditingId(u.id);
                                                            setUserForm({ ...u, password: "" });
                                                            setView('editUser');
                                                        }}
                                                    >
                                                        <Edit3 size={16} />
                                                    </Button>
                                                )}
                                                {can('users', 'delete') && u.id !== currentUser.id && (
                                                    <Button variant="ghost" size="sm" style={{ padding: 8, color: '#ef4444' }} onClick={() => handleDeleteUser(u.id)}>
                                                        <Trash2 size={16} />
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 20 }}>
                        {roles.map(r => (
                            <div key={r.id} style={{ background: 'white', borderRadius: 12, border: '1px solid var(--border-color)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12, transition: 'all 0.2s', boxShadow: 'var(--shadow-sm)', position: 'relative' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ width: 40, height: 40, borderRadius: 10, background: r.is_system ? '#e0f2fe' : '#fef3c7', color: r.is_system ? '#0369a1' : '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Shield size={20} />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{r.name}</h3>
                                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.is_system ? 'Perfil de Sistema' : 'Perfil Personalizado'}</span>
                                        </div>
                                    </div>
                                    <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', gap: 4 }}>
                                        {can('users', 'edit') && (
                                            <Button variant="ghost" size="sm" style={{ padding: 8, color: 'var(--primary)' }} onClick={() => {
                                                setEditingId(r.id);
                                                setRoleForm(r);
                                                setView('editRole');
                                            }}>
                                                <Edit3 size={16} />
                                            </Button>
                                        )}
                                        {can('users', 'delete') && !r.is_system && (
                                            <Button variant="ghost" size="sm" style={{ padding: 8, color: '#ef4444' }} onClick={() => handleDeleteRole(r.id, r.is_system)}>
                                                <Trash2 size={16} />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0', minHeight: 40 }}>{r.description || 'Sin descripción.'}</p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
                                    {PERMISSION_GROUPS.map(group => {
                                        const totalItems = group.items.length;
                                        const activeItems = group.items.filter(item => {
                                            const p = r.permissions[item.id];
                                            return p && (p.view || p.create || p.edit || p.delete);
                                        }).length;
                                        
                                        if (activeItems === 0) return null;

                                        return (
                                            <div key={group.title} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: activeItems === totalItems ? 'var(--success)' : 'var(--primary)' }} />
                                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-main)' }}>{group.title}: {activeItems}/{totalItems}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
