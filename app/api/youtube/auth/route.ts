import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { youtubeUploadService } from '@/lib/services/youtube-upload.service';
import { YouTubeAuthUrlResponse, YouTubeAccountResponse } from '@/types/youtube';

/**
 * GET /api/youtube/auth
 * Returns the OAuth URL for connecting YouTube account
 * or the connected account info if already connected
 */
export async function GET() {
  try {
    // Check authentication
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

    // Check if Google credentials are configured
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.json(
        {
          error: {
            message: 'YouTube integration not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local',
            code: 'NOT_CONFIGURED',
          },
        },
        { status: 503 }
      );
    }

    // Check if already connected for this user
    const account = await youtubeUploadService.getConnectedAccount(session.user.id);

    if (account) {
      const response: YouTubeAccountResponse = {
        connected: true,
        email: account.email,
        channelTitle: account.channelTitle,
      };
      return NextResponse.json(response);
    }

    // Generate auth URL
    const authUrl = youtubeUploadService.getAuthUrl();

    const response: YouTubeAuthUrlResponse = {
      authUrl,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('YouTube auth error:', error);
    return NextResponse.json(
      {
        error: {
          message: error.message || 'Failed to get YouTube auth URL',
          code: 'YOUTUBE_AUTH_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/youtube/auth
 * Disconnects the YouTube account
 */
export async function DELETE() {
  try {
    // Check authentication
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

    await youtubeUploadService.disconnectAccount(session.user.id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('YouTube disconnect error:', error);
    return NextResponse.json(
      {
        error: {
          message: error.message || 'Failed to disconnect YouTube account',
          code: 'YOUTUBE_DISCONNECT_ERROR',
        },
      },
      { status: 500 }
    );
  }
}
