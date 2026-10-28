import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'NOMINEE' | 'ADMIN';
  lastCheckInAt?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentials: any) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  refreshUser: async () => {}
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('vaultkeep_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const data = await api.getMe();
      setUser(data.user);
      localStorage.setItem('vaultkeep_user', JSON.stringify(data.user));
    } catch {
      setUser(null);
      localStorage.removeItem('vaultkeep_token');
      localStorage.removeItem('vaultkeep_user');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (localStorage.getItem('vaultkeep_token')) {
      refreshUser();
    } else {
      setLoading(false);
    }

    const handleExpired = () => {
      setUser(null);
    };
    window.addEventListener('auth-expired', handleExpired);
    return () => window.removeEventListener('auth-expired', handleExpired);
  }, []);

  const login = async (credentials: any) => {
    const res = await api.login(credentials);
    localStorage.setItem('vaultkeep_token', res.token);
    localStorage.setItem('vaultkeep_user', JSON.stringify(res.user));
    setUser(res.user);
  };

  const register = async (data: any) => {
    const res = await api.register(data);
    localStorage.setItem('vaultkeep_token', res.token);
    localStorage.setItem('vaultkeep_user', JSON.stringify(res.user));
    setUser(res.user);
  };

  const logout = () => {
    api.logout().catch(() => {});
    localStorage.removeItem('vaultkeep_token');
    localStorage.removeItem('vaultkeep_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
