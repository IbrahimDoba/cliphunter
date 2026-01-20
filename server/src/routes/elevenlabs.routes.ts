import { Router, type Router as RouterType } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
// ElevenLabs service will be imported once moved

const router: RouterType = Router();

// GET /api/elevenlabs/voices
router.get('/voices', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    // TODO: Implement - Get available voices from ElevenLabs
    res.json({ voices: [] });
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message } });
  }
});

export default router;
