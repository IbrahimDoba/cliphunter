import { Router, type Router as RouterType } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { jobService } from '../services/job.service';
import { usageService } from '../services/usage.service';
import { queue } from '../queue/queue';
import fs from 'fs';
import path from 'path';

const router: RouterType = Router();

// POST /api/jobs/create
router.post('/create', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { videoUrl, options } = req.body;
    const userId = req.user!.id;

    // TODO: Re-enable usage limits once database connection is stable
    // Check usage limits
    // const usageCheck = await usageService.canCreateClips(userId, 1);
    // if (!usageCheck.allowed) {
    //   return res.status(403).json({
    //     error: {
    //       message: `Daily limit reached. ${usageCheck.remaining} clips remaining today.`,
    //       code: 'LIMIT_REACHED'
    //     }
    //   });
    // }

    // Create job
    const job = await queue.enqueue({
      userId,
      videoUrl,
      options,
    });

    res.status(201).json({ jobId: job.id, status: job.status });
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message } });
  }
});

// GET /api/jobs/:id/status
router.get('/:id/status', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id as string;
    const job = await jobService.getJob(id);

    if (!job) {
      return res.status(404).json({ error: { message: 'Job not found' } });
    }

    if (job.userId !== req.user!.id) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }

    res.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
    });
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message } });
  }
});

// POST /api/jobs/:id/cancel
router.post('/:id/cancel', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id as string;
    const job = await jobService.getJob(id);

    if (!job || job.userId !== req.user!.id) {
      return res.status(404).json({ error: { message: 'Job not found' } });
    }

    await jobService.cancelJob(id);
    res.json({ jobId: id, status: 'CANCELLED' });
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message } });
  }
});

// GET /api/jobs/:id/compilations/:compilationId/video - Video streaming
router.get('/:id/compilations/:compilationId/video', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id as string;
    const compilationId = req.params.compilationId as string;

    // Get compilation and verify ownership
    const job = await jobService.getJob(id);
    if (!job || job.userId !== req.user!.id) {
      return res.status(404).json({ error: { message: 'Not found' } });
    }

    // Get video file path
    const outputDir = process.env.OUTPUT_DIR || './public/outputs';
    const videoPath = path.join(outputDir, `${compilationId}.mp4`);

    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: { message: 'Video not found' } });
    }

    const stat = fs.statSync(videoPath);
    const range = req.headers.range;

    if (range) {
      // Handle range requests for video seeking
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
      });

      fs.createReadStream(videoPath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': 'video/mp4',
      });
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message } });
  }
});

export default router;
