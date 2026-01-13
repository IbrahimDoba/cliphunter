import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { compilationService } from '@/lib/services/compilation.service';
import * as fs from 'fs';
import * as path from 'path';

/**
 * GET /api/jobs/[id]/compilations/[compilationId]/video
 * Stream the compilation video file
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; compilationId: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }

    const { id: jobId, compilationId } = await params;

    // Get compilation and verify ownership
    const compilation = await compilationService.getCompilationForUser(
      compilationId,
      session.user.id
    );

    if (!compilation) {
      return NextResponse.json(
        { error: { message: 'Compilation not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    // Verify job ID matches
    if (compilation.jobId !== jobId) {
      return NextResponse.json(
        { error: { message: 'Compilation not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    // Check if compilation has an output path
    if (!compilation.outputPath) {
      return NextResponse.json(
        { error: { message: 'Video not ready', code: 'NOT_READY' } },
        { status: 404 }
      );
    }

    // Verify file exists
    if (!fs.existsSync(compilation.outputPath)) {
      return NextResponse.json(
        { error: { message: 'Video file not found', code: 'FILE_NOT_FOUND' } },
        { status: 404 }
      );
    }

    // Get file stats
    const stats = fs.statSync(compilation.outputPath);
    const fileSize = stats.size;

    // Handle range requests for video streaming
    const range = request.headers.get('range');

    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      // Create read stream for the range
      const fileStream = fs.createReadStream(compilation.outputPath, {
        start,
        end,
      });

      // Convert Node stream to Web stream
      const webStream = new ReadableStream({
        start(controller) {
          fileStream.on('data', (chunk) => {
            controller.enqueue(chunk);
          });
          fileStream.on('end', () => {
            controller.close();
          });
          fileStream.on('error', (error) => {
            controller.error(error);
          });
        },
        cancel() {
          fileStream.destroy();
        },
      });

      return new NextResponse(webStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': 'video/mp4',
        },
      });
    } else {
      // Full file request
      const fileBuffer = fs.readFileSync(compilation.outputPath);

      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Length': fileSize.toString(),
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
        },
      });
    }
  } catch (error: any) {
    console.error('Failed to serve compilation video:', error);

    return NextResponse.json(
      { error: { message: 'Failed to serve video', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
