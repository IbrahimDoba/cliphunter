import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { queue } from '@/lib/queue/queue';
import { usageService } from '@/lib/services/usage.service';
import { createJobSchema } from '@/lib/utils/validation';
import { CreateJobRequest, CreateJobResponse } from '@/types/api';
import { logger } from '@/lib/utils/logger';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          error: {
            message: 'Unauthorized',
            code: 'UNAUTHORIZED',
          },
        },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body: CreateJobRequest = await request.json();

    // Validate request
    const validation = createJobSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: {
            message: 'Invalid request',
            code: 'VALIDATION_ERROR',
            details: validation.error.errors,
          },
        },
        { status: 400 }
      );
    }

    const { videoUrl, options } = validation.data;
    const maxClips = options?.maxClips || 5;

    // Check usage limits
    const usageCheck = await usageService.canCreateClips(userId, maxClips);

    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          error: {
            message: `Daily clip limit reached. You have ${usageCheck.remaining} clips remaining today. Limit resets at midnight UTC.`,
            code: 'USAGE_LIMIT_EXCEEDED',
            details: {
              used: usageCheck.used,
              limit: usageCheck.limit,
              remaining: usageCheck.remaining,
              resetAt: usageCheck.resetAt.toISOString(),
            },
          },
        },
        { status: 429 }
      );
    }

    // Create job
    const job = await queue.enqueue(userId, videoUrl, options || {});

    // Note: Usage is recorded on successful job completion in the video processor,
    // not here. This ensures users aren't charged for failed jobs.

    const response: CreateJobResponse = {
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
    };

    logger.info('Job created via API', { jobId: job.id, userId, videoUrl });

    return NextResponse.json(response, { status: 201 });
  } catch (error: any) {
    logger.error('Failed to create job', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: 'Failed to create job',
          code: 'INTERNAL_ERROR',
          details: error.message,
        },
      },
      { status: 500 }
    );
  }
}
