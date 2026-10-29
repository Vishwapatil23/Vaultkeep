import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { StatusBadge } from '../components/Badge';
import { Shield, Clock, FileText, Users, CheckCircle, AlertTriangle, ArrowRight, RefreshCw, Upload, UserPlus } from 'lucide-react';

interface OwnerDashboardProps {
  onNavigate: (tab: string) => void;
}

export const OwnerDashboard: React.FC<OwnerDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [lifecycle, setLifecycle] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [nominees, setNominees] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [checkIns, setCheckIns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkInSubmitting, setCheckInSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchData = async () => {
    try {
      const [statusRes, docsRes, nomineesRes, rulesRes, checkInsRes] = await Promise.all([
        api.getLifecycleStatus(),
        api.getDocuments(),
        api.getNominees(),
        api.getReleaseRules(),
        api.getCheckIns()
      ]);

      setLifecycle(statusRes.lifecycle);
      setSettings(statusRes.settings);
      setDocuments(docsRes.documents || []);
      setNominees(nomineesRes.nominees || []);
      setRules(rulesRes.releaseRules || []);
      setCheckIns(checkInsRes.checkIns || []);
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handlePerformCheckIn = async () => {
    setCheckInSubmitting(true);
    setNotification(null);
    try {
      const res = await api.performCheckIn();
      setLifecycle(res.lifecycle);
      setNotification({
        type: 'success',
        message: 'Check-in confirmed successfully! Your inactivity deadline has been extended.'
      });
      // Refresh check-ins
      const checkInsRes = await api.getCheckIns();
      setCheckIns(checkInsRes.checkIns || []);
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Check-in failed.'
      });
    } finally {
      setCheckInSubmitting(false);
    }
  };

  const getDaysRemaining = (deadlineStr?: string) => {
    if (!deadlineStr) return 0;
    const diffMs = new Date(deadlineStr).getTime() - new Date().getTime();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const daysRemaining = getDaysRemaining(lifecycle?.next_check_in_deadline);
  const isInGracePeriod = lifecycle?.current_state === 'GRACE_PERIOD';

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Alert Notification */}
      {notification && (
        <div style={{
          backgroundColor: notification.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
          color: notification.type === 'success' ? 'var(--success)' : 'var(--danger)',
          padding: '0.85rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          fontWeight: 500
        }}>
          {notification.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          {notification.message}
        </div>
      )}

      {/* Critical Grace Period Warning Banner */}
      {isInGracePeriod && (
        <div style={{
          backgroundColor: 'var(--warning-bg)',
          border: '1px solid var(--warning)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem 1.5rem',
          marginBottom: '1.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <AlertTriangle size={24} color="var(--warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <h4 style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                URGENT: Check-in Overdue — Grace Period Active
              </h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Your check-in deadline has expired. Nominees have been notified and a grace period is currently running until{' '}
                <strong>{new Date(lifecycle?.grace_period_ends_at).toLocaleString()}</strong>.
                Clicking "Confirm Check-In Now" below will immediately abort the release process and restore your active status.
              </p>
            </div>
          </div>
          <button
            onClick={handlePerformCheckIn}
            disabled={checkInSubmitting}
            style={{
              backgroundColor: 'var(--warning)',
              color: '#000',
              fontWeight: 700,
              border: 'none',
              padding: '0.65rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Abort & Check-In
          </button>
        </div>
      )}

      {/* Welcome & Primary Action Card */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        padding: '2rem',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: '2rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '2rem',
        alignItems: 'center'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.65rem' }}>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 800 }}>Welcome back, {user?.name}</h1>
            <StatusBadge status={lifecycle?.current_state || 'ACTIVE'} />
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            Your encrypted legacy vault is protected by AWS KMS envelope encryption.
            Confirming your regular check-in ensures your documents remain in private custody.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => onNavigate('vault')}
              style={{
                backgroundColor: 'var(--primary)',
                color: '#fff',
                border: 'none',
                padding: '0.6rem 1.15rem',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <Upload size={16} /> Upload Document
            </button>
            <button
              onClick={() => onNavigate('nominees')}
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                padding: '0.6rem 1.15rem',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <UserPlus size={16} /> Appoint Nominee
            </button>
          </div>
        </div>

        {/* Check-In Deadline & Primary Trigger */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md)',
          padding: '1.5rem',
          border: '1px solid var(--border-color)',
          textAlign: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            <Clock size={16} /> Next Check-in Deadline
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: daysRemaining < 5 ? 'var(--warning)' : 'var(--primary)', marginBottom: '0.25rem' }}>
            {daysRemaining} {daysRemaining === 1 ? 'Day' : 'Days'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            Due on: {new Date(lifecycle?.next_check_in_deadline).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
          </div>

          <button
            onClick={handlePerformCheckIn}
            disabled={checkInSubmitting}
            style={{
              width: '100%',
              backgroundColor: 'var(--success)',
              color: '#fff',
              border: 'none',
              padding: '0.8rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: checkInSubmitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            {checkInSubmitting ? <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={18} />}
            Confirm Check-In Now
          </button>
        </div>
      </div>

      {/* Summary Statistics Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1.25rem',
        marginBottom: '2rem'
      }}>
        <StatBox
          icon={<FileText size={22} color="var(--primary)" />}
          label="Encrypted Documents"
          value={documents.length}
          subtext="AES-256-GCM / S3 Ciphertext"
          onClick={() => onNavigate('vault')}
        />
        <StatBox
          icon={<Users size={22} color="var(--trust-teal)" />}
          label="Trusted Nominees"
          value={nominees.length}
          subtext={`${nominees.filter(n => n.invitationStatus === 'ACCEPTED').length} Verified`}
          onClick={() => onNavigate('nominees')}
        />
        <StatBox
          icon={<Shield size={22} color="var(--primary)" />}
          label="Release Policies"
          value={rules.length}
          subtext="Active Release Mappings"
          onClick={() => onNavigate('rules')}
        />
        <StatBox
          icon={<Clock size={22} color="var(--trust-teal)" />}
          label="Inactivity Policy"
          value={`${settings?.check_in_interval_days || 90} Days`}
          subtext={`+${settings?.grace_period_days || 7} Day Grace Period`}
          onClick={() => onNavigate('lifecycle')}
        />
      </div>

      {/* Recent Check-Ins History Table */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        padding: '1.5rem',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Recent Check-In History</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Automated Audit Verification</span>
        </div>

        {checkIns.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            No check-in entries recorded yet. Click "Confirm Check-In Now" above to confirm your activity.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem' }}>Timestamp (UTC)</th>
                  <th style={{ padding: '0.75rem' }}>Channel / Type</th>
                  <th style={{ padding: '0.75rem' }}>IP Address</th>
                  <th style={{ padding: '0.75rem' }}>Extended Deadline</th>
                </tr>
              </thead>
              <tbody>
                {checkIns.slice(0, 5).map(ci => (
                  <tr key={ci.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>{new Date(ci.check_in_timestamp).toLocaleString()}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{
                        backgroundColor: 'var(--bg-surface)',
                        padding: '0.2rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}>
                        {ci.check_in_type}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{ci.ip_address || '127.0.0.1'}</td>
                    <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(ci.next_deadline_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const StatBox: React.FC<{ icon: React.ReactNode; label: string; value: string | number; subtext: string; onClick: () => void }> = ({
  icon,
  label,
  value,
  subtext,
  onClick
}) => (
  <div
    onClick={onClick}
    style={{
      backgroundColor: 'var(--bg-card)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-color)',
      padding: '1.25rem',
      cursor: 'pointer',
      transition: 'transform 0.15s, box-shadow 0.15s',
      boxShadow: 'var(--shadow-sm)'
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ backgroundColor: 'var(--bg-surface)', padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}>
        {icon}
      </div>
    </div>
    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.2rem' }}>
      {value}
    </div>
    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
      {subtext}
    </div>
  </div>
);
