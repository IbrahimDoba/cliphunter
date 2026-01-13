import { NextRequest, NextResponse } from 'next/server';
import * as path from 'path';
import { jobService } from '@/lib/services/job.service';
import { clipService } from '@/lib/services/clip.service';
import { elevenLabsService } from '@/lib/services/elevenlabs.service';
import { env } from '@/config/env';
import { logger } from '@/lib/utils/logger';

interface AddIntroRequest {
  jobId: string;
  script: string;
  voiceId?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clipId } = await params;
    const body = (await request.json()) as AddIntroRequest;

    // Validate request
    if (!body.jobId) {
      return NextResponse.json(
        {
          error: {
            message: 'jobId is required',
            code: 'INVALID_REQUEST',
          },
        },
        { status: 400 }
      );
    }

    if (!body.script || typeof body.script !== 'string') {
      return NextResponse.json(
        {
          error: {
            message: 'Script is required',
            code: 'INVALID_REQUEST',
          },
        },
        { status: 400 }
      );
    }

    const script = body.script.trim();
    if (script.length === 0 || script.length > 500) {
      return NextResponse.json(
        {
          error: {
            message: 'Script must be between 1 and 500 characters',
            code: 'INVALID_SCRIPT',
          },
        },
        { status: 400 }
      );
    }

    // Check if ElevenLabs is configured
    if (!elevenLabsService.isConfigured()) {
      return NextResponse.json(
        {
          error: {
            message: 'ElevenLabs API not configured',
            code: 'NOT_CONFIGURED',
          },
        },
        { status: 503 }
      );
    }

    // Get the job to find the clip
    const job = await jobService.getJob(body.jobId);
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
      body.jobId,
      'clips',
      `${clipId}.mp4`
    );

    logger.info('Adding voiceover intro to clip', {
      jobId: body.jobId,
      clipId,
      scriptLength: script.length,
      voiceId: body.voiceId,
      clipPath,
    });

    // Generate intro and add to clip
    await clipService.generateIntroVideo(clipPath, script, body.voiceId);

    return NextResponse.json({
      success: true,
      clip: {
        id: clipId,
        videoUrl: clip.videoUrl,
      },
    });
  } catch (error: any) {
    logger.error('Failed to add intro to clip', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: error.message || 'Failed to add intro',
          code: 'INTRO_ERROR',
        },
      },
      { status: 500 }
    );
  }
}
