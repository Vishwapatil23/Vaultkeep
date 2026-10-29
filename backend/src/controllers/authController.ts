import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { memoryDb, saveMemoryDb } from '../db';
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

    const existing = memoryDb.users.find(u => u.email.toLowerCase() === normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'An account with this email address already exists.' });
      return;
    }

    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
    const password_hash = await bcrypt.hash(password, saltRounds);
    const userId = uuidv4();
    const now = new Date();

    const newUser = {
      id: userId,
      name,
      email: normalizedEmail,
      password_hash,
      role: role.toUpperCase() === 'NOMINEE' ? 'NOMINEE' : role.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'OWNER',
      account_status: 'ACTIVE',
      contact_verified: true,
      last_check_in_at: now.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };
    memoryDb.users.push(newUser);

    // If owner, set up default settings and initial lifecycle
    if (newUser.role === 'OWNER') {
      const intervalDays = parseInt(process.env.DEFAULT_CHECK_IN_INTERVAL_DAYS || '30', 10);
      const graceDays = parseInt(process.env.DEFAULT_GRACE_PERIOD_DAYS || '7', 10);
      const warningDays = parseInt(process.env.DEFAULT_WARNING_DAYS || '5', 10);

      memoryDb.owner_settings.push({
        id: uuidv4(),
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

      const nextDeadline = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
      memoryDb.account_lifecycle.push({
        id: uuidv4(),
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

    // Check if user was registered as a pending nominee and link them
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
      actorRole: newUser.role,
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
      message: 'Account registered successfully.',
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

    const user = memoryDb.users.find(u => u.email.toLowerCase() === normalizedEmail);

    if (!user) {
      await AuditService.recordSecurityEvent(
        'LOGIN_FAILURE_USER_NOT_FOUND',
        normalizedEmail,
        { reason: 'User not found' },
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
    const user = memoryDb.users.find(u => u.id === req.user?.id);
    if (!user) {
      res.status(404).json({ error: 'User profile not found.' });
      return;
    }

    const settings = memoryDb.owner_settings.find(s => s.owner_id === user.id);
    const lifecycle = memoryDb.account_lifecycle.find(l => l.owner_id === user.id);

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
