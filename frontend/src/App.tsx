import React, { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { Navbar } from './components/Navbar';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { OwnerDashboard } from './pages/OwnerDashboard';
import { DocumentVault } from './pages/DocumentVault';
import { NomineeDirectory } from './pages/NomineeDirectory';
import { InactivityPolicyPage } from './pages/InactivityPolicyPage';
import { ReleaseRuleEditor } from './pages/ReleaseRuleEditor';
import { NomineePortal } from './pages/NomineePortal';
import { AuditLogView } from './pages/AuditLogView';
import { AdminDashboard } from './pages/AdminDashboard';

export const App: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-app)',
        color: 'var(--text-secondary)'
      }}>
        Initializing VaultKeep Security Environment...
      </div>
    );
  }

  // If user is not authenticated
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Navbar currentTab={currentTab} onTabChange={setCurrentTab} />
        <main style={{ flex: 1 }}>
          {currentTab === 'login' ? (
            <LoginPage onNavigate={setCurrentTab} />
          ) : currentTab === 'register' ? (
            <RegisterPage onNavigate={setCurrentTab} />
          ) : (
            <LandingPage onNavigate={setCurrentTab} />
          )}
        </main>
      </div>
    );
  }

  // Authenticated View
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar currentTab={currentTab} onTabChange={setCurrentTab} />
      <main style={{ flex: 1, paddingBottom: '3rem' }}>
        {/* Owner Pages */}
        {user.role === 'OWNER' && (
          <>
            {currentTab === 'dashboard' && <OwnerDashboard onNavigate={setCurrentTab} />}
            {currentTab === 'vault' && <DocumentVault />}
            {currentTab === 'nominees' && <NomineeDirectory />}
            {currentTab === 'lifecycle' && <InactivityPolicyPage />}
            {currentTab === 'rules' && <ReleaseRuleEditor />}
            {currentTab === 'audit' && <AuditLogView />}
          </>
        )}

        {/* Nominee Pages */}
        {user.role === 'NOMINEE' && (
          <>
            {currentTab === 'nominee-dashboard' && <NomineePortal activeSubTab="dashboard" />}
            {currentTab === 'released-docs' && <NomineePortal activeSubTab="docs" />}
            {currentTab === 'nominee-history' && <NomineePortal activeSubTab="history" />}
          </>
        )}

        {/* Admin Pages */}
        {user.role === 'ADMIN' && (
          <>
            {currentTab === 'admin-dashboard' && <AdminDashboard />}
            {currentTab === 'admin-audit' && <AuditLogView />}
          </>
        )}
      </main>
    </div>
  );
};
