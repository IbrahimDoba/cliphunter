import { jobService } from '../services/job.service';
import { Job } from '@/types/job';
import { logger } from '../utils/logger';

export class SimpleQueue {
  private isProcessing = false;

  /**
   * Enqueue a job (handled by database insertion in jobService)
   */
  async enqueue(videoUrl: string, options: Job['options'] = {}): Promise<Job> {
    const job = await jobService.createJob(videoUrl, options);
    logger.info('Job enqueued', { jobId: job.id });
    return job;
  }

  /**
   * Get next job from queue
   */
  async dequeue(): Promise<Job | null> {
    if (this.isProcessing) {
      return null;
    }

    const job = await jobService.getNextQueuedJob();

    if (job) {
      this.isProcessing = true;
      logger.info('Job dequeued', { jobId: job.id });
    }

    return job;
  }

  /**
   * Mark job as complete
   */
  async complete(jobId: string): Promise<void> {
    this.isProcessing = false;
    logger.info('Job processing complete', { jobId });
  }

  /**
   * Mark job as failed
   */
  async fail(jobId: string): Promise<void> {
    this.isProcessing = false;
    logger.info('Job processing failed', { jobId });
  }

  /**
   * Check if queue is processing
   */
  isQueueBusy(): boolean {
    return this.isProcessing;
  }
}

export const queue = new SimpleQueue();
