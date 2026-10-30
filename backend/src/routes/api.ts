import { Router } from 'express';
import multer from 'multer';
import { AuthController } from '../controllers/authController';
import { DocumentController } from '../controllers/documentController';
import { NomineeController } from '../controllers/nomineeController';
import { ReleaseRuleController } from '../controllers/releaseRuleController';
import { LifecycleController } from '../controllers/lifecycleController';
import { AdminController } from '../controllers/adminController';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max
});

// ================= AUTHENTICATION =================
router.post('/auth/register', AuthController.register);
router.post('/auth/login', AuthController.login);
router.get('/auth/me', authenticateToken, AuthController.me);
router.post('/auth/logout', authenticateToken, AuthController.logout);
router.get('/auth/registered-users', AuthController.getRegisteredUsers);

// ================= INVITATIONS (PUBLIC / NOMINEE) =================
router.get('/nominees/invitations/verify', NomineeController.verifyInvitationToken);
router.post('/nominees/invitations/accept', NomineeController.acceptInvitation);

// ================= DOCUMENTS (OWNER) =================
router.get('/documents', authenticateToken, requireRole(['OWNER']), DocumentController.getDocuments);
router.post('/documents', authenticateToken, requireRole(['OWNER']), upload.single('file'), DocumentController.uploadDocument);
router.get('/documents/:id/download', authenticateToken, requireRole(['OWNER']), DocumentController.downloadDocument);
router.delete('/documents/:id', authenticateToken, requireRole(['OWNER']), DocumentController.deleteDocument);

// ================= NOMINEE MANAGEMENT (OWNER) =================
router.get('/nominees', authenticateToken, requireRole(['OWNER']), NomineeController.getNominees);
router.post('/nominees', authenticateToken, requireRole(['OWNER']), NomineeController.addNominee);
router.delete('/nominees/:id', authenticateToken, requireRole(['OWNER']), NomineeController.deleteNominee);
router.post('/nominees/:id/check-sns-confirmation', authenticateToken, requireRole(['OWNER']), NomineeController.checkSnsConfirmation);

// ================= RELEASE RULES (OWNER) =================
router.get('/release-rules', authenticateToken, requireRole(['OWNER']), ReleaseRuleController.getRules);
router.post('/release-rules', authenticateToken, requireRole(['OWNER']), ReleaseRuleController.createRule);
router.delete('/release-rules/:id', authenticateToken, requireRole(['OWNER']), ReleaseRuleController.deleteRule);

// ================= CHECK-INS & LIFECYCLE (OWNER) =================
router.post('/check-ins', authenticateToken, requireRole(['OWNER']), LifecycleController.performCheckIn);
router.get('/check-ins', authenticateToken, requireRole(['OWNER']), LifecycleController.getCheckIns);
router.get('/lifecycle/status', authenticateToken, LifecycleController.getStatus);
router.patch('/lifecycle/policy', authenticateToken, requireRole(['OWNER']), LifecycleController.updatePolicy);
router.post('/lifecycle/evaluate', authenticateToken, LifecycleController.evaluateInactivity);
router.post('/lifecycle/simulate-inactivity', authenticateToken, requireRole(['OWNER']), LifecycleController.simulateInactivity);

// ================= NOMINEE PORTAL (NOMINEE ROLE) =================
router.get('/nominee/relationships', authenticateToken, NomineeController.getNomineeRelationships);
router.get('/nominee/released-documents', authenticateToken, NomineeController.getReleasedDocuments);
router.get('/nominee/released-documents/:id/download', authenticateToken, NomineeController.downloadReleasedDocument);
router.get('/nominee/access-history', authenticateToken, NomineeController.getNomineeAccessHistory);

// ================= NOTIFICATIONS & AUDIT =================
router.get('/notifications', authenticateToken, AdminController.getNotifications);
router.get('/audit-logs', authenticateToken, AdminController.getAuditLogs);
router.get('/admin/system-health', AdminController.getSystemHealth);
router.get('/admin/database-view', authenticateToken, requireRole(['ADMIN']), AdminController.getDatabaseView);

export default router;
