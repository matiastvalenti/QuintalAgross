import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Lock, Loader2, Warehouse, CheckCircle, AlertCircle } from 'lucide-react';
import Button from '../../components/ui/Button';
import s from './LoginPage.module.css';

export default function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Token de recuperación no encontrado. Por favor, solicita uno nuevo.");
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={s.loginPage}>
        <div className={s.loginForm} style={{ textAlign: 'center' }}>
          <div className={s.logo}>
            <CheckCircle size={64} color="#10b981" strokeWidth={1.5} />
            <h1 style={{ marginTop: 20 }}>Contraseña actualizada</h1>
            <p>Tu contraseña ha sido restablecida con éxito. Serás redirigido al login en unos segundos...</p>
          </div>
          <Button fullWidth onClick={() => navigate('/login')} style={{ marginTop: 20 }}>Ir al login ahora</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={s.loginPage}>
      <form className={s.loginForm} onSubmit={handleSubmit}>
        <div className={s.logo}>
          <Warehouse size={48} color="var(--primary)" strokeWidth={2.5} />
          <h1>Nueva contraseña</h1>
          <p>Crea una contraseña segura para tu cuenta</p>
        </div>
        
        {error && <div className={s.error} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={16} /> {error}
        </div>}
        
        {!token ? (
          <Link to="/forgot-password" style={{ display: 'block', textAlign: 'center', marginTop: 20, color: 'var(--primary)', fontWeight: 600 }}>
            Solicitar nuevo token
          </Link>
        ) : (
          <>
            <div className={s.field}>
              <label><Lock size={16} /> Nueva contraseña</label>
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                placeholder="Mínimo 6 caracteres"
                required 
              />
            </div>
            
            <div className={s.field}>
              <label><Lock size={16} /> Confirmar contraseña</label>
              <input 
                type="password" 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                placeholder="Repite tu contraseña"
                required 
              />
            </div>
            
            <Button 
              fullWidth 
              variant="primary" 
              type="submit" 
              disabled={loading}
              style={{ height: 50, borderRadius: 16, fontSize: 16, fontWeight: 700 }}
            >
              {loading ? <><Loader2 className={s.spin} size={20} /> Actualizando...</> : "Guardar contraseña"}
            </Button>
          </>
        )}
      </form>
    </div>
  );
}
