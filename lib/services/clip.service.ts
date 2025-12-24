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
  titles?: string[]; // Title overlay for each clip
}

export interface GeneratedClip {
  id: string;
  videoPath: string;
  thumbnailPath: string;
  startTime: number;
  endTime: number;
  duration: number;
  score: number;
  title?: string; // The title burned into the video
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
      const title = options.titles?.[i]; // Get title for this clip

      try {
        const clip = await this.generateClip(
          videoPath,
          scene,
          clipId,
          outputDir,
          qualityPreset,
          options.subtitlePath,
          title,
          (percent) => onProgress?.(i, percent)
        );

        clips.push(clip);
        logger.info(`Clip ${i + 1}/${scenes.length} generated`, { clipId, title });
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
    title?: string,
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

    // Add title overlay if provided (supports multi-line)
    if (title) {
      const titleFilters = this.buildTitleFilters(title);
      filters.push(...titleFilters);
    }

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
      title,
    };
  }

  /**
   * Escape text for FFmpeg drawtext filter
   * FFmpeg requires special characters to be escaped
   */
  private escapeTextForFFmpeg(text: string): string {
    return text
      .replace(/\\/g, '\\\\\\\\') // Backslashes
      .replace(/'/g, "'\\\\\\''") // Single quotes
      .replace(/:/g, '\\:') // Colons
      .replace(/%/g, '\\%') // Percent signs
      .replace(/\n/g, '') // Remove newlines (handle separately)
      .trim();
  }

  /**
   * Split title into multiple lines at word boundaries
   * Supports up to 3 lines for longer titles
   */
  private splitTitleIntoLines(title: string, maxCharsPerLine: number = 20): string[] {
    if (title.length <= maxCharsPerLine) {
      return [title];
    }

    const words = title.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;

      if (testLine.length <= maxCharsPerLine) {
        currentLine = testLine;
      } else {
        // Current line is full, start a new line
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }

    // Don't forget the last line
    if (currentLine) {
      lines.push(currentLine);
    }

    // Limit to 3 lines max
    return lines.slice(0, 3);
  }

  /**
   * Build FFmpeg drawtext filters for title overlay
   * Style: Large bold white text with thick black outline (like TikTok/YouTube Shorts)
   */
  private buildTitleFilters(title: string): string[] {
    // 18 chars per line with Impact font on 1080px width
    const lines = this.splitTitleIntoLines(title, 18);
    const filters: string[] = [];

    logger.info('Building title filters', { title, lines, lineCount: lines.length });

    // Font settings - large, bold, prominent
    const fontSize = 68;
    const borderWidth = 5;
    const lineHeight = 80; // Space between lines
    const baseY = 70; // Starting Y position from top

    lines.forEach((line, index) => {
      const escapedLine = this.escapeTextForFFmpeg(line);
      const yPos = baseY + (index * lineHeight);

      // Main text with thick black border and bold font
      // Use fontfile for Windows compatibility
      filters.push(
        `drawtext=text='${escapedLine}':` +
        `fontfile='C\\:/Windows/Fonts/impact.ttf':` +
        `fontsize=${fontSize}:` +
        `fontcolor=white:` +
        `borderw=${borderWidth}:` +
        `bordercolor=black:` +
        `x=(w-text_w)/2:` +
        `y=${yPos}:` +
        `enable='between(t,0,10)':` +
        `alpha='if(lt(t,9),1,max(0,1-(t-9)))'`
      );
    });

    logger.info('Title filters built', { filterCount: filters.length, filters });

    return filters;
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

  /**
   * Add title overlay to an existing clip
   * Re-encodes the clip with the title burned in
   */
  async addTitleToClip(
    clipPath: string,
    title: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    const qualityPreset = VIDEO_CONFIG.qualityPresets['medium'];
    const tempPath = clipPath.replace('.mp4', '_temp.mp4');

    logger.info('Adding title to clip', { clipPath, title });

    // Get clip duration for progress tracking
    const metadata = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(clipPath, (err, data) => {
        if (err) reject(err);
        else resolve(data.format.duration || 30);
      });
    });

    // Build title filters (supports multi-line)
    const titleFilters = this.buildTitleFilters(title);
    const filterComplex = titleFilters.join(',');

    // Re-encode with title
    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg(clipPath)
        .videoCodec('libx264')
        .videoBitrate(qualityPreset.videoBitrate)
        .fps(VIDEO_CONFIG.defaults.fps)
        .audioCodec('aac')
        .audioBitrate(qualityPreset.audioBitrate)
        .outputOptions([
          `-preset ${qualityPreset.preset}`,
          '-movflags +faststart',
        ])
        .videoFilters(filterComplex)
        .output(tempPath);

      if (onProgress) {
        command = command.on(
          'progress',
          createProgressHandler(metadata, onProgress)
        );
      }

      command
        .on('end', () => resolve())
        .on('error', (err, stdout, stderr) => {
          logger.error('FFmpeg title overlay error', {
            error: err.message,
            stdout,
            stderr,
          });
          reject(err);
        })
        .run();
    });

    // Replace original with new version
    const fs = await import('fs/promises');
    await fs.unlink(clipPath);
    await fs.rename(tempPath, clipPath);

    logger.info('Title added to clip successfully', { clipPath, title });
  }
}

export const clipService = new ClipService();
