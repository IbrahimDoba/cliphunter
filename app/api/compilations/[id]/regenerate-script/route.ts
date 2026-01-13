import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { compilationService } from '@/lib/services/compilation.service';
import { compilationProcessorService } from '@/lib/services/compilation-processor.service';
import { RegenerateScriptRequest, NARRATION_STYLE } from '@/types/compilation';
import { logger } from '@/lib/utils/logger';
import { prisma } from '@/lib/db/prisma';
import { NarrationStyle as PrismaNarrationStyle } from '@prisma/client';

/**
 * POST /api/compilations/[id]/regenerate-script
 * Regenerate the narration script with optional new style or instructions
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
    const body: RegenerateScriptRequest = await request.json();

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

    // Can only regenerate script during REVIEWING status
    if (compilation.status !== 'REVIEWING') {
      return NextResponse.json(
        {
          error: {
            message: `Cannot regenerate script in status: ${compilation.status}. Must be in REVIEWING status.`,
            code: 'INVALID_STATE',
          },
        },
        { status: 400 }
      );
    }

    // Validate narration style if provided
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

    // Update narration style if provided
    if (body.narrationStyle) {
      await prisma.compilation.update({
        where: { id },
        data: { narrationStyle: body.narrationStyle as PrismaNarrationStyle },
      });
    }

    logger.info('Script regeneration started', {
      compilationId: id,
      userId: session.user.id,
      newStyle: body.narrationStyle,
      hasInstructions: !!body.additionalInstructions,
    });

    // Regenerate script asynchronously
    compilationProcessorService.generateScript(id).catch((error) => {
      logger.error('Background script regeneration failed', {
        compilationId: id,
        error: error.message,
      });
    });

    return NextResponse.json({
      id: compilation.id,
      status: 'GENERATING_SCRIPT',
      message:
        'Script regeneration started. Poll GET /api/compilations/{id} for status.',
    });
  } catch (error: any) {
    logger.error('Failed to regenerate script', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: 'Failed to regenerate script',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}
