import { google, Auth } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../db/prisma';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { generateThumbnail } from '../utils/ffmpeg';
import {
  YouTubeAccount,
  YouTubeUploadOptions,
  YouTubeUploadProgress,
  YouTubeUploadResult,
} from '../shared/types/youtube';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

export class YouTubeUploadService {
  private oauth2Client: Auth.OAuth2Client | null = null;

  /**
   * Get or create OAuth2 client
   */
  private getOAuth2Client(): Auth.OAuth2Client {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new Error('Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local');
    }

    if (!this.oauth2Client) {
      this.oauth2Client = new google.auth.OAuth2(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        env.GOOGLE_REDIRECT_URI
      );
    }

    return this.oauth2Client;
  }

  /**
   * Generate OAuth URL for user to authorize
   */
  getAuthUrl(): string {
    const oauth2Client = this.getOAuth2Client();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent', // Force consent to always get refresh token
    });

    return authUrl;
  }

  /**
   * Handle OAuth callback - exchange code for tokens and save account
   */
  async handleCallback(code: string, userId: string): Promise<YouTubeAccount> {
    const oauth2Client = this.getOAuth2Client();

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Failed to get tokens from Google');
    }

    oauth2Client.setCredentials(tokens);

    // Get user info (email)
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    if (!userInfo.email) {
      throw new Error('Failed to get user email from Google');
    }

    // Get YouTube channel info
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const { data: channelData } = await youtube.channels.list({
      part: ['snippet'],
      mine: true,
    });

    const channel = channelData.items?.[0];
    if (!channel?.id) {
      throw new Error('No YouTube channel found for this account');
    }

    const tokenExpiry = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600000); // Default 1 hour

    // Upsert YouTube account for this user
    const account = await prisma.youTubeAccount.upsert({
      where: { userId },
      update: {
        email: userInfo.email,
        channelId: channel.id,
        channelTitle: channel.snippet?.title || null,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry,
      },
      create: {
        userId,
        email: userInfo.email,
        channelId: channel.id,
        channelTitle: channel.snippet?.title || null,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry,
      },
    });

    logger.info('YouTube account connected', { userId, email: account.email, channelId: account.channelId });

    return this.prismaToAccount(account);
  }

  /**
   * Get connected YouTube account for a user
   */
  async getConnectedAccount(userId: string): Promise<YouTubeAccount | null> {
    const account = await prisma.youTubeAccount.findUnique({
      where: { userId },
    });

    if (!account) {
      return null;
    }

    return this.prismaToAccount(account);
  }

  /**
   * Refresh access token if expired
   */
  private async refreshTokenIfNeeded(account: YouTubeAccount, userId: string): Promise<YouTubeAccount> {
    // Check if token expires in the next 5 minutes
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    if (account.tokenExpiry > Date.now() + bufferTime) {
      return account; // Token still valid
    }

    logger.info('Refreshing YouTube access token', { userId, email: account.email });

    const oauth2Client = this.getOAuth2Client();
    oauth2Client.setCredentials({
      refresh_token: account.refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    if (!credentials.access_token) {
      throw new Error('Failed to refresh access token');
    }

    const newExpiry = credentials.expiry_date
      ? new Date(credentials.expiry_date)
      : new Date(Date.now() + 3600000);

    // Update account in database
    await prisma.youTubeAccount.update({
      where: { userId },
      data: {
        accessToken: credentials.access_token,
        tokenExpiry: newExpiry,
      },
    });

    return {
      ...account,
      accessToken: credentials.access_token,
      tokenExpiry: newExpiry.getTime(),
    };
  }

  /**
   * Upload video to YouTube with progress tracking
   * Automatically extracts a thumbnail at 2 seconds and uploads it
   */
  async uploadVideo(
    userId: string,
    clipPath: string,
    options: YouTubeUploadOptions,
    onProgress?: (progress: YouTubeUploadProgress) => void
  ): Promise<YouTubeUploadResult> {
    // Get connected account for this user
    let account = await this.getConnectedAccount(userId);
    if (!account) {
      throw new Error('No YouTube account connected. Please connect your account first.');
    }

    // Refresh token if needed
    account = await this.refreshTokenIfNeeded(account, userId);

    // Verify file exists
    if (!fs.existsSync(clipPath)) {
      throw new Error(`Video file not found: ${clipPath}`);
    }

    const fileSize = fs.statSync(clipPath).size;

    // Set up OAuth client with fresh credentials
    const oauth2Client = this.getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
    });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    logger.info('Starting YouTube upload', {
      userId,
      title: options.title,
      privacy: options.privacy,
      fileSize,
    });

    // Extract thumbnail at 2 seconds for YouTube
    const thumbnailPath = path.join(os.tmpdir(), `yt-thumb-${uuidv4()}.jpg`);
    let thumbnailExtracted = false;

    try {
      await generateThumbnail(clipPath, thumbnailPath, 2);
      thumbnailExtracted = fs.existsSync(thumbnailPath);
      logger.info('Thumbnail extracted for YouTube upload', { thumbnailPath, success: thumbnailExtracted });
    } catch (err: any) {
      logger.warn('Failed to extract thumbnail, will upload without custom thumbnail', { error: err.message });
    }

    // Create upload stream
    const fileStream = fs.createReadStream(clipPath);

    // Track upload progress
    let bytesUploaded = 0;
    fileStream.on('data', (chunk: Buffer | string) => {
      bytesUploaded += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      if (onProgress) {
        onProgress({
          percentage: Math.round((bytesUploaded / fileSize) * 100),
          bytesUploaded,
          totalBytes: fileSize,
        });
      }
    });

    // Upload to YouTube
    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: options.title,
          description: options.description,
          categoryId: '22', // People & Blogs category
        },
        status: {
          privacyStatus: options.privacy,
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fileStream,
      },
    });

    if (!response.data.id) {
      throw new Error('Upload completed but no video ID returned');
    }

    const videoId = response.data.id;

    // Upload custom thumbnail if extraction was successful
    if (thumbnailExtracted) {
      try {
        await this.uploadThumbnail(youtube, videoId, thumbnailPath);
        logger.info('Custom thumbnail uploaded successfully', { videoId });
      } catch (err: any) {
        // Log but don't fail - thumbnail upload requires verified channel
        logger.warn('Failed to upload custom thumbnail (channel may need verification)', {
          error: err.message,
          videoId
        });
      } finally {
        // Clean up temporary thumbnail file
        try {
          fs.unlinkSync(thumbnailPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    const result: YouTubeUploadResult = {
      videoId,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      title: options.title,
    };

    logger.info('YouTube upload completed', { userId, ...result });

    return result;
  }

  /**
   * Upload a custom thumbnail for a video
   * Note: Requires channel to be verified for custom thumbnails
   */
  private async uploadThumbnail(
    youtube: ReturnType<typeof google.youtube>,
    videoId: string,
    thumbnailPath: string
  ): Promise<void> {
    const thumbnailStream = fs.createReadStream(thumbnailPath);

    await youtube.thumbnails.set({
      videoId,
      media: {
        mimeType: 'image/jpeg',
        body: thumbnailStream,
      },
    });
  }

  /**
   * Disconnect YouTube account for a user
   */
  async disconnectAccount(userId: string): Promise<void> {
    await prisma.youTubeAccount.delete({
      where: { userId },
    }).catch(() => {
      // Ignore if account doesn't exist
    });

    logger.info('YouTube account disconnected', { userId });
  }

  /**
   * Convert Prisma record to YouTubeAccount object
   */
  private prismaToAccount(record: any): YouTubeAccount {
    return {
      id: record.id,
      email: record.email,
      channelId: record.channelId,
      channelTitle: record.channelTitle || undefined,
      accessToken: record.accessToken,
      refreshToken: record.refreshToken,
      tokenExpiry: record.tokenExpiry.getTime(),
      createdAt: record.createdAt,
    };
  }
}

export const youtubeUploadService = new YouTubeUploadService();
