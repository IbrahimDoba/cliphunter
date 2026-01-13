import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { compilationService } from '@/lib/services/compilation.service';
import { compilationProcessorService } from '@/lib/services/compilation-processor.service';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/compilations/[id]/render
 * Start the final render process for a compilation
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // Parse request body for clip subtitles preferences
    let clipSubtitles: Record<string, boolean> = {};
    try {
      const body = await request.json();
      clipSubtitles = body.clipSubtitles || {};
    } catch {
      // No body provided, use defaults
    }

    // Get compilation and verify ownership
    const compilation = await compilationService.getCompilationForUser(
      id,
      session.user.id
    );

    if (!compilation) {
      return NextResponse.json(
        {
          error: {
            message: 'Compilation not found',
            code: 'NOT_FOUND',
          },
        },
        { status: 404 }
      );
    }

    // Can only start render from REVIEWING status
    if (compilation.status !== 'REVIEWING') {
      return NextResponse.json(
        {
          error: {
            message: `Cannot start render from status: ${compilation.status}. Must be in REVIEWING status.`,
            code: 'INVALID_STATE',
          },
        },
        { status: 400 }
      );
    }

    // Validate that we have the necessary data
    if (!compilation.selectedClips?.length) {
      return NextResponse.json(
        {
          error: {
            message: 'No clips selected for compilation',
            code: 'MISSING_DATA',
          },
        },
        { status: 400 }
      );
    }

    if (!compilation.script) {
      return NextResponse.json(
        {
          error: {
            message: 'No script generated for compilation',
            code: 'MISSING_DATA',
          },
        },
        { status: 400 }
      );
    }

    // Save clip subtitles preferences
    const clipsWithSubtitles = Object.entries(clipSubtitles)
      .filter(([_, enabled]) => enabled)
      .map(([clipId]) => clipId);

    logger.info('Compilation render started', {
      compilationId: id,
      userId: session.user.id,
      clipCount: compilation.selectedClips.length,
      clipsWithSubtitles: clipsWithSubtitles.length,
    });

    // Start the render pipeline asynchronously with subtitle preferences
    compilationProcessorService.renderCompilation(id, clipSubtitles).catch((error) => {
      logger.error('Background render failed', {
        compilationId: id,
        error: error.message,
      });
    });

    return NextResponse.json({
      id: compilation.id,
      status: 'GENERATING_VOICEOVER',
      message:
        'Render started. First generating voiceover, then rendering video. Poll GET /api/compilations/{id} for status.',
    });
  } catch (error: any) {
    logger.error('Failed to start render', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: 'Failed to start render',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}
