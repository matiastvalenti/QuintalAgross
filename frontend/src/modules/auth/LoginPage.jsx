import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Loader2, Warehouse } from 'lucide-react';
import Button from '../../components/ui/Button';
import s from './LoginPage.module.css';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={s.loginPage}>
      <form className={`${s.loginForm} animate-scale`} onSubmit={handleSubmit}>
        <div className={`${s.logo} animate-slide-up`} style={{ animationDelay: '0.1s' }}>
          <Warehouse size={48} color="var(--primary)" strokeWidth={2.5} />
          <h1>Quintal Agross</h1>
          <p>Gestión Integral Agross</p>
        </div>
        
        {error && <div className={`${s.error} animate-fade`}>{error}</div>}
        
        <div className={`${s.field} animate-slide-up`} style={{ animationDelay: '0.2s' }}>
          <label><User size={16} /> Usuario</label>
          <input 
            type="text" 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            placeholder="Tu nombre de usuario o email"
            required 
          />
        </div>
        
        <div className={`${s.field} animate-slide-up`} style={{ animationDelay: '0.3s' }}>
          <label><Lock size={16} /> Contraseña</label>
          <input 
            type="password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            placeholder="••••••••"
            required 
          />
        </div>
        
        <div className="animate-slide-up" style={{ animationDelay: '0.4s' }}>
          <Button 
            fullWidth 
            variant="primary" 
            type="submit" 
            disabled={loading}
            style={{ height: 50, borderRadius: 16, fontSize: 16, fontWeight: 700 }}
          >
            {loading ? <><Loader2 className={s.spin} size={20} /> Entrando...</> : "Iniciar Sesión"}
          </Button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <a 
            href="/forgot-password" 
            onClick={(e) => { e.preventDefault(); navigate('/forgot-password'); }}
            style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 500 }}
          >
            ¿Olvidaste tu contraseña?
          </a>
        </div>
      </form>
    </div>
  );
}
