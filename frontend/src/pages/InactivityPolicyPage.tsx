import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { StatusBadge } from '../components/Badge';
import { Clock, Shield, AlertTriangle, CheckCircle, Play, RefreshCw, Zap, Bell, ArrowRight } from 'lucide-react';

export const InactivityPolicyPage: React.FC = () => {
  const [lifecycle, setLifecycle] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [checkInInterval, setCheckInInterval] = useState(90);
  const [gracePeriod, setGracePeriod] = useState(7);
  const [warningDays, setWarningDays] = useState(5);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await api.getLifecycleStatus();
      setLifecycle(res.lifecycle);
      setSettings(res.settings);
      if (res.settings) {
        setCheckInInterval(res.settings.check_in_interval_days || 90);
        setGracePeriod(res.settings.grace_period_days || 7);
        setWarningDays(res.settings.warning_days || 5);
      }
    } catch (err: any) {
      console.error('Failed to load lifecycle:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      const res = await api.updateLifecyclePolicy({
        checkInIntervalDays: checkInInterval,
        gracePeriodDays: gracePeriod,
        warningDays: warningDays
      });
      setSettings(res.settings);
      setNotice({ type: 'success', message: 'Inactivity policy settings saved successfully.' });
      await fetchStatus();
    } catch (err: any) {
      setNotice({ type: 'error', message: err.message || 'Failed to update policy.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSimulateInactivity = async () => {
    setSimulating(true);
    setNotice(null);
    try {
      const res = await api.simulateInactivity();
      setNotice({
        type: 'success',
        message: 'Demonstration simulation executed: Inactivity deadline expired. Account transitioned to GRACE_PERIOD and SNS notification dispatched.'
      });
      await fetchStatus();
    } catch (err: any) {
      setNotice({ type: 'error', message: err.message || 'Simulation failed.' });
    } finally {
      setSimulating(false);
    }
  };

  const handleForceRelease = async () => {
    setSimulating(true);
    setNotice(null);
    try {
      // Fast forward grace period end to now and trigger evaluation
      if (lifecycle) {
        lifecycle.grace_period_ends_at = new Date(Date.now() - 1000).toISOString();
      }
      await api.evaluateInactivity();
      setNotice({
        type: 'success',
        message: 'Grace period elapsed. Lifecycle transitioned to ACCESS_GRANTED and release grants generated.'
      });
      await fetchStatus();
    } catch (err: any) {
      setNotice({ type: 'error', message: err.message || 'Evaluation failed.' });
    } finally {
      setSimulating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const currentState = lifecycle?.current_state || 'ACTIVE';

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
          Check-In & Inactivity Policy
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Configure automated dormancy detection, warning windows, and the fail-safe grace period
        </p>
      </div>

      {notice && (
        <div style={{
          backgroundColor: notice.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
          color: notice.type === 'success' ? 'var(--success)' : 'var(--danger)',
          padding: '0.85rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          fontWeight: 500
        }}>
          {notice.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          {notice.message}
        </div>
      )}

      {/* State Machine Visualizer */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        padding: '1.5rem',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Account Lifecycle State Flow</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Current State:</span>
            <StatusBadge status={currentState} />
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          position: 'relative'
        }}>
          <StateStep
            number="1"
            title="ACTIVE"
            desc="Owner confirms periodic check-ins. Plaintext documents are securely locked in S3."
            isActive={currentState === 'ACTIVE'}
            isPassed={currentState === 'GRACE_PERIOD' || currentState === 'ACCESS_GRANTED'}
          />
          <StateStep
            number="2"
            title="CHECK_IN_DUE"
            desc="Deadline approaching. Automated warning emails/SMS sent to owner."
            isActive={currentState === 'CHECK_IN_DUE'}
            isPassed={currentState === 'GRACE_PERIOD' || currentState === 'ACCESS_GRANTED'}
          />
          <StateStep
            number="3"
            title="GRACE_PERIOD"
            desc="Check-in missed. Nominees notified. Running countdown; owner can still abort."
            isActive={currentState === 'GRACE_PERIOD'}
            isPassed={currentState === 'ACCESS_GRANTED'}
          />
          <StateStep
            number="4"
            title="ACCESS_GRANTED"
            desc="Grace period expired. Conditional access granted strictly to approved nominees."
            isActive={currentState === 'ACCESS_GRANTED'}
            isPassed={false}
          />
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '2rem'
      }}>
        {/* Policy Configuration Form */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
          padding: '1.75rem',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Policy Parameters
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Customize the duration between required check-ins and the delay applied during grace period.
          </p>

          <form onSubmit={handleSavePolicy}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Check-In Interval (Days)
              </label>
              <input
                type="number"
                min={1}
                max={365}
                required
                value={checkInInterval}
                onChange={e => setCheckInInterval(parseInt(e.target.value, 10))}
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem'
                }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                How often you must log in and confirm check-in (1 - 365 days)
              </span>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Grace Period Duration (Days)
              </label>
              <input
                type="number"
                min={1}
                max={90}
                required
                value={gracePeriod}
                onChange={e => setGracePeriod(parseInt(e.target.value, 10))}
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem'
                }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Time delayed safeguard window after missed check-in before any documents release (1 - 90 days)
              </span>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Advance Warning Notification (Days)
              </label>
              <input
                type="number"
                min={1}
                max={30}
                required
                value={warningDays}
                onChange={e => setWarningDays(parseInt(e.target.value, 10))}
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem'
                }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Days before deadline to transmit reminder notifications
              </span>
            </div>

            <button
              type="submit"
              disabled={saving}
              style={{
                width: '100%',
                backgroundColor: 'var(--primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: saving ? 'not-allowed' : 'pointer',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              {saving ? 'Updating Policy...' : 'Save Inactivity Policy'}
            </button>
          </form>
        </div>

        {/* Demonstration & Viva Testing Panel */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
          padding: '1.75rem',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: 'var(--trust-teal-light)',
            color: 'var(--trust-teal)',
            padding: '0.25rem 0.65rem',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.75rem',
            fontWeight: 700,
            marginBottom: '0.75rem'
          }}>
            <Zap size={14} /> College Viva & Working Demonstration
          </div>

          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            EventBridge Automation Simulation
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            In a live cloud environment, Amazon EventBridge executes this workflow on a scheduled cron rule invoking AWS Lambda.
            Use these controls to demonstrate lifecycle state changes, grace period initiation, and release grants during college evaluation.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              onClick={handleSimulateInactivity}
              disabled={simulating || currentState === 'GRACE_PERIOD'}
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                color: 'var(--warning)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: simulating ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <span>1. Simulate Missed Check-In (Triggers GRACE_PERIOD)</span>
              <Play size={16} />
            </button>

            <button
              onClick={handleForceRelease}
              disabled={simulating || currentState !== 'GRACE_PERIOD'}
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                color: 'var(--danger)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: simulating || currentState !== 'GRACE_PERIOD' ? 'not-allowed' : 'pointer',
                opacity: currentState !== 'GRACE_PERIOD' ? 0.5 : 1,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <span>2. Elapse Grace Period (Triggers ACCESS_GRANTED)</span>
              <Play size={16} />
            </button>

            <button
              onClick={async () => {
                await api.performCheckIn();
                await fetchStatus();
              }}
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                color: 'var(--success)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <span>3. Confirm Check-In (Aborts Release & Restores ACTIVE)</span>
              <CheckCircle size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const StateStep: React.FC<{ number: string; title: string; desc: string; isActive: boolean; isPassed: boolean }> = ({
  number,
  title,
  desc,
  isActive,
  isPassed
}) => (
  <div style={{
    backgroundColor: isActive ? 'var(--primary-light)' : 'var(--bg-surface)',
    border: `2px solid ${isActive ? 'var(--primary)' : isPassed ? 'var(--success)' : 'var(--border-color)'}`,
    borderRadius: 'var(--radius-md)',
    padding: '1.25rem',
    position: 'relative'
  }}>
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '24px',
      height: '24px',
      borderRadius: '50%',
      backgroundColor: isActive ? 'var(--primary)' : isPassed ? 'var(--success)' : 'var(--text-muted)',
      color: '#fff',
      fontSize: '0.75rem',
      fontWeight: 700,
      marginBottom: '0.5rem'
    }}>
      {number}
    </div>
    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>
      {title}
    </div>
    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
      {desc}
    </div>
  </div>
);
