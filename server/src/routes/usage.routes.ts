import { Router, type Router as RouterType } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { usageService } from '../services/usage.service';

const router: RouterType = Router();

// GET /api/usage
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const usage = await usageService.getCurrentUsage(userId);
    res.json(usage);
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message } });
  }
});

export default router;
