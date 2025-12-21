import * as path from 'path';
import { Scene } from '@/types/clip';
import { VIDEO_CONFIG } from '@/config/constants';
import { logger } from '../utils/logger';
import {
  ffmpeg,
  formatTime,
  generateThumbnail,
  createProgressHandler,
} from '../utils/ffmpeg';
import { v4 as uuidv4 } from 'uuid';

export interface ClipGenerationOptions {
  includeSubtitles?: boolean;
  subtitlePath?: string;
  quality?: 'low' | 'medium' | 'high';
}

export interface GeneratedClip {
  id: string;
  videoPath: string;
  thumbnailPath: string;
  startTime: number;
  endTime: number;
  duration: number;
  score: number;
}

export class ClipService {
  /**
   * Generate clips from video based on scenes
   */
  async generateClips(
    videoPath: string,
    scenes: Scene[],
    outputDir: string,
    options: ClipGenerationOptions = {},
    onProgress?: (clipIndex: number, percent: number) => void
  ): Promise<GeneratedClip[]> {
    logger.info('Generating clips', { videoPath, sceneCount: scenes.length });

    const clips: GeneratedClip[] = [];
    const quality = options.quality || VIDEO_CONFIG.defaults.quality;
    const qualityPreset = VIDEO_CONFIG.qualityPresets[quality];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const clipId = uuidv4();

      try {
        const clip = await this.generateClip(
          videoPath,
          scene,
          clipId,
          outputDir,
          qualityPreset,
          options.subtitlePath,
          (percent) => onProgress?.(i, percent)
        );

        clips.push(clip);
        logger.info(`Clip ${i + 1}/${scenes.length} generated`, { clipId });
      } catch (error) {
        logger.error(`Failed to generate clip ${i + 1}`, { error, scene });
      }
    }

    logger.info('All clips generated', { clipCount: clips.length });

    return clips;
  }

  /**
   * Generate a single clip
   */
  private async generateClip(
    videoPath: string,
    scene: Scene,
    clipId: string,
    outputDir: string,
    qualityPreset: { videoBitrate: string; audioBitrate: string; preset: string },
    subtitlePath?: string,
    onProgress?: (percent: number) => void
  ): Promise<GeneratedClip> {
    const clipPath = path.join(outputDir, 'clips', `${clipId}.mp4`);
    const thumbnailPath = path.join(outputDir, 'thumbnails', `${clipId}.jpg`);

    // Build video filters
    const filters: string[] = [];

    // Crop to vertical format (9:16)
    filters.push('crop=ih*9/16:ih');

    // Scale to target resolution
    filters.push(`scale=${VIDEO_CONFIG.defaults.resolution.width}:${VIDEO_CONFIG.defaults.resolution.height}`);

    const filterComplex = filters.join(',');

    // Generate clip
    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg(videoPath)
        .setStartTime(formatTime(scene.startTime))
        .setDuration(scene.duration)
        .videoCodec('libx264')
        .videoBitrate(qualityPreset.videoBitrate)
        .fps(VIDEO_CONFIG.defaults.fps)
        .audioCodec('aac')
        .audioBitrate(qualityPreset.audioBitrate)
        .outputOptions([
          `-preset ${qualityPreset.preset}`,
          '-movflags +faststart', // Optimize for streaming
        ])
        .videoFilters(filterComplex)
        .output(clipPath);

      if (onProgress) {
        command = command.on(
          'progress',
          createProgressHandler(scene.duration, onProgress)
        );
      }

      command
        .on('end', () => resolve())
        .on('error', (err, stdout, stderr) => {
          logger.error('FFmpeg clip generation error', {
            error: err.message,
            stdout,
            stderr,
            scene,
          });
          reject(err);
        })
        .on('stderr', (stderrLine) => {
          logger.debug('FFmpeg stderr:', stderrLine);
        })
        .run();
    });

    // Generate thumbnail
    await generateThumbnail(clipPath, thumbnailPath, 0);

    return {
      id: clipId,
      videoPath: clipPath,
      thumbnailPath,
      startTime: scene.startTime,
      endTime: scene.endTime,
      duration: scene.duration,
      score: scene.score,
    };
  }

  /**
   * Generate thumbnail for an existing clip
   */
  async generateClipThumbnail(
    clipPath: string,
    outputPath: string,
    timeInSeconds: number = 0
  ): Promise<void> {
    await generateThumbnail(clipPath, outputPath, timeInSeconds);
  }
}

export const clipService = new ClipService();
