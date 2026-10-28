import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { StatusBadge } from '../components/Badge';
import { Bell, Search, RefreshCw, Shield, AlertCircle } from 'lucide-react';

export const AuditLogView: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchLogs = async () => {
    try {
      const res = await api.getAuditLogs(100);
      setLogs(res.auditLogs || []);
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(l =>
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    (l.actor_email && l.actor_email.toLowerCase().includes(search.toLowerCase())) ||
    l.resource_type.toLowerCase().includes(search.toLowerCase())
  );

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
            Security Audit Trail
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Immutable, chronological record of authentication, cryptographic operations, check-ins, and access events
          </p>
        </div>

        <button
          onClick={() => {
            setLoading(true);
            fetchLogs();
          }}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-main)',
            borderRadius: 'var(--radius-md)',
            padding: '0.55rem 0.95rem',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
        >
          <RefreshCw size={14} /> Refresh Logs
        </button>
      </div>

      {/* Search Input */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        padding: '1rem 1.25rem',
        marginBottom: '1.5rem',
        position: 'relative'
      }}>
        <Search size={18} style={{ position: 'absolute', left: '2rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter audit logs by action, actor, or resource type..."
          style={{
            width: '100%',
            padding: '0.55rem 0.75rem 0.55rem 2.5rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-main)',
            fontSize: '0.85rem',
            outline: 'none'
          }}
        />
      </div>

      {/* Audit Log Table */}
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
        ) : filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            No audit records match your search criteria.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.825rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Timestamp (UTC)</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Actor</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Action</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Resource</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Outcome</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Correlation ID</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600 }}>{log.actor_email}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{log.actor_role}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--primary)' }}>
                      {log.action}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{
                        backgroundColor: 'var(--bg-surface)',
                        padding: '0.15rem 0.45rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}>
                        {log.resource_type}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <StatusBadge status={log.outcome} />
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {log.correlation_id ? log.correlation_id.substring(0, 13) + '...' : 'N/A'}
                    </td>
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
