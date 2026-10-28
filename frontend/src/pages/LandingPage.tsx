import React from 'react';
import { Shield, Lock, Clock, Users, ArrowRight, Key, Database, BellCheck, Activity } from 'lucide-react';

interface LandingProps {
  onNavigate: (page: string) => void;
}

export const LandingPage: React.FC<LandingProps> = ({ onNavigate }) => {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      {/* Hero Section */}
      <section style={{ textAlign: 'center', marginBottom: '4.5rem' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          backgroundColor: 'var(--primary-light)',
          color: 'var(--primary)',
          padding: '0.35rem 0.85rem',
          borderRadius: 'var(--radius-full)',
          fontSize: '0.85rem',
          fontWeight: 600,
          marginBottom: '1.25rem'
        }}>
          <Lock size={14} /> Zero-Plaintext Cloud Architecture with AWS KMS
        </div>
        <h1 style={{
          fontSize: '2.75rem',
          fontWeight: 800,
          lineHeight: 1.2,
          letterSpacing: '-0.03em',
          marginBottom: '1.25rem',
          color: 'var(--text-main)'
        }}>
          Encrypted Digital Legacy &<br />Conditional Nominee Access
        </h1>
        <p style={{
          fontSize: '1.15rem',
          color: 'var(--text-secondary)',
          maxWidth: '680px',
          margin: '0 auto 2.5rem',
          lineHeight: 1.6
        }}>
          VaultKeep provides a cryptographically isolated digital vault for sensitive personal records.
          Configure periodic check-ins; if prolonged inactivity occurs, your explicitly chosen documents
          are conditionally released to trusted nominees through an audited, time-delayed grace period.
        </p>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button
            onClick={() => onNavigate('register')}
            style={{
              backgroundColor: 'var(--primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem 1.75rem',
              fontWeight: 600,
              fontSize: '1rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: 'var(--shadow-md)'
            }}
          >
            Create Your Secure Vault <ArrowRight size={18} />
          </button>
          <button
            onClick={() => onNavigate('login')}
            style={{
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem 1.75rem',
              fontWeight: 600,
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            Sign In to Existing Vault
          </button>
        </div>
      </section>

      {/* Core Architectural Pillars */}
      <section style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '1.5rem',
        marginBottom: '4.5rem'
      }}>
        <FeatureCard
          icon={<Key size={24} color="var(--primary)" />}
          title="Envelope Encryption via AWS KMS"
          description="Every document is encrypted with a unique AES-256-GCM data key wrapped by AWS KMS customer managed keys. Plaintext keys are wiped from memory immediately; only ciphertext is stored in Amazon S3."
        />
        <FeatureCard
          icon={<Clock size={24} color="var(--trust-teal)" />}
          title="EventBridge & Lambda Automation"
          description="A serverless inactivity monitoring workflow continually audits check-in deadlines. Overdue check-ins initiate an owner-configured grace period before any release decision is executed."
        />
        <FeatureCard
          icon={<Users size={24} color="var(--primary)" />}
          title="Granular Nominee Release Rules"
          description="No nominee receives blanket access. Account owners define explicit document-to-nominee mappings with preview, verification, and optional time-bounded access durations."
        />
        <FeatureCard
          icon={<Activity size={24} color="var(--trust-teal)" />}
          title="Fail-Safe Grace Period Safeguard"
          description="If an owner completes an authenticated check-in at any time during an active grace period, the pending release workflow is safely aborted and the account restored to active status."
        />
        <FeatureCard
          icon={<Database size={24} color="var(--primary)" />}
          title="Segregated PostgreSQL Metadata"
          description="Document contents and plaintext keys never enter the PostgreSQL metadata database. Relational state, audit logs, and release grants are strictly isolated from storage blobs."
        />
        <FeatureCard
          icon={<Shield size={24} color="var(--trust-teal)" />}
          title="Full Cryptographic Audit Trail"
          description="Every authentication, upload, check-in, policy modification, grace period transition, and document download attempt is permanently recorded in structured audit logs."
        />
      </section>

      {/* Digital Legacy Disclaimer */}
      <section style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.75rem 2rem',
        textAlign: 'center'
      }}>
        <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
          Digital Legacy & Legal Entitlement Notice
        </h4>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '800px', margin: '0 auto', lineHeight: 1.5 }}>
          VaultKeep implements conditional digital access based strictly upon account check-in inactivity policies defined explicitly by the account owner. Inactivity detection does not independently establish a legal determination of death or incapacitation, nor does it replace formal probate, wills, or legal estate administration.
        </p>
      </section>
    </div>
  );
};

const FeatureCard: React.FC<{ icon: React.ReactNode; title: string; description: string }> = ({
  icon,
  title,
  description
}) => (
  <div style={{
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-color)',
    padding: '1.75rem',
    boxShadow: 'var(--shadow-sm)'
  }}>
    <div style={{
      width: '46px',
      height: '46px',
      borderRadius: 'var(--radius-md)',
      backgroundColor: 'var(--bg-surface)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '1rem'
    }}>
      {icon}
    </div>
    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
      {title}
    </h3>
    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
      {description}
    </p>
  </div>
);
