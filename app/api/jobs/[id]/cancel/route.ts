import { NextRequest, NextResponse } from 'next/server';
import { jobService } from '@/lib/services/job.service';
import { CancelJobResponse } from '@/types/api';
import { isValidJobId } from '@/lib/utils/validation';
import { logger } from '@/lib/utils/logger';

export async function POST(
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

    // Cancel job
    const cancelled = await jobService.cancelJob(jobId);

    if (!cancelled) {
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

      return NextResponse.json(
        {
          error: {
            message: 'Job cannot be cancelled',
            code: 'JOB_ALREADY_COMPLETED',
          },
        },
        { status: 409 }
      );
    }

    const response: CancelJobResponse = {
      jobId,
      status: 'cancelled',
    };

    logger.info('Job cancelled via API', { jobId });

    return NextResponse.json(response);
  } catch (error: any) {
    logger.error('Failed to cancel job', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: 'Failed to cancel job',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}
