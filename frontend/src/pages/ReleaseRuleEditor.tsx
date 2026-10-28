import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Modal } from '../components/Modal';
import { Shield, Plus, Trash2, FileText, User, Clock, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

export const ReleaseRuleEditor: React.FC = () => {
  const [rules, setRules] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [nominees, setNominees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [selectedNomineeId, setSelectedNomineeId] = useState('');
  const [accessDuration, setAccessDuration] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [rulesRes, docsRes, nomineesRes] = await Promise.all([
        api.getReleaseRules(),
        api.getDocuments(),
        api.getNominees()
      ]);
      setRules(rulesRes.releaseRules || []);
      setDocuments(docsRes.documents || []);
      setNominees(nomineesRes.nominees || []);
    } catch (err: any) {
      console.error('Failed to load release rules:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocId || !selectedNomineeId) {
      setError('Please select both a document and a nominee.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.createReleaseRule({
        documentId: selectedDocId,
        nomineeId: selectedNomineeId,
        accessDurationDays: accessDuration ? parseInt(accessDuration, 10) : null
      });
      await fetchData();
      setIsModalOpen(false);
      setSelectedDocId('');
      setSelectedNomineeId('');
      setAccessDuration('');
    } catch (err: any) {
      setError(err.message || 'Failed to create release rule.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to revoke this release policy?')) return;
    try {
      await api.deleteReleaseRule(ruleId);
      await fetchData();
    } catch (err: any) {
      alert(`Failed to delete rule: ${err.message}`);
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
            Document Release Policy Rules
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Explicitly assign which encrypted documents will be released to specific nominees upon validated inactivity
          </p>
        </div>

        <button
          onClick={() => {
            setSelectedDocId(documents.length > 0 ? documents[0].id : '');
            setSelectedNomineeId(nominees.length > 0 ? nominees[0].id : '');
            setAccessDuration('');
            setError(null);
            setIsModalOpen(true);
          }}
          disabled={documents.length === 0 || nominees.length === 0}
          style={{
            backgroundColor: documents.length === 0 || nominees.length === 0 ? 'var(--bg-surface)' : 'var(--primary)',
            color: documents.length === 0 || nominees.length === 0 ? 'var(--text-muted)' : '#fff',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: '0.7rem 1.25rem',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: documents.length === 0 || nominees.length === 0 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <Plus size={18} /> Add Document Release Rule
        </button>
      </div>

      {/* Rules Table */}
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
        ) : rules.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1.5rem', color: 'var(--text-secondary)' }}>
            <Shield size={42} style={{ marginBottom: '1rem', color: 'var(--text-muted)' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
              No Release Rules Established
            </h3>
            <p style={{ fontSize: '0.85rem', maxWidth: '440px', margin: '0 auto 1.25rem' }}>
              Documents in your vault will not be released to anyone unless you explicitly create a release rule pairing each document to a designated nominee.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.85rem 1rem' }}>Document</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Designated Nominee</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Access Duration</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Confirmed At</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <tr key={rule.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={16} color="var(--primary)" />
                        <div>
                          <div>{rule.documentName}</div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{rule.documentCategory}</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <User size={16} color="var(--trust-teal)" />
                        <div>
                          <div style={{ fontWeight: 600 }}>{rule.nomineeName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{rule.nomineeEmail}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{
                        backgroundColor: 'var(--bg-surface)',
                        padding: '0.2rem 0.55rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}>
                        {rule.accessDurationDays ? `${rule.accessDurationDays} Days` : 'Indefinite'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      {new Date(rule.confirmedAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        title="Revoke Rule"
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

      {/* Add Rule Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Establish Document Release Rule"
      >
        {error && (
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
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleCreateRule}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Select Encrypted Document
            </label>
            <select
              value={selectedDocId}
              onChange={e => setSelectedDocId(e.target.value)}
              required
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
              <option value="" disabled>Choose a document...</option>
              {documents.map(d => (
                <option key={d.id} value={d.id}>{d.originalName} ({d.category})</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Select Authorized Nominee
            </label>
            <select
              value={selectedNomineeId}
              onChange={e => setSelectedNomineeId(e.target.value)}
              required
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
              <option value="" disabled>Choose a nominee...</option>
              {nominees.map(n => (
                <option key={n.id} value={n.id}>{n.fullName} ({n.relationshipType} - {n.email})</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Access Duration in Days (Optional)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={accessDuration}
              onChange={e => setAccessDuration(e.target.value)}
              placeholder="Leave blank for indefinite access"
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
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              If specified, the nominee's release grant will automatically expire after this period.
            </span>
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
                cursor: submitting ? 'not-allowed' : 'pointer'
              }}
            >
              {submitting ? 'Confirming...' : 'Confirm Release Rule'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
