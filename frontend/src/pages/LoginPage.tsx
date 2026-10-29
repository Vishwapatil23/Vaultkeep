import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Shield, Lock, Mail, AlertCircle, ArrowRight, UserCheck, Sparkles } from 'lucide-react';

interface LoginProps {
  onNavigate: (page: string) => void;
}

interface SavedAccount {
  name: string;
  email: string;
  password?: string;
  role: string;
}

interface BackendUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isDemo: boolean;
  createdAt: string;
}

export const LoginPage: React.FC<LoginProps> = ({ onNavigate }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState(() => {
    return localStorage.getItem('vaultkeep_last_registered_email') || '';
  });
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<BackendUser[]>([]);

  useEffect(() => {
    // Load local browser-saved registered accounts
    try {
      const saved = JSON.parse(localStorage.getItem('vaultkeep_saved_accounts') || '[]');
      if (Array.isArray(saved)) {
        setSavedAccounts(saved);
        // If password is saved for the prefilled email, prefill password too
        const lastEmail = localStorage.getItem('vaultkeep_last_registered_email');
        if (lastEmail) {
          const match = saved.find((a: SavedAccount) => a.email.toLowerCase() === lastEmail.toLowerCase());
          if (match && match.password) {
            setPassword(match.password);
          }
        }
      }
    } catch {
      // ignore
    }

    // Also fetch all registered users from backend DB
    api.getRegisteredUsers()
      .then(res => {
        if (res.users && Array.isArray(res.users)) {
          setRegisteredUsers(res.users);
        }
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const loggedInUser = await login({ email: trimmedEmail, password });

      // Remember credentials locally for subsequent effortless logins
      try {
        const saved = JSON.parse(localStorage.getItem('vaultkeep_saved_accounts') || '[]');
        const filtered = saved.filter((a: SavedAccount) => a.email.toLowerCase() !== trimmedEmail);
        filtered.unshift({
          name: loggedInUser.name,
          email: trimmedEmail,
          password,
          role: loggedInUser.role
        });
        localStorage.setItem('vaultkeep_saved_accounts', JSON.stringify(filtered.slice(0, 5)));
        localStorage.setItem('vaultkeep_last_registered_email', trimmedEmail);
      } catch {
        // ignore
      }

      // Route to correct dashboard based on user role
      if (loggedInUser.role === 'NOMINEE') {
        onNavigate('nominee-dashboard');
      } else if (loggedInUser.role === 'ADMIN') {
        onNavigate('admin-dashboard');
      } else {
        onNavigate('dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid authentication credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSavedAccount = (acc: SavedAccount) => {
    setEmail(acc.email);
    if (acc.password) {
      setPassword(acc.password);
    }
    setError(null);
  };

  const handleSelectBackendUser = (u: BackendUser) => {
    setEmail(u.email);
    // If we have password in savedAccounts, populate it
    const match = savedAccounts.find(a => a.email.toLowerCase() === u.email.toLowerCase());
    if (match && match.password) {
      setPassword(match.password);
    } else {
      setPassword('');
    }
    setError(null);
  };

  const setSyntheticCredentials = (userEmail: string, userPass: string) => {
    setEmail(userEmail);
    setPassword(userPass);
    setError(null);
  };

  // Filter backend users to only non-demo registered users
  const customRegisteredUsers = registeredUsers.filter(u => !u.isDemo);

  return (
    <div style={{ maxWidth: '460px', margin: '3rem auto', padding: '0 1rem' }}>
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-md)',
        padding: '2rem'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            width: '48px',
            height: '48px',
            backgroundColor: 'var(--primary-light)',
            color: 'var(--primary)',
            borderRadius: 'var(--radius-md)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '0.75rem'
          }}>
            <Shield size={26} />
          </div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-main)' }}>Sign In to VaultKeep</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Authenticate to access your encrypted legacy or nominee vault</p>
        </div>

        {error && (
          <div style={{
            backgroundColor: 'var(--danger-bg)',
            color: 'var(--danger)',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1.25rem'
          }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-main)' }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@example.com"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.75rem 0.65rem 2.25rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-main)',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-main)' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.75rem 0.65rem 2.25rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-main)',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              backgroundColor: 'var(--primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            {loading ? 'Authenticating...' : <>Sign In <ArrowRight size={16} /></>}
          </button>
        </form>

        {/* Recently Registered Accounts in this Browser */}
        {savedAccounts.length > 0 && (
          <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '0.65rem' }}>
              <Sparkles size={14} /> Recently Registered Accounts (1-Click Fill)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {savedAccounts.map((acc, idx) => (
                <button
                  key={`saved-${idx}`}
                  type="button"
                  onClick={() => handleSelectSavedAccount(acc)}
                  style={{
                    backgroundColor: email.toLowerCase() === acc.email.toLowerCase() ? 'var(--primary-light)' : 'var(--bg-surface)',
                    border: `1px solid ${email.toLowerCase() === acc.email.toLowerCase() ? 'var(--primary)' : 'var(--border-color)'}`,
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.45rem 0.65rem',
                    fontSize: '0.8rem',
                    color: 'var(--text-main)',
                    fontWeight: 600,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <UserCheck size={14} style={{ color: 'var(--primary)' }} />
                    <span>{acc.name} ({acc.email})</span>
                  </div>
                  <span style={{
                    fontSize: '0.7rem',
                    backgroundColor: acc.role === 'NOMINEE' ? 'var(--trust-teal-light)' : 'var(--primary-light)',
                    color: acc.role === 'NOMINEE' ? 'var(--trust-teal)' : 'var(--primary)',
                    padding: '0.1rem 0.4rem',
                    borderRadius: 'var(--radius-full)'
                  }}>
                    {acc.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Registered Users from Database (if not already listed in saved accounts) */}
        {customRegisteredUsers.length > 0 && savedAccounts.length === 0 && (
          <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.65rem', textAlign: 'center' }}>
              Registered Database Accounts
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {customRegisteredUsers.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleSelectBackendUser(u)}
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.45rem 0.65rem',
                    fontSize: '0.8rem',
                    color: 'var(--text-main)',
                    fontWeight: 600,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>{u.name} ({u.email})</span>
                  <span style={{
                    fontSize: '0.7rem',
                    backgroundColor: u.role === 'NOMINEE' ? 'var(--trust-teal-light)' : 'var(--primary-light)',
                    color: u.role === 'NOMINEE' ? 'var(--trust-teal)' : 'var(--primary)',
                    padding: '0.1rem 0.4rem',
                    borderRadius: 'var(--radius-full)'
                  }}>
                    {u.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Synthetic Demonstration Test Accounts */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.65rem', textAlign: 'center' }}>
            Quick Demo Identities (Viva & Evaluation)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <button
              type="button"
              onClick={() => setSyntheticCredentials('alex.vance@vaultkeep-demo.internal', 'Password123!')}
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.4rem 0.65rem',
                fontSize: '0.8rem',
                color: 'var(--primary)',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer'
              }}
            >
              1. Alexander Vance (Account Owner)
            </button>
            <button
              type="button"
              onClick={() => setSyntheticCredentials('eleanor.nominee@vaultkeep-demo.internal', 'Password123!')}
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.4rem 0.65rem',
                fontSize: '0.8rem',
                color: 'var(--trust-teal)',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer'
              }}
            >
              2. Eleanor Vance (Trusted Nominee)
            </button>
            <button
              type="button"
              onClick={() => setSyntheticCredentials('admin.operator@vaultkeep-demo.internal', 'Password123!')}
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.4rem 0.65rem',
                fontSize: '0.8rem',
                color: 'var(--warning)',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer'
              }}
            >
              3. Marcus Security (Operator / Admin)
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Need a new vault?{' '}
          <button
            onClick={() => onNavigate('register')}
            style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}
          >
            Register Account
          </button>
        </div>
      </div>
    </div>
  );
};
