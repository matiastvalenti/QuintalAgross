import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Loader2, Warehouse, ArrowLeft, CheckCircle } from 'lucide-react';
import Button from '../../components/ui/Button';
import s from './LoginPage.module.css';

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await forgotPassword(email);
      setSuccess(true);
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
            <h1 style={{ marginTop: 20 }}>Solicitud enviada</h1>
            <p>Si el email {email} está en nuestra base de datos, recibirás un mensaje con las instrucciones para recuperar tu contraseña.</p>
          </div>
          <Link to="/login" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
            <ArrowLeft size={16} /> Volver al login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={s.loginPage}>
      <form className={s.loginForm} onSubmit={handleSubmit}>
        <div className={s.logo}>
          <Warehouse size={48} color="var(--primary)" strokeWidth={2.5} />
          <h1>Recuperar acceso</h1>
          <p>Ingresa tu email para restablecer tu contraseña</p>
        </div>
        
        {error && <div className={s.error}>{error}</div>}
        
        <div className={s.field}>
          <label><Mail size={16} /> Email</label>
          <input 
            type="email" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            placeholder="ejemplo@quintalagross.ar"
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
          {loading ? <><Loader2 className={s.spin} size={20} /> Enviando...</> : "Enviar instrucciones"}
        </Button>

        <Link to="/login" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, color: 'var(--text-secondary)', fontSize: 14, textDecoration: 'none' }}>
          <ArrowLeft size={16} /> Volver al login
        </Link>
      </form>
    </div>
  );
}
