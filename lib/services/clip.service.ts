import * as path from "path";
import { Scene } from "@/types/clip";
import { VIDEO_CONFIG } from "@/config/constants";
import { logger } from "../utils/logger";
import {
  ffmpeg,
  formatTime,
  generateThumbnail,
  createProgressHandler,
} from "../utils/ffmpeg";
import { v4 as uuidv4 } from "uuid";
import { ClipSuggestion, SubtitleChunk } from "./gemini.service";

export interface ClipGenerationOptions {
  includeSubtitles?: boolean;
  subtitlePath?: string;
  subtitleChunks?: SubtitleChunk[][]; // Array of subtitle chunks per clip
  quality?: "low" | "medium" | "high";
  titles?: string[]; // Title overlay for each clip
  showSubscribe?: boolean; // Show "SUBSCRIBE :)" overlay at bottom
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
   * Generate clips from video based on scenes (parallel processing for speed)
   */
  async generateClips(
    videoPath: string,
    scenes: Scene[],
    outputDir: string,
    options: ClipGenerationOptions = {},
    onProgress?: (clipIndex: number, percent: number) => void
  ): Promise<GeneratedClip[]> {
    logger.info("Generating clips in parallel", {
      videoPath,
      sceneCount: scenes.length,
    });

    const quality = options.quality || VIDEO_CONFIG.defaults.quality;
    const qualityPreset = VIDEO_CONFIG.qualityPresets[quality];

    // Generate all clips in parallel for faster processing
    const clipPromises = scenes.map(async (scene, i) => {
      const clipId = uuidv4();
      const title = options.titles?.[i];
      const subtitleChunks = options.subtitleChunks?.[i];

      try {
        const clip = await this.generateClip(
          videoPath,
          scene,
          clipId,
          outputDir,
          qualityPreset,
          options.subtitlePath,
          title,
          subtitleChunks,
          options.showSubscribe ?? true, // Default to showing subscribe
          (percent) => onProgress?.(i, percent)
        );

        logger.info(`Clip ${i + 1}/${scenes.length} generated`, {
          clipId,
          title,
        });
        return clip;
      } catch (error) {
        logger.error(`Failed to generate clip ${i + 1}`, { error, scene });
        return null;
      }
    });

    const results = await Promise.all(clipPromises);
    const clips = results.filter(
      (clip): clip is GeneratedClip => clip !== null
    );

    logger.info("All clips generated", { clipCount: clips.length });

    return clips;
  }

  /**
   * Generate clips from Gemini's ClipSuggestion results
   * Converts Gemini's timestamp format (MM:SS) to seconds and generates clips
   */
  async generateClipsFromSuggestions(
    videoPath: string,
    suggestions: ClipSuggestion[],
    outputDir: string,
    options: ClipGenerationOptions = {},
    onProgress?: (clipIndex: number, percent: number) => void
  ): Promise<GeneratedClip[]> {
    logger.info("Generating clips from Gemini suggestions", {
      videoPath,
      suggestionCount: suggestions.length,
    });

    // Convert ClipSuggestions to Scene-like objects
    const scenes: Scene[] = suggestions.map((suggestion) => {
      const startTime = this.timestampToSeconds(suggestion.start_time);
      const endTime = this.timestampToSeconds(suggestion.end_time);

      return {
        startTime,
        endTime,
        duration: endTime - startTime,
        score: suggestion.virality_score / 10, // Normalize to 0-1 range
      };
    });

    // Extract titles from suggestions
    const titles = suggestions.map((s) => s.title);

    // Use existing generateClips method with titles
    return this.generateClips(
      videoPath,
      scenes,
      outputDir,
      { ...options, titles },
      onProgress
    );
  }

  /**
   * Convert MM:SS or HH:MM:SS timestamp to seconds
   */
  private timestampToSeconds(timestamp: string): number {
    const parts = timestamp.split(":").map(Number);

    if (parts.length === 2) {
      // MM:SS
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      // HH:MM:SS
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    return 0;
  }

  /**
   * Generate a single clip
   */
  private async generateClip(
    videoPath: string,
    scene: Scene,
    clipId: string,
    outputDir: string,
    qualityPreset: {
      videoBitrate: string;
      audioBitrate: string;
      preset: string;
    },
    subtitlePath?: string,
    title?: string,
    subtitleChunks?: SubtitleChunk[],
    showSubscribe: boolean = true,
    onProgress?: (percent: number) => void
  ): Promise<GeneratedClip> {
    const clipPath = path.join(outputDir, "clips", `${clipId}.mp4`);
    const thumbnailPath = path.join(outputDir, "thumbnails", `${clipId}.jpg`);

    // Build video filters
    const filters: string[] = [];

    // Crop to vertical format (9:16)
    filters.push("crop=ih*9/16:ih");

    // Scale to target resolution
    filters.push(
      `scale=${VIDEO_CONFIG.defaults.resolution.width}:${VIDEO_CONFIG.defaults.resolution.height}`
    );

    // Add title overlay if provided (supports multi-line)
    if (title) {
      const titleFilters = this.buildTitleFilters(title);
      filters.push(...titleFilters);
    }

    // Add subtitle overlays if provided (synced captions)
    if (subtitleChunks && subtitleChunks.length > 0) {
      const subtitleFilters = this.buildSubtitleFilters(subtitleChunks);
      filters.push(...subtitleFilters);
    }

    // Add subscribe text at bottom (optional)
    if (showSubscribe) {
      filters.push(this.buildSubscribeFilter());
    }

    const filterComplex = filters.join(",");

    // Generate clip with optimized settings
    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg(videoPath)
        .setStartTime(formatTime(scene.startTime))
        .setDuration(scene.duration)
        .videoCodec("libx264")
        .videoBitrate(qualityPreset.videoBitrate)
        .fps(VIDEO_CONFIG.defaults.fps)
        .audioCodec("aac")
        .audioBitrate(qualityPreset.audioBitrate)
        .outputOptions([
          `-preset ${qualityPreset.preset}`,
          "-threads 0", // Use all available CPU threads
          "-tune fastdecode", // Optimize for fast decoding
          "-movflags +faststart", // Optimize for streaming
        ])
        .videoFilters(filterComplex)
        .output(clipPath);

      if (onProgress) {
        command = command.on(
          "progress",
          createProgressHandler(scene.duration, onProgress)
        );
      }

      command
        .on("end", () => resolve())
        .on("error", (err, stdout, stderr) => {
          logger.error("FFmpeg clip generation error", {
            error: err.message,
            stdout,
            stderr,
            scene,
          });
          reject(err);
        })
        .on("stderr", (stderrLine) => {
          logger.debug("FFmpeg stderr:", stderrLine);
        })
        .run();
    });

    // Generate thumbnail
    await generateThumbnail(clipPath, thumbnailPath, 1);

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
      .replace(/\\/g, "\\\\\\\\") // Backslashes
      .replace(/'/g, "'\\\\\\''") // Single quotes
      .replace(/:/g, "\\:") // Colons
      .replace(/%/g, "\\%") // Percent signs
      .replace(/\n/g, "") // Remove newlines (handle separately)
      .trim();
  }

  /**
   * Split title into multiple lines at word boundaries
   * Supports up to 3 lines for longer titles
   */
  private splitTitleIntoLines(
    title: string,
    maxCharsPerLine: number = 20
  ): string[] {
    if (title.length <= maxCharsPerLine) {
      return [title];
    }

    const words = title.split(" ");
    const lines: string[] = [];
    let currentLine = "";

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

    logger.info("Building title filters", {
      title,
      lines,
      lineCount: lines.length,
    });

    // Font settings - large, bold, prominent
    const fontSize = 68;
    const borderWidth = 5;
    const lineHeight = 80; // Space between lines
    const baseY = 70; // Starting Y position from top

    lines.forEach((line, index) => {
      const escapedLine = this.escapeTextForFFmpeg(line);
      const yPos = baseY + index * lineHeight;

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

    logger.info("Title filters built", {
      filterCount: filters.length,
      filters,
    });

    return filters;
  }

  /**
   * Build FFmpeg drawtext filter for "SUBSCRIBE :)" overlay at bottom
   * Style: Bold red text with black outline, always visible
   */
  private buildSubscribeFilter(): string {
    const fontSize = 62;
    const borderWidth = 4;
    const bottomMargin = 150;
    const text = this.escapeTextForFFmpeg("SUBSCRIBE :)");

    return (
      `drawtext=text='${text}':` +
      `fontfile='C\\:/Windows/Fonts/impact.ttf':` +
      `fontsize=${fontSize}:` +
      `fontcolor=red:` +
      `borderw=${borderWidth}:` +
      `bordercolor=black:` +
      `x=(w-text_w)/2:` +
      `y=h-${bottomMargin}`
    );
  }

  /**
   * Build FFmpeg drawtext filters for subtitle overlays
   * Style: White text with black outline, positioned at bottom center, timed to audio
   */
  private buildSubtitleFilters(chunks: SubtitleChunk[]): string[] {
    const filters: string[] = [];

    // Font settings for subtitles - slightly smaller than title, positioned at bottom
    const fontSize = 54;
    const borderWidth = 4;
    const bottomMargin = 280; // Above the subscribe text

    logger.info("Building subtitle filters", {
      chunkCount: chunks.length,
    });

    chunks.forEach((chunk, index) => {
      const escapedText = this.escapeTextForFFmpeg(chunk.text);

      // Create drawtext filter with time-based enable
      // Show this text only between chunk.start and chunk.end
      filters.push(
        `drawtext=text='${escapedText}':` +
          `fontfile='C\\:/Windows/Fonts/impact.ttf':` +
          `fontsize=${fontSize}:` +
          `fontcolor=white:` +
          `borderw=${borderWidth}:` +
          `bordercolor=black:` +
          `x=(w-text_w)/2:` +
          `y=h-${bottomMargin}:` +
          `enable='between(t,${chunk.start.toFixed(2)},${chunk.end.toFixed(2)})'`
      );
    });

    logger.info("Subtitle filters built", {
      filterCount: filters.length,
    });

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
    const qualityPreset = VIDEO_CONFIG.qualityPresets["medium"];
    const tempPath = clipPath.replace(".mp4", "_temp.mp4");

    logger.info("Adding title to clip", { clipPath, title });

    // Get clip duration for progress tracking
    const metadata = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(clipPath, (err, data) => {
        if (err) reject(err);
        else resolve(data.format.duration || 30);
      });
    });

    // Build title filters (supports multisi-line) and subscribe text
    const titleFilters = this.buildTitleFilters(title);
    titleFilters.push(this.buildSubscribeFilter());
    const filterComplex = titleFilters.join(",");

    // Re-encode with title (optimized for speed)
    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg(clipPath)
        .videoCodec("libx264")
        .videoBitrate(qualityPreset.videoBitrate)
        .fps(VIDEO_CONFIG.defaults.fps)
        .audioCodec("aac")
        .audioBitrate(qualityPreset.audioBitrate)
        .outputOptions([
          `-preset ${qualityPreset.preset}`,
          "-threads 0",
          "-tune fastdecode",
          "-movflags +faststart",
        ])
        .videoFilters(filterComplex)
        .output(tempPath);

      if (onProgress) {
        command = command.on(
          "progress",
          createProgressHandler(metadata, onProgress)
        );
      }

      command
        .on("end", () => resolve())
        .on("error", (err, stdout, stderr) => {
          logger.error("FFmpeg title overlay error", {
            error: err.message,
            stdout,
            stderr,
          });
          reject(err);
        })
        .run();
    });

    // Replace original with new version
    const fs = await import("fs/promises");
    await fs.unlink(clipPath);
    await fs.rename(tempPath, clipPath);

    logger.info("Title added to clip successfully", { clipPath, title });
  }

  /**
   * Add subtitles to an existing clip
   * Re-encodes the clip with subtitle overlays burned in
   */
  async addSubtitlesToClip(
    clipPath: string,
    subtitleChunks: SubtitleChunk[],
    onProgress?: (percent: number) => void
  ): Promise<void> {
    const qualityPreset = VIDEO_CONFIG.qualityPresets["medium"];
    const tempPath = clipPath.replace(".mp4", "_subtitled.mp4");

    logger.info("Adding subtitles to clip", {
      clipPath,
      chunkCount: subtitleChunks.length,
    });

    // Get clip duration for progress tracking
    const metadata = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(clipPath, (err, data) => {
        if (err) reject(err);
        else resolve(data.format.duration || 30);
      });
    });

    // Build subtitle filters
    const subtitleFilters = this.buildSubtitleFilters(subtitleChunks);
    const filterComplex = subtitleFilters.join(",");

    // Re-encode with subtitles
    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg(clipPath)
        .videoCodec("libx264")
        .videoBitrate(qualityPreset.videoBitrate)
        .fps(VIDEO_CONFIG.defaults.fps)
        .audioCodec("aac")
        .audioBitrate(qualityPreset.audioBitrate)
        .outputOptions([
          `-preset ${qualityPreset.preset}`,
          "-threads 0",
          "-tune fastdecode",
          "-movflags +faststart",
        ])
        .videoFilters(filterComplex)
        .output(tempPath);

      if (onProgress) {
        command = command.on(
          "progress",
          createProgressHandler(metadata, onProgress)
        );
      }

      command
        .on("end", () => resolve())
        .on("error", (err, stdout, stderr) => {
          logger.error("FFmpeg subtitle overlay error", {
            error: err.message,
            stdout,
            stderr,
          });
          reject(err);
        })
        .run();
    });

    // Replace original with new version
    const fs = await import("fs/promises");
    await fs.unlink(clipPath);
    await fs.rename(tempPath, clipPath);

    logger.info("Subtitles added to clip successfully", {
      clipPath,
      chunkCount: subtitleChunks.length,
    });
  }
}

export const clipService = new ClipService();
