import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Modal } from '../components/Modal';
import { FileText, Upload, Download, Trash2, Search, Filter, Lock, Key, Shield, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

export const DocumentVault: React.FC = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Upload modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState('PERSONAL');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Download state
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchDocs = async () => {
    try {
      const res = await api.getDocuments();
      setDocuments(res.documents || []);
    } catch (err: any) {
      console.error('Failed to fetch documents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Please select a file to upload.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('category', uploadCategory);

    try {
      await api.uploadDocument(formData);
      setUploadSuccess(`Document "${selectedFile.name}" encrypted with AES-256-GCM and stored in private S3.`);
      setSelectedFile(null);
      await fetchDocs();
      setTimeout(() => {
        setIsUploadModalOpen(false);
        setUploadSuccess(null);
      }, 1500);
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: any) => {
    setDownloadingId(doc.id);
    try {
      await api.downloadDocument(doc.id, doc.originalName);
    } catch (err: any) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete "${name}" from S3 and remove its release policies?`)) {
      return;
    }
    try {
      await api.deleteDocument(id);
      await fetchDocs();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const filteredDocs = documents.filter(doc => {
    const matchesCategory = categoryFilter === 'ALL' || doc.category === categoryFilter;
    const matchesSearch = doc.originalName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header and Upload trigger */}
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
            Encrypted Document Vault
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            All documents are stored as ciphertext in Amazon S3 protected by AWS KMS Customer Managed Keys
          </p>
        </div>

        <button
          onClick={() => {
            setSelectedFile(null);
            setUploadError(null);
            setUploadSuccess(null);
            setIsUploadModalOpen(true);
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
          <Upload size={18} /> Upload Encrypted Document
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        padding: '1rem 1.25rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1', minWidth: '240px' }}>
          <Search size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search documents by filename..."
            style={{
              width: '100%',
              padding: '0.55rem 0.75rem 0.55rem 2.25rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-main)',
              fontSize: '0.85rem',
              outline: 'none'
            }}
          />
        </div>

        {/* Category Pills */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {['ALL', 'FINANCIAL', 'LEGAL', 'PERSONAL', 'CREDENTIALS', 'OTHER'].map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              style={{
                backgroundColor: categoryFilter === cat ? 'var(--primary)' : 'var(--bg-surface)',
                color: categoryFilter === cat ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '0.4rem 0.75rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Documents Table */}
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
        ) : filteredDocs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1.5rem', color: 'var(--text-secondary)' }}>
            <FileText size={42} style={{ marginBottom: '1rem', color: 'var(--text-muted)' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
              No Documents in Vault
            </h3>
            <p style={{ fontSize: '0.85rem', maxWidth: '400px', margin: '0 auto 1.25rem' }}>
              {searchQuery ? 'No documents match your search criteria.' : 'Your vault is currently empty. Upload your first encrypted document to secure it for your legacy.'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setIsUploadModalOpen(true)}
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
                Upload Document Now
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.85rem 1rem' }}>Document Name</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Category</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Encryption / Algorithm</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Size</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Assigned Nominees</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map(doc => (
                  <tr key={doc.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{ backgroundColor: 'var(--primary-light)', padding: '0.45rem', borderRadius: 'var(--radius-sm)', color: 'var(--primary)' }}>
                          <FileText size={18} />
                        </div>
                        <div>
                          <div>{doc.originalName}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            SHA256: {doc.checksumSha256 ? doc.checksumSha256.substring(0, 16) + '...' : 'Verified'}
                          </div>
                          {doc.storageKey && (
                            <div style={{ fontSize: '0.675rem', color: 'var(--trust-teal)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                              S3: {doc.storageKey}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-main)',
                        padding: '0.2rem 0.55rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}>
                        {doc.category}
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--trust-teal)', fontSize: '0.8rem', fontWeight: 600 }}>
                        <Lock size={13} /> {doc.encryptionAlgorithm} (v1)
                      </div>
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      {(doc.fileSizeBytes / 1024).toFixed(1)} KB
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{
                        backgroundColor: doc.assignedNomineesCount > 0 ? 'var(--trust-teal-light)' : 'var(--bg-surface)',
                        color: doc.assignedNomineesCount > 0 ? 'var(--trust-teal)' : 'var(--text-muted)',
                        padding: '0.2rem 0.6rem',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}>
                        {doc.assignedNomineesCount} {doc.assignedNomineesCount === 1 ? 'Nominee' : 'Nominees'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleDownload(doc)}
                          disabled={downloadingId === doc.id}
                          title="Decrypt & Download Document"
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--primary)',
                            padding: '0.45rem',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer'
                          }}
                        >
                          {downloadingId === doc.id ? (
                            <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                          ) : (
                            <Download size={16} />
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id, doc.originalName)}
                          title="Delete Document"
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload Document Modal */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        title="Upload Encrypted Document to Vault"
      >
        {uploadError && (
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
            <AlertCircle size={16} /> {uploadError}
          </div>
        )}

        {uploadSuccess && (
          <div style={{
            backgroundColor: 'var(--success-bg)',
            color: 'var(--success)',
            padding: '0.75rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1rem'
          }}>
            <CheckCircle size={16} /> {uploadSuccess}
          </div>
        )}

        <form onSubmit={handleUploadSubmit}>
          {/* File Picker */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Select Document File
            </label>
            <input
              type="file"
              required
              onChange={e => setSelectedFile(e.target.files ? e.target.files[0] : null)}
              style={{
                width: '100%',
                padding: '0.65rem',
                border: '1px dashed var(--border-color)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-main)',
                fontSize: '0.85rem'
              }}
            />
            {selectedFile && (
              <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>

          {/* Category Dropdown */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Document Category
            </label>
            <select
              value={uploadCategory}
              onChange={e => setUploadCategory(e.target.value)}
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
              <option value="PERSONAL">Personal & Identity</option>
              <option value="FINANCIAL">Financial & Bank Accounts</option>
              <option value="LEGAL">Legal, Deeds & Contracts</option>
              <option value="CREDENTIALS">Account Credentials & Access Keys</option>
              <option value="OTHER">Other Documents</option>
            </select>
          </div>

          {/* Cryptographic Architecture Guarantee */}
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem',
            marginBottom: '1.5rem',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.4
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--primary)', fontWeight: 600, marginBottom: '0.25rem' }}>
              <Key size={14} /> Envelope Encryption Guarantee
            </div>
            Before being stored in Amazon S3, your file is encrypted with a unique 256-bit AES-GCM data key wrapped by AWS KMS.
            The plaintext data key is wiped from application memory immediately.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(false)}
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
              disabled={uploading}
              style={{
                padding: '0.65rem 1.25rem',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                backgroundColor: 'var(--primary)',
                color: '#fff',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: uploading ? 'not-allowed' : 'pointer',
                opacity: uploading ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              {uploading ? (
                <>
                  <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Encrypting with KMS...
                </>
              ) : (
                <>
                  <Shield size={16} />
                  Encrypt & Save
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
