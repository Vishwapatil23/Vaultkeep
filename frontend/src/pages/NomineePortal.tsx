import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { StatusBadge } from '../components/Badge';
import { Shield, FileText, Download, Lock, AlertTriangle, CheckCircle, Clock, RefreshCw, Key } from 'lucide-react';

interface NomineePortalProps {
  activeSubTab?: 'dashboard' | 'docs' | 'history';
}

export const NomineePortal: React.FC<NomineePortalProps> = ({ activeSubTab = 'dashboard' }) => {
  const [relationships, setRelationships] = useState<any[]>([]);
  const [releasedDocs, setReleasedDocs] = useState<any[]>([]);
  const [accessHistory, setAccessHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [relRes, docsRes, histRes] = await Promise.all([
        api.getNomineeRelationships(),
        api.getReleasedDocuments(),
        api.getNomineeAccessHistory()
      ]);
      setRelationships(relRes.relationships || []);
      setReleasedDocs(docsRes.releasedDocuments || []);
      setAccessHistory(histRes.accessHistory || []);
    } catch (err: any) {
      console.error('Failed to load nominee data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDownload = async (doc: any) => {
    setDownloadingId(doc.documentId);
    try {
      await api.downloadReleasedDocument(doc.documentId, doc.originalName);
      await fetchData(); // refresh history
    } catch (err: any) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const activeGracePeriodRel = relationships.find(r => r.lifecycleState === 'GRACE_PERIOD');
  const releaseGrantedRel = relationships.find(r => r.isReleaseGranted);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
          Nominee Recipient Portal
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Authenticated dashboard for trusted contacts appointed to receive digital legacy document access
        </p>
      </div>

      {/* Grace Period Notification Banner */}
      {activeGracePeriodRel && (
        <div style={{
          backgroundColor: 'var(--warning-bg)',
          border: '1px solid var(--warning)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem 1.5rem',
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '1rem'
        }}>
          <Clock size={24} color="var(--warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
              Account Inactivity Notice for {activeGracePeriodRel.ownerName}
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              VaultKeep's automated inactivity monitoring detected that {activeGracePeriodRel.ownerName} has missed their check-in deadline.
              A security grace period is active until <strong>{new Date(activeGracePeriodRel.gracePeriodEndsAt).toLocaleString()}</strong>.
              If no owner check-in confirms continued activity before that deadline, authorized documents will become available for your retrieval.
            </p>
          </div>
        </div>
      )}

      {/* Appointing Owners Summary */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        padding: '1.5rem',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: '2rem'
      }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>
          Your Appointed Legacy Relationships
        </h3>

        {relationships.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            No appointing owners found for your verified email address.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {relationships.map((rel, idx) => (
              <div key={idx} style={{
                backgroundColor: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                padding: '1.25rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '1rem' }}>{rel.ownerName}</span>
                  <StatusBadge status={rel.lifecycleState} />
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  Relationship: <strong>{rel.relationshipType}</strong>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Release Status: {rel.isReleaseGranted ? 'Authorized Release Active' : 'Owner Custody Active'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Released Documents Section */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: '2rem'
      }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Authorized Released Documents</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Only documents explicitly permitted by confirmed owner release policies are displayed
          </p>
        </div>

        {releasedDocs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1.5rem', color: 'var(--text-secondary)' }}>
            <Lock size={42} style={{ marginBottom: '1rem', color: 'var(--text-muted)' }} />
            <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
              No Documents Currently Released
            </h4>
            <p style={{ fontSize: '0.85rem', maxWidth: '480px', margin: '0 auto', lineHeight: 1.5 }}>
              Documents remain strictly locked and encrypted with AWS KMS. They will only become decryptable if the appointing owner's account enters the released state after an expired grace period.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.85rem 1rem' }}>Document Name</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Category</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Appointing Owner</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Granted At</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Expiration</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {releasedDocs.map(doc => (
                  <tr key={doc.grantId} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={18} color="var(--primary)" />
                        <div>
                          <div>{doc.originalName}</div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{(doc.fileSizeBytes / 1024).toFixed(1)} KB</span>
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
                        {doc.category}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', fontWeight: 600 }}>{doc.ownerName}</td>
                    <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                      {new Date(doc.grantedAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                      {doc.expiresAt ? new Date(doc.expiresAt).toLocaleDateString() : 'Indefinite'}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <button
                        onClick={() => handleDownload(doc)}
                        disabled={downloadingId === doc.documentId}
                        style={{
                          backgroundColor: 'var(--primary)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 'var(--radius-md)',
                          padding: '0.5rem 0.9rem',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}
                      >
                        {downloadingId === doc.documentId ? (
                          <>
                            <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                            Decrypting...
                          </>
                        ) : (
                          <>
                            <Download size={14} />
                            Decrypt & Download
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Nominee Access History Audit Log */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        padding: '1.5rem',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem' }}>Your Audited Access History</h3>
        {accessHistory.length === 0 ? (
          <div style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            No access history recorded yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.6rem' }}>Timestamp</th>
                  <th style={{ padding: '0.6rem' }}>Action</th>
                  <th style={{ padding: '0.6rem' }}>Outcome</th>
                  <th style={{ padding: '0.6rem' }}>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {accessHistory.slice(0, 5).map(h => (
                  <tr key={h.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.6rem' }}>{new Date(h.created_at).toLocaleString()}</td>
                    <td style={{ padding: '0.6rem', fontWeight: 600 }}>{h.action}</td>
                    <td style={{ padding: '0.6rem' }}><StatusBadge status={h.outcome} /></td>
                    <td style={{ padding: '0.6rem', fontFamily: 'var(--font-mono)' }}>{h.ip_address}</td>
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
