import { prisma } from '../db/prisma';
import { JobStatus as PrismaJobStatus, Prisma } from '@prisma/client';
import {
  Job,
  JobProgress,
  JobResult,
  JobError,
  JobOptions,
} from '@/types/job';
import { JOB_STATUS, PROCESSING_STEPS } from '@/config/constants';
import { logger } from '../utils/logger';

// Helper to convert objects to Prisma JSON input
function toJson<T>(obj: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(obj));
}

// Map between our string statuses and Prisma enum
const statusToPrisma: Record<string, PrismaJobStatus> = {
  [JOB_STATUS.QUEUED]: 'QUEUED',
  [JOB_STATUS.PROCESSING]: 'PROCESSING',
  [JOB_STATUS.COMPLETED]: 'COMPLETED',
  [JOB_STATUS.FAILED]: 'FAILED',
  [JOB_STATUS.CANCELLED]: 'CANCELLED',
};

const prismaToStatus: Record<PrismaJobStatus, string> = {
  QUEUED: JOB_STATUS.QUEUED,
  PROCESSING: JOB_STATUS.PROCESSING,
  COMPLETED: JOB_STATUS.COMPLETED,
  FAILED: JOB_STATUS.FAILED,
  CANCELLED: JOB_STATUS.CANCELLED,
};

export class JobService {
  /**
   * Create a new job
   */
  async createJob(
    userId: string,
    videoUrl: string,
    options: JobOptions = {}
  ): Promise<Job> {
    const progress: JobProgress = {
      step: PROCESSING_STEPS.DOWNLOADING,
      percentage: 0,
      message: 'Job queued',
    };

    const jobOptions = {
      clipDuration: options.clipDuration,
      maxClips: options.maxClips || 5,
      includeSubtitles: options.includeSubtitles ?? true,
      showSubscribe: options.showSubscribe ?? false,
    };

    const job = await prisma.job.create({
      data: {
        userId,
        videoUrl,
        status: 'QUEUED',
        progress: toJson(progress),
        options: toJson(jobOptions),
      },
    });

    logger.info('Job created', { jobId: job.id, userId, videoUrl });

    return this.prismaToJob(job);
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<Job | null> {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return null;
    }

    return this.prismaToJob(job);
  }

  /**
   * Get job by ID for a specific user (authorization check)
   */
  async getJobForUser(jobId: string, userId: string): Promise<Job | null> {
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        userId,
      },
    });

    if (!job) {
      return null;
    }

    return this.prismaToJob(job);
  }

  /**
   * Get all jobs for a user
   */
  async getJobsForUser(userId: string, limit: number = 100): Promise<Job[]> {
    const jobs = await prisma.job.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return jobs.map((job) => this.prismaToJob(job));
  }

  /**
   * Update job status
   */
  async updateJobStatus(
    jobId: string,
    status: Job['status'],
    progress?: JobProgress
  ): Promise<void> {
    const updateData: Prisma.JobUpdateInput = {
      status: statusToPrisma[status],
    };

    if (progress) {
      updateData.progress = toJson(progress);
    }

    await prisma.job.update({
      where: { id: jobId },
      data: updateData,
    });

    logger.debug('Job status updated', { jobId, status, progress });
  }

  /**
   * Update job progress
   */
  async updateJobProgress(jobId: string, progress: JobProgress): Promise<void> {
    await prisma.job.update({
      where: { id: jobId },
      data: { progress: toJson(progress) },
    });

    logger.debug('Job progress updated', { jobId, progress });
  }

  /**
   * Complete job with result
   */
  async completeJob(jobId: string, result: JobResult): Promise<void> {
    const progress: JobProgress = {
      step: PROCESSING_STEPS.DONE,
      percentage: 100,
      message: 'Clips generated successfully',
    };

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        result: toJson(result),
        progress: toJson(progress),
      },
    });

    logger.info('Job completed', { jobId, clipCount: result.clips.length });
  }

  /**
   * Fail job with error
   */
  async failJob(jobId: string, error: JobError): Promise<void> {
    const progress: JobProgress = {
      step: PROCESSING_STEPS.ERROR,
      percentage: 0,
      message: error.message,
    };

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        error: toJson(error),
        progress: toJson(progress),
      },
    });

    logger.error('Job failed', { jobId, error });
  }

  /**
   * Update a specific clip's title in the job result
   */
  async updateClipTitle(
    jobId: string,
    clipId: string,
    newTitle: string
  ): Promise<boolean> {
    const job = await this.getJob(jobId);

    if (!job || !job.result) {
      return false;
    }

    const clipIndex = job.result.clips.findIndex((c) => c.id === clipId);
    if (clipIndex === -1) {
      return false;
    }

    job.result.clips[clipIndex].title = newTitle;

    await prisma.job.update({
      where: { id: jobId },
      data: { result: toJson(job.result) },
    });

    logger.info('Clip title updated', { jobId, clipId, newTitle });

    return true;
  }

  /**
   * Cancel job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.getJob(jobId);

    if (!job) {
      return false;
    }

    if (
      job.status === JOB_STATUS.COMPLETED ||
      job.status === JOB_STATUS.FAILED
    ) {
      return false;
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'CANCELLED' },
    });

    logger.info('Job cancelled', { jobId });

    return true;
  }

  /**
   * Get next queued job
   */
  async getNextQueuedJob(): Promise<Job | null> {
    const job = await prisma.job.findFirst({
      where: { status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
    });

    if (!job) {
      return null;
    }

    return this.prismaToJob(job);
  }

  /**
   * Get all jobs (for admin/debugging)
   */
  async getAllJobs(limit: number = 100): Promise<Job[]> {
    const jobs = await prisma.job.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return jobs.map((job) => this.prismaToJob(job));
  }

  /**
   * Convert Prisma job to our Job interface
   */
  private prismaToJob(job: any): Job {
    return {
      id: job.id,
      userId: job.userId,
      videoUrl: job.videoUrl,
      status: prismaToStatus[job.status as PrismaJobStatus],
      progress: job.progress as JobProgress,
      result: job.result as JobResult | undefined,
      error: job.error as JobError | undefined,
      options: job.options as JobOptions,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}

export const jobService = new JobService();
