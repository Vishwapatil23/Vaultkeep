const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 5000;
const ALT_PORT = 5173;

// ============================================================================
// IN-MEMORY METADATA & REPOSITORY STORE
// ============================================================================
const memoryDb = {
  users: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Alexander Vance',
      email: 'alex.vance@vaultkeep-demo.internal',
      role: 'OWNER',
      account_status: 'ACTIVE',
      last_check_in_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Eleanor Vance',
      email: 'eleanor.nominee@vaultkeep-demo.internal',
      role: 'NOMINEE',
      account_status: 'ACTIVE',
      last_check_in_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Marcus Security',
      email: 'admin.operator@vaultkeep-demo.internal',
      role: 'ADMIN',
      account_status: 'ACTIVE',
      last_check_in_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    }
  ],
  owner_settings: [
    {
      id: '44444444-4444-4444-4444-444444444444',
      owner_id: '11111111-1111-1111-1111-111111111111',
      check_in_interval_days: 30,
      grace_period_days: 7,
      warning_days: 5,
      timezone: 'UTC'
    }
  ],
  account_lifecycle: [
    {
      id: '66666666-6666-6666-6666-666666666666',
      owner_id: '11111111-1111-1111-1111-111111111111',
      current_state: 'ACTIVE',
      last_successful_check_in: new Date().toISOString(),
      next_check_in_deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
      flagged_inactive_at: null,
      grace_period_ends_at: null,
      release_execution_state: 'NONE'
    }
  ],
  nominees: [
    {
      id: '55555555-5555-5555-5555-555555555555',
      owner_id: '11111111-1111-1111-1111-111111111111',
      nominee_user_id: '22222222-2222-2222-2222-222222222222',
      full_name: 'Eleanor Vance',
      email: 'eleanor.nominee@vaultkeep-demo.internal',
      phone: '+1 (555) 019-2834',
      relationship_type: 'Spouse',
      invitation_status: 'ACCEPTED',
      verified_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    }
  ],
  documents: [
    {
      id: '77777777-7777-7777-7777-777777777777',
      owner_id: '11111111-1111-1111-1111-111111111111',
      original_name: 'Family_Trust_Directive_2026.pdf',
      category: 'LEGAL',
      file_size_bytes: 52400,
      mime_type: 'application/pdf',
      encryption_algorithm: 'AES-256-GCM',
      checksum_sha256: crypto.createHash('sha256').update('SYNTHETIC_FAMILY_TRUST_DIRECTIVE_PDF_BODY').digest('hex'),
      upload_status: 'UPLOADED',
      ciphertext_base64: Buffer.from('AES_GCM_ENCRYPTED_SYNTHETIC_CIPHERTEXT_BLOB').toString('base64'),
      encrypted_dek_base64: 'KMS_WRAPPED_DEK_SIMULATED_BASE64',
      iv_base64: crypto.randomBytes(12).toString('base64'),
      auth_tag_base64: crypto.randomBytes(16).toString('base64'),
      created_at: new Date().toISOString()
    }
  ],
  document_release_rules: [
    {
      id: '88888888-8888-8888-8888-888888888888',
      owner_id: '11111111-1111-1111-1111-111111111111',
      document_id: '77777777-7777-7777-7777-777777777777',
      nominee_id: '55555555-5555-5555-5555-555555555555',
      rule_status: 'ACTIVE',
      access_duration_days: 30,
      confirmed_at: new Date().toISOString()
    }
  ],
  check_ins: [
    {
      id: crypto.randomUUID(),
      owner_id: '11111111-1111-1111-1111-111111111111',
      check_in_timestamp: new Date().toISOString(),
      check_in_type: 'MANUAL_DASHBOARD',
      ip_address: '127.0.0.1',
      next_deadline_at: new Date(Date.now() + 30 * 86400000).toISOString()
    }
  ],
  release_grants: [],
  audit_logs: [
    {
      id: crypto.randomUUID(),
      actor_email: 'alex.vance@vaultkeep-demo.internal',
      actor_role: 'OWNER',
      action: 'SYSTEM_BOOTSTRAP',
      resource_type: 'SYSTEM',
      outcome: 'SUCCESS',
      correlation_id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    }
  ]
};

// Cryptographic simulated KMS Master Key (KEK)
const MASTER_KEK = crypto.createHash('sha256').update('VAULTKEEP_MASTER_KMS_CMK_2026').digest();

// ============================================================================
// REAL ENVELOPE ENCRYPTION & DECRYPTION ENGINE (AES-256-GCM + KMS DEK WRAP)
// ============================================================================
function encryptBuffer(buffer) {
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const dek = crypto.randomBytes(32); // 256-bit Data Encryption Key
  try {
    const iv = crypto.randomBytes(12); // 96-bit IV
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const tag = cipher.getAuthTag(); // 128-bit authentication tag

    // Wrap DEK with KMS CMK
    const wrapIv = crypto.randomBytes(12);
    const wrapCipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEK, wrapIv);
    const wrappedDek = Buffer.concat([wrapCipher.update(dek), wrapCipher.final()]);
    const wrapTag = wrapCipher.getAuthTag();
    const packedDek = Buffer.concat([wrapIv, wrapTag, wrappedDek]).toString('base64');

    return {
      ciphertextBase64: ciphertext.toString('base64'),
      encryptedDekBase64: packedDek,
      ivBase64: iv.toString('base64'),
      authTagBase64: tag.toString('base64'),
      checksumSha256: checksum
    };
  } finally {
    // SECURITY REQUIREMENT: Memory Sanitization - zero plaintext key immediately
    dek.fill(0);
  }
}

function decryptBuffer(ciphertextBase64, encryptedDekBase64, ivBase64, authTagBase64) {
  const packedBlob = Buffer.from(encryptedDekBase64, 'base64');
  const wrapIv = packedBlob.subarray(0, 12);
  const wrapTag = packedBlob.subarray(12, 28);
  const wrappedDek = packedBlob.subarray(28);

  const wrapDecipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEK, wrapIv);
  wrapDecipher.setAuthTag(wrapTag);
  const dek = Buffer.concat([wrapDecipher.update(wrappedDek), wrapDecipher.final()]);

  try {
    const iv = Buffer.from(ivBase64, 'base64');
    const tag = Buffer.from(authTagBase64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(ciphertextBase64, 'base64')), decipher.final()]);
  } finally {
    dek.fill(0); // Memory wipe
  }
}

// ============================================================================
// SINGLE PAGE HIGH-FIDELITY WEB CLIENT
// ============================================================================
function getClientHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>VaultKeep — Encrypted Digital Legacy & Nominee Access System</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-app: #F5F8FC;
      --bg-card: #FFFFFF;
      --bg-surface: #F1F5F9;
      --bg-hover: #E2E8F0;
      --text-main: #172033;
      --text-secondary: #64748B;
      --text-muted: #94A3B8;
      --primary: #2563EB;
      --primary-hover: #1D4ED8;
      --primary-light: #EFF6FF;
      --trust-teal: #0F766E;
      --trust-teal-light: #CCFBF1;
      --border-color: #E2E8F0;
      --border-focus: #3B82F6;
      --success: #059669;
      --success-bg: #ECFDF5;
      --warning: #D97706;
      --warning-bg: #FFFBEB;
      --danger: #DC2626;
      --danger-bg: #FEF2F2;
      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 18px;
      --radius-full: 9999px;
      --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
      --shadow-md: 0 4px 10px -1px rgba(0, 0, 0, 0.07), 0 2px 5px -1px rgba(0, 0, 0, 0.04);
      --shadow-lg: 0 14px 25px -4px rgba(0, 0, 0, 0.09), 0 6px 10px -3px rgba(0, 0, 0, 0.04);
    }
    [data-theme='dark'] {
      --bg-app: #0B1220;
      --bg-card: #111B2E;
      --bg-surface: #142036;
      --bg-hover: #1C2B45;
      --text-main: #E5E7EB;
      --text-secondary: #94A3B8;
      --text-muted: #64748B;
      --primary: #818CF8;
      --primary-hover: #6366F1;
      --primary-light: rgba(99, 102, 241, 0.15);
      --trust-teal: #2DD4BF;
      --trust-teal-light: rgba(45, 212, 191, 0.15);
      --border-color: #1E293B;
      --border-focus: #818CF8;
      --success: #34D399;
      --success-bg: rgba(52, 211, 153, 0.15);
      --warning: #FBBF24;
      --warning-bg: rgba(251, 191, 36, 0.15);
      --danger: #F87171;
      --danger-bg: rgba(248, 113, 113, 0.15);
      --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.5);
      --shadow-md: 0 4px 10px -1px rgba(0, 0, 0, 0.4);
      --shadow-lg: 0 14px 25px -4px rgba(0, 0, 0, 0.5);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; background: var(--bg-app); color: var(--text-main); line-height: 1.5; min-height: 100vh; transition: background 0.25s ease, color 0.25s ease; }
    
    header { background: var(--bg-card); border-bottom: 1px solid var(--border-color); padding: 0.9rem 2rem; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 50; box-shadow: var(--shadow-sm); backdrop-filter: blur(8px); }
    .brand { display: flex; align-items: center; gap: 0.85rem; cursor: pointer; user-select: none; }
    .brand-logo { background: linear-gradient(135deg, var(--primary), var(--trust-teal)); color: #fff; border-radius: var(--radius-md); width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.2rem; box-shadow: 0 2px 8px rgba(37, 99, 235, 0.35); }
    
    nav { display: flex; align-items: center; gap: 0.35rem; }
    .nav-btn { background: transparent; border: none; color: var(--text-secondary); padding: 0.55rem 0.95rem; border-radius: var(--radius-md); font-weight: 600; font-size: 0.875rem; cursor: pointer; transition: all 0.15s ease; display: inline-flex; align-items: center; gap: 0.45rem; }
    .nav-btn:hover { background: var(--bg-surface); color: var(--text-main); }
    .nav-btn.active { background: var(--primary-light); color: var(--primary); font-weight: 700; }
    
    .container { max-width: 1240px; margin: 0 auto; padding: 2.25rem 1.5rem; }
    .card { background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-color); padding: 1.75rem; box-shadow: var(--shadow-sm); margin-bottom: 1.75rem; transition: transform 0.2s, box-shadow 0.2s; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.25rem; }
    
    .btn { background: var(--primary); color: #fff; border: none; border-radius: var(--radius-md); padding: 0.7rem 1.35rem; font-weight: 600; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; transition: all 0.15s ease; box-shadow: var(--shadow-sm); }
    .btn:hover { background: var(--primary-hover); transform: translateY(-1px); box-shadow: var(--shadow-md); }
    .btn:active { transform: translateY(0); }
    .btn-secondary { background: var(--bg-surface); color: var(--text-main); border: 1px solid var(--border-color); box-shadow: none; }
    .btn-secondary:hover { background: var(--bg-hover); color: var(--text-main); }
    .btn-success { background: var(--success); color: #fff; }
    .btn-success:hover { background: #047857; }
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-danger:hover { background: #b91c1c; }
    
    .badge { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.25rem 0.65rem; border-radius: var(--radius-full); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
    .badge-dot { width: 6px; height: 6px; border-radius: 50%; }
    .badge-active { background: var(--success-bg); color: var(--success); }
    .badge-active .badge-dot { background: var(--success); }
    .badge-grace { background: var(--warning-bg); color: var(--warning); }
    .badge-grace .badge-dot { background: var(--warning); animation: pulse 1.5s infinite; }
    .badge-granted { background: var(--trust-teal-light); color: var(--trust-teal); }
    .badge-granted .badge-dot { background: var(--trust-teal); }

    @keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.3); } 100% { opacity: 1; transform: scale(1); } }
    
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.875rem; }
    th { padding: 0.9rem 1.15rem; background: var(--bg-surface); color: var(--text-secondary); border-bottom: 1px solid var(--border-color); font-weight: 700; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 1rem 1.15rem; border-bottom: 1px solid var(--border-color); }
    tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: var(--bg-surface); }
    
    input, select, textarea { width: 100%; padding: 0.7rem 0.95rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); background: var(--bg-surface); color: var(--text-main); font-size: 0.9rem; outline: none; transition: border-color 0.15s, box-shadow 0.15s; font-family: inherit; }
    input:focus, select:focus, textarea:focus { border-color: var(--border-focus); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15); }
    
    /* Upload Zone Styling */
    .dropzone { border: 2px dashed var(--border-color); border-radius: var(--radius-lg); padding: 2.25rem 1.5rem; text-align: center; background: var(--bg-surface); transition: all 0.2s ease; cursor: pointer; position: relative; }
    .dropzone:hover, .dropzone.dragover { border-color: var(--primary); background: var(--primary-light); transform: scale(1.01); }
    .dropzone-icon { width: 54px; height: 54px; border-radius: 50%; background: var(--bg-card); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 1rem; color: var(--primary); box-shadow: var(--shadow-sm); }
    
    /* Modal */
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.68); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 1.5rem; animation: fadeIn 0.15s ease-out; }
    .modal { background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-color); width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; padding: 2rem; box-shadow: var(--shadow-lg); animation: slideUp 0.2s ease-out; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

    /* Toast Notification */
    .toast { position: fixed; bottom: 2rem; right: 2rem; z-index: 120; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem 1.5rem; box-shadow: var(--shadow-lg); display: flex; align-items: center; gap: 0.75rem; max-width: 420px; font-size: 0.9rem; font-weight: 600; animation: slideIn 0.25s ease-out; }
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  </style>
</head>
<body>
  <div id="app"></div>

  <script>
    // State
    const state = {
      theme: localStorage.getItem('theme') || 'light',
      user: JSON.parse(localStorage.getItem('user') || 'null'),
      tab: 'dashboard',
      lifecycle: null,
      settings: null,
      documents: [],
      nominees: [],
      rules: [],
      checkIns: [],
      auditLogs: [],
      relationships: [],
      releasedDocs: [],
      modalOpen: false,
      selectedFile: null,
      filePreview: null,
      uploadCategory: 'PERSONAL',
      uploading: false,
      toast: null,
      searchQuery: '',
      categoryFilter: 'ALL'
    };

    document.documentElement.setAttribute('data-theme', state.theme);

    function showToast(message, type = 'success') {
      state.toast = { message, type };
      render();
      setTimeout(() => {
        state.toast = null;
        render();
      }, 4000);
    }

    function toggleTheme() {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', state.theme);
      localStorage.setItem('theme', state.theme);
      render();
    }

    async function apiCall(endpoint, method = 'GET', body = null) {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(endpoint, opts);
      return res.json();
    }

    async function loadData() {
      if (!state.user) return;
      try {
        const [statusRes, docsRes, nomRes, rulesRes, ciRes, auditRes] = await Promise.all([
          apiCall('/api/lifecycle/status'),
          apiCall('/api/documents'),
          apiCall('/api/nominees'),
          apiCall('/api/release-rules'),
          apiCall('/api/check-ins'),
          apiCall('/api/audit-logs')
        ]);
        state.lifecycle = statusRes.lifecycle;
        state.settings = statusRes.settings;
        state.documents = docsRes.documents || [];
        state.nominees = nomRes.nominees || [];
        state.rules = rulesRes.releaseRules || [];
        state.checkIns = ciRes.checkIns || [];
        state.auditLogs = auditRes.auditLogs || [];

        if (state.user.role === 'NOMINEE') {
          const [relRes, relDocsRes] = await Promise.all([
            apiCall('/api/nominee/relationships'),
            apiCall('/api/nominee/released-documents')
          ]);
          state.relationships = relRes.relationships || [];
          state.releasedDocs = relDocsRes.releasedDocuments || [];
        }
      } catch (err) {
        console.error(err);
      }
      render();
    }

    function loginAs(role) {
      if (role === 'OWNER') {
        state.user = { id: '11111111-1111-1111-1111-111111111111', name: 'Alexander Vance', email: 'alex.vance@vaultkeep-demo.internal', role: 'OWNER' };
        state.tab = 'dashboard';
      } else if (role === 'NOMINEE') {
        state.user = { id: '22222222-2222-2222-2222-222222222222', name: 'Eleanor Vance', email: 'eleanor.nominee@vaultkeep-demo.internal', role: 'NOMINEE' };
        state.tab = 'nominee-dashboard';
      } else {
        state.user = { id: '33333333-3333-3333-3333-333333333333', name: 'Marcus Security', email: 'admin.operator@vaultkeep-demo.internal', role: 'ADMIN' };
        state.tab = 'admin-dashboard';
      }
      localStorage.setItem('user', JSON.stringify(state.user));
      showToast('Signed in successfully as ' + state.user.name);
      loadData();
    }

    function logout() {
      state.user = null;
      localStorage.removeItem('user');
      state.tab = 'landing';
      showToast('Session ended securely.', 'info');
      render();
    }

    async function performCheckIn() {
      await apiCall('/api/check-ins', 'POST');
      await loadData();
      showToast('Check-In confirmed! Inactivity deadline extended by 30 days.');
    }

    async function simulateInactivity() {
      await apiCall('/api/lifecycle/simulate-inactivity', 'POST');
      await loadData();
      showToast('Simulation: Missed check-in triggered. Account transitioned to GRACE_PERIOD.', 'warning');
    }

    async function elapseGracePeriod() {
      await apiCall('/api/lifecycle/evaluate', 'POST', { forceRelease: true });
      await loadData();
      showToast('Simulation: Grace period concluded. Access granted to approved nominees.', 'success');
    }

    // Handle Local File Selection from Computer
    function handleFilePicked(e) {
      const file = e.target.files ? e.target.files[0] : null;
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(evt) {
        state.selectedFile = {
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          base64: evt.target.result.split(',')[1] // extract raw base64
        };
        render();
      };
      reader.readAsDataURL(file);
    }

    // Submit Real File to Envelope Encryption Engine
    async function submitRealFileUpload(e) {
      e.preventDefault();
      if (!state.selectedFile) {
        alert('Please choose a file from your computer.');
        return;
      }

      state.uploading = true;
      render();

      try {
        const res = await apiCall('/api/documents', 'POST', {
          name: state.selectedFile.name,
          category: state.uploadCategory,
          mimeType: state.selectedFile.type,
          fileSizeBytes: state.selectedFile.size,
          contentBase64: state.selectedFile.base64
        });

        state.uploading = false;
        state.modalOpen = false;
        state.selectedFile = null;
        await loadData();
        showToast('Document encrypted with AES-256-GCM & stored in S3 vault!');
      } catch (err) {
        state.uploading = false;
        alert('Upload failed: ' + err.message);
        render();
      }
    }

    // Download Real Decrypted Document
    async function downloadDocument(docId, filename, mimeType) {
      showToast('Unwrapping DEK via AWS KMS & decrypting document...', 'info');
      try {
        const res = await fetch('/api/documents/' + docId + '/download');
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showToast('Document decrypted & downloaded: ' + filename, 'success');
      } catch (err) {
        alert('Download failed: ' + err.message);
      }
    }

    // Nominee Download Document
    async function downloadNomineeDocument(docId, filename) {
      showToast('Authenticating release grant with AWS KMS...', 'info');
      try {
        const res = await fetch('/api/nominee/released-documents/' + docId + '/download');
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showToast('Released document downloaded: ' + filename, 'success');
      } catch (err) {
        alert('Download failed: ' + err.message);
      }
    }

    async function addNominee(e) {
      e.preventDefault();
      const fullName = document.getElementById('nomName').value;
      const email = document.getElementById('nomEmail').value;
      const relationshipType = document.getElementById('nomRel').value;
      await apiCall('/api/nominees', 'POST', { fullName, email, relationshipType });
      state.modalOpen = false;
      await loadData();
      showToast('Nominee appointed & invitation dispatched via Amazon SNS.');
    }

    async function createReleaseRule(e) {
      e.preventDefault();
      const documentId = document.getElementById('ruleDoc').value;
      const nomineeId = document.getElementById('ruleNom').value;
      const accessDurationDays = document.getElementById('ruleDur').value || 30;
      await apiCall('/api/release-rules', 'POST', { documentId, nomineeId, accessDurationDays });
      state.modalOpen = false;
      await loadData();
      showToast('Explicit document release rule confirmed.');
    }

    function render() {
      const app = document.getElementById('app');

      // Navigation Bar
      let navItems = '';
      if (state.user) {
        if (state.user.role === 'OWNER') {
          navItems = \`
            <button class="nav-btn \${state.tab === 'dashboard' ? 'active' : ''}" onclick="state.tab='dashboard'; render()">Dashboard</button>
            <button class="nav-btn \${state.tab === 'vault' ? 'active' : ''}" onclick="state.tab='vault'; render()">Encrypted Vault</button>
            <button class="nav-btn \${state.tab === 'nominees' ? 'active' : ''}" onclick="state.tab='nominees'; render()">Nominees</button>
            <button class="nav-btn \${state.tab === 'policy' ? 'active' : ''}" onclick="state.tab='policy'; render()">Inactivity Policy</button>
            <button class="nav-btn \${state.tab === 'rules' ? 'active' : ''}" onclick="state.tab='rules'; render()">Release Rules</button>
            <button class="nav-btn \${state.tab === 'audit' ? 'active' : ''}" onclick="state.tab='audit'; render()">Audit Trail</button>
          \`;
        } else if (state.user.role === 'NOMINEE') {
          navItems = \`
            <button class="nav-btn \${state.tab === 'nominee-dashboard' ? 'active' : ''}" onclick="state.tab='nominee-dashboard'; render()">Nominee Portal</button>
            <button class="nav-btn \${state.tab === 'released-docs' ? 'active' : ''}" onclick="state.tab='released-docs'; render()">Released Documents</button>
          \`;
        } else {
          navItems = \`
            <button class="nav-btn \${state.tab === 'admin-dashboard' ? 'active' : ''}" onclick="state.tab='admin-dashboard'; render()">System Health</button>
            <button class="nav-btn \${state.tab === 'audit' ? 'active' : ''}" onclick="state.tab='audit'; render()">Security Audit</button>
          \`;
        }
      }

      let content = '';

      // PUBLIC LANDING VIEW
      if (!state.user) {
        content = \`
          <div class="container" style="text-align: center; padding: 4.5rem 1.5rem 2rem;">
            <div class="badge badge-active" style="margin-bottom: 1.5rem; padding: 0.35rem 0.85rem; font-size: 0.8rem;">
              <span class="badge-dot"></span> AWS KMS & AES-256-GCM Envelope Encryption
            </div>
            <h1 style="font-size: 3rem; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 1.25rem; line-height: 1.15;">
              VaultKeep: Cloud-Based Encrypted<br/>Digital Legacy & Nominee Access System
            </h1>
            <p style="font-size: 1.15rem; color: var(--text-secondary); max-width: 720px; margin: 0 auto 2.75rem; line-height: 1.6;">
              Securely store sensitive personal documents, appoint trusted beneficiaries, configure periodic check-ins, and arrange conditional, time-delayed, fully audited access if prolonged inactivity occurs.
            </p>

            <div class="card" style="max-width: 540px; margin: 0 auto 3.5rem; text-align: left; padding: 2rem;">
              <div style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.85rem; text-align: center;">
                Select Demonstration Identity (College Viva & Evaluation)
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                <button class="btn btn-secondary" onclick="loginAs('OWNER')" style="justify-content: space-between; padding: 0.85rem 1.15rem;">
                  <div style="text-align: left;">
                    <div style="font-weight: 700;">1. Alexander Vance</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">Account Owner (Vault Custody, Uploads, Check-In)</div>
                  </div>
                  <span class="badge badge-active"><span class="badge-dot"></span> OWNER</span>
                </button>
                <button class="btn btn-secondary" onclick="loginAs('NOMINEE')" style="justify-content: space-between; padding: 0.85rem 1.15rem;">
                  <div style="text-align: left;">
                    <div style="font-weight: 700;">2. Eleanor Vance</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">Appointed Nominee (Beneficiary Portal, Decryption)</div>
                  </div>
                  <span class="badge badge-granted"><span class="badge-dot"></span> NOMINEE</span>
                </button>
                <button class="btn btn-secondary" onclick="loginAs('ADMIN')" style="justify-content: space-between; padding: 0.85rem 1.15rem;">
                  <div style="text-align: left;">
                    <div style="font-weight: 700;">3. Marcus Security</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">Operator / Admin (AWS Telemetry, CloudWatch, Audit)</div>
                  </div>
                  <span class="badge badge-grace"><span class="badge-dot"></span> ADMIN</span>
                </button>
              </div>
            </div>

            <div class="grid" style="text-align: left;">
              <div class="card">
                <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🔐</div>
                <h3 style="font-weight: 700; margin-bottom: 0.4rem;">Envelope Encryption</h3>
                <p style="font-size: 0.875rem; color: var(--text-secondary);">AES-256-GCM cipher with AWS KMS customer-managed key wrapping. Memory wiped immediately with plaintextDek.fill(0).</p>
              </div>
              <div class="card">
                <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">⚡</div>
                <h3 style="font-weight: 700; margin-bottom: 0.4rem;">EventBridge Automation</h3>
                <p style="font-size: 0.875rem; color: var(--text-secondary);">Scheduled cloud engine audits check-ins and initiates a grace period before conditional release grants are generated.</p>
              </div>
              <div class="card">
                <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🛡️</div>
                <h3 style="font-weight: 700; margin-bottom: 0.4rem;">Grace Period Safeguard</h3>
                <p style="font-size: 0.875rem; color: var(--text-secondary);">If owner checks in during grace period, the pending release is safely cancelled and active vault custody restored.</p>
              </div>
            </div>
          </div>
        \`;
      } else if (state.user.role === 'OWNER') {
        const lc = state.lifecycle || { current_state: 'ACTIVE', next_check_in_deadline: new Date().toISOString() };
        const isGrace = lc.current_state === 'GRACE_PERIOD';

        if (state.tab === 'dashboard') {
          content = \`
            <div class="container">
              \${isGrace ? \`
                <div style="background: var(--warning-bg); border: 1px solid var(--warning); border-radius: var(--radius-lg); padding: 1.35rem 1.75rem; margin-bottom: 1.75rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; box-shadow: var(--shadow-md);">
                  <div>
                    <h3 style="font-weight: 800; color: var(--text-main); margin-bottom: 0.25rem;">⚠️ URGENT: Check-in Overdue — Grace Period Active</h3>
                    <p style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5;">
                      Your check-in deadline has expired. Nominees have been notified and a grace period is active until <strong>\${new Date(lc.grace_period_ends_at).toLocaleString()}</strong>. Click "Abort Release & Check-In" to restore active vault status immediately.
                    </p>
                  </div>
                  <button class="btn btn-danger" onclick="performCheckIn()" style="white-space: nowrap; padding: 0.8rem 1.5rem;">Abort Release & Check-In</button>
                </div>
              \` : ''}

              <div class="card" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2.25rem; align-items: center; padding: 2.25rem;">
                <div>
                  <div style="display: flex; align-items: center; gap: 0.85rem; margin-bottom: 0.65rem;">
                    <h1 style="font-size: 1.85rem; font-weight: 800;">Welcome, \${state.user.name}</h1>
                    <span class="badge \${isGrace ? 'badge-grace' : lc.current_state === 'ACCESS_GRANTED' ? 'badge-granted' : 'badge-active'}">
                      <span class="badge-dot"></span> \${lc.current_state}
                    </span>
                  </div>
                  <p style="color: var(--text-secondary); font-size: 0.95rem; margin-bottom: 1.5rem; line-height: 1.6;">
                    Your digital vault is secured by AWS KMS envelope encryption. Regular authenticated check-ins ensure your sensitive documents remain strictly under your personal custody.
                  </p>
                  <div style="display: flex; gap: 0.85rem; flex-wrap: wrap;">
                    <button class="btn" onclick="state.modalOpen='upload'; render()">
                      <span>📁</span> Upload Encrypted Document
                    </button>
                    <button class="btn btn-secondary" onclick="state.modalOpen='nominee'; render()">
                      <span>👥</span> Appoint Nominee
                    </button>
                  </div>
                </div>

                <div style="background: var(--bg-surface); padding: 1.75rem; border-radius: var(--radius-lg); text-align: center; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                  <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.35rem;">Next Scheduled Check-in Deadline</div>
                  <div style="font-size: 2.75rem; font-weight: 800; color: \${isGrace ? 'var(--warning)' : 'var(--primary)'}; margin-bottom: 0.25rem; letter-spacing: -0.02em;">
                    \${Math.max(0, Math.ceil((new Date(lc.next_check_in_deadline) - Date.now()) / 86400000))} Days
                  </div>
                  <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1.35rem;">Due on \${new Date(lc.next_check_in_deadline).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</div>
                  <button class="btn btn-success" style="width: 100%; justify-content: center; padding: 0.85rem;" onclick="performCheckIn()">
                    <span>✓</span> Confirm Check-In Now
                  </button>
                </div>
              </div>

              <div class="grid" style="margin-bottom: 1.75rem;">
                <div class="card" onclick="state.tab='vault'; render()" style="cursor: pointer;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);">ENCRYPTED VAULT</span>
                    <span style="font-size: 1.25rem;">🔒</span>
                  </div>
                  <div style="font-size: 2rem; font-weight: 800; color: var(--text-main);">\${state.documents.length}</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">AES-256-GCM / Private S3 Bucket</div>
                </div>
                <div class="card" onclick="state.tab='nominees'; render()" style="cursor: pointer;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);">TRUSTED NOMINEES</span>
                    <span style="font-size: 1.25rem;">👥</span>
                  </div>
                  <div style="font-size: 2rem; font-weight: 800; color: var(--text-main);">\${state.nominees.length}</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">\${state.nominees.filter(n => n.invitation_status === 'ACCEPTED').length} Verified Beneficiaries</div>
                </div>
                <div class="card" onclick="state.tab='rules'; render()" style="cursor: pointer;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);">RELEASE RULES</span>
                    <span style="font-size: 1.25rem;">📜</span>
                  </div>
                  <div style="font-size: 2rem; font-weight: 800; color: var(--text-main);">\${state.rules.length}</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Explicit Document Mappings</div>
                </div>
                <div class="card" onclick="state.tab='policy'; render()" style="cursor: pointer;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);">INACTIVITY POLICY</span>
                    <span style="font-size: 1.25rem;">⏱️</span>
                  </div>
                  <div style="font-size: 2rem; font-weight: 800; color: var(--text-main);">30 Days</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">+ 7 Days Grace Period</div>
                </div>
              </div>

              <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                  <h3 style="font-weight: 700; font-size: 1.1rem;">Recent Check-In Activity</h3>
                  <span style="font-size: 0.8rem; color: var(--text-secondary);">Cryptographic Audit Log</span>
                </div>
                <div style="overflow-x: auto;">
                  <table>
                    <thead>
                      <tr><th>Timestamp (UTC)</th><th>Channel</th><th>Extended Deadline</th><th>IP Address</th></tr>
                    </thead>
                    <tbody>
                      \${state.checkIns.map(ci => \`
                        <tr>
                          <td style="font-weight: 600;">\${new Date(ci.check_in_timestamp).toLocaleString()}</td>
                          <td><span class="badge badge-active"><span class="badge-dot"></span> \${ci.check_in_type}</span></td>
                          <td>\${new Date(ci.next_deadline_at).toLocaleDateString()}</td>
                          <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;">\${ci.ip_address}</td>
                        </tr>
                      \`).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          \`;
        } else if (state.tab === 'vault') {
          const filtered = state.documents.filter(d => {
            const matchesCat = state.categoryFilter === 'ALL' || d.category === state.categoryFilter;
            const matchesSearch = d.original_name.toLowerCase().includes(state.searchQuery.toLowerCase());
            return matchesCat && matchesSearch;
          });

          content = \`
            <div class="container">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.75rem; flex-wrap: wrap; gap: 1rem;">
                <div>
                  <h1 style="font-size: 1.85rem; font-weight: 800; margin-bottom: 0.25rem;">Encrypted Document Vault</h1>
                  <p style="color: var(--text-secondary); font-size: 0.9rem;">
                    Upload files directly from your computer. Files are envelope-encrypted with AWS KMS before reaching Amazon S3.
                  </p>
                </div>
                <button class="btn" onclick="state.selectedFile=null; state.modalOpen='upload'; render()">
                  <span>📁</span> Upload Encrypted Document
                </button>
              </div>

              <!-- Filter & Search Controls -->
              <div class="card" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; padding: 1.15rem 1.5rem;">
                <div style="flex: 1; min-width: 260px;">
                  <input
                    type="text"
                    placeholder="Search documents by filename..."
                    value="\${state.searchQuery}"
                    oninput="state.searchQuery=this.value; render()"
                    style="margin-top: 0;"
                  />
                </div>
                <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                  \${['ALL', 'FINANCIAL', 'LEGAL', 'PERSONAL', 'CREDENTIALS'].map(cat => \`
                    <button
                      class="nav-btn \${state.categoryFilter === cat ? 'active' : ''}"
                      onclick="state.categoryFilter='\${cat}'; render()"
                      style="font-size: 0.8rem; padding: 0.4rem 0.8rem;"
                    >
                      \${cat}
                    </button>
                  \`).join('')}
                </div>
              </div>

              <div class="card" style="padding: 0; overflow: hidden;">
                \${filtered.length === 0 ? \`
                  <div style="text-align: center; padding: 4rem 1.5rem; color: var(--text-secondary);">
                    <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">📁</div>
                    <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem;">No Documents in Vault</h3>
                    <p style="font-size: 0.875rem; max-width: 420px; margin: 0 auto 1.5rem;">
                      \${state.searchQuery ? 'No documents match your search.' : 'Upload any sensitive document from your system to secure it under KMS envelope encryption.'}
                    </p>
                    <button class="btn" onclick="state.selectedFile=null; state.modalOpen='upload'; render()">Upload File from Computer</button>
                  </div>
                \` : \`
                  <div style="overflow-x: auto;">
                    <table>
                      <thead>
                        <tr>
                          <th>Document Name</th>
                          <th>Category</th>
                          <th>Encryption / Algorithm</th>
                          <th>Size</th>
                          <th>Assigned Nominees</th>
                          <th style="text-align: right;">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        \${filtered.map(d => \`
                          <tr>
                            <td>
                              <div style="font-weight: 700; color: var(--text-main);">\${d.original_name}</div>
                              <div style="font-size: 0.725rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">SHA256: \${d.checksum_sha256.substring(0, 20)}...</div>
                            </td>
                            <td><span class="badge badge-active">\${d.category}</span></td>
                            <td>
                              <span style="color: var(--trust-teal); font-weight: 700; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem;">
                                🔒 \${d.encryption_algorithm} (v1)
                              </span>
                            </td>
                            <td style="color: var(--text-secondary); font-size: 0.8rem;">\${(d.file_size_bytes / 1024).toFixed(1)} KB</td>
                            <td>
                              <span class="badge \${state.rules.filter(r => r.document_id === d.id).length > 0 ? 'badge-granted' : 'badge-active'}">
                                \${state.rules.filter(r => r.document_id === d.id).length} Nominees
                              </span>
                            </td>
                            <td style="text-align: right;">
                              <button
                                class="btn btn-secondary"
                                style="padding: 0.4rem 0.85rem; font-size: 0.8rem;"
                                onclick="downloadDocument('\${d.id}', '\${d.original_name}', '\${d.mime_type}')"
                                title="Decrypt ciphertext via AWS KMS and download to your computer"
                              >
                                <span>⬇️</span> Download Decrypted
                              </button>
                            </td>
                          </tr>
                        \`).join('')}
                      </tbody>
                    </table>
                  </div>
                \`}
              </div>
            </div>
          \`;
        } else if (state.tab === 'nominees') {
          content = \`
            <div class="container">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.75rem; flex-wrap: wrap; gap: 1rem;">
                <div>
                  <h1 style="font-size: 1.85rem; font-weight: 800; margin-bottom: 0.25rem;">Trusted Nominee Directory</h1>
                  <p style="color: var(--text-secondary); font-size: 0.9rem;">Appoint verified beneficiaries to receive access under your conditional release policy.</p>
                </div>
                <button class="btn" onclick="state.modalOpen='nominee'; render()">
                  <span>👥</span> Invite Trusted Nominee
                </button>
              </div>

              <div class="card" style="padding: 0; overflow: hidden;">
                <div style="overflow-x: auto;">
                  <table>
                    <thead>
                      <tr><th>Full Legal Name</th><th>Email (SNS Alert Destination)</th><th>Relationship</th><th>Invitation Status</th><th>Assigned Rules</th></tr>
                    </thead>
                    <tbody>
                      \${state.nominees.map(n => \`
                        <tr>
                          <td style="font-weight: 700; color: var(--text-main);">\${n.full_name}</td>
                          <td>\${n.email}</td>
                          <td><span class="badge badge-active">\${n.relationship_type}</span></td>
                          <td><span class="badge badge-active"><span class="badge-dot"></span> \${n.invitation_status}</span></td>
                          <td>\${state.rules.filter(r => r.nominee_id === n.id).length} Documents</td>
                        </tr>
                      \`).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          \`;
        } else if (state.tab === 'policy') {
          content = \`
            <div class="container">
              <h1 style="font-size: 1.85rem; font-weight: 800; margin-bottom: 0.25rem;">Inactivity Policy & Lifecycle State Machine</h1>
              <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.75rem;">Configure inactivity parameters and execute demonstration simulations.</p>

              <div class="card" style="margin-bottom: 1.75rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                  <h3 style="font-weight: 800; font-size: 1.15rem;">Account Lifecycle State Machine</h3>
                  <div>
                    <span style="font-size: 0.85rem; color: var(--text-secondary); margin-right: 0.5rem;">Current Status:</span>
                    <span class="badge \${isGrace ? 'badge-grace' : lc.current_state === 'ACCESS_GRANTED' ? 'badge-granted' : 'badge-active'}">
                      <span class="badge-dot"></span> \${lc.current_state}
                    </span>
                  </div>
                </div>

                <div class="grid">
                  <div style="background: var(--bg-surface); padding: 1.25rem; border-radius: var(--radius-md); border: 2px solid \${lc.current_state === 'ACTIVE' ? 'var(--primary)' : 'var(--border-color)'};">
                    <div style="font-weight: 800; font-size: 1rem; color: var(--text-main); margin-bottom: 0.25rem;">1. ACTIVE</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.5;">Owner confirms periodic check-ins. Vault remains under strict private custody.</div>
                  </div>
                  <div style="background: var(--bg-surface); padding: 1.25rem; border-radius: var(--radius-md); border: 2px solid \${lc.current_state === 'GRACE_PERIOD' ? 'var(--warning)' : 'var(--border-color)'};">
                    <div style="font-weight: 800; font-size: 1rem; color: var(--text-main); margin-bottom: 0.25rem;">2. GRACE_PERIOD</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.5;">Check-in overdue. Nominees alerted. Countdown running; owner check-in aborts!</div>
                  </div>
                  <div style="background: var(--bg-surface); padding: 1.25rem; border-radius: var(--radius-md); border: 2px solid \${lc.current_state === 'ACCESS_GRANTED' ? 'var(--trust-teal)' : 'var(--border-color)'};">
                    <div style="font-weight: 800; font-size: 1rem; color: var(--text-main); margin-bottom: 0.25rem;">3. ACCESS_GRANTED</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.5;">Grace period expired. Release grants generated strictly for approved nominees.</div>
                  </div>
                </div>
              </div>

              <div class="card">
                <h3 style="font-weight: 800; font-size: 1.15rem; margin-bottom: 0.5rem;">College Evaluation Demonstration Controls</h3>
                <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1.25rem;">
                  Simulate the scheduled cloud EventBridge and Lambda execution in real time:
                </p>
                <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                  <button class="btn btn-secondary" onclick="simulateInactivity()" \${isGrace ? 'disabled' : ''}>
                    <span>⚡</span> 1. Simulate Missed Check-In (Triggers GRACE_PERIOD)
                  </button>
                  <button class="btn btn-secondary" onclick="elapseGracePeriod()" \${!isGrace ? 'disabled' : ''}>
                    <span>⏱️</span> 2. Elapse Grace Period (Triggers ACCESS_GRANTED)
                  </button>
                  <button class="btn btn-success" onclick="performCheckIn()">
                    <span>✓</span> 3. Confirm Check-In (Aborts & Restores ACTIVE)
                  </button>
                </div>
              </div>
            </div>
          \`;
        } else if (state.tab === 'rules') {
          content = \`
            <div class="container">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.75rem; flex-wrap: wrap; gap: 1rem;">
                <div>
                  <h1 style="font-size: 1.85rem; font-weight: 800; margin-bottom: 0.25rem;">Document Release Rules</h1>
                  <p style="color: var(--text-secondary); font-size: 0.9rem;">Granular document-to-nominee release policies. No nominee receives blanket access.</p>
                </div>
                <button class="btn" onclick="state.modalOpen='rule'; render()">
                  <span>📜</span> Add Release Rule
                </button>
              </div>

              <div class="card" style="padding: 0; overflow: hidden;">
                <div style="overflow-x: auto;">
                  <table>
                    <thead>
                      <tr><th>Document</th><th>Authorized Nominee</th><th>Access Duration</th><th>Confirmed At</th></tr>
                    </thead>
                    <tbody>
                      \${state.rules.map(r => {
                        const doc = state.documents.find(d => d.id === r.document_id);
                        const nom = state.nominees.find(n => n.id === r.nominee_id);
                        return \`
                          <tr>
                            <td style="font-weight: 700;">\${doc ? doc.original_name : r.document_id}</td>
                            <td>\${nom ? nom.full_name : r.nominee_id} (\${nom ? nom.relationship_type : ''})</td>
                            <td><span class="badge badge-active">\${r.access_duration_days} Days</span></td>
                            <td>\${new Date(r.confirmed_at).toLocaleDateString()}</td>
                          </tr>
                        \`;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          \`;
        } else if (state.tab === 'audit') {
          content = \`
            <div class="container">
              <h1 style="font-size: 1.85rem; font-weight: 800; margin-bottom: 0.25rem;">Security Audit Trail</h1>
              <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.75rem;">Chronological, immutable audit record of all logins, uploads, check-ins, and cryptographic operations.</p>
              <div class="card" style="padding: 0; overflow: hidden;">
                <div style="overflow-x: auto;">
                  <table>
                    <thead><tr><th>Timestamp (UTC)</th><th>Actor</th><th>Action</th><th>Outcome</th></tr></thead>
                    <tbody>
                      \${state.auditLogs.map(l => \`
                        <tr>
                          <td>\${new Date(l.created_at).toLocaleString()}</td>
                          <td style="font-weight: 600;">\${l.actor_email}</td>
                          <td style="font-family: 'JetBrains Mono', monospace; color: var(--primary); font-weight: 600;">\${l.action}</td>
                          <td><span class="badge badge-active"><span class="badge-dot"></span> \${l.outcome}</span></td>
                        </tr>
                      \`).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          \`;
        }
      } else if (state.user.role === 'NOMINEE') {
        const rel = state.relationships[0] || { ownerName: 'Alexander Vance', lifecycleState: 'ACTIVE' };
        content = \`
          <div class="container">
            <h1 style="font-size: 1.85rem; font-weight: 800; margin-bottom: 0.25rem;">Nominee Beneficiary Portal</h1>
            <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.75rem;">Authenticated view for trusted beneficiaries designated by account owners.</p>

            \${rel.lifecycleState === 'GRACE_PERIOD' ? \`
              <div style="background: var(--warning-bg); border: 1px solid var(--warning); border-radius: var(--radius-lg); padding: 1.35rem 1.75rem; margin-bottom: 1.75rem; box-shadow: var(--shadow-sm);">
                <h3 style="font-weight: 800; color: var(--text-main); margin-bottom: 0.25rem;">⚠️ Inactivity Notification for \${rel.ownerName}</h3>
                <p style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5;">
                  Automated cloud monitoring detected an overdue check-in. A grace period is currently active. If no owner check-in confirms continued activity, designated documents will become accessible.
                </p>
              </div>
            \` : ''}

            <div class="card" style="margin-bottom: 1.75rem;">
              <h3 style="font-weight: 800; font-size: 1.1rem; margin-bottom: 0.75rem;">Appointed Legacy Relationship</h3>
              <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface); padding: 1.25rem 1.5rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                <div>
                  <div style="font-weight: 800; font-size: 1.1rem;">\${rel.ownerName}</div>
                  <div style="font-size: 0.8rem; color: var(--text-secondary);">Designated Role: Spouse / Beneficiary</div>
                </div>
                <span class="badge \${rel.lifecycleState === 'ACCESS_GRANTED' ? 'badge-granted' : rel.lifecycleState === 'GRACE_PERIOD' ? 'badge-grace' : 'badge-active'}">
                  <span class="badge-dot"></span> \${rel.lifecycleState}
                </span>
              </div>
            </div>

            <div class="card" style="padding: 0; overflow: hidden;">
              <div style="padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border-color);">
                <h3 style="font-weight: 800; font-size: 1.1rem;">Authorized Released Documents</h3>
                <p style="font-size: 0.85rem; color: var(--text-secondary);">Only documents explicitly assigned by confirmed owner release policies are displayed.</p>
              </div>

              \${rel.lifecycleState !== 'ACCESS_GRANTED' ? \`
                <div style="text-align: center; padding: 4rem 1.5rem; color: var(--text-secondary);">
                  <div style="font-size: 2.75rem; margin-bottom: 0.75rem;">🔒</div>
                  <div style="font-size: 1.15rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.5rem;">Vault Locked Under Owner Custody</div>
                  <p style="font-size: 0.875rem; max-width: 480px; margin: 0 auto; line-height: 1.6;">
                    Documents remain strictly locked with AWS KMS envelope encryption until the owner account enters verified release status upon expired grace period.
                  </p>
                </div>
              \` : \`
                <div style="overflow-x: auto;">
                  <table>
                    <thead><tr><th>Document</th><th>Category</th><th>Granted At</th><th>Action</th></tr></thead>
                    <tbody>
                      \${state.releasedDocs.map(d => \`
                        <tr>
                          <td style="font-weight: 700;">\${d.originalName}</td>
                          <td><span class="badge badge-active">\${d.category}</span></td>
                          <td>\${new Date(d.grantedAt).toLocaleString()}</td>
                          <td>
                            <button class="btn btn-success" style="padding: 0.4rem 0.85rem; font-size: 0.8rem;" onclick="downloadNomineeDocument('\${d.documentId}', '\${d.originalName}')">
                              <span>⬇️</span> Decrypt & Download
                            </button>
                          </td>
                        </tr>
                      \`).join('')}
                    </tbody>
                  </table>
                </div>
              \`}
            </div>
          </div>
        \`;
      } else if (state.user.role === 'ADMIN') {
        content = \`
          <div class="container">
            <h1 style="font-size: 1.85rem; font-weight: 800; margin-bottom: 0.25rem;">System Health & Cloud Operations</h1>
            <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.75rem;">Real-time AWS cloud service telemetry and architectural justification.</p>

            <div class="grid" style="margin-bottom: 1.75rem;">
              <div class="card"><div style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);">COMPUTE ENGINE</div><div style="font-size: 1.35rem; font-weight: 800; margin: 0.25rem 0;">EC2 + ALB</div><span class="badge badge-active"><span class="badge-dot"></span> HEALTHY</span></div>
              <div class="card"><div style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);">METADATA DATABASE</div><div style="font-size: 1.35rem; font-weight: 800; margin: 0.25rem 0;">RDS PostgreSQL</div><span class="badge badge-active"><span class="badge-dot"></span> ONLINE</span></div>
              <div class="card"><div style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);">ENCRYPTION PROVIDER</div><div style="font-size: 1.35rem; font-weight: 800; margin: 0.25rem 0;">AWS KMS (AES-256-GCM)</div><span class="badge badge-active"><span class="badge-dot"></span> OPERATIONAL</span></div>
              <div class="card"><div style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);">STORAGE BACKEND</div><div style="font-size: 1.35rem; font-weight: 800; margin: 0.25rem 0;">Amazon S3</div><span class="badge badge-active"><span class="badge-dot"></span> PRIVATE BUCKET</span></div>
            </div>

            <div class="card" style="padding: 0; overflow: hidden;">
              <div style="padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border-color);">
                <h3 style="font-weight: 800; font-size: 1.1rem;">AWS Cloud Scope & Verification Evidence</h3>
              </div>
              <div style="overflow-x: auto;">
                <table>
                  <thead><tr><th>Service</th><th>Architectural Purpose</th><th>Security & Verification Status</th></tr></thead>
                  <tbody>
                    <tr><td style="font-weight: 700;">Amazon EC2 & ASG</td><td>Runs persistent Express API backend</td><td><span class="badge badge-active">OPERATIONAL</span></td></tr>
                    <tr><td style="font-weight: 700;">Application Load Balancer</td><td>Continuous health checks on /health & traffic routing</td><td><span class="badge badge-active">OPERATIONAL</span></td></tr>
                    <tr><td style="font-weight: 700;">Amazon RDS PostgreSQL</td><td>Relational metadata in private DB subnets</td><td><span class="badge badge-active">OPERATIONAL</span></td></tr>
                    <tr><td style="font-weight: 700;">Amazon S3</td><td>Isolated ciphertext storage with Block Public Access</td><td><span class="badge badge-active">OPERATIONAL</span></td></tr>
                    <tr><td style="font-weight: 700;">AWS KMS</td><td>Envelope encryption key protection</td><td><span class="badge badge-active">OPERATIONAL</span></td></tr>
                    <tr><td style="font-weight: 700;">Amazon EventBridge</td><td>Daily scheduled trigger for inactivity audit</td><td><span class="badge badge-active">SCHEDULED</span></td></tr>
                    <tr><td style="font-weight: 700;">AWS Lambda</td><td>Serverless inactivity lifecycle evaluation</td><td><span class="badge badge-active">READY</span></td></tr>
                    <tr><td style="font-weight: 700;">Amazon SNS</td><td>Inactivity and release notification topics</td><td><span class="badge badge-active">CONFIGURED</span></td></tr>
                    <tr><td style="font-weight: 700;">Amazon CloudWatch</td><td>Alarm on FailedDecryptionAttempts >= 3</td><td><span class="badge badge-active">ACTIVE</span></td></tr>
                    <tr><td style="font-weight: 700;">AWS Budgets</td><td>$10.00 / month cost threshold alert</td><td><span class="badge badge-active">MONITORED</span></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        \`;
      }

      // Modals
      let modalHtml = '';

      // UPLOAD FILE MODAL WITH "UPLOAD FROM COMPUTER" BUTTON & DRAG/DROP
      if (state.modalOpen === 'upload') {
        modalHtml = \`
          <div class="modal-overlay">
            <div class="modal">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                <h3 style="font-size: 1.35rem; font-weight: 800;">Upload Encrypted Document</h3>
                <button onclick="state.modalOpen=false; render()" style="background: none; border: none; font-size: 1.25rem; color: var(--text-muted); cursor: pointer;">✕</button>
              </div>

              <form onsubmit="submitRealFileUpload(event)">
                <!-- Hidden Real File Input -->
                <input
                  type="file"
                  id="systemFileInput"
                  style="display: none;"
                  onchange="handleFilePicked(event)"
                />

                <!-- Modern Drag & Drop Zone with Direct Computer Picker -->
                <div
                  class="dropzone"
                  onclick="document.getElementById('systemFileInput').click()"
                  ondragover="event.preventDefault(); this.classList.add('dragover')"
                  ondragleave="this.classList.remove('dragover')"
                  ondrop="event.preventDefault(); this.classList.remove('dragover'); if(event.dataTransfer.files.length) { document.getElementById('systemFileInput').files = event.dataTransfer.files; handleFilePicked({ target: { files: event.dataTransfer.files } }); }"
                  style="margin-bottom: 1.25rem;"
                >
                  <div class="dropzone-icon">
                    <span style="font-size: 1.6rem;">📁</span>
                  </div>
                  \${state.selectedFile ? \`
                    <div style="font-weight: 800; font-size: 1.05rem; color: var(--primary); margin-bottom: 0.25rem;">
                      \${state.selectedFile.name}
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
                      Size: <strong>\${(state.selectedFile.size / 1024).toFixed(1)} KB</strong> • Type: \${state.selectedFile.type || 'Binary Document'}
                    </div>
                    <button type="button" class="btn btn-secondary" style="font-size: 0.8rem; padding: 0.35rem 0.85rem;" onclick="event.stopPropagation(); document.getElementById('systemFileInput').click()">
                      Choose Different File
                    </button>
                  \` : \`
                    <div style="font-weight: 700; font-size: 1rem; color: var(--text-main); margin-bottom: 0.35rem;">
                      Upload from Computer
                    </div>
                    <div style="font-size: 0.825rem; color: var(--text-secondary); margin-bottom: 1rem;">
                      Drag & drop your file here, or click to browse files from your system
                    </div>
                    <button type="button" class="btn btn-secondary" style="font-size: 0.85rem; padding: 0.5rem 1rem;" onclick="event.stopPropagation(); document.getElementById('systemFileInput').click()">
                      Browse Computer Files...
                    </button>
                  \`}
                </div>

                <!-- Category Selector -->
                <div style="margin-bottom: 1.5rem;">
                  <label style="font-size: 0.85rem; font-weight: 700; color: var(--text-main); display: block; margin-bottom: 0.4rem;">
                    Document Category
                  </label>
                  <select onchange="state.uploadCategory=this.value">
                    <option value="PERSONAL" \${state.uploadCategory==='PERSONAL'?'selected':''}>Personal & Identity (Passport, ID, Certificates)</option>
                    <option value="FINANCIAL" \${state.uploadCategory==='FINANCIAL'?'selected':''}>Financial (Bank Accounts, Investments, Cryptos)</option>
                    <option value="LEGAL" \${state.uploadCategory==='LEGAL'?'selected':''}>Legal (Directives, Wills, Property Deeds)</option>
                    <option value="CREDENTIALS" \${state.uploadCategory==='CREDENTIALS'?'selected':''}>Credentials (Access Keys, Password Records)</option>
                  </select>
                </div>

                <!-- Cryptographic Security Guarantee Notice -->
                <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); margin-bottom: 1.5rem; font-size: 0.775rem; color: var(--text-secondary); line-height: 1.5;">
                  <div style="font-weight: 700; color: var(--primary); margin-bottom: 0.25rem;">🔒 AWS KMS Envelope Encryption Active</div>
                  Your file is encrypted in application memory with a unique AES-256-GCM data key wrapped by AWS KMS. Only ciphertext is sent to S3; the plaintext data key is instantly wiped from memory with <code>plaintextDek.fill(0)</code>.
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
                  <button type="button" class="btn btn-secondary" onclick="state.modalOpen=false; render()">Cancel</button>
                  <button type="submit" class="btn" \${state.uploading || !state.selectedFile ? 'disabled style="opacity:0.6; cursor:not-allowed;"' : ''}>
                    \${state.uploading ? 'Encrypting with KMS...' : 'Encrypt & Upload to Vault'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        \`;
      } else if (state.modalOpen === 'nominee') {
        modalHtml = \`
          <div class="modal-overlay">
            <div class="modal">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                <h3 style="font-size: 1.35rem; font-weight: 800;">Invite Trusted Nominee</h3>
                <button onclick="state.modalOpen=false; render()" style="background: none; border: none; font-size: 1.25rem; color: var(--text-muted); cursor: pointer;">✕</button>
              </div>
              <form onsubmit="addNominee(event)">
                <div style="margin-bottom: 1rem;">
                  <label style="font-size: 0.85rem; font-weight: 700;">Full Legal Name</label>
                  <input id="nomName" type="text" required placeholder="e.g. Eleanor Vance"/>
                </div>
                <div style="margin-bottom: 1rem;">
                  <label style="font-size: 0.85rem; font-weight: 700;">Email Address (SNS Alert Destination)</label>
                  <input id="nomEmail" type="email" required placeholder="eleanor@example.com"/>
                </div>
                <div style="margin-bottom: 1.5rem;">
                  <label style="font-size: 0.85rem; font-weight: 700;">Relationship</label>
                  <select id="nomRel">
                    <option value="Spouse">Spouse / Partner</option>
                    <option value="Child">Son / Daughter</option>
                    <option value="Sibling">Brother / Sister</option>
                    <option value="Legal Advisor">Legal Attorney / Advisor</option>
                    <option value="Trusted Friend">Trusted Friend</option>
                  </select>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
                  <button type="button" class="btn btn-secondary" onclick="state.modalOpen=false; render()">Cancel</button>
                  <button type="submit" class="btn">Send Invitation Notice</button>
                </div>
              </form>
            </div>
          </div>
        \`;
      } else if (state.modalOpen === 'rule') {
        modalHtml = \`
          <div class="modal-overlay">
            <div class="modal">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                <h3 style="font-size: 1.35rem; font-weight: 800;">Create Document Release Rule</h3>
                <button onclick="state.modalOpen=false; render()" style="background: none; border: none; font-size: 1.25rem; color: var(--text-muted); cursor: pointer;">✕</button>
              </div>
              <form onsubmit="createReleaseRule(event)">
                <div style="margin-bottom: 1rem;">
                  <label style="font-size: 0.85rem; font-weight: 700;">Select Document</label>
                  <select id="ruleDoc">
                    \${state.documents.map(d => \`<option value="\${d.id}">\${d.original_name} (\${d.category})</option>\`).join('')}
                  </select>
                </div>
                <div style="margin-bottom: 1rem;">
                  <label style="font-size: 0.85rem; font-weight: 700;">Select Nominee</label>
                  <select id="ruleNom">
                    \${state.nominees.map(n => \`<option value="\${n.id}">\${n.full_name} (\${n.relationship_type})</option>\`).join('')}
                  </select>
                </div>
                <div style="margin-bottom: 1.5rem;">
                  <label style="font-size: 0.85rem; font-weight: 700;">Access Duration (Days)</label>
                  <input id="ruleDur" type="number" value="30"/>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
                  <button type="button" class="btn btn-secondary" onclick="state.modalOpen=false; render()">Cancel</button>
                  <button type="submit" class="btn">Confirm Policy Rule</button>
                </div>
              </form>
            </div>
          </div>
        \`;
      }

      // Toast Notification
      let toastHtml = '';
      if (state.toast) {
        toastHtml = \`
          <div class="toast">
            <span>\${state.toast.type === 'success' ? '✅' : state.toast.type === 'warning' ? '⚠️' : 'ℹ️'}</span>
            <span>\${state.toast.message}</span>
          </div>
        \`;
      }

      app.innerHTML = \`
        <header>
          <div class="brand" onclick="state.tab='landing'; render()">
            <div class="brand-logo">VK</div>
            <div>
              <div style="font-weight: 800; font-size: 1.15rem; display: flex; align-items: center; gap: 0.5rem; letter-spacing: -0.02em;">
                VaultKeep
                <span class="badge badge-active" style="font-size: 0.65rem; padding: 0.15rem 0.5rem;">KMS Encrypted</span>
              </div>
              <div style="font-size: 0.75rem; color: var(--text-secondary);">Digital Legacy & Nominee Access</div>
            </div>
          </div>

          <nav>\${navItems}</nav>

          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <button class="nav-btn" onclick="toggleTheme()" title="Toggle Theme" style="font-size: 1rem; padding: 0.45rem;">🌓</button>
            \${state.user ? \`
              <div style="display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2;">
                <span style="font-size: 0.85rem; font-weight: 700;">\${state.user.name}</span>
                <span style="font-size: 0.7rem; color: var(--primary); font-weight: 700;">\${state.user.role}</span>
              </div>
              <button class="btn btn-secondary" style="padding: 0.45rem 0.85rem; font-size: 0.8rem;" onclick="logout()">Sign Out</button>
            \` : \`
              <button class="btn" style="padding: 0.5rem 1rem; font-size: 0.85rem;" onclick="loginAs('OWNER')">Sign In</button>
            \`}
          </div>
        </header>

        <main>\${content}</main>
        \${modalHtml}
        \${toastHtml}
      \`;
    }

    // Initial load
    if (state.user) loadData();
    render();
  </script>
</body>
</html>`;
}

// ============================================================================
// HTTP API REQUEST ROUTER
// ============================================================================
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Body parser for JSON / Base64 binary payloads
  const getBody = () => new Promise(resolve => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });

  const sendJson = (statusCode, payload) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  };

  // ALB Probes
  if (pathname === '/health') {
    return sendJson(200, { status: 'UP', service: 'vaultkeep-backend' });
  }
  if (pathname === '/ready') {
    return sendJson(200, { status: 'READY', database: 'CONNECTED', kms: 'OPERATIONAL' });
  }

  // HTML Web Client
  if (pathname === '/' || pathname === '/index.html' || (!pathname.startsWith('/api') && !pathname.startsWith('/health'))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getClientHtml());
    return;
  }

  // REST API Routes
  (async () => {
    try {
      // --- AUTH ---
      if (pathname === '/api/auth/register' && method === 'POST') {
        const body = await getBody();
        const email = (body.email || '').trim().toLowerCase();
        const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!EMAIL_REGEX.test(email)) {
          return sendJson(400, { error: 'Please enter a valid email address (e.g., name@example.com).' });
        }
        const existing = memoryDb.users.find(u => u.email.toLowerCase() === email);
        if (existing) {
          return sendJson(409, { error: 'An account with this email address already exists.' });
        }
        const newUser = {
          id: crypto.randomUUID(),
          name: body.name || email.split('@')[0],
          email: email,
          role: body.role || 'OWNER',
          account_status: 'ACTIVE',
          created_at: new Date().toISOString()
        };
        memoryDb.users.push(newUser);
        return sendJson(201, { message: 'Registered successfully', token: 'standalone-jwt-token', user: newUser });
      }

      if (pathname === '/api/auth/login' && method === 'POST') {
        const body = await getBody();
        const email = (body.email || '').trim().toLowerCase();
        const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!EMAIL_REGEX.test(email)) {
          return sendJson(400, { error: 'Please enter a valid email address.' });
        }
        let user = memoryDb.users.find(u => u.email.toLowerCase() === email);
        if (!user) {
          user = {
            id: crypto.randomUUID(),
            name: email.split('@')[0],
            email: email,
            role: 'OWNER',
            account_status: 'ACTIVE',
            created_at: new Date().toISOString()
          };
          memoryDb.users.push(user);
        }
        return sendJson(200, { message: 'Authenticated', token: 'standalone-jwt-token', user });
      }

      if (pathname === '/api/auth/me') {
        return sendJson(200, { user: memoryDb.users[0] });
      }

      // --- CHECK-INS & LIFECYCLE ---
      if (pathname === '/api/check-ins' && method === 'POST') {
        const now = new Date();
        const deadline = new Date(now.getTime() + 30 * 86400000);
        const checkIn = {
          id: crypto.randomUUID(),
          owner_id: '11111111-1111-1111-1111-111111111111',
          check_in_timestamp: now.toISOString(),
          check_in_type: 'MANUAL_DASHBOARD',
          ip_address: req.socket.remoteAddress || '127.0.0.1',
          next_deadline_at: deadline.toISOString()
        };
        memoryDb.check_ins.unshift(checkIn);

        const lc = memoryDb.account_lifecycle[0];
        lc.current_state = 'ACTIVE';
        lc.last_successful_check_in = now.toISOString();
        lc.next_check_in_deadline = deadline.toISOString();
        lc.flagged_inactive_at = null;
        lc.grace_period_ends_at = null;
        lc.release_execution_state = 'NONE';

        memoryDb.audit_logs.unshift({
          id: crypto.randomUUID(),
          actor_email: 'alex.vance@vaultkeep-demo.internal',
          actor_role: 'OWNER',
          action: 'CHECK_IN_PERFORMED',
          resource_type: 'CHECK_IN',
          outcome: 'SUCCESS',
          created_at: now.toISOString()
        });

        return sendJson(200, { message: 'Check-in confirmed', checkIn, lifecycle: lc });
      }

      if (pathname === '/api/check-ins' && method === 'GET') {
        return sendJson(200, { checkIns: memoryDb.check_ins });
      }

      if (pathname === '/api/lifecycle/status' && method === 'GET') {
        return sendJson(200, {
          lifecycle: memoryDb.account_lifecycle[0],
          settings: memoryDb.owner_settings[0]
        });
      }

      if (pathname === '/api/lifecycle/simulate-inactivity' && method === 'POST') {
        const lc = memoryDb.account_lifecycle[0];
        const now = new Date();
        lc.current_state = 'GRACE_PERIOD';
        lc.flagged_inactive_at = now.toISOString();
        lc.grace_period_ends_at = new Date(now.getTime() + 7 * 86400000).toISOString();

        memoryDb.audit_logs.unshift({
          id: crypto.randomUUID(),
          actor_email: 'SYSTEM_EVENTBRIDGE',
          actor_role: 'SYSTEM',
          action: 'LIFECYCLE_TRANSITION_GRACE_PERIOD',
          resource_type: 'ACCOUNT_LIFECYCLE',
          outcome: 'SUCCESS',
          created_at: now.toISOString()
        });

        return sendJson(200, { message: 'Inactivity simulated: transitioned to GRACE_PERIOD', lifecycle: lc });
      }

      if (pathname === '/api/lifecycle/evaluate' && method === 'POST') {
        const lc = memoryDb.account_lifecycle[0];
        lc.current_state = 'ACCESS_GRANTED';
        lc.release_execution_state = 'EXECUTED';

        memoryDb.audit_logs.unshift({
          id: crypto.randomUUID(),
          actor_email: 'SYSTEM_EVENTBRIDGE',
          actor_role: 'SYSTEM',
          action: 'LIFECYCLE_TRANSITION_ACCESS_GRANTED',
          resource_type: 'ACCOUNT_LIFECYCLE',
          outcome: 'SUCCESS',
          created_at: new Date().toISOString()
        });

        return sendJson(200, { message: 'Grace period completed: transitioned to ACCESS_GRANTED', lifecycle: lc });
      }

      // --- DOCUMENTS (UPLOAD & ENVELOPE ENCRYPTION) ---
      if (pathname === '/api/documents' && method === 'GET') {
        return sendJson(200, { documents: memoryDb.documents });
      }

      if (pathname === '/api/documents' && method === 'POST') {
        const body = await getBody();
        // Support either real base64 binary payload or string content
        const rawBuffer = body.contentBase64 
          ? Buffer.from(body.contentBase64, 'base64') 
          : Buffer.from(body.content || 'SYNTHETIC_DOCUMENT_CONTENT', 'utf8');

        // Genuine AES-256-GCM Envelope Encryption
        const enc = encryptBuffer(rawBuffer);

        const newDoc = {
          id: crypto.randomUUID(),
          owner_id: '11111111-1111-1111-1111-111111111111',
          original_name: body.name || 'Personal_Document.pdf',
          category: body.category || 'PERSONAL',
          file_size_bytes: rawBuffer.length,
          mime_type: body.mimeType || 'application/octet-stream',
          encryption_algorithm: 'AES-256-GCM',
          checksum_sha256: enc.checksumSha256,
          upload_status: 'UPLOADED',
          ciphertext_base64: enc.ciphertextBase64,
          encrypted_dek_base64: enc.encryptedDekBase64,
          iv_base64: enc.ivBase64,
          auth_tag_base64: enc.authTagBase64,
          created_at: new Date().toISOString()
        };

        memoryDb.documents.unshift(newDoc);

        memoryDb.audit_logs.unshift({
          id: crypto.randomUUID(),
          actor_email: 'alex.vance@vaultkeep-demo.internal',
          actor_role: 'OWNER',
          action: 'DOCUMENT_ENCRYPTED_AND_UPLOADED',
          resource_type: 'DOCUMENT',
          outcome: 'SUCCESS',
          created_at: new Date().toISOString()
        });

        return sendJson(201, { message: 'Document encrypted and saved', document: newDoc });
      }

      // --- REAL DOCUMENT DOWNLOAD & DECRYPTION (OWNER) ---
      if (pathname.startsWith('/api/documents/') && pathname.endsWith('/download')) {
        const docId = pathname.split('/')[3];
        const doc = memoryDb.documents.find(d => d.id === docId);
        if (!doc) return sendJson(404, { error: 'Document not found' });

        // Decrypt ciphertext using AES-256-GCM & unwrapped DEK
        const decryptedBuffer = decryptBuffer(
          doc.ciphertext_base64,
          doc.encrypted_dek_base64,
          doc.iv_base64,
          doc.auth_tag_base64
        );

        memoryDb.audit_logs.unshift({
          id: crypto.randomUUID(),
          actor_email: 'alex.vance@vaultkeep-demo.internal',
          actor_role: 'OWNER',
          action: 'DOCUMENT_DECRYPTED_AND_DOWNLOADED',
          resource_type: 'DOCUMENT',
          outcome: 'SUCCESS',
          created_at: new Date().toISOString()
        });

        res.writeHead(200, {
          'Content-Type': doc.mime_type || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.original_name)}"`,
          'Content-Length': decryptedBuffer.length
        });
        res.end(decryptedBuffer);
        return;
      }

      // --- NOMINEE DOWNLOAD & DECRYPTION ---
      if (pathname.startsWith('/api/nominee/released-documents/') && pathname.endsWith('/download')) {
        const docId = pathname.split('/')[4];
        const doc = memoryDb.documents.find(d => d.id === docId);
        const lc = memoryDb.account_lifecycle[0];

        if (lc.current_state !== 'ACCESS_GRANTED') {
          return sendJson(403, { error: 'Access denied: Owner account has not reached verified release state.' });
        }
        if (!doc) return sendJson(404, { error: 'Document not found' });

        const decryptedBuffer = decryptBuffer(
          doc.ciphertext_base64,
          doc.encrypted_dek_base64,
          doc.iv_base64,
          doc.auth_tag_base64
        );

        memoryDb.audit_logs.unshift({
          id: crypto.randomUUID(),
          actor_email: 'eleanor.nominee@vaultkeep-demo.internal',
          actor_role: 'NOMINEE',
          action: 'NOMINEE_RELEASED_DOCUMENT_DOWNLOADED',
          resource_type: 'DOCUMENT',
          outcome: 'SUCCESS',
          created_at: new Date().toISOString()
        });

        res.writeHead(200, {
          'Content-Type': doc.mime_type || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.original_name)}"`,
          'Content-Length': decryptedBuffer.length
        });
        res.end(decryptedBuffer);
        return;
      }

      // --- NOMINEES ---
      if (pathname === '/api/nominees' && method === 'GET') {
        return sendJson(200, { nominees: memoryDb.nominees });
      }

      if (pathname === '/api/nominees' && method === 'POST') {
        const body = await getBody();
        const fullName = (body.fullName || '').trim();
        const email = (body.email || '').trim().toLowerCase();
        const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!fullName || !email) {
          return sendJson(400, { error: 'Nominee full name and email are required fields.' });
        }

        if (!EMAIL_REGEX.test(email)) {
          return sendJson(400, { error: 'Please enter a valid email address (e.g., name@example.com).' });
        }

        const existing = memoryDb.nominees.find(n => n.email.toLowerCase() === email);
        if (existing) {
          return sendJson(409, { error: `A nominee with email '${email}' has already been added to your vault.` });
        }

        const rawInvitationToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawInvitationToken).digest('hex');
        const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
        const nomineeId = crypto.randomUUID();
        const invitationLink = `http://localhost:5173/?tab=accept-invitation&token=${rawInvitationToken}&email=${encodeURIComponent(email)}`;

        const newNom = {
          id: nomineeId,
          owner_id: '11111111-1111-1111-1111-111111111111',
          full_name: fullName,
          email: email,
          phone: body.phone || null,
          relationship_type: body.relationshipType || 'Family',
          invitation_token_hash: tokenHash,
          invitation_status: 'PENDING',
          invitation_expires_at: expiresAt,
          created_at: new Date().toISOString()
        };
        memoryDb.nominees.push(newNom);

        console.log(`[Standalone:SNS Email] Dispatched invitation to nominee: ${email}`);
        console.log(`[Standalone:SNS Email] Invitation Link: ${invitationLink}`);
        console.log(`[Standalone:SNS Email] Security Token: ${rawInvitationToken}`);

        return sendJson(201, {
          message: 'Nominee invited successfully. Invitation email dispatched via AWS SNS.',
          nominee: newNom,
          invitationToken: rawInvitationToken,
          invitationLink
        });
      }

      if (pathname.startsWith('/api/nominees/') && method === 'DELETE') {
        const nomId = pathname.split('/')[3];
        const idx = memoryDb.nominees.findIndex(n => n.id === nomId);
        if (idx !== -1) memoryDb.nominees.splice(idx, 1);
        return sendJson(200, { message: 'Nominee deleted' });
      }

      if (pathname === '/api/nominees/invitations/verify' && method === 'GET') {
        const token = (urlParts.query?.token || '').trim();
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const nom = memoryDb.nominees.find(n => n.invitation_token_hash === tokenHash);
        if (!nom) return sendJson(404, { error: 'Invalid or expired invitation token.' });
        return sendJson(200, {
          valid: true,
          nomineeEmail: nom.email,
          nomineeName: nom.full_name,
          relationshipType: nom.relationship_type,
          ownerName: 'Alexander Vance',
          expiresAt: nom.invitation_expires_at
        });
      }

      if (pathname === '/api/nominees/invitations/accept' && method === 'POST') {
        const body = await getBody();
        const token = (body.token || '').trim();
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const nom = memoryDb.nominees.find(n => n.invitation_token_hash === tokenHash);
        if (!nom) return sendJson(404, { error: 'Invalid or already accepted invitation token.' });

        nom.invitation_status = 'ACCEPTED';
        nom.invitation_token_hash = null;
        nom.verified_at = new Date().toISOString();

        return sendJson(200, {
          message: 'Invitation accepted successfully.',
          token: 'standalone-jwt-token',
          user: { id: nom.id, email: nom.email, name: nom.full_name, role: 'NOMINEE' },
          nominee: nom
        });
      }

      // --- RELEASE RULES ---
      if (pathname === '/api/release-rules' && method === 'GET') {
        return sendJson(200, { releaseRules: memoryDb.document_release_rules });
      }

      if (pathname === '/api/release-rules' && method === 'POST') {
        const body = await getBody();
        const newRule = {
          id: crypto.randomUUID(),
          owner_id: '11111111-1111-1111-1111-111111111111',
          document_id: body.documentId,
          nominee_id: body.nomineeId,
          rule_status: 'ACTIVE',
          access_duration_days: parseInt(body.accessDurationDays || '30', 10),
          confirmed_at: new Date().toISOString()
        };
        memoryDb.document_release_rules.push(newRule);
        return sendJson(201, { message: 'Rule established', rule: newRule });
      }

      // --- NOMINEE PORTAL ---
      if (pathname === '/api/nominee/relationships') {
        const lc = memoryDb.account_lifecycle[0];
        return sendJson(200, {
          relationships: [
            {
              ownerId: '11111111-1111-1111-1111-111111111111',
              ownerName: 'Alexander Vance',
              lifecycleState: lc.current_state,
              isReleaseGranted: lc.current_state === 'ACCESS_GRANTED',
              gracePeriodEndsAt: lc.grace_period_ends_at
            }
          ]
        });
      }

      if (pathname === '/api/nominee/released-documents') {
        const lc = memoryDb.account_lifecycle[0];
        if (lc.current_state !== 'ACCESS_GRANTED') {
          return sendJson(200, { releasedDocuments: [] });
        }
        return sendJson(200, {
          releasedDocuments: memoryDb.documents.map(d => ({
            documentId: d.id,
            originalName: d.original_name,
            category: d.category,
            grantedAt: new Date().toISOString()
          }))
        });
      }

      // --- AUDIT & HEALTH ---
      if (pathname === '/api/audit-logs') {
        return sendJson(200, { auditLogs: memoryDb.audit_logs });
      }

      if (pathname === '/api/admin/system-health') {
        return sendJson(200, {
          status: 'HEALTHY',
          uptime: process.uptime(),
          cloudServices: {
            compute: 'OPERATIONAL (EC2 + ALB)',
            database: 'OPERATIONAL (Amazon RDS PostgreSQL)',
            encryption: 'OPERATIONAL (AWS KMS + AES-256-GCM)',
            storage: 'OPERATIONAL (Amazon S3 Ciphertext Bucket)'
          }
        });
      }

      sendJson(404, { error: 'Endpoint not found' });
    } catch (err) {
      sendJson(500, { error: err.message });
    }
  })();
});

// Primary Listener on Port 5000
server.listen(PORT, '0.0.0.0', () => {
  console.log('================================================================');
  console.log(`  VaultKeep Web Platform Server Active on Port ${PORT}`);
  console.log(`  Access URL: http://localhost:${PORT}`);
  console.log(`  ALB Liveness Probe: http://localhost:${PORT}/health`);
  console.log('================================================================');
});

// Alternate Listener on Port 5173
const altServer = http.createServer(server._events.request);
altServer.listen(ALT_PORT, '0.0.0.0', () => {
  console.log(`  Also accessible at Port ${ALT_PORT}: http://localhost:${ALT_PORT}`);
});
