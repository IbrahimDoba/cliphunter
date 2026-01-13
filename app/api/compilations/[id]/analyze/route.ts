import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { compilationService } from '@/lib/services/compilation.service';
import { compilationProcessorService } from '@/lib/services/compilation-processor.service';
import { logger } from '@/lib/utils/logger';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
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

    const { id } = params; // ✅ no await

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
        'Analysis started. Poll GET /api/compilations/{id} for status.',
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
