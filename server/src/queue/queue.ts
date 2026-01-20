import { prisma } from '../db/prisma';
import type { Job, JobOptions } from '../shared';

interface EnqueueParams {
  userId: string;
  videoUrl: string;
  options?: JobOptions;
}

let isProcessing = false;

export const queue = {
  async enqueue(params: EnqueueParams): Promise<{ id: string; status: string }> {
    const job = await prisma.job.create({
      data: {
        userId: params.userId,
        videoUrl: params.videoUrl,
        status: 'QUEUED',
        options: (params.options || {}) as any,
        progress: {
          step: 'downloading',
          percentage: 0,
          message: 'Waiting in queue...',
        },
      },
    });

    return {
      id: job.id,
      status: job.status,
    };
  },

  async dequeue(): Promise<Job | null> {
    if (isProcessing) {
      return null;
    }

    const job = await prisma.job.findFirst({
      where: { status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
    });

    if (!job) return null;

    isProcessing = true;

    // Mark as processing
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'PROCESSING' },
    });

    return {
      id: job.id,
      userId: job.userId,
      videoUrl: job.videoUrl,
      status: 'processing',
      progress: (job.progress as any) || { step: 'downloading', percentage: 0, message: '' },
      result: job.result as any,
      error: job.error as any,
      options: job.options as any,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  },

  isQueueBusy(): boolean {
    return isProcessing;
  },

  setProcessingComplete(): void {
    isProcessing = false;
  },

  async fail(jobId: string): Promise<void> {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'FAILED' },
    });
    isProcessing = false;
  },

  async complete(jobId: string): Promise<void> {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'COMPLETED' },
    });
    isProcessing = false;
  },
};
