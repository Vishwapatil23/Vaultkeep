import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db';
import { AuditService } from '../services/auditService';

if (!process.env.JWT_SECRET) {
  throw new Error('[Security Configuration Error] Missing required JWT_SECRET environment variable.');
}
const JWT_SECRET: string = process.env.JWT_SECRET;

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
    
    // Query live PostgreSQL database
    const result = await query('SELECT id, name, email, role, account_status FROM users WHERE id = $1', [decoded.id]);
    const user = result.rows && result.rows.length > 0 ? result.rows[0] : null;

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
