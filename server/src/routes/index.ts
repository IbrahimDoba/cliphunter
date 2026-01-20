import { Router, type Router as RouterType } from 'express';
import jobsRoutes from './jobs.routes';
import clipsRoutes from './clips.routes';
import compilationsRoutes from './compilations.routes';
import usageRoutes from './usage.routes';
import youtubeRoutes from './youtube.routes';
import elevenlabsRoutes from './elevenlabs.routes';

const router: RouterType = Router();

router.use('/jobs', jobsRoutes);
router.use('/clips', clipsRoutes);
router.use('/compilations', compilationsRoutes);
router.use('/usage', usageRoutes);
router.use('/youtube', youtubeRoutes);
router.use('/elevenlabs', elevenlabsRoutes);

export default router;
