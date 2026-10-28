import React from 'react';

export interface BadgeProps {
  status: string;
  label?: string;
}

export const StatusBadge: React.FC<BadgeProps> = ({ status, label }) => {
  const displayLabel = label || status;
  let bg = 'var(--bg-surface)';
  let color = 'var(--text-secondary)';

  switch (status.toUpperCase()) {
    case 'ACTIVE':
    case 'ACCEPTED':
    case 'SUCCESS':
    case 'UPLOADED':
    case 'UP':
    case 'READY':
      bg = 'var(--success-bg)';
      color = 'var(--success)';
      break;

    case 'GRACE_PERIOD':
    case 'CHECK_IN_DUE':
    case 'WARNING':
    case 'PENDING':
    case 'INACTIVE_PENDING':
      bg = 'var(--warning-bg)';
      color = 'var(--warning)';
      break;

    case 'ACCESS_GRANTED':
      bg = 'var(--trust-teal-light)';
      color = 'var(--trust-teal)';
      break;

    case 'FAILED':
    case 'DENIED':
    case 'REVOKED':
    case 'DELETED':
    case 'SUSPENDED':
      bg = 'var(--danger-bg)';
      color = 'var(--danger)';
      break;

    default:
      bg = 'var(--bg-surface)';
      color = 'var(--text-secondary)';
      break;
  }

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.35rem',
      backgroundColor: bg,
      color: color,
      padding: '0.2rem 0.6rem',
      borderRadius: 'var(--radius-full)',
      fontSize: '0.75rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.03em'
    }}>
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: color
      }} />
      {displayLabel}
    </span>
  );
};
