import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { compilationService } from '@/lib/services/compilation.service';
import { jobService } from '@/lib/services/job.service';
import {
  CreateCompilationRequest,
  CompilationResponse,
  NARRATION_STYLE,
  SUBTITLE_STYLE,
  CLIP_AUDIO_MODE,
} from '@/types/compilation';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/compilations
 * List all compilations for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
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

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    let compilations;

    if (jobId) {
      // Get compilations for a specific job
      compilations = await compilationService.getCompilationsForJob(jobId);
      // Filter by user
      compilations = compilations.filter((c) => c.userId === session.user.id);
    } else {
      // Get all compilations for the user
      compilations = await compilationService.getCompilationsForUser(
        session.user.id,
        limit
      );
    }

    return NextResponse.json({
      compilations: compilations.map((c) => toResponse(c)),
    });
  } catch (error: any) {
    logger.error('Failed to list compilations', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: 'Failed to list compilations',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/compilations
 * Create a new compilation
 */
export async function POST(request: NextRequest) {
  try {
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

    const body: CreateCompilationRequest = await request.json();

    // Validate required fields
    if (!body.jobId) {
      return NextResponse.json(
        {
          error: {
            message: 'jobId is required',
            code: 'VALIDATION_ERROR',
          },
        },
        { status: 400 }
      );
    }

    if (!body.targetDuration || body.targetDuration < 30) {
      return NextResponse.json(
        {
          error: {
            message: 'targetDuration must be at least 30 seconds',
            code: 'VALIDATION_ERROR',
          },
        },
        { status: 400 }
      );
    }

    // Validate narration style
    if (
      body.narrationStyle &&
      !Object.values(NARRATION_STYLE).includes(body.narrationStyle)
    ) {
      return NextResponse.json(
        {
          error: {
            message: 'Invalid narration style',
            code: 'VALIDATION_ERROR',
          },
        },
        { status: 400 }
      );
    }

    // Validate subtitle style
    if (
      body.subtitleStyle &&
      !Object.values(SUBTITLE_STYLE).includes(body.subtitleStyle)
    ) {
      return NextResponse.json(
        {
          error: {
            message: 'Invalid subtitle style',
            code: 'VALIDATION_ERROR',
          },
        },
        { status: 400 }
      );
    }

    // Validate audio settings
    if (
      body.audioSettings?.clipAudioMode &&
      !Object.values(CLIP_AUDIO_MODE).includes(body.audioSettings.clipAudioMode)
    ) {
      return NextResponse.json(
        {
          error: {
            message: 'Invalid clip audio mode',
            code: 'VALIDATION_ERROR',
          },
        },
        { status: 400 }
      );
    }

    // Verify the job exists and belongs to the user
    const job = await jobService.getJobForUser(body.jobId, session.user.id);

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

    // Verify job is completed with clips
    if (job.status !== 'completed' || !job.result?.clips?.length) {
      return NextResponse.json(
        {
          error: {
            message: 'Job must be completed with clips to create a compilation',
            code: 'INVALID_JOB_STATE',
          },
        },
        { status: 400 }
      );
    }

    // Create the compilation
    const compilation = await compilationService.createCompilation(
      session.user.id,
      {
        jobId: body.jobId,
        targetDuration: body.targetDuration,
        narrationStyle: body.narrationStyle || 'COMMENTARY',
        subtitleStyle: body.subtitleStyle || 'WORD_BY_WORD_HIGHLIGHT',
        audioSettings: {
          clipAudioMode: body.audioSettings?.clipAudioMode || 'MUTED',
          backgroundMusic: body.audioSettings?.backgroundMusic || null,
          musicVolume: body.audioSettings?.musicVolume ?? 50,
        },
      }
    );

    logger.info('Compilation created', {
      compilationId: compilation.id,
      userId: session.user.id,
      jobId: body.jobId,
    });

    return NextResponse.json(
      {
        id: compilation.id,
        status: compilation.status,
        message: 'Compilation created. Call /api/compilations/{id}/analyze to start analysis.',
      },
      { status: 201 }
    );
  } catch (error: any) {
    logger.error('Failed to create compilation', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: 'Failed to create compilation',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

// Helper to convert compilation to API response
function toResponse(compilation: any): CompilationResponse {
  return {
    id: compilation.id,
    status: compilation.status,
    progress: compilation.progress,
    config: {
      targetDuration: compilation.targetDuration,
      narrationStyle: compilation.narrationStyle,
      subtitleStyle: compilation.subtitleStyle,
      audioSettings: {
        clipAudioMode: compilation.clipAudioMode,
        backgroundMusic: compilation.backgroundMusic,
        musicVolume: compilation.musicVolume,
      },
    },
    clipAnalysis: compilation.clipAnalysis,
    selectedClips: compilation.selectedClips,
    script: compilation.script,
    outputUrl: compilation.outputUrl,
    error: compilation.error,
    createdAt: compilation.createdAt,
    updatedAt: compilation.updatedAt,
  };
}
