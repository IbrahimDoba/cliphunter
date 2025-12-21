import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import * as path from 'path';
import { env } from '@/config/env';
import { logger } from '@/lib/utils/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clipId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const download = searchParams.get('download') === 'true';

    // Construct file path (assumes format: {jobId}/{clipId}.mp4)
    // The clipId in the URL will be in format: {jobId}/clips/{clipId}
    const relativePath = clipId.endsWith('.mp4') ? clipId : `${clipId}.mp4`;
    const filePath = path.join(process.cwd(), env.OUTPUT_DIR, relativePath);

    logger.debug('Serving clip', { clipId, filePath });

    // Check if file exists
    const fileStats = await stat(filePath);

    if (!fileStats.isFile()) {
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

    // Read file
    const fileBuffer = await readFile(filePath);

    // Determine content disposition
    const disposition = download
      ? `attachment; filename="${path.basename(filePath)}"`
      : 'inline';

    // Return video file
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': fileStats.size.toString(),
        'Content-Disposition': disposition,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
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

    logger.error('Failed to serve clip', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: 'Failed to serve clip',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}
