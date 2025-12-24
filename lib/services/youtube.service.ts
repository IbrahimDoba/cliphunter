import { exec, spawn } from 'child_process';
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

export interface DownloadProgress {
  percentage: number;
  speed: string;
  eta: string;
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
   * Download video from YouTube with progress tracking
   */
  async downloadVideo(
    videoUrl: string,
    jobId: string,
    onProgress?: (progress: DownloadProgress) => void
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

      // Download video with progress tracking using spawn
      await this.downloadWithProgress(videoUrl, outputTemplate, onProgress);

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
   * Download video using spawn for real-time progress
   */
  private downloadWithProgress(
    videoUrl: string,
    outputTemplate: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '--format', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '--output', outputTemplate,
        '--no-playlist',
        '--newline', // Output progress on new lines for easier parsing
        videoUrl,
      ];

      const ytdlp = spawn('yt-dlp', args);

      let lastProgress = 0;

      ytdlp.stdout.on('data', (data: Buffer) => {
        const output = data.toString();

        // Parse yt-dlp progress output
        // Format: [download]  45.2% of 150.00MiB at 5.00MiB/s ETA 00:15
        const progressMatch = output.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+[\d.]+\w+\s+at\s+([\d.]+\w+\/s)(?:\s+ETA\s+(\d+:\d+))?/);

        if (progressMatch && onProgress) {
          const percentage = parseFloat(progressMatch[1]);

          // Only update if progress changed significantly (avoid spam)
          if (percentage - lastProgress >= 1 || percentage >= 100) {
            lastProgress = percentage;
            onProgress({
              percentage: Math.round(percentage),
              speed: progressMatch[2] || 'calculating...',
              eta: progressMatch[3] || 'calculating...',
            });
          }
        }

        // Also check for merger progress
        const mergerMatch = output.match(/\[Merger\]/);
        if (mergerMatch && onProgress) {
          onProgress({
            percentage: 99,
            speed: 'merging...',
            eta: 'almost done',
          });
        }
      });

      ytdlp.stderr.on('data', (data: Buffer) => {
        const output = data.toString();
        logger.debug('yt-dlp stderr:', output);
      });

      ytdlp.on('close', (code) => {
        if (code === 0) {
          if (onProgress) {
            onProgress({ percentage: 100, speed: 'complete', eta: 'done' });
          }
          resolve();
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });

      ytdlp.on('error', (err) => {
        reject(new Error(`Failed to start yt-dlp: ${err.message}`));
      });
    });
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
