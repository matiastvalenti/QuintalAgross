import React, { createContext, useContext, useState, useEffect } from "react";
import { API_URL } from "../config";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      console.time('4. Validación Sesion AuthContext');
      const token = localStorage.getItem("token");
      const savedUser = localStorage.getItem("user");
      
      // Si hay sesión guardada, la cargamos inmediatamente para no bloquear la UI
      if (token && savedUser) {
        setUser(JSON.parse(savedUser));
        setLoading(false);
        console.timeEnd('4. Validación Sesion AuthContext');
        
        // Aquí podríamos disparar una revalidación asíncrona silente:
        // validateSessionInBackground(token);
        return;
      }
      
      // Si no hay sesión, liberamos para que redirija al login
      setLoading(false);
      console.timeEnd('4. Validación Sesion AuthContext');
    };

    init();

    // Global fetch interceptor to catch 401 Unauthorized errors
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      let response = await originalFetch(...args);
      const url = args[0]?.toString() || "";
      
      // If we got a 401 and it's not a login/refresh attempt
      if (response.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/refresh')) {
        const refreshToken = localStorage.getItem("refresh_token");
        if (refreshToken) {
          try {
            // Attempt to refresh the token
            const refreshRes = await originalFetch(`${API_URL}/auth/refresh`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ refresh_token: refreshToken })
            });

            if (refreshRes.ok) {
              const data = await refreshRes.json();
              localStorage.setItem("token", data.access_token);
              // Update Authorization header in the arguments for retry
              const options = args[1] || {};
              options.headers = {
                ...(options.headers || {}),
                "Authorization": `Bearer ${data.access_token}`
              };
              // Retry original request
              response = await originalFetch(args[0], options);
              return response;
            }
          } catch (err) {
            console.error("Token refresh failed", err);
          }
        }
        
        // If refresh failed or no refresh token, logout
        localStorage.removeItem("token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");
        setUser(null);
        window.dispatchEvent(new Event('session_expired'));
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const login = async (email, password) => {
    const formData = new FormData();
    formData.append("username", email);
    formData.append("password", password);

    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || "Login failed");
    }

    const data = await res.json();
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    setUser(null);
  };

  const forgotPassword = async (email) => {
    const res = await fetch(`${API_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || "Error al solicitar recuperación");
    }
    return await res.json();
  };

  const resetPassword = async (token, newPassword) => {
    const res = await fetch(`${API_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, new_password: newPassword }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || "Error al restablecer contraseña");
    }
    return await res.json();
  };

  const updateUser = (updatedUserData) => {
    const newUser = { ...user, ...updatedUserData };
    localStorage.setItem("user", JSON.stringify(newUser));
    setUser(newUser);
  };

  const hasRole = (role) => {
    const roles = user?.roles || [];
    const lowerRoles = roles.map(r => r.toLowerCase());
    const lowerTarget = role.toLowerCase();
    
    return (
      lowerRoles.includes(lowerTarget) ||
      lowerRoles.includes("admin") ||
      lowerRoles.includes("administrador") ||
      lowerRoles.includes("owner")
    );
  };

  const can = (module, action) => {
    const roles = user?.roles || [];
    const lowerRoles = roles.map(r => r.toLowerCase());
    
    if (lowerRoles.includes("admin") || lowerRoles.includes("administrador") || lowerRoles.includes("owner")) {
        return true;
    }
    const perms = user?.permissions || {};
    return perms[module]?.[action] === true;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, hasRole, can, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
