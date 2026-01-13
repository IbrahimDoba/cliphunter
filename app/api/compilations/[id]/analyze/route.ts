import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { compilationService } from '@/lib/services/compilation.service';
import { compilationProcessorService } from '@/lib/services/compilation-processor.service';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/compilations/[id]/analyze
 * Start the analysis phase for a compilation
 * This will analyze all clips from the job, curate them, and generate a script
 */
export async function POST(
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

    // Can only start analysis from CONFIGURING status
    if (compilation.status !== 'CONFIGURING') {
      return NextResponse.json(
        {
          error: {
            message: `Cannot start analysis from status: ${compilation.status}`,
            code: 'INVALID_STATE',
          },
        },
        { status: 400 }
      );
    }

    logger.info('Compilation analysis started', {
      compilationId: id,
      userId: session.user.id,
    });

    // Start processing asynchronously (don't await)
    // This runs the full pipeline: analyze -> curate -> generate script
    compilationProcessorService.processCompilation(id).catch((error) => {
      logger.error('Background compilation processing failed', {
        compilationId: id,
        error: error.message,
      });
    });

    return NextResponse.json({
      id: compilation.id,
      status: 'ANALYZING',
      message:
        'Analysis started. This will analyze clips, curate selection, and generate a script. Poll GET /api/compilations/{id} for status.',
    });
  } catch (error: any) {
    logger.error('Failed to start analysis', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: 'Failed to start analysis',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}
