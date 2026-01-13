import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { compilationService } from '@/lib/services/compilation.service';
import { UpdateClipsRequest } from '@/types/compilation';
import { logger } from '@/lib/utils/logger';

/**
 * PUT /api/compilations/[id]/clips
 * Update the clip selection for a compilation
 */
export async function PUT(
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
    const body: UpdateClipsRequest = await request.json();

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

    // Can only update clips during REVIEWING status
    if (compilation.status !== 'REVIEWING') {
      return NextResponse.json(
        {
          error: {
            message: `Cannot update clips in status: ${compilation.status}. Must be in REVIEWING status.`,
            code: 'INVALID_STATE',
          },
        },
        { status: 400 }
      );
    }

    // Validate clips array
    if (!Array.isArray(body.clips) || body.clips.length === 0) {
      return NextResponse.json(
        {
          error: {
            message: 'clips array is required and must not be empty',
            code: 'VALIDATION_ERROR',
          },
        },
        { status: 400 }
      );
    }

    // Validate each clip
    for (const clip of body.clips) {
      if (!clip.sourceClipId) {
        return NextResponse.json(
          {
            error: {
              message: 'Each clip must have a sourceClipId',
              code: 'VALIDATION_ERROR',
            },
          },
          { status: 400 }
        );
      }

      if (
        typeof clip.segmentStart !== 'number' ||
        typeof clip.segmentEnd !== 'number'
      ) {
        return NextResponse.json(
          {
            error: {
              message: 'Each clip must have segmentStart and segmentEnd',
              code: 'VALIDATION_ERROR',
            },
          },
          { status: 400 }
        );
      }

      if (clip.segmentStart >= clip.segmentEnd) {
        return NextResponse.json(
          {
            error: {
              message: 'segmentStart must be less than segmentEnd',
              code: 'VALIDATION_ERROR',
            },
          },
          { status: 400 }
        );
      }

      if (typeof clip.orderIndex !== 'number') {
        return NextResponse.json(
          {
            error: {
              message: 'Each clip must have an orderIndex',
              code: 'VALIDATION_ERROR',
            },
          },
          { status: 400 }
        );
      }
    }

    // Convert to SelectedClip format and save
    const selectedClips = body.clips.map((clip) => ({
      clipId: clip.sourceClipId,
      segmentStart: clip.segmentStart,
      segmentEnd: clip.segmentEnd,
      orderIndex: clip.orderIndex,
      purpose: '', // Will be filled during script generation
    }));

    await compilationService.saveSelectedClips(id, selectedClips);

    logger.info('Compilation clips updated', {
      compilationId: id,
      userId: session.user.id,
      clipCount: selectedClips.length,
    });

    return NextResponse.json({
      success: true,
      clipCount: selectedClips.length,
    });
  } catch (error: any) {
    logger.error('Failed to update clips', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: 'Failed to update clips',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/compilations/[id]/clips
 * Add a single clip to the compilation
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
    const body = await request.json();

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

    // Can only update clips during REVIEWING status
    if (compilation.status !== 'REVIEWING') {
      return NextResponse.json(
        {
          error: {
            message: `Cannot add clips in status: ${compilation.status}. Must be in REVIEWING status.`,
            code: 'INVALID_STATE',
          },
        },
        { status: 400 }
      );
    }

    // Validate clip data
    if (!body.sourceClipId) {
      return NextResponse.json(
        {
          error: {
            message: 'sourceClipId is required',
            code: 'VALIDATION_ERROR',
          },
        },
        { status: 400 }
      );
    }

    // Determine order index (add to end if not specified)
    const orderIndex =
      body.orderIndex ?? (compilation.selectedClips?.length || 0);

    await compilationService.addClip(id, {
      clipId: body.sourceClipId,
      segmentStart: body.segmentStart || 0,
      segmentEnd: body.segmentEnd || 30,
      orderIndex,
      purpose: '',
    });

    logger.info('Clip added to compilation', {
      compilationId: id,
      userId: session.user.id,
      clipId: body.sourceClipId,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    logger.error('Failed to add clip', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: 'Failed to add clip',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/compilations/[id]/clips
 * Remove a clip from the compilation
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
    const { searchParams } = new URL(request.url);
    const sourceClipId = searchParams.get('sourceClipId');

    if (!sourceClipId) {
      return NextResponse.json(
        {
          error: {
            message: 'sourceClipId query parameter is required',
            code: 'VALIDATION_ERROR',
          },
        },
        { status: 400 }
      );
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

    // Can only update clips during REVIEWING status
    if (compilation.status !== 'REVIEWING') {
      return NextResponse.json(
        {
          error: {
            message: `Cannot remove clips in status: ${compilation.status}. Must be in REVIEWING status.`,
            code: 'INVALID_STATE',
          },
        },
        { status: 400 }
      );
    }

    await compilationService.removeClip(id, sourceClipId);

    logger.info('Clip removed from compilation', {
      compilationId: id,
      userId: session.user.id,
      clipId: sourceClipId,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    logger.error('Failed to remove clip', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: 'Failed to remove clip',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}
