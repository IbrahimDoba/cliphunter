import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffprobePath from '@ffprobe-installer/ffprobe';
import { VideoMetadata } from '@/types/clip';
import { logger } from './logger';

// Set ffmpeg and ffprobe paths
ffmpeg.setFfmpegPath(ffmpegPath.path);
ffmpeg.setFfprobePath(ffprobePath.path);

/**
 * Get video metadata using ffprobe
 */
export async function getVideoMetadata(videoPath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        logger.error('Failed to get video metadata', { error: err, videoPath });
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      if (!videoStream) {
        reject(new Error('No video stream found'));
        return;
      }

      resolve({
        duration: metadata.format.duration || 0,
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        fps: eval(videoStream.r_frame_rate || '30') || 30, // e.g., "30/1" -> 30
        codec: videoStream.codec_name || '',
        bitrate: metadata.format.bit_rate || 0,
        title: metadata.format.tags?.title as string | undefined,
      });
    });
  });
}

/**
 * Format seconds to HH:MM:SS.mmm format for ffmpeg
 */
export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`;
}

/**
 * Extract audio from video
 */
export async function extractAudio(
  videoPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('pcm_s16le')
      .audioFrequency(16000)
      .audioChannels(1)
      .output(outputPath)
      .on('end', () => {
        logger.info('Audio extracted successfully', { outputPath });
        resolve();
      })
      .on('error', (err) => {
        logger.error('Audio extraction failed', { error: err, videoPath });
        reject(err);
      })
      .run();
  });
}

/**
 * Generate thumbnail from video at specific time
 */
export async function generateThumbnail(
  videoPath: string,
  outputPath: string,
  timeInSeconds: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Normalize path to use forward slashes and get directory
    const normalizedPath = outputPath.replace(/\\/g, '/');
    const filename = normalizedPath.split('/').pop() || 'thumbnail.jpg';
    const folder = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));

    if (!folder) {
      reject(new Error('Invalid output path for thumbnail'));
      return;
    }

    ffmpeg(videoPath)
      .screenshots({
        timestamps: [timeInSeconds],
        filename,
        folder,
        size: '1080x1920',
      })
      .on('end', () => {
        logger.debug('Thumbnail generated', { outputPath, time: timeInSeconds });
        resolve();
      })
      .on('error', (err) => {
        logger.error('Thumbnail generation failed', { error: err, videoPath });
        reject(err);
      });
  });
}

/**
 * Create progress handler for ffmpeg
 */
export function createProgressHandler(
  duration: number,
  onProgress: (percent: number) => void
) {
  return (progress: { timemark: string }) => {
    // Parse timemark (format: HH:MM:SS.ms)
    const parts = progress.timemark.split(':');
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    const currentTime = hours * 3600 + minutes * 60 + seconds;

    const percent = Math.min((currentTime / duration) * 100, 100);
    onProgress(Math.round(percent));
  };
}

export { ffmpeg };
