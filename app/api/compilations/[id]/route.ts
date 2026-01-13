import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { compilationService } from '@/lib/services/compilation.service';
import { CompilationResponse } from '@/types/compilation';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/compilations/[id]
 * Get a single compilation
 */
export async function GET(
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

    return NextResponse.json(toResponse(compilation));
  } catch (error: any) {
    logger.error('Failed to get compilation', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: 'Failed to get compilation',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/compilations/[id]
 * Delete a compilation
 */
export async function DELETE(
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

    // Verify compilation belongs to user
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

    // Don't allow deleting while rendering
    if (compilation.status === 'RENDERING') {
      return NextResponse.json(
        {
          error: {
            message: 'Cannot delete compilation while rendering',
            code: 'INVALID_STATE',
          },
        },
        { status: 400 }
      );
    }

    const deleted = await compilationService.deleteCompilation(id);

    if (!deleted) {
      return NextResponse.json(
        {
          error: {
            message: 'Failed to delete compilation',
            code: 'DELETE_FAILED',
          },
        },
        { status: 500 }
      );
    }

    logger.info('Compilation deleted', {
      compilationId: id,
      userId: session.user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error('Failed to delete compilation', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: 'Failed to delete compilation',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

// Helper to convert compilation to API response
function toResponse(compilation: any): CompilationResponse & { jobId: string } {
  return {
    id: compilation.id,
    jobId: compilation.jobId,
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
