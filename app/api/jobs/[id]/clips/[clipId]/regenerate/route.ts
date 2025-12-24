import { NextRequest, NextResponse } from 'next/server';
import * as path from 'path';
import { jobService } from '@/lib/services/job.service';
import { clipService } from '@/lib/services/clip.service';
import { env } from '@/config/env';
import { logger } from '@/lib/utils/logger';

interface RegenerateRequest {
  title: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; clipId: string }> }
) {
  try {
    const { id: jobId, clipId } = await params;
    const body = (await request.json()) as RegenerateRequest;

    if (!body.title || typeof body.title !== 'string') {
      return NextResponse.json(
        {
          error: {
            message: 'Title is required',
            code: 'INVALID_REQUEST',
          },
        },
        { status: 400 }
      );
    }

    const title = body.title.trim();
    if (title.length === 0 || title.length > 100) {
      return NextResponse.json(
        {
          error: {
            message: 'Title must be between 1 and 100 characters',
            code: 'INVALID_TITLE',
          },
        },
        { status: 400 }
      );
    }

    // Get the job to find the clip
    const job = await jobService.getJob(jobId);
    if (!job || !job.result) {
      return NextResponse.json(
        {
          error: {
            message: 'Job not found or has no results',
            code: 'JOB_NOT_FOUND',
          },
        },
        { status: 404 }
      );
    }

    // Find the clip in the job results
    const clip = job.result.clips.find((c) => c.id === clipId);
    if (!clip) {
      return NextResponse.json(
        {
          error: {
            message: 'Clip not found',
            code: 'CLIP_NOT_FOUND',
          },
        },
        { status: 404 }
      );
    }

    // Construct the clip file path
    const clipPath = path.join(
      process.cwd(),
      env.OUTPUT_DIR,
      jobId,
      'clips',
      `${clipId}.mp4`
    );

    logger.info('Regenerating clip with new title', { jobId, clipId, title, clipPath });

    // Add title overlay to the clip
    await clipService.addTitleToClip(clipPath, title);

    // Update the clip title in the job result
    await jobService.updateClipTitle(jobId, clipId, title);

    return NextResponse.json({
      success: true,
      clip: {
        id: clipId,
        title,
        videoUrl: clip.videoUrl,
      },
    });
  } catch (error: any) {
    logger.error('Failed to regenerate clip', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: error.message || 'Failed to regenerate clip',
          code: 'REGENERATION_ERROR',
        },
      },
      { status: 500 }
    );
  }
}
