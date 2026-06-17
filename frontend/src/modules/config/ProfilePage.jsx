import React, { useState } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Card from '../../components/ui/Card';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_URL } from '../../config';
import { User, Lock, Mail, Save, LogOut } from 'lucide-react';
import { getInitials } from '../../utils/formatters';

export default function ProfilePage() {
    const { user, logout, updateUser } = useAuth();
    const { showToast } = useToast();
    
    // Profile State
    const [profileData, setProfileData] = useState({
        full_name: user?.name || "",
        email: user?.email || ""
    });
    const [updatingProfile, setUpdatingProfile] = useState(false);

    // Password State
    const [passData, setPassData] = useState({
        current: "",
        new_pass: "",
        confirm: ""
    });
    const [updatingPass, setUpdatingPass] = useState(false);

    const handleUpdateProfile = async () => {
        if (!profileData.full_name || !profileData.email) {
            showToast("Nombre y Email son obligatorios", "warning");
            return;
        }

        try {
            setUpdatingProfile(true);
            const res = await fetch(`${API_URL}/auth/me`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(profileData)
            });

            if (res.ok) {
                const data = await res.json();
                showToast("Perfil actualizado correctamente", "success");
                // Refresh global state immediately
                updateUser({ name: profileData.full_name, email: profileData.email });
            } else {
                const err = await res.json();
                showToast(err.detail || "Error al actualizar perfil", "error");
            }
        } catch (e) {
            showToast("Error de conexión", "error");
        } finally {
            setUpdatingProfile(false);
        }
    };

    const handleChangePassword = async () => {
        if (!passData.current || !passData.new_pass) {
            showToast("Complete todos los campos de contraseña", "warning");
            return;
        }
        if (passData.new_pass !== passData.confirm) {
            showToast("Las contraseñas no coinciden", "warning");
            return;
        }

        try {
            setUpdatingPass(true);
            const res = await fetch(`${API_URL}/auth/change-password`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    current_password: passData.current,
                    new_password: passData.new_pass
                })
            });

            if (res.ok) {
                showToast("Contraseña cambiada con éxito", "success");
                setPassData({ current: "", new_pass: "", confirm: "" });
            } else {
                const err = await res.json();
                showToast(err.detail || "Error al cambiar contraseña", "error");
            }
        } catch (e) {
            showToast("Error de conexión", "error");
        } finally {
            setUpdatingPass(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-page)', overflowX: 'hidden' }}>
            {/* Header / Banner area */}
            <div style={{ 
                height: '180px', 
                background: 'linear-gradient(135deg, var(--primary) 0%, #1e1b4b 100%)',
                position: 'relative',
                flexShrink: 0
            }}>
                <div style={{ maxWidth: 1200, margin: '0 auto', height: '100%', position: 'relative', padding: '0 20px' }}>
                    <div style={{ 
                        position: 'absolute', 
                        bottom: '-40px', 
                        display: 'flex', 
                        alignItems: 'flex-end', 
                        gap: 24 
                    }}>
                        <div style={{ 
                            width: 120, 
                            height: 120, 
                            borderRadius: 'var(--r-md)', 
                            background: 'white', 
                            border: '4px solid white',
                            boxShadow: 'var(--shadow-lg)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 48,
                            fontWeight: 800,
                            color: 'var(--primary)'
                        }}>
                            {getInitials(user?.name)}
                        </div>
                        <div style={{ paddingBottom: 12 }}>
                            <h1 style={{ color: 'white', margin: 0, fontSize: 32, fontWeight: 800, textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                                {user?.name || 'Usuario'}
                            </h1>
                            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                {user?.roles?.map(role => (
                                    <span key={role} style={{ 
                                        background: 'rgba(255,255,255,0.2)', 
                                        color: 'white', 
                                        padding: '2px 12px', 
                                        borderRadius: 100, 
                                        fontSize: 11, 
                                        fontWeight: 600,
                                        textTransform: 'uppercase',
                                        backdropFilter: 'blur(4px)'
                                    }}>
                                        {role}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ padding: '60px 20px 40px 20px', flex: 1, overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24, maxWidth: 1200, margin: '0 auto' }}>
                    
                    {/* Datos Personales */}
                    <Card title="Datos de la Cuenta" icon={<User size={18} />}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <Input 
                                label="Nombre Completo" 
                                value={profileData.full_name} 
                                onChange={e => setProfileData({...profileData, full_name: e.target.value})}
                                placeholder="Ej: Juan Pérez"
                            />
                            <Input 
                                label="Correo Electrónico" 
                                value={profileData.email} 
                                onChange={e => setProfileData({...profileData, email: e.target.value})}
                                placeholder="usuario@empresa.com"
                                icon={<Mail size={16} />}
                            />
                            
                            <div style={{ marginTop: 8, padding: '16px', background: 'var(--bg-page)', borderRadius: 'var(--r-md)', border: '1px solid var(--border-color)' }}>
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Detalles de Acceso</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-sm)' }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>Nombre de Usuario</span>
                                        <span style={{ fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace', fontSize: 14, background: 'var(--primary-light)', padding: '2px 10px', borderRadius: 8 }}>@{user?.username}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>Nivel de Acceso</span>
                                        <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{user?.roles?.join(', ').toUpperCase()}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>ID de Usuario</span>
                                        <span style={{ fontWeight: 500, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-tertiary)' }}>{user?.id?.slice(0, 18)}…</span>
                                    </div>
                                </div>
                            </div>

                            <Button onClick={handleUpdateProfile} disabled={updatingProfile} style={{ marginTop: 8 }}>
                                <Save size={16} style={{ marginRight: 6 }} /> Actualizar Información
                            </Button>
                        </div>
                    </Card>

                    {/* Seguridad */}
                    <Card title="Seguridad y Credenciales" icon={<Lock size={18} />}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
                                Se recomienda cambiar la contraseña cada 90 días para mantener la integridad de su cuenta.
                            </p>
                            <Input 
                                type="password" 
                                label="Contraseña Actual" 
                                value={passData.current} 
                                onChange={e => setPassData({...passData, current: e.target.value})}
                                placeholder="••••••••"
                            />
                            <div style={{ height: 1, background: 'var(--border-color)', margin: '8px 0' }}></div>
                            <Input 
                                type="password" 
                                label="Nueva Contraseña" 
                                value={passData.new_pass} 
                                onChange={e => setPassData({...passData, new_pass: e.target.value})}
                                placeholder="Mínimo 8 caracteres"
                            />
                            <Input 
                                type="password" 
                                label="Confirmar Nueva Contraseña" 
                                value={passData.confirm} 
                                onChange={e => setPassData({...passData, confirm: e.target.value})}
                                placeholder="Repita la contraseña"
                            />

                            <Button variant="secondary" onClick={handleChangePassword} disabled={updatingPass} style={{ marginTop: 8 }}>
                                <Lock size={16} style={{ marginRight: 6 }} /> Cambiar Contraseña
                            </Button>
                        </div>
                    </Card>

                </div>
                
                <div style={{ textAlign: 'center', marginTop: 60, display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
                    <div style={{ height: 1, width: 200, background: 'var(--border-color)' }}></div>
                    <Button variant="ghost" onClick={logout} style={{ color: 'var(--danger)' }}>
                        <LogOut size={16} style={{ marginRight: 6 }} /> Cerrar Sesión del Sistema
                    </Button>
                </div>
            </div>
        </div>
    );
}
