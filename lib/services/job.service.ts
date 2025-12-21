import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client';
import {
  Job,
  JobRecord,
  JobProgress,
  JobResult,
  JobError,
  JobOptions,
} from '@/types/job';
import { JOB_STATUS, PROCESSING_STEPS } from '@/config/constants';
import { logger } from '../utils/logger';

export class JobService {
  /**
   * Create a new job
   */
  async createJob(videoUrl: string, options: JobOptions = {}): Promise<Job> {
    const jobId = uuidv4();
    const now = Date.now();

    const job: Job = {
      id: jobId,
      videoUrl,
      status: JOB_STATUS.QUEUED,
      progress: {
        step: PROCESSING_STEPS.DOWNLOADING,
        percentage: 0,
        message: 'Job queued',
      },
      options: {
        clipDuration: options.clipDuration,
        maxClips: options.maxClips || 5,
        includeSubtitles: options.includeSubtitles ?? true,
      },
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };

    // Insert into database
    const stmt = db.prepare(`
      INSERT INTO jobs (id, video_url, status, progress, result, error, options, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      job.id,
      job.videoUrl,
      job.status,
      JSON.stringify(job.progress),
      null,
      null,
      JSON.stringify(job.options),
      now,
      now
    );

    logger.info('Job created', { jobId, videoUrl });

    return job;
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<Job | null> {
    const stmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
    const record = stmt.get(jobId) as JobRecord | undefined;

    if (!record) {
      return null;
    }

    return this.recordToJob(record);
  }

  /**
   * Update job status
   */
  async updateJobStatus(
    jobId: string,
    status: Job['status'],
    progress?: JobProgress
  ): Promise<void> {
    const now = Date.now();
    const updates: string[] = ['status = ?', 'updated_at = ?'];
    const values: any[] = [status, now];

    if (progress) {
      updates.push('progress = ?');
      values.push(JSON.stringify(progress));
    }

    values.push(jobId);

    const stmt = db.prepare(`
      UPDATE jobs
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);

    logger.debug('Job status updated', { jobId, status, progress });
  }

  /**
   * Update job progress
   */
  async updateJobProgress(jobId: string, progress: JobProgress): Promise<void> {
    const stmt = db.prepare(`
      UPDATE jobs
      SET progress = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(JSON.stringify(progress), Date.now(), jobId);

    logger.debug('Job progress updated', { jobId, progress });
  }

  /**
   * Complete job with result
   */
  async completeJob(jobId: string, result: JobResult): Promise<void> {
    const stmt = db.prepare(`
      UPDATE jobs
      SET status = ?, result = ?, progress = ?, updated_at = ?
      WHERE id = ?
    `);

    const progress: JobProgress = {
      step: PROCESSING_STEPS.DONE,
      percentage: 100,
      message: 'Clips generated successfully',
    };

    stmt.run(
      JOB_STATUS.COMPLETED,
      JSON.stringify(result),
      JSON.stringify(progress),
      Date.now(),
      jobId
    );

    logger.info('Job completed', { jobId, clipCount: result.clips.length });
  }

  /**
   * Fail job with error
   */
  async failJob(jobId: string, error: JobError): Promise<void> {
    const stmt = db.prepare(`
      UPDATE jobs
      SET status = ?, error = ?, progress = ?, updated_at = ?
      WHERE id = ?
    `);

    const progress: JobProgress = {
      step: PROCESSING_STEPS.ERROR,
      percentage: 0,
      message: error.message,
    };

    stmt.run(
      JOB_STATUS.FAILED,
      JSON.stringify(error),
      JSON.stringify(progress),
      Date.now(),
      jobId
    );

    logger.error('Job failed', { jobId, error });
  }

  /**
   * Cancel job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.getJob(jobId);

    if (!job) {
      return false;
    }

    if (job.status === JOB_STATUS.COMPLETED || job.status === JOB_STATUS.FAILED) {
      return false;
    }

    const stmt = db.prepare(`
      UPDATE jobs
      SET status = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(JOB_STATUS.CANCELLED, Date.now(), jobId);

    logger.info('Job cancelled', { jobId });

    return true;
  }

  /**
   * Get next queued job
   */
  async getNextQueuedJob(): Promise<Job | null> {
    const stmt = db.prepare(`
      SELECT * FROM jobs
      WHERE status = ?
      ORDER BY created_at ASC
      LIMIT 1
    `);

    const record = stmt.get(JOB_STATUS.QUEUED) as JobRecord | undefined;

    if (!record) {
      return null;
    }

    return this.recordToJob(record);
  }

  /**
   * Get all jobs (for admin/debugging)
   */
  async getAllJobs(limit: number = 100): Promise<Job[]> {
    const stmt = db.prepare(`
      SELECT * FROM jobs
      ORDER BY created_at DESC
      LIMIT ?
    `);

    const records = stmt.all(limit) as JobRecord[];
    return records.map((record) => this.recordToJob(record));
  }

  /**
   * Convert database record to Job object
   */
  private recordToJob(record: JobRecord): Job {
    return {
      id: record.id,
      videoUrl: record.video_url,
      status: record.status,
      progress: JSON.parse(record.progress),
      result: record.result ? JSON.parse(record.result) : undefined,
      error: record.error ? JSON.parse(record.error) : undefined,
      options: JSON.parse(record.options),
      createdAt: new Date(record.created_at),
      updatedAt: new Date(record.updated_at),
    };
  }
}

export const jobService = new JobService();
