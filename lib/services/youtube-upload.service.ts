import { google, Auth } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import { db } from '../db/client';
import { env } from '@/config/env';
import { logger } from '../utils/logger';
import {
  YouTubeAccount,
  YouTubeAccountRecord,
  YouTubeUploadOptions,
  YouTubeUploadProgress,
  YouTubeUploadResult,
} from '@/types/youtube';

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
  async handleCallback(code: string): Promise<YouTubeAccount> {
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

    // Check if account already exists
    const existingAccount = await this.getAccountByEmail(userInfo.email);
    const accountId = existingAccount?.id || uuidv4();
    const now = Date.now();

    const account: YouTubeAccount = {
      id: accountId,
      email: userInfo.email,
      channelId: channel.id,
      channelTitle: channel.snippet?.title || undefined,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: tokens.expiry_date || now + 3600000, // Default 1 hour if not provided
      createdAt: existingAccount?.createdAt || new Date(now),
    };

    // Upsert account to database
    if (existingAccount) {
      const stmt = db.prepare(`
        UPDATE youtube_accounts
        SET access_token = ?, refresh_token = ?, token_expiry = ?, channel_title = ?
        WHERE id = ?
      `);
      stmt.run(account.accessToken, account.refreshToken, account.tokenExpiry, account.channelTitle || null, account.id);
    } else {
      const stmt = db.prepare(`
        INSERT INTO youtube_accounts (id, email, channel_id, channel_title, access_token, refresh_token, token_expiry, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        account.id,
        account.email,
        account.channelId,
        account.channelTitle || null,
        account.accessToken,
        account.refreshToken,
        account.tokenExpiry,
        now
      );
    }

    logger.info('YouTube account connected', { email: account.email, channelId: account.channelId });

    return account;
  }

  /**
   * Get connected YouTube account (returns first/only account for MVP)
   */
  async getConnectedAccount(): Promise<YouTubeAccount | null> {
    const stmt = db.prepare('SELECT * FROM youtube_accounts LIMIT 1');
    const record = stmt.get() as YouTubeAccountRecord | undefined;

    if (!record) {
      return null;
    }

    return this.recordToAccount(record);
  }

  /**
   * Get account by email
   */
  async getAccountByEmail(email: string): Promise<YouTubeAccount | null> {
    const stmt = db.prepare('SELECT * FROM youtube_accounts WHERE email = ?');
    const record = stmt.get(email) as YouTubeAccountRecord | undefined;

    if (!record) {
      return null;
    }

    return this.recordToAccount(record);
  }

  /**
   * Refresh access token if expired
   */
  private async refreshTokenIfNeeded(account: YouTubeAccount): Promise<YouTubeAccount> {
    // Check if token expires in the next 5 minutes
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    if (account.tokenExpiry > Date.now() + bufferTime) {
      return account; // Token still valid
    }

    logger.info('Refreshing YouTube access token', { email: account.email });

    const oauth2Client = this.getOAuth2Client();
    oauth2Client.setCredentials({
      refresh_token: account.refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    if (!credentials.access_token) {
      throw new Error('Failed to refresh access token');
    }

    // Update account in database
    const stmt = db.prepare(`
      UPDATE youtube_accounts
      SET access_token = ?, token_expiry = ?
      WHERE id = ?
    `);
    stmt.run(credentials.access_token, credentials.expiry_date || Date.now() + 3600000, account.id);

    return {
      ...account,
      accessToken: credentials.access_token,
      tokenExpiry: credentials.expiry_date || Date.now() + 3600000,
    };
  }

  /**
   * Upload video to YouTube with progress tracking
   */
  async uploadVideo(
    clipPath: string,
    options: YouTubeUploadOptions,
    onProgress?: (progress: YouTubeUploadProgress) => void
  ): Promise<YouTubeUploadResult> {
    // Get connected account
    let account = await this.getConnectedAccount();
    if (!account) {
      throw new Error('No YouTube account connected. Please connect your account first.');
    }

    // Refresh token if needed
    account = await this.refreshTokenIfNeeded(account);

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
      title: options.title,
      privacy: options.privacy,
      fileSize,
    });

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

    const result: YouTubeUploadResult = {
      videoId: response.data.id,
      videoUrl: `https://www.youtube.com/watch?v=${response.data.id}`,
      title: options.title,
    };

    logger.info('YouTube upload completed', result);

    return result;
  }

  /**
   * Disconnect YouTube account
   */
  async disconnectAccount(): Promise<void> {
    const stmt = db.prepare('DELETE FROM youtube_accounts');
    stmt.run();
    logger.info('YouTube account disconnected');
  }

  /**
   * Convert database record to YouTubeAccount object
   */
  private recordToAccount(record: YouTubeAccountRecord): YouTubeAccount {
    return {
      id: record.id,
      email: record.email,
      channelId: record.channel_id,
      channelTitle: record.channel_title || undefined,
      accessToken: record.access_token,
      refreshToken: record.refresh_token,
      tokenExpiry: record.token_expiry,
      createdAt: new Date(record.created_at),
    };
  }
}

export const youtubeUploadService = new YouTubeUploadService();
