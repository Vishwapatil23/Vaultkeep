const API_BASE = '/api';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('vaultkeep_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(endpoint: string, options: RequestInit = {}): Promise<any> {
  const headers = {
    ...getAuthHeader(),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401 && !endpoint.includes('/auth/login')) {
    localStorage.removeItem('vaultkeep_token');
    localStorage.removeItem('vaultkeep_user');
    window.dispatchEvent(new Event('auth-expired'));
  }

  if (!response.ok) {
    let errorMsg = 'An error occurred';
    try {
      const errJson = await response.json();
      errorMsg = errJson.error || errorMsg;
    } catch {
      errorMsg = await response.text() || errorMsg;
    }
    throw new Error(errorMsg);
  }

  // Handle file downloads
  const disposition = response.headers.get('Content-Disposition');
  if (disposition && disposition.includes('attachment')) {
    const blob = await response.blob();
    return blob;
  }

  return response.json();
}

export const api = {
  // Auth
  login: (data: any) => request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  register: (data: any) => request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  getMe: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),

  // Check-ins & Lifecycle
  performCheckIn: () => request('/check-ins', { method: 'POST' }),
  getCheckIns: () => request('/check-ins'),
  getLifecycleStatus: () => request('/lifecycle/status'),
  updateLifecyclePolicy: (data: any) => request('/lifecycle/policy', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  evaluateInactivity: () => request('/lifecycle/evaluate', { method: 'POST' }),
  simulateInactivity: () => request('/lifecycle/simulate-inactivity', { method: 'POST' }),

  // Documents
  getDocuments: () => request('/documents'),
  uploadDocument: (formData: FormData) => request('/documents', {
    method: 'POST',
    body: formData
  }),
  downloadDocument: async (id: string, originalName: string) => {
    const blob = await request(`/documents/${id}/download`);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = originalName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },
  deleteDocument: (id: string) => request(`/documents/${id}`, { method: 'DELETE' }),

  // Nominees
  getNominees: () => request('/nominees'),
  addNominee: (data: any) => request('/nominees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteNominee: (id: string) => request(`/nominees/${id}`, { method: 'DELETE' }),
  acceptInvitation: (token: string) => request('/nominees/invitations/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  }),

  // Release Rules
  getReleaseRules: () => request('/release-rules'),
  createReleaseRule: (data: any) => request('/release-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteReleaseRule: (id: string) => request(`/release-rules/${id}`, { method: 'DELETE' }),

  // Nominee Portal
  getNomineeRelationships: () => request('/nominee/relationships'),
  getReleasedDocuments: () => request('/nominee/released-documents'),
  downloadReleasedDocument: async (documentId: string, originalName: string) => {
    const blob = await request(`/nominee/released-documents/${documentId}/download`);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = originalName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },
  getNomineeAccessHistory: () => request('/nominee/access-history'),

  // Notifications & Audit
  getNotifications: () => request('/notifications'),
  getAuditLogs: (limit = 100) => request(`/audit-logs?limit=${limit}`),
  getSystemHealth: () => request('/admin/system-health')
};
