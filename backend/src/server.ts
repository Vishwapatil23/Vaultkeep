import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import apiRouter from './routes/api';
import { AdminController } from './controllers/adminController';
import { LifecycleService } from './services/lifecycleService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// 1. Security Headers & CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : [CORS_ORIGIN, 'http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
}));

// 2. Logging & Parsers
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. Rate Limiting on Authentication Endpoints (Brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts from this IP. Please try again after 15 minutes.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// 4. Load Balancer Health & Readiness Probes (ALB Target Group Probes)
app.get('/health', AdminController.liveness);
app.get('/ready', AdminController.readiness);

// 5. Mount API Routes
app.use('/api', apiRouter);

// 6. 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Path not found: ${req.method} ${req.originalUrl}` });
});

// 7. Centralized Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[Unhandled Server Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error occurred.',
    correlationId: req.headers['x-correlation-id'] || undefined
  });
});

// 8. Automated Background Inactivity Worker (Local simulation of Amazon EventBridge scheduled rule)
if (process.env.NODE_ENV !== 'test') {
  const SCHEDULER_INTERVAL_MS = 60 * 1000; // Evaluate every 60 seconds
  setInterval(async () => {
    try {
      await LifecycleService.evaluateInactivityEngine();
    } catch (err: any) {
      console.error('[EventBridge Simulation Worker Error]', err.message);
    }
  }, SCHEDULER_INTERVAL_MS);
}

// Start Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  VaultKeep API Backend Server running on port ${PORT}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  KMS Encryption: AWS KMS & AES-256-GCM Envelope Encryption`);
    console.log(`  Health Check URL: http://localhost:${PORT}/health`);
    console.log(`=======================================================`);
  });
}

export default app;
