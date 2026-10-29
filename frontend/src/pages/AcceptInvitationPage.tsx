import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Shield, CheckCircle, AlertCircle, Lock, User, ArrowRight, Clock, Mail } from 'lucide-react';

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
  const { user, login } = useAuth();

  // Extract from query parameters if not passed directly
  const queryParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = queryParams.get('token') || queryParams.get('invite') || initialToken || '';
  const emailFromUrl = queryParams.get('email') || initialEmail || '';

  const [token, setToken] = useState<string>(tokenFromUrl);
  const [invitationData, setInvitationData] = useState<any>(null);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Registration/Acceptance form state
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

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
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

      if (!user) {
        if (!password || password.length < 8) {
          throw new Error('Please create a password of at least 8 characters to secure your nominee portal.');
        }
        payload.password = password;
        payload.name = name || invitationData?.nomineeName;
      }

      const res = await api.acceptInvitation(payload);

      // If backend returned JWT token and user, log them in
      if (res.token && res.user) {
        localStorage.setItem('vaultkeep_token', res.token);
        localStorage.setItem('vaultkeep_user', JSON.stringify(res.user));
        window.dispatchEvent(new Event('auth-token-updated'));
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
      <div style={{ maxWidth: '520px', margin: '3.5rem auto', padding: '0 1rem' }}>
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
            Invitation Accepted!
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '2rem' }}>
            You are now officially registered and verified as a trusted nominee for{' '}
            <strong>{invitationData?.ownerName || 'your appointing owner'}</strong>.
            In the event of verified extended inactivity, conditionally authorized legacy documents will become available in your nominee portal.
          </p>

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
            Enter Nominee Portal <ArrowRight size={18} />
          </button>
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
        padding: '2rem'
      }}>
        {/* Header */}
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
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            Nominee Invitation
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Confirm and accept your appointment as a trusted digital legacy nominee
          </p>
        </div>

        {/* Verification Status Alert */}
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

        {invitationData && (
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              <CheckCircle size={16} /> Verified Invitation Details
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
              <div>Appointing Owner: <strong>{invitationData.ownerName}</strong> ({invitationData.ownerEmail || 'Secured Account'})</div>
              <div>Nominee Recipient: <strong>{invitationData.nomineeEmail}</strong></div>
              <div>Relationship: <strong>{invitationData.relationshipType}</strong></div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                Expires: {new Date(invitationData.expiresAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        )}

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

        {/* Form */}
        <form onSubmit={handleAccept}>
          <div style={{ marginBottom: '1.25rem' }}>
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
              placeholder="Enter invitation token (from email link)"
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

          {/* If the nominee is not already logged in, prompt to set their password */}
          {!user && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-main)' }}>
                  Your Full Legal Name
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Enter your full name"
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.75rem 0.65rem 2.25rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-main)',
                      fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-main)' }}>
                  Create Nominee Account Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.75rem 0.65rem 2.25rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-main)',
                      fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  This password will authenticate your access to conditional legacy releases.
                </span>
              </div>
            </>
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
              <CheckCircle size={16} /> Logged in as <strong>{user.email}</strong>. Accepting will link this nominee status to your account.
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || verifying}
            style={{
              width: '100%',
              backgroundColor: 'var(--primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            {submitting ? 'Verifying & Accepting...' : 'Accept Nominee Invitation'}
          </button>
        </form>

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
