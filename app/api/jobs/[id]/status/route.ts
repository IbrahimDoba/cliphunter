import { NextRequest, NextResponse } from 'next/server';
import { jobService } from '@/lib/services/job.service';
import { GetJobStatusResponse } from '@/types/api';
import { isValidJobId } from '@/lib/utils/validation';
import { logger } from '@/lib/utils/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // Validate job ID format
    if (!isValidJobId(jobId)) {
      return NextResponse.json(
        {
          error: {
            message: 'Invalid job ID format',
            code: 'INVALID_JOB_ID',
          },
        },
        { status: 400 }
      );
    }

    // Get job
    const job = await jobService.getJob(jobId);

    if (!job) {
      return NextResponse.json(
        {
          error: {
            message: 'Job not found',
            code: 'JOB_NOT_FOUND',
          },
        },
        { status: 404 }
      );
    }

    const response: GetJobStatusResponse = {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };

    return NextResponse.json(response);
  } catch (error: any) {
    logger.error('Failed to get job status', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: 'Failed to get job status',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}
