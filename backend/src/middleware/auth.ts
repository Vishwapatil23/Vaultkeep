import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query, memoryDb } from '../db';
import { AuditService } from '../services/auditService';

const JWT_SECRET = process.env.JWT_SECRET || 'vaultkeep_jwt_super_secure_dev_secret_key_2026_x89a';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'OWNER' | 'NOMINEE' | 'ADMIN';
  name: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access denied. Missing bearer authorization token.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    
    // Query live database first
    let user: any = null;
    try {
      const result = await query('SELECT id, name, email, role, account_status FROM users WHERE id = $1', [decoded.id]);
      if (result.rows && result.rows.length > 0) {
        user = result.rows[0];
      }
    } catch {
      // Fallback to memory store if query unavailable
      user = memoryDb.users.find(u => u.id === decoded.id);
    }

    if (!user) {
      user = memoryDb.users.find(u => u.id === decoded.id);
    }

    if (!user || user.account_status !== 'ACTIVE') {
      res.status(403).json({ error: 'Account is deactivated or does not exist.' });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    };
    next();
  } catch (err: any) {
    AuditService.recordSecurityEvent('INVALID_TOKEN_ATTEMPT', 'UNKNOWN', { error: err.message }, req.ip, req.headers['user-agent']);
    res.status(401).json({ error: 'Invalid, malformed, or expired token.' });
  }
};

export const requireRole = (allowedRoles: ('OWNER' | 'NOMINEE' | 'ADMIN')[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      AuditService.recordSecurityEvent(
        'UNAUTHORIZED_ROLE_ACCESS',
        req.user?.email || 'ANONYMOUS',
        { required: allowedRoles, actual: req.user?.role },
        req.ip,
        req.headers['user-agent']
      );
      res.status(403).json({ error: 'Forbidden: Insufficient privileges for this operation.' });
      return;
    }
    next();
  };
};
