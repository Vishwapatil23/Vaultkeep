import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Lock, Mail, AlertCircle, ArrowRight } from 'lucide-react';

interface LoginProps {
  onNavigate: (page: string) => void;
}

export const LoginPage: React.FC<LoginProps> = ({ onNavigate }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login({ email, password });
      onNavigate('dashboard');
    } catch (err: any) {
      setError(err.message || 'Invalid authentication credentials.');
    } finally {
      setLoading(false);
    }
  };

  const setSyntheticCredentials = (userEmail: string, userPass: string) => {
    setEmail(userEmail);
    setPassword(userPass);
    setError(null);
  };

  return (
    <div style={{ maxWidth: '440px', margin: '3.5rem auto', padding: '0 1rem' }}>
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
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Authenticate to manage or access your encrypted legacy</p>
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

        {/* Synthetic Demonstration Test Accounts */}
        <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
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
