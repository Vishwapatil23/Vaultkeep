const fs = require('fs');
const path = require('path');

const filePath = path.resolve('frontend/src/pages/AdminDashboard.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const explorerCode = `
      {/* Live Amazon RDS Database Explorer */}
      <DatabaseExplorer />
    </div>
  );
};

const DatabaseExplorer: React.FC = () => {
  const [selectedTable, setSelectedTable] = useState('users');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const tables = [
    'users',
    'nominees',
    'documents',
    'account_lifecycle',
    'audit_logs',
    'check_ins',
    'document_release_rules',
    'notifications'
  ];

  const fetchTableData = async (table: string) => {
    setLoading(true);
    try {
      const res = await api.getDatabaseView(table);
      setData(res);
    } catch (err) {
      console.error('Failed to load table data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTableData(selectedTable);
  }, [selectedTable]);

  const psqlCommand = 'psql "sslmode=require host=vaultkeep-postgresql-db.cyrw6icwadyc.us-east-1.rds.amazonaws.com port=5432 dbname=vaultkeep_db user=vaultkeep_admin"';

  const handleCopy = () => {
    navigator.clipboard.writeText(psqlCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      backgroundColor: 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-color)',
      padding: '1.5rem',
      boxShadow: 'var(--shadow-sm)',
      marginBottom: '2rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Database size={20} color="var(--primary)" /> Live Amazon RDS Database Explorer
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Real-time inspection of managed PostgreSQL tables, relational integrity, and schema records
          </p>
        </div>

        <button
          onClick={() => fetchTableData(selectedTable)}
          disabled={loading}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-main)',
            borderRadius: 'var(--radius-md)',
            padding: '0.45rem 0.85rem',
            fontWeight: 600,
            fontSize: '0.8rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem'
          }}
        >
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh Table
        </button>
      </div>

      {/* Connection Info Banner */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
        padding: '1rem',
        marginBottom: '1.5rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1.5rem',
        fontSize: '0.825rem'
      }}>
        <div>
          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>HOST ENDPOINT</span>
          <code style={{ color: 'var(--text-main)', fontWeight: 600 }}>vaultkeep-postgresql-db.cyrw6icwadyc.us-east-1.rds.amazonaws.com</code>
        </div>
        <div>
          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>DATABASE</span>
          <code style={{ color: 'var(--text-main)', fontWeight: 600 }}>vaultkeep_db</code>
        </div>
        <div>
          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>PORT / SSL</span>
          <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>5432 (SSL Mode: Require)</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>MASTER USER</span>
          <code style={{ color: 'var(--text-main)', fontWeight: 600 }}>vaultkeep_admin</code>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <button
            onClick={handleCopy}
            style={{
              background: copied ? '#10b981' : 'var(--primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '0.4rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              transition: 'background 0.2s'
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied psql command!' : 'Copy psql Connection'}
          </button>
        </div>
      </div>

      {/* Table Selection Tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {tables.map(tbl => (
          <button
            key={tbl}
            onClick={() => setSelectedTable(tbl)}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: selectedTable === tbl ? '1px solid var(--primary)' : '1px solid var(--border-color)',
              background: selectedTable === tbl ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-surface)',
              color: selectedTable === tbl ? 'var(--primary)' : 'var(--text-secondary)',
              transition: 'all 0.15s ease'
            }}
          >
            {tbl} {selectedTable === tbl && data?.totalRows !== undefined && \`(\${data.totalRows})\`}
          </button>
        ))}
      </div>

      {/* Table Data View */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : data?.rows && data.rows.length > 0 ? (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)' }}>
                {Object.keys(data.rows[0]).map(col => (
                  <th key={col} style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row: any, idx: number) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                  {Object.keys(data.rows[0]).map(col => {
                    const val = row[col];
                    const isProtected = val === '[PROTECTED_HASH]';
                    let displayVal = val;
                    if (val === null || val === undefined) displayVal = <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>null</span>;
                    else if (typeof val === 'object') displayVal = JSON.stringify(val);
                    else if (typeof val === 'boolean') displayVal = val ? 'true' : 'false';

                    return (
                      <td key={col} style={{ padding: '0.65rem 0.85rem', whiteSpace: 'nowrap', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {isProtected ? (
                          <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontWeight: 600 }}>
                            PROTECTED
                          </span>
                        ) : displayVal}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }}>
          No records found in table <strong>{selectedTable}</strong>.
        </div>
      )}
    </div>
  );
};
`;

const needle = '    </div>\r\n  );\r\n};\r\n\r\nconst MetricCard';
if (content.includes(needle)) {
  content = content.replace(needle, explorerCode + '\r\nconst MetricCard');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully updated AdminDashboard.tsx');
} else {
  console.error('Target needle not found');
}

