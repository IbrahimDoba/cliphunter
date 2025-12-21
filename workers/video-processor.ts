import { queue } from '../lib/queue/queue';
import { jobService } from '../lib/services/job.service';
import { youtubeService } from '../lib/services/youtube.service';
import { videoService } from '../lib/services/video.service';
import { subtitleService } from '../lib/services/subtitle.service';
import { clipService } from '../lib/services/clip.service';
import { storageService } from '../lib/storage/local-storage';
import { env } from '../config/env';
import { JOB_STATUS, PROCESSING_STEPS } from '../config/constants';
import { logger } from '../lib/utils/logger';
import { JobResult, JobProgress } from '../types/job';

class VideoProcessor {
  private pollInterval: number;
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;

  constructor() {
    this.pollInterval = env.QUEUE_POLL_INTERVAL;
  }

  /**
   * Start the worker
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Worker already running');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 Video processor worker started', {
      pollInterval: this.pollInterval,
    });

    // Start polling for jobs
    this.intervalId = setInterval(() => {
      this.processNextJob().catch((error) => {
        logger.error('Error in job processing loop', error);
      });
    }, this.pollInterval);

    // Process first job immediately
    this.processNextJob().catch((error) => {
      logger.error('Error processing first job', error);
    });
  }

  /**
   * Stop the worker
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    logger.info('Video processor worker stopped');
  }

  /**
   * Process next job in queue
   */
  private async processNextJob(): Promise<void> {
    if (queue.isQueueBusy()) {
      return;
    }

    const job = await queue.dequeue();

    if (!job) {
      return;
    }

    logger.info('Processing job', { jobId: job.id, videoUrl: job.videoUrl });

    try {
      // Update job status to processing
      await jobService.updateJobStatus(job.id, JOB_STATUS.PROCESSING, {
        step: PROCESSING_STEPS.DOWNLOADING,
        percentage: 0,
        message: 'Downloading video...',
      });

      // Step 1: Download video
      const videoInfo = await youtubeService.downloadVideo(job.videoUrl, job.id);

      await this.updateProgress(job.id, PROCESSING_STEPS.ANALYZING, 25, 'Analyzing video...');

      // Step 2: Analyze video and detect scenes
      const maxClips = job.options.maxClips || 5;
      const scenes = await videoService.analyzeVideo(videoInfo.videoPath, maxClips);

      await this.updateProgress(job.id, PROCESSING_STEPS.TRANSCRIBING, 50, 'Generating subtitles...');

      // Step 3: Generate subtitles (optional)
      let subtitlePath: string | null = null;
      if (job.options.includeSubtitles) {
        const jobDir = await storageService.ensureJobDir(job.id);
        subtitlePath = await subtitleService.generateSubtitles(
          videoInfo.videoPath,
          jobDir
        );
      }

      await this.updateProgress(job.id, PROCESSING_STEPS.GENERATING, 60, 'Generating clips...');

      // Step 4: Generate clips
      const jobDir = await storageService.ensureJobDir(job.id);
      const clips = await clipService.generateClips(
        videoInfo.videoPath,
        scenes,
        jobDir,
        {
          includeSubtitles: job.options.includeSubtitles,
          subtitlePath: subtitlePath || undefined,
          quality: 'medium',
        },
        (clipIndex, percent) => {
          const baseProgress = 60;
          const clipProgress = 35 / scenes.length;
          const totalProgress = baseProgress + clipIndex * clipProgress + (percent / 100) * clipProgress;

          this.updateProgress(
            job.id,
            PROCESSING_STEPS.GENERATING,
            Math.round(totalProgress),
            `Generating clip ${clipIndex + 1}/${scenes.length}...`
          ).catch((err) => logger.error('Failed to update progress', err));
        }
      );

      // Step 5: Build result
      const result: JobResult = {
        videoTitle: videoInfo.title,
        duration: videoInfo.duration,
        clips: clips.map((clip) => ({
          id: clip.id,
          startTime: clip.startTime,
          endTime: clip.endTime,
          duration: clip.duration,
          score: clip.score,
          thumbnailUrl: `/outputs/${job.id}/thumbnails/${clip.id}.jpg`,
          videoUrl: `/outputs/${job.id}/clips/${clip.id}.mp4`,
        })),
      };

      // Complete job
      await jobService.completeJob(job.id, result);

      // Cleanup downloaded video
      await youtubeService.cleanup(videoInfo.videoPath);

      await queue.complete(job.id);

      logger.info('Job completed successfully', {
        jobId: job.id,
        clipsGenerated: clips.length,
      });
    } catch (error: any) {
      logger.error('Job processing failed', { jobId: job.id, error: error.message });

      await jobService.failJob(job.id, {
        message: error.message || 'Unknown error occurred',
        code: 'PROCESSING_ERROR',
        details: error,
      });

      await queue.fail(job.id);
    }
  }

  /**
   * Update job progress
   */
  private async updateProgress(
    jobId: string,
    step: JobProgress['step'],
    percentage: number,
    message: string
  ): Promise<void> {
    await jobService.updateJobProgress(jobId, {
      step,
      percentage,
      message,
    });
  }
}

// Create and start worker
const processor = new VideoProcessor();

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  processor.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  processor.stop();
  process.exit(0);
});

// Start the processor
processor.start();
