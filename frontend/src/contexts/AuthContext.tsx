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
  login: (credentials: any) => Promise<User>;
  register: (data: any) => Promise<User>;
  loginWithUser: (user: User, token: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => ({} as User),
  register: async () => ({} as User),
  loginWithUser: () => {},
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

    const handleTokenUpdated = () => {
      const savedUser = localStorage.getItem('vaultkeep_user');
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch {
          refreshUser();
        }
      } else {
        refreshUser();
      }
    };

    window.addEventListener('auth-expired', handleExpired);
    window.addEventListener('auth-token-updated', handleTokenUpdated);
    return () => {
      window.removeEventListener('auth-expired', handleExpired);
      window.removeEventListener('auth-token-updated', handleTokenUpdated);
    };
  }, []);

  const login = async (credentials: any): Promise<User> => {
    const res = await api.login(credentials);
    localStorage.setItem('vaultkeep_token', res.token);
    localStorage.setItem('vaultkeep_user', JSON.stringify(res.user));
    localStorage.setItem('vaultkeep_last_registered_email', res.user.email);
    setUser(res.user);
    return res.user;
  };

  const register = async (data: any): Promise<User> => {
    const res = await api.register(data);
    localStorage.setItem('vaultkeep_token', res.token);
    localStorage.setItem('vaultkeep_user', JSON.stringify(res.user));
    localStorage.setItem('vaultkeep_last_registered_email', res.user.email);
    setUser(res.user);
    return res.user;
  };

  const loginWithUser = (userData: User, token: string) => {
    localStorage.setItem('vaultkeep_token', token);
    localStorage.setItem('vaultkeep_user', JSON.stringify(userData));
    localStorage.setItem('vaultkeep_last_registered_email', userData.email);
    setUser(userData);
  };

  const logout = () => {
    api.logout().catch(() => {});
    localStorage.removeItem('vaultkeep_token');
    localStorage.removeItem('vaultkeep_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginWithUser, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
