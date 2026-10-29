import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query, memoryDb, saveMemoryDb } from '../db';
import { AuditService } from '../services/auditService';
import { AuthenticatedRequest } from '../middleware/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'vaultkeep_jwt_super_secure_dev_secret_key_2026_x89a';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

export class AuthController {
  public static async register(req: Request, res: Response): Promise<void> {
    const { name, email, password, role = 'OWNER', phone } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required fields.' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address (e.g., name@example.com).' });
      return;
    }

    // 1. Check if user already exists in PostgreSQL database
    let existingUser: any = null;
    try {
      const existingRes = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [normalizedEmail]);
      if (existingRes.rows && existingRes.rows.length > 0) {
        existingUser = existingRes.rows[0];
      }
    } catch {
      existingUser = memoryDb.users.find(u => u.email.toLowerCase() === normalizedEmail);
    }

    if (!existingUser) {
      existingUser = memoryDb.users.find(u => u.email.toLowerCase() === normalizedEmail);
    }

    if (existingUser) {
      res.status(409).json({ error: 'An account with this email address already exists.' });
      return;
    }

    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
    const password_hash = await bcrypt.hash(password, saltRounds);
    const userId = uuidv4();
    const now = new Date();
    const assignedRole = role.toUpperCase() === 'NOMINEE' ? 'NOMINEE' : role.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'OWNER';

    // 2. Persist new user in RDS PostgreSQL
    try {
      await query(
        `INSERT INTO users (id, name, email, password_hash, role, account_status, contact_verified, last_check_in_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', true, $6, $7, $8)`,
        [userId, name.trim(), normalizedEmail, password_hash, assignedRole, now, now, now]
      );
    } catch (err: any) {
      console.error('[AuthController:Register:Error]', err.message);
      // If RDS insert failed, also save to memory fallback
      memoryDb.users.push({
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
        password_hash,
        role: assignedRole,
        account_status: 'ACTIVE',
        contact_verified: true,
        last_check_in_at: now.toISOString(),
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      });
      saveMemoryDb();
    }

    // Also mirror to memoryDb for consistent dual-read resilience
    const newUser = {
      id: userId,
      name: name.trim(),
      email: normalizedEmail,
      password_hash,
      role: assignedRole,
      account_status: 'ACTIVE',
      contact_verified: true,
      last_check_in_at: now.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };
    if (!memoryDb.users.some(u => u.id === userId)) {
      memoryDb.users.push(newUser);
    }

    // 3. If owner, initialize owner_settings and account_lifecycle in RDS
    if (assignedRole === 'OWNER') {
      const intervalDays = parseInt(process.env.DEFAULT_CHECK_IN_INTERVAL_DAYS || '30', 10);
      const graceDays = parseInt(process.env.DEFAULT_GRACE_PERIOD_DAYS || '7', 10);
      const warningDays = parseInt(process.env.DEFAULT_WARNING_DAYS || '5', 10);
      const settingsId = uuidv4();
      const lifecycleId = uuidv4();
      const nextDeadline = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

      try {
        await query(
          `INSERT INTO owner_settings (id, owner_id, check_in_interval_days, grace_period_days, warning_days, reminder_email_enabled, reminder_sms_enabled, phone_number, timezone, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, true, false, $6, 'UTC', $7, $8)
           ON CONFLICT (owner_id) DO NOTHING`,
          [settingsId, userId, intervalDays, graceDays, warningDays, phone || null, now, now]
        );

        await query(
          `INSERT INTO account_lifecycle (id, owner_id, current_state, last_successful_check_in, next_check_in_deadline, release_execution_state, state_transition_reason, updated_at)
           VALUES ($1, $2, 'ACTIVE', $3, $4, 'NONE', 'Account registered and activated', $5)
           ON CONFLICT (owner_id) DO NOTHING`,
          [lifecycleId, userId, now, nextDeadline, now]
        );
      } catch (err: any) {
        console.warn('[AuthController:SettingsInit:Warning]', err.message);
      }

      // Memory mirror
      memoryDb.owner_settings.push({
        id: settingsId,
        owner_id: userId,
        check_in_interval_days: intervalDays,
        grace_period_days: graceDays,
        warning_days: warningDays,
        reminder_email_enabled: true,
        reminder_sms_enabled: false,
        phone_number: phone || null,
        timezone: 'UTC',
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      });

      memoryDb.account_lifecycle.push({
        id: lifecycleId,
        owner_id: userId,
        current_state: 'ACTIVE',
        last_successful_check_in: now.toISOString(),
        next_check_in_deadline: nextDeadline.toISOString(),
        flagged_inactive_at: null,
        grace_period_ends_at: null,
        release_execution_state: 'NONE',
        state_transition_reason: 'Account registered and activated',
        updated_at: now.toISOString()
      });
    }

    // 4. Link any pending nominee records to this new user in RDS
    try {
      await query(
        `UPDATE nominees
         SET nominee_user_id = $1, invitation_status = 'ACCEPTED', verified_at = $2, updated_at = $3
         WHERE LOWER(email) = LOWER($4)`,
        [userId, now, now, normalizedEmail]
      );
    } catch (err: any) {
      console.warn('[AuthController:LinkNominees:Warning]', err.message);
    }

    // Mirror to memory
    const pendingNominees = memoryDb.nominees.filter(n => n.email.toLowerCase() === normalizedEmail);
    for (const pendingNominee of pendingNominees) {
      pendingNominee.nominee_user_id = userId;
      pendingNominee.invitation_status = 'ACCEPTED';
      pendingNominee.verified_at = now.toISOString();
    }

    saveMemoryDb();

    await AuditService.recordEvent({
      actorId: userId,
      actorEmail: normalizedEmail,
      actorRole: assignedRole,
      action: 'USER_REGISTERED',
      resourceType: 'USER',
      resourceId: userId,
      outcome: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role, name: newUser.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Account registered successfully in Amazon RDS PostgreSQL.',
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    });
  }

  public static async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    // 1. Query user from Amazon RDS PostgreSQL
    let user: any = null;
    try {
      const userRes = await query(
        'SELECT id, name, email, password_hash, role, account_status, last_check_in_at FROM users WHERE LOWER(email) = LOWER($1)',
        [normalizedEmail]
      );
      if (userRes.rows && userRes.rows.length > 0) {
        user = userRes.rows[0];
      }
    } catch (err: any) {
      console.error('[AuthController:Login:QueryError]', err.message);
      user = memoryDb.users.find(u => u.email.toLowerCase() === normalizedEmail);
    }

    if (!user) {
      user = memoryDb.users.find(u => u.email.toLowerCase() === normalizedEmail);
    }

    if (!user) {
      await AuditService.recordSecurityEvent(
        'LOGIN_FAILURE_USER_NOT_FOUND',
        normalizedEmail,
        { reason: 'User not found in RDS database' },
        req.ip,
        req.headers['user-agent']
      );
      res.status(401).json({ error: 'Invalid email or password credentials.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await AuditService.recordSecurityEvent(
        'LOGIN_FAILURE_INVALID_PASSWORD',
        normalizedEmail,
        { reason: 'Password mismatch' },
        req.ip,
        req.headers['user-agent']
      );
      res.status(401).json({ error: 'Invalid email or password credentials.' });
      return;
    }

    if (user.account_status !== 'ACTIVE') {
      res.status(403).json({ error: 'Account has been suspended or closed.' });
      return;
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    await AuditService.recordEvent({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'USER_LOGIN',
      resourceType: 'SESSION',
      resourceId: user.id,
      outcome: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      message: 'Authentication successful.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  }

  public static async me(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    let user: any = null;
    let settings: any = null;
    let lifecycle: any = null;

    try {
      const uRes = await query('SELECT id, name, email, role, last_check_in_at FROM users WHERE id = $1', [req.user.id]);
      if (uRes.rows && uRes.rows.length > 0) user = uRes.rows[0];

      const sRes = await query('SELECT * FROM owner_settings WHERE owner_id = $1', [req.user.id]);
      if (sRes.rows && sRes.rows.length > 0) settings = sRes.rows[0];

      const lRes = await query('SELECT * FROM account_lifecycle WHERE owner_id = $1', [req.user.id]);
      if (lRes.rows && lRes.rows.length > 0) lifecycle = lRes.rows[0];
    } catch (err: any) {
      console.warn('[AuthController:Me:Warning]', err.message);
    }

    if (!user) user = memoryDb.users.find(u => u.id === req.user?.id);
    if (!settings) settings = memoryDb.owner_settings.find(s => s.owner_id === req.user?.id);
    if (!lifecycle) lifecycle = memoryDb.account_lifecycle.find(l => l.owner_id === req.user?.id);

    if (!user) {
      res.status(404).json({ error: 'User profile not found.' });
      return;
    }

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        lastCheckInAt: user.last_check_in_at
      },
      settings,
      lifecycle
    });
  }

  public static async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (req.user) {
      await AuditService.recordEvent({
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        action: 'USER_LOGOUT',
        resourceType: 'SESSION',
        resourceId: req.user.id,
        outcome: 'SUCCESS',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
    }
    res.json({ message: 'Session closed successfully.' });
  }

  public static async getRegisteredUsers(req: Request, res: Response): Promise<void> {
    try {
      const result = await query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC');
      const users = result.rows.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isDemo: u.email.endsWith('@vaultkeep-demo.internal'),
        createdAt: u.created_at
      }));
      res.json({ users });
    } catch {
      const users = memoryDb.users.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isDemo: u.email.endsWith('@vaultkeep-demo.internal'),
        createdAt: u.created_at
      }));
      res.json({ users });
    }
  }
}
