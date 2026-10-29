import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Shield, CheckCircle, AlertCircle, Lock, User, ArrowRight, ChevronDown, ChevronUp, Key } from 'lucide-react';

interface AcceptInvitationPageProps {
  initialToken?: string;
  initialEmail?: string;
  onNavigate: (page: string) => void;
}

export const AcceptInvitationPage: React.FC<AcceptInvitationPageProps> = ({
  initialToken,
  initialEmail,
  onNavigate
}) => {
  const { user, loginWithUser } = useAuth();

  // Extract from query parameters if not passed directly
  const queryParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = queryParams.get('token') || queryParams.get('invite') || initialToken || '';
  const emailFromUrl = queryParams.get('email') || initialEmail || '';

  const [token, setToken] = useState<string>(tokenFromUrl);
  const [invitationData, setInvitationData] = useState<any>(null);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Optional registration fields
  const [showAccountCreation, setShowAccountCreation] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (token) {
      verifyToken(token);
    }
  }, [token]);

  const verifyToken = async (tok: string) => {
    if (!tok.trim()) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const data = await api.verifyInvitation(tok.trim());
      setInvitationData(data);
      if (data.nomineeName) setName(data.nomineeName);
    } catch (err: any) {
      setVerifyError(err.message || 'Invalid or expired invitation token.');
      setInvitationData(null);
    } finally {
      setVerifying(false);
    }
  };

  const handleAccept = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!token.trim()) {
      setAcceptError('Please enter a valid invitation token.');
      return;
    }

    setSubmitting(true);
    setAcceptError(null);

    try {
      const payload: { token: string; password?: string; name?: string } = {
        token: token.trim()
      };

      // Password and name are completely OPTIONAL
      if (!user && showAccountCreation && password) {
        if (password.length < 8) {
          throw new Error('Password must be at least 8 characters long.');
        }
        payload.password = password;
        payload.name = name || invitationData?.nomineeName;
      }

      const res = await api.acceptInvitation(payload);

      // If backend returned JWT token and user, log them in immediately
      if (res.token && res.user) {
        loginWithUser(res.user, res.token);

        try {
          const saved = JSON.parse(localStorage.getItem('vaultkeep_saved_accounts') || '[]');
          const filtered = saved.filter((a: any) => a.email.toLowerCase() !== res.user.email.toLowerCase());
          filtered.unshift({
            name: res.user.name,
            email: res.user.email.toLowerCase(),
            password: password || undefined,
            role: 'NOMINEE'
          });
          localStorage.setItem('vaultkeep_saved_accounts', JSON.stringify(filtered.slice(0, 5)));
          localStorage.setItem('vaultkeep_last_registered_email', res.user.email.toLowerCase());
        } catch {
          // ignore
        }
      }

      setSuccess(true);
    } catch (err: any) {
      setAcceptError(err.message || 'Failed to accept invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div style={{ maxWidth: '540px', margin: '3.5rem auto', padding: '0 1rem' }}>
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-md)',
          padding: '2.5rem',
          textAlign: 'center'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            backgroundColor: 'var(--success-bg)',
            color: 'var(--success)',
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.25rem'
          }}>
            <CheckCircle size={32} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
            Nomination Confirmed & Accepted!
          </h2>
          <p style={{ fontSize: '0.925rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '2rem' }}>
            You are now officially confirmed as a trusted digital legacy nominee for{' '}
            <strong style={{ color: 'var(--text-main)' }}>{invitationData?.ownerName || 'the account owner'}</strong>.
            <br />
            No further action is required right now. If extended inactivity is ever confirmed under their policy, you will be notified via AWS SNS and granted conditional access.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {user ? (
              <button
                onClick={() => onNavigate('nominee-dashboard')}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 1.5rem',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                Go to Nominee Portal <ArrowRight size={18} />
              </button>
            ) : (
              <>
                <button
                  onClick={() => onNavigate('register')}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 1.5rem',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}
                >
                  Create Nominee Account Password <ArrowRight size={18} />
                </button>
                <button
                  onClick={() => onNavigate('login')}
                  style={{
                    width: '100%',
                    backgroundColor: 'transparent',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.65rem 1.5rem',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  Return to Sign In
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '540px', margin: '3rem auto', padding: '0 1rem' }}>
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-md)',
        padding: '2.25rem'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            width: '52px',
            height: '52px',
            backgroundColor: 'var(--primary-light)',
            color: 'var(--primary)',
            borderRadius: 'var(--radius-md)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '0.75rem'
          }}>
            <Shield size={28} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            Nominee Invitation
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Confirm and accept your appointment as an authorized digital legacy nominee
          </p>
        </div>

        {/* Verification Alert if token error */}
        {verifyError && (
          <div style={{
            backgroundColor: 'var(--danger-bg)',
            color: 'var(--danger)',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1.5rem'
          }}>
            <AlertCircle size={18} /> {verifyError}
          </div>
        )}

        {/* If token verified, show clear details */}
        {invitationData ? (
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            marginBottom: '1.5rem'
          }}>
            <p style={{ margin: '0 0 0.5rem 0', fontWeight: 700, color: 'var(--text-main)', fontSize: '1.05rem' }}>
              Hi {invitationData.nomineeName || 'there'},
            </p>
            <p style={{ margin: '0 0 0.75rem 0', color: 'var(--text-secondary)', fontSize: '0.925rem', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--primary)' }}>{invitationData.ownerName}</strong> invited you to be a nominee in their VaultKeep digital legacy vault.
            </p>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '0.6rem' }}>
              Nominee Email: <strong>{invitationData.nomineeEmail}</strong> &bull; Relationship: <strong>{invitationData.relationshipType}</strong>
              <br />
              This invitation expires in 7 days. If you weren’t expecting it, you can ignore this page.
            </div>
          </div>
        ) : !token ? (
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-main)' }}>
              Invitation Security Token
            </label>
            <input
              type="text"
              required
              value={token}
              onChange={e => {
                setToken(e.target.value);
                if (e.target.value.length >= 16) {
                  verifyToken(e.target.value);
                }
              }}
              placeholder="Paste invitation token from email link"
              style={{
                width: '100%',
                padding: '0.7rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-main)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />
          </div>
        ) : null}

        {acceptError && (
          <div style={{
            backgroundColor: 'var(--danger-bg)',
            color: 'var(--danger)',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1.25rem'
          }}>
            <AlertCircle size={18} /> {acceptError}
          </div>
        )}

        {user && (
          <div style={{
            backgroundColor: 'var(--info-bg, #eff6ff)',
            color: 'var(--primary)',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <CheckCircle size={16} /> Logged in as <strong>{user.email}</strong>. Accepting will link this nominee status directly to your account.
          </div>
        )}

        {/* PRIMARY 1-CLICK ACCEPT BUTTON: No long form required! */}
        <button
          onClick={() => handleAccept()}
          disabled={submitting || verifying || (token && !invitationData && !verifyError)}
          style={{
            width: '100%',
            backgroundColor: 'var(--primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem 1.5rem',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: '1.25rem'
          }}
        >
          {submitting ? 'Confirming Acceptance...' : (
            <>
              <CheckCircle size={20} /> Accept Invitation
            </>
          )}
        </button>

        {/* Optional Account Creation Section (Collapsible) */}
        {!user && (
          <div style={{
            borderTop: '1px solid var(--border-color)',
            paddingTop: '1rem',
            marginTop: '0.5rem'
          }}>
            <button
              type="button"
              onClick={() => setShowAccountCreation(!showAccountCreation)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '0.25rem 0'
              }}
            >
              <span>Optional: Create account password now</span>
              {showAccountCreation ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showAccountCreation && (
              <div style={{ marginTop: '0.85rem', backgroundColor: 'var(--bg-surface)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ marginBottom: '0.85rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-main)' }}>
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Enter full name"
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-card)',
                      color: 'var(--text-main)',
                      fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-main)' }}>
                    Account Password (min 8 characters)
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Create a password"
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-card)',
                      color: 'var(--text-main)',
                      fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  />
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                    Setting a password creates your nominee portal account upon acceptance.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
          Already have an account?{' '}
          <button
            onClick={() => onNavigate('login')}
            style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
          >
            Sign in here
          </button>
        </div>
      </div>
    </div>
  );
};
