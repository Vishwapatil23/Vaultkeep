import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/Badge';
import { Users, UserPlus, Trash2, Mail, Phone, Heart, CheckCircle, AlertCircle, RefreshCw, Copy } from 'lucide-react';

export const NomineeDirectory: React.FC = () => {
  const [nominees, setNominees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [relationshipType, setRelationshipType] = useState('Spouse');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchNominees = async () => {
    try {
      const res = await api.getNominees();
      setNominees(res.nominees || []);
    } catch (err: any) {
      console.error('Failed to fetch nominees:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNominees();
  }, []);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError(null);
    setCreatedToken(null);
    setCreatedLink(null);
    setCopied(false);

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_REGEX.test(email.trim())) {
      setModalError('Please enter a valid email address (e.g., name@example.com).');
      setSubmitting(false);
      return;
    }

    try {
      const res = await api.addNominee({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        relationshipType
      });

      // ONLY set createdToken and success UI when the backend successfully processes the invitation
      setCreatedToken(res.invitationToken);
      setCreatedLink(res.invitationLink || `${window.location.origin}/?tab=accept-invitation&token=${res.invitationToken}&email=${encodeURIComponent(email.trim().toLowerCase())}`);
      await fetchNominees();
    } catch (err: any) {
      setCreatedToken(null);
      setCreatedLink(null);
      setModalError(err.message || 'Failed to send nominee invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to revoke nominee status for "${name}"? All associated document release policies will be immediately cancelled.`)) {
      return;
    }
    try {
      await api.deleteNominee(id);
      await fetchNominees();
    } catch (err: any) {
      alert(`Failed to revoke nominee: ${err.message}`);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            Trusted Nominee Directory
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Designate authorized trusted contacts eligible for conditional, time-delayed digital legacy release
          </p>
        </div>

        <button
          onClick={() => {
            setFullName('');
            setEmail('');
            setPhone('');
            setRelationshipType('Spouse');
            setModalError(null);
            setCreatedToken(null);
            setIsModalOpen(true);
          }}
          style={{
            backgroundColor: 'var(--primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: '0.7rem 1.25rem',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <UserPlus size={18} /> Invite New Nominee
        </button>
      </div>

      {/* Nominees Grid / Table */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)'
      }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : nominees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1.5rem', color: 'var(--text-secondary)' }}>
            <Users size={42} style={{ marginBottom: '1rem', color: 'var(--text-muted)' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
              No Nominees Appointed
            </h3>
            <p style={{ fontSize: '0.85rem', maxWidth: '420px', margin: '0 auto 1.25rem' }}>
              You haven't designated any trusted nominees yet. Appoint trusted family members or advisors to receive conditional access.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              style={{
                backgroundColor: 'var(--primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '0.55rem 1rem',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              Appoint Nominee
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.85rem 1rem' }}>Nominee Contact</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Relationship</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Invitation Status</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Authorized Documents</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {nominees.map(n => (
                  <tr key={n.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{n.fullName}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <Mail size={12} /> {n.email}
                      </div>
                      {n.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <Phone size={12} /> {n.phone}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-main)',
                        padding: '0.2rem 0.6rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}>
                        {n.relationshipType}
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <StatusBadge status={n.invitationStatus} />
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{
                        backgroundColor: n.assignedDocumentsCount > 0 ? 'var(--primary-light)' : 'var(--bg-surface)',
                        color: n.assignedDocumentsCount > 0 ? 'var(--primary)' : 'var(--text-muted)',
                        padding: '0.2rem 0.6rem',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}>
                        {n.assignedDocumentsCount} {n.assignedDocumentsCount === 1 ? 'Document' : 'Documents'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <button
                        onClick={() => handleDelete(n.id, n.fullName)}
                        title="Revoke Nominee Relationship"
                        style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--danger)',
                          padding: '0.45rem',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite Nominee Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Invite Trusted Nominee"
      >
        {modalError && (
          <div style={{
            backgroundColor: 'var(--danger-bg)',
            color: 'var(--danger)',
            padding: '0.75rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1rem'
          }}>
            <AlertCircle size={16} /> {modalError}
          </div>
        )}

        {createdToken ? (
          <div>
            <div style={{
              backgroundColor: 'var(--success-bg)',
              color: 'var(--success)',
              padding: '0.85rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.25rem',
              fontWeight: 600
            }}>
              <CheckCircle size={18} /> Invitation sent! Notification dispatched via Amazon SNS.
            </div>

            {createdLink && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Accept Invitation Link
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdLink);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: 0
                    }}
                  >
                    <Copy size={13} /> {copied ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>
                <div style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.65rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  wordBreak: 'break-all',
                  color: 'var(--primary)'
                }}>
                  {createdLink}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Invitation Security Token
              </label>
              <div style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.65rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem',
                wordBreak: 'break-all',
                color: 'var(--primary)'
              }}>
                {createdToken}
              </div>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              AWS SNS has dispatched this notification to the nominee's inbox. If this is the first notification to this email address on this SNS Topic, AWS sends a subscription confirmation link first.
            </p>

            <button
              onClick={() => setIsModalOpen(false)}
              style={{
                width: '100%',
                backgroundColor: 'var(--primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '0.7rem',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer'
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleInviteSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Full Legal Name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Eleanor Vance"
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Email Address (SNS Notification Destination)
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="eleanor@example.com"
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Phone Number (Optional)
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+1 (555) 019-2834"
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Relationship Type
              </label>
              <select
                value={relationshipType}
                onChange={e => setRelationshipType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              >
                <option value="Spouse">Spouse / Partner</option>
                <option value="Child">Son / Daughter</option>
                <option value="Sibling">Brother / Sister</option>
                <option value="Parent">Parent</option>
                <option value="Legal Advisor">Legal Attorney / Advisor</option>
                <option value="Trusted Friend">Trusted Friend</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{
                  padding: '0.65rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '0.65rem 1.25rem',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  backgroundColor: 'var(--primary)',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                {submitting ? 'Sending Invite...' : 'Send Invitation'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
