import { NextRequest, NextResponse } from 'next/server';
import { geminiService } from '@/lib/services/gemini.service';
import { jobService } from '@/lib/services/job.service';
import { logger } from '@/lib/utils/logger';

interface GenerateScriptRequest {
  jobId: string;
  hookType?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clipId } = await params;
    const body = (await request.json()) as GenerateScriptRequest;

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

    // Check if Gemini is configured
    if (!geminiService.isConfigured()) {
      return NextResponse.json(
        {
          error: {
            message: 'Gemini API not configured',
            code: 'NOT_CONFIGURED',
          },
        },
        { status: 503 }
      );
    }

    // Get the job to find clip info
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

    // Find the clip
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

    logger.info('Generating intro script for clip', {
      clipId,
      clipTitle: clip.title,
      hookType: body.hookType,
    });

    // Generate script using Gemini
    const script = await geminiService.generateVoiceOverScript(
      clip.title || 'Amazing Moment',
      null, // No transcript snippet for now
      body.hookType
    );

    // Calculate estimated duration (approximately 2.5 words per second)
    const wordCount = script.split(/\s+/).length;
    const estimatedDuration = Math.round((wordCount / 2.5) * 10) / 10;

    return NextResponse.json({
      script,
      estimatedDuration,
      wordCount,
    });
  } catch (error: any) {
    logger.error('Failed to generate intro script', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: error.message || 'Failed to generate script',
          code: 'GENERATION_ERROR',
        },
      },
      { status: 500 }
    );
  }
}
