import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { env } from '@/config/env';
import { logger } from '../utils/logger';
import { sanitizeFilename, extractVideoId } from '../utils/validation';

const execPromise = promisify(exec);

export interface YouTubeVideoInfo {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
  videoPath: string;
}

export class YouTubeService {
  private tempDir: string;

  constructor() {
    this.tempDir = path.resolve(process.cwd(), env.TEMP_DIR);
    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create temp directory', error);
    }
  }

  /**
   * Download video from YouTube
   */
  async downloadVideo(
    videoUrl: string,
    jobId: string
  ): Promise<YouTubeVideoInfo> {
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    // Use forward slashes for yt-dlp (works on Windows too)
    const outputTemplate = path.join(this.tempDir, `${jobId}_%(id)s.%(ext)s`).replace(/\\/g, '/');

    logger.info('Starting video download', { videoUrl, jobId });

    try {
      // First, get video info
      const info = await this.getVideoInfo(videoUrl);

      // Download video
      const command = `yt-dlp --format "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 --output "${outputTemplate}" --no-playlist --quiet --progress "${videoUrl}"`;

      logger.debug('Executing yt-dlp command', { command });

      await execPromise(command, {
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      });

      // Find the downloaded file
      const files = await fs.readdir(this.tempDir);
      const videoFile = files.find((file) => file.startsWith(jobId));

      if (!videoFile) {
        throw new Error('Downloaded file not found');
      }

      const videoPath = path.join(this.tempDir, videoFile);

      logger.info('Video downloaded successfully', { videoPath });

      return {
        id: videoId,
        title: info.title,
        duration: info.duration,
        thumbnail: info.thumbnail,
        videoPath,
      };
    } catch (error: any) {
      logger.error('Video download failed', { error: error.message, videoUrl });
      throw new Error(`Failed to download video: ${error.message}`);
    }
  }

  /**
   * Get video information without downloading
   */
  async getVideoInfo(videoUrl: string): Promise<{
    title: string;
    duration: number;
    thumbnail: string;
  }> {
    try {
      const command = `yt-dlp --dump-json --no-playlist --quiet "${videoUrl}"`;

      const { stdout } = await execPromise(command);
      const info = JSON.parse(stdout);

      return {
        title: sanitizeFilename(info.title || 'Unknown'),
        duration: info.duration || 0,
        thumbnail: info.thumbnail || '',
      };
    } catch (error: any) {
      logger.error('Failed to get video info', { error: error.message, videoUrl });
      throw new Error(`Failed to get video information: ${error.message}`);
    }
  }

  /**
   * Clean up downloaded video file
   */
  async cleanup(videoPath: string): Promise<void> {
    try {
      await fs.unlink(videoPath);
      logger.debug('Cleaned up video file', { videoPath });
    } catch (error) {
      logger.warn('Failed to cleanup video file', { error, videoPath });
    }
  }

  /**
   * Check if yt-dlp is installed
   */
  async checkDependencies(): Promise<boolean> {
    try {
      await execPromise('yt-dlp --version');
      return true;
    } catch {
      return false;
    }
  }
}

export const youtubeService = new YouTubeService();
