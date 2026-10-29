import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Shield, Moon, Sun, LogOut, User as UserIcon, Bell, FileText, Users, Clock, Settings, LayoutDashboard } from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onTabChange }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const handleBrandClick = () => {
    if (!user) {
      onTabChange('landing');
      return;
    }
    if (user.role === 'NOMINEE') {
      onTabChange('nominee-dashboard');
    } else if (user.role === 'ADMIN') {
      onTabChange('admin-dashboard');
    } else {
      onTabChange('dashboard');
    }
  };

  const handleLogout = () => {
    logout();
    onTabChange('login');
  };

  return (
    <header style={{
      backgroundColor: 'var(--bg-card)',
      borderBottom: '1px solid var(--border-color)',
      position: 'sticky',
      top: 0,
      zIndex: 40,
      padding: '0.75rem 1.5rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: 'var(--shadow-sm)'
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} onClick={handleBrandClick}>
        <div style={{
          backgroundColor: 'var(--primary)',
          color: '#fff',
          borderRadius: 'var(--radius-md)',
          padding: '0.45rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Shield size={22} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.15rem', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            VaultKeep
            <span style={{
              fontSize: '0.65rem',
              backgroundColor: 'var(--trust-teal-light)',
              color: 'var(--trust-teal)',
              padding: '0.15rem 0.45rem',
              borderRadius: 'var(--radius-full)',
              fontWeight: 600,
              textTransform: 'uppercase'
            }}>KMS Encrypted</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cloud Digital Legacy & Nominee Access</div>
        </div>
      </div>

      {/* Navigation Links for Authenticated Users */}
      {user && (
        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {user.role === 'OWNER' && (
            <>
              <NavButton active={currentTab === 'dashboard'} onClick={() => onTabChange('dashboard')} icon={<LayoutDashboard size={16} />} label="Dashboard" />
              <NavButton active={currentTab === 'vault'} onClick={() => onTabChange('vault')} icon={<FileText size={16} />} label="Encrypted Vault" />
              <NavButton active={currentTab === 'nominees'} onClick={() => onTabChange('nominees')} icon={<Users size={16} />} label="Nominees" />
              <NavButton active={currentTab === 'lifecycle'} onClick={() => onTabChange('lifecycle')} icon={<Clock size={16} />} label="Inactivity Policy" />
              <NavButton active={currentTab === 'rules'} onClick={() => onTabChange('rules')} icon={<Shield size={16} />} label="Release Rules" />
              <NavButton active={currentTab === 'audit'} onClick={() => onTabChange('audit')} icon={<Bell size={16} />} label="Audit Trail" />
            </>
          )}

          {user.role === 'NOMINEE' && (
            <>
              <NavButton active={currentTab === 'nominee-dashboard'} onClick={() => onTabChange('nominee-dashboard')} icon={<LayoutDashboard size={16} />} label="Nominee Portal" />
              <NavButton active={currentTab === 'released-docs'} onClick={() => onTabChange('released-docs')} icon={<FileText size={16} />} label="Released Documents" />
              <NavButton active={currentTab === 'nominee-history'} onClick={() => onTabChange('nominee-history')} icon={<Bell size={16} />} label="Access History" />
            </>
          )}

          {user.role === 'ADMIN' && (
            <>
              <NavButton active={currentTab === 'admin-dashboard'} onClick={() => onTabChange('admin-dashboard')} icon={<LayoutDashboard size={16} />} label="System Overview" />
              <NavButton active={currentTab === 'admin-audit'} onClick={() => onTabChange('admin-audit')} icon={<Bell size={16} />} label="Security Events" />
            </>
          )}
        </nav>
      )}

      {/* Right Action Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-main)',
            borderRadius: 'var(--radius-md)',
            padding: '0.45rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              lineHeight: 1.2
            }}>
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{user.name}</span>
              <span style={{
                fontSize: '0.7rem',
                color: user.role === 'OWNER' ? 'var(--primary)' : user.role === 'NOMINEE' ? 'var(--trust-teal)' : 'var(--warning)',
                fontWeight: 600
              }}>
                {user.role} ROLE
              </span>
            </div>
            <button
              onClick={handleLogout}
              title="Sign Out"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                color: 'var(--danger)',
                borderRadius: 'var(--radius-md)',
                padding: '0.45rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => onTabChange('login')}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
                padding: '0.45rem 0.9rem',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              Sign In
            </button>
            <button
              onClick={() => onTabChange('register')}
              style={{
                background: 'var(--primary)',
                border: 'none',
                color: '#fff',
                padding: '0.45rem 0.9rem',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              Register
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({
  active,
  onClick,
  icon,
  label
}) => (
  <button
    onClick={onClick}
    style={{
      background: active ? 'var(--primary-light)' : 'transparent',
      color: active ? 'var(--primary)' : 'var(--text-secondary)',
      border: 'none',
      borderRadius: 'var(--radius-md)',
      padding: '0.45rem 0.75rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.4rem',
      fontWeight: active ? 600 : 500,
      fontSize: '0.85rem',
      cursor: 'pointer',
      transition: 'all 0.15s ease'
    }}
  >
    {icon}
    <span>{label}</span>
  </button>
);
