import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { compilationService } from '@/lib/services/compilation.service';
import { UpdateScriptRequest } from '@/types/compilation';
import { logger } from '@/lib/utils/logger';

/**
 * PUT /api/compilations/[id]/script
 * Update the narration script for a compilation
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
    const body: UpdateScriptRequest = await request.json();

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

    // Can only update script during REVIEWING status
    if (compilation.status !== 'REVIEWING') {
      return NextResponse.json(
        {
          error: {
            message: `Cannot update script in status: ${compilation.status}. Must be in REVIEWING status.`,
            code: 'INVALID_STATE',
          },
        },
        { status: 400 }
      );
    }

    // Validate script structure
    if (!body.intro?.text && !body.segments?.length && !body.outro?.text) {
      return NextResponse.json(
        {
          error: {
            message: 'Script must have at least intro, segments, or outro',
            code: 'VALIDATION_ERROR',
          },
        },
        { status: 400 }
      );
    }

    // Get current script and merge updates
    const currentScript = compilation.script || {
      intro: { text: '' },
      segments: [],
      outro: { text: '' },
      totalEstimatedDuration: 0,
    };

    // Update intro if provided
    if (body.intro?.text !== undefined) {
      currentScript.intro.text = body.intro.text;
    }

    // Update outro if provided
    if (body.outro?.text !== undefined) {
      currentScript.outro.text = body.outro.text;
    }

    // Update segment narrations if provided
    if (body.segments?.length) {
      // Also update the compilation clips with narrations
      const clipUpdates = body.segments.map((seg) => ({
        sourceClipId: seg.clipId,
        narrationBefore: seg.narrationBefore,
        narrationDuring: seg.narrationDuring,
        narrationAfter: seg.narrationAfter,
      }));

      await compilationService.updateClipNarrations(id, clipUpdates);

      // Update the script segments
      for (const update of body.segments) {
        const segmentIndex = currentScript.segments.findIndex(
          (s) => s.clipId === update.clipId
        );
        if (segmentIndex !== -1) {
          if (update.narrationBefore !== undefined) {
            currentScript.segments[segmentIndex].narrationBefore = {
              text: update.narrationBefore,
            };
          }
          if (update.narrationDuring !== undefined) {
            currentScript.segments[segmentIndex].narrationDuring = {
              text: update.narrationDuring,
            };
          }
          if (update.narrationAfter !== undefined) {
            currentScript.segments[segmentIndex].narrationAfter = {
              text: update.narrationAfter,
            };
          }
        }
      }
    }

    // Recalculate estimated duration
    let totalDuration = 0;
    // Estimate ~2.5 words per second for narration
    const wordsPerSecond = 2.5;

    if (currentScript.intro.text) {
      totalDuration += currentScript.intro.text.split(/\s+/).length / wordsPerSecond;
    }

    for (const segment of currentScript.segments) {
      // Add clip segment duration
      totalDuration += segment.clipEnd - segment.clipStart;

      // Add narration durations
      if (segment.narrationBefore?.text) {
        totalDuration +=
          segment.narrationBefore.text.split(/\s+/).length / wordsPerSecond;
      }
      // narrationDuring doesn't add to duration (plays over clip)
      if (segment.narrationAfter?.text) {
        totalDuration +=
          segment.narrationAfter.text.split(/\s+/).length / wordsPerSecond;
      }
    }

    if (currentScript.outro.text) {
      totalDuration += currentScript.outro.text.split(/\s+/).length / wordsPerSecond;
    }

    currentScript.totalEstimatedDuration = Math.round(totalDuration);

    // Save the updated script
    await compilationService.saveScript(id, currentScript);

    logger.info('Compilation script updated', {
      compilationId: id,
      userId: session.user.id,
    });

    return NextResponse.json({
      success: true,
      script: currentScript,
    });
  } catch (error: any) {
    logger.error('Failed to update script', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: 'Failed to update script',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}
