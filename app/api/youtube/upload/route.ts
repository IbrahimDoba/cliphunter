import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as path from 'path';
import { youtubeUploadService } from '@/lib/services/youtube-upload.service';
import { YouTubeUploadRequest, YouTubeUploadResponse } from '@/types/youtube';

// Request validation schema
const uploadSchema = z.object({
  clipPath: z.string().min(1, 'Clip path is required'),
  title: z.string().min(1, 'Title is required').max(100, 'Title must be 100 characters or less'),
  description: z.string().max(5000, 'Description must be 5000 characters or less').default(''),
  privacy: z.enum(['public', 'unlisted', 'private']).default('private'),
});

/**
 * POST /api/youtube/upload
 * Uploads a clip to YouTube
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const validationResult = uploadSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: {
            message: 'Invalid request',
            code: 'VALIDATION_ERROR',
            details: validationResult.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const { clipPath, title, description, privacy } = validationResult.data as YouTubeUploadRequest;

    // Resolve clip path (convert relative URL to absolute file path)
    // clipPath comes in format like "/outputs/jobId/clips/clipId.mp4"
    let absolutePath: string;
    if (clipPath.startsWith('/outputs/')) {
      absolutePath = path.join(process.cwd(), 'public', clipPath);
    } else if (path.isAbsolute(clipPath)) {
      absolutePath = clipPath;
    } else {
      absolutePath = path.join(process.cwd(), clipPath);
    }

    // Upload to YouTube
    const result = await youtubeUploadService.uploadVideo(absolutePath, {
      title,
      description,
      privacy,
    });

    const response: YouTubeUploadResponse = {
      videoId: result.videoId,
      videoUrl: result.videoUrl,
      title: result.title,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error: any) {
    console.error('YouTube upload error:', error);

    // Handle specific errors
    if (error.message?.includes('No YouTube account connected')) {
      return NextResponse.json(
        {
          error: {
            message: error.message,
            code: 'NOT_CONNECTED',
          },
        },
        { status: 401 }
      );
    }

    if (error.message?.includes('not found')) {
      return NextResponse.json(
        {
          error: {
            message: error.message,
            code: 'FILE_NOT_FOUND',
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: {
          message: error.message || 'Failed to upload to YouTube',
          code: 'UPLOAD_ERROR',
        },
      },
      { status: 500 }
    );
  }
}
