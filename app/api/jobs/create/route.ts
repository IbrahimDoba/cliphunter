import { NextRequest, NextResponse } from 'next/server';
import { queue } from '@/lib/queue/queue';
import { createJobSchema } from '@/lib/utils/validation';
import { CreateJobRequest, CreateJobResponse } from '@/types/api';
import { logger } from '@/lib/utils/logger';

export async function POST(request: NextRequest) {
  try {
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

    // Create job
    const job = await queue.enqueue(videoUrl, options || {});

    const response: CreateJobResponse = {
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
    };

    logger.info('Job created via API', { jobId: job.id, videoUrl });

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
