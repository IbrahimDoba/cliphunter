import { NextRequest, NextResponse } from 'next/server';
import { youtubeUploadService } from '@/lib/services/youtube-upload.service';

/**
 * GET /api/youtube/callback
 * Handles OAuth callback from Google
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    // Handle error from Google
    if (error) {
      console.error('OAuth error from Google:', error);
      return NextResponse.redirect(
        new URL(`/youtube/callback?error=${encodeURIComponent(error)}`, request.url)
      );
    }

    // Validate code
    if (!code) {
      return NextResponse.redirect(
        new URL('/youtube/callback?error=No authorization code received', request.url)
      );
    }

    // Exchange code for tokens and save account
    const account = await youtubeUploadService.handleCallback(code);

    // Redirect to success page (will be handled by frontend)
    return NextResponse.redirect(
      new URL(
        `/youtube/callback?success=true&email=${encodeURIComponent(account.email)}&channel=${encodeURIComponent(account.channelTitle || '')}`,
        request.url
      )
    );
  } catch (error: any) {
    console.error('YouTube callback error:', error);
    return NextResponse.redirect(
      new URL(`/youtube/callback?error=${encodeURIComponent(error.message || 'Failed to connect YouTube account')}`, request.url)
    );
  }
}
