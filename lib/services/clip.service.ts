import * as path from "path";
import * as fs from "fs/promises";
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
import { ClipSuggestion, SubtitleChunk, geminiService } from "./gemini.service";
import { elevenLabsService } from "./elevenlabs.service";

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
   * Title is visible throughout the entire video duration
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
      // No enable or alpha = always visible throughout entire video
      filters.push(
        `drawtext=text='${escapedLine}':` +
          `fontfile='C\\:/Windows/Fonts/impact.ttf':` +
          `fontsize=${fontSize}:` +
          `fontcolor=white:` +
          `borderw=${borderWidth}:` +
          `bordercolor=black:` +
          `x=(w-text_w)/2:` +
          `y=${yPos}`
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
   * Style: Large bold white text with thick black outline, centered on screen, timed to audio
   */
  private buildSubtitleFilters(chunks: SubtitleChunk[]): string[] {
    const filters: string[] = [];

    // Font settings for subtitles - large, bold, centered
    const fontSize = 72; // Bigger for better visibility
    const borderWidth = 6; // Thicker outline
    const shadowX = 3;
    const shadowY = 3;

    logger.info("Building subtitle filters", {
      chunkCount: chunks.length,
    });

    chunks.forEach((chunk, index) => {
      const escapedText = this.escapeTextForFFmpeg(chunk.text);

      // Create drawtext filter with time-based enable
      // Show this text only between chunk.start and chunk.end
      // Centered both horizontally and vertically
      filters.push(
        `drawtext=text='${escapedText}':` +
          `fontfile='C\\:/Windows/Fonts/impact.ttf':` +
          `fontsize=${fontSize}:` +
          `fontcolor=white:` +
          `borderw=${borderWidth}:` +
          `bordercolor=black:` +
          `shadowcolor=black@0.5:` +
          `shadowx=${shadowX}:` +
          `shadowy=${shadowY}:` +
          `x=(w-text_w)/2:` +
          `y=(h-text_h)/2:` +
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

  /**
   * Add voice-over audio to an existing clip
   * Mixes the voice-over with the original audio, with voice-over slightly louder
   * Voice-over plays at the start of the clip with a small delay
   */
  async addVoiceOverToClip(
    clipPath: string,
    voiceOverPath: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    const qualityPreset = VIDEO_CONFIG.qualityPresets["medium"];
    const tempPath = clipPath.replace(".mp4", "_voiceover.mp4");

    logger.info("Adding voice-over to clip", { clipPath, voiceOverPath });

    // Get clip duration for progress tracking
    const metadata = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(clipPath, (err, data) => {
        if (err) reject(err);
        else resolve(data.format.duration || 30);
      });
    });

    // Mix voice-over with original audio
    // Voice-over starts after 500ms delay, volume boosted slightly
    // Original audio is ducked (lowered) during voice-over
    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg(clipPath)
        .input(voiceOverPath)
        .complexFilter([
          // Add 500ms delay to voice-over and boost volume
          "[1:a]adelay=500|500,volume=1.3[vo]",
          // Duck the original audio slightly when voice-over plays
          "[0:a]volume=0.7[original]",
          // Mix both audio tracks
          "[original][vo]amix=inputs=2:duration=first:dropout_transition=2[aout]",
        ])
        .outputOptions([
          "-map",
          "0:v", // Keep original video
          "-map",
          "[aout]", // Use mixed audio
          "-c:v",
          "libx264",
          `-preset ${qualityPreset.preset}`,
          "-c:a",
          "aac",
          `-b:a ${qualityPreset.audioBitrate}`,
          "-threads 0",
          "-movflags +faststart",
        ])
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
          logger.error("FFmpeg voice-over mixing error", {
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

    // Clean up voice-over file
    try {
      await fs.unlink(voiceOverPath);
    } catch {
      // Ignore cleanup errors
    }

    logger.info("Voice-over added to clip successfully", { clipPath });
  }

  /**
   * Generate a voiceover intro and prepend it to an existing clip
   * Creates: blurred background + voiceover audio + word-by-word subtitles
   * Then concatenates the intro with the original clip
   */
  async generateIntroVideo(
    clipPath: string,
    script: string,
    voiceId?: string,
    onProgress?: (step: string, percent: number) => void
  ): Promise<void> {
    const tempDir = path.dirname(clipPath);
    const clipId = path.basename(clipPath, ".mp4");
    const qualityPreset = VIDEO_CONFIG.qualityPresets["medium"];

    logger.info("Generating voiceover intro", { clipPath, script, voiceId });

    // Temp file paths
    const framePath = path.join(tempDir, `${clipId}_frame.png`);
    const blurredFramePath = path.join(tempDir, `${clipId}_blurred.png`);
    const audioPath = path.join(tempDir, `${clipId}_intro_audio.mp3`);
    const boostedAudioPath = path.join(tempDir, `${clipId}_intro_audio_loud.mp3`);
    const introVideoPath = path.join(tempDir, `${clipId}_intro.mp4`);
    const concatListPath = path.join(tempDir, `${clipId}_concat.txt`);
    const outputPath = path.join(tempDir, `${clipId}_with_intro.mp4`);

    // Helper to check if file exists
    const fileExists = async (filePath: string): Promise<boolean> => {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    };

    try {
      // Step 1: Extract first frame using ffmpeg command directly
      onProgress?.("Extracting frame", 10);
      logger.info("Extracting first frame from clip");

      await new Promise<void>((resolve, reject) => {
        ffmpeg(clipPath)
          .seekInput(0.5)
          .frames(1)
          .output(framePath)
          .on("end", () => resolve())
          .on("error", (err, stdout, stderr) => {
            logger.error("Frame extraction failed", { error: err.message, stderr });
            reject(err);
          })
          .run();
      });

      // Verify frame was created
      if (!(await fileExists(framePath))) {
        throw new Error("Failed to extract frame from video");
      }
      logger.info("Frame extracted successfully", { framePath });

      // Step 2: Apply blur effect to frame
      onProgress?.("Applying blur effect", 20);
      logger.info("Applying blur effect to frame");

      await new Promise<void>((resolve, reject) => {
        ffmpeg(framePath)
          .videoFilters("gblur=sigma=40") // Stronger blur
          .output(blurredFramePath)
          .on("end", () => resolve())
          .on("error", (err, stdout, stderr) => {
            logger.error("Blur effect failed", { error: err.message, stderr });
            reject(err);
          })
          .run();
      });

      // Verify blurred frame was created
      if (!(await fileExists(blurredFramePath))) {
        throw new Error("Failed to create blurred frame");
      }
      logger.info("Blurred frame created successfully", { blurredFramePath });

      // Step 3: Generate voiceover audio
      onProgress?.("Generating voiceover", 30);
      logger.info("Generating voiceover audio with ElevenLabs");

      await elevenLabsService.generateSpeech(script, audioPath, voiceId);

      // Verify audio was created
      if (!(await fileExists(audioPath))) {
        throw new Error("Failed to generate voiceover audio");
      }

      // Step 4: Boost audio volume significantly (3x louder)
      onProgress?.("Boosting audio volume", 35);
      logger.info("Boosting voiceover volume");

      await new Promise<void>((resolve, reject) => {
        ffmpeg(audioPath)
          .audioFilters("volume=3.0") // 3x volume boost
          .output(boostedAudioPath)
          .on("end", () => resolve())
          .on("error", (err) => {
            logger.error("Audio boost failed", { error: err.message });
            reject(err);
          })
          .run();
      });

      // Use boosted audio if created, otherwise fall back to original
      const finalAudioPath = (await fileExists(boostedAudioPath)) ? boostedAudioPath : audioPath;

      // Step 5: Get audio duration
      const audioDuration = await new Promise<number>((resolve, reject) => {
        ffmpeg.ffprobe(finalAudioPath, (err, data) => {
          if (err) reject(err);
          else resolve(data.format.duration || 5);
        });
      });

      logger.info("Voiceover audio ready", { audioDuration, boosted: finalAudioPath === boostedAudioPath });

      // Step 6: Generate word-level timestamps for subtitles
      onProgress?.("Creating subtitles", 50);
      let subtitleChunks: SubtitleChunk[] = [];

      // Use fallback timing (distribute words evenly) - more reliable than transcription
      const words = script.split(/\s+/).filter(w => w.length > 0);
      const wordsPerChunk = 2;
      const totalChunks = Math.ceil(words.length / wordsPerChunk);
      const chunkDuration = audioDuration / totalChunks;

      for (let i = 0; i < words.length; i += wordsPerChunk) {
        const chunkWords = words.slice(i, i + wordsPerChunk);
        const chunkIndex = Math.floor(i / wordsPerChunk);
        subtitleChunks.push({
          text: chunkWords.join(" "),
          start: chunkIndex * chunkDuration,
          end: (chunkIndex + 1) * chunkDuration,
        });
      }

      logger.info("Subtitle chunks created", { chunkCount: subtitleChunks.length });

      // Step 7: Create intro video with blurred frame + audio + subtitles
      onProgress?.("Building intro video", 70);
      logger.info("Creating intro video with subtitles");

      // Build subtitle filters
      const subtitleFilters = this.buildSubtitleFilters(subtitleChunks);
      const filterString = subtitleFilters.length > 0 ? subtitleFilters.join(",") : "null";

      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(blurredFramePath)
          .inputOptions(["-loop 1"])
          .input(finalAudioPath)
          .outputOptions([
            "-c:v libx264",
            "-preset ultrafast",
            "-tune stillimage",
            "-c:a aac",
            "-b:a 192k", // Higher audio bitrate
            "-pix_fmt yuv420p",
            "-shortest",
            "-r 30",
          ])
          .videoFilters(filterString)
          .output(introVideoPath)
          .on("end", () => resolve())
          .on("error", (err, stdout, stderr) => {
            logger.error("Intro video creation failed", { error: err.message, stderr });
            reject(err);
          })
          .run();
      });

      // Verify intro video was created
      if (!(await fileExists(introVideoPath))) {
        throw new Error("Failed to create intro video");
      }
      logger.info("Intro video created successfully", { introVideoPath });

      // Step 8: Concatenate intro with original clip
      onProgress?.("Concatenating videos", 85);
      logger.info("Concatenating intro with original clip");

      // Create concat file list with forward slashes for FFmpeg
      const introPathEscaped = introVideoPath.replace(/\\/g, "/");
      const clipPathEscaped = clipPath.replace(/\\/g, "/");
      const concatContent = `file '${introPathEscaped}'\nfile '${clipPathEscaped}'`;
      await fs.writeFile(concatListPath, concatContent);

      logger.info("Concat list created", { concatContent });

      // Concatenate with re-encoding for compatibility
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatListPath)
          .inputOptions(["-f concat", "-safe 0"])
          .outputOptions([
            "-c:v libx264",
            `-preset ${qualityPreset.preset}`,
            `-b:v ${qualityPreset.videoBitrate}`,
            "-c:a aac",
            `-b:a ${qualityPreset.audioBitrate}`,
            "-movflags +faststart",
            "-threads 0",
          ])
          .output(outputPath)
          .on("end", () => resolve())
          .on("error", (err, stdout, stderr) => {
            logger.error("Concatenation failed", { error: err.message, stderr });
            reject(err);
          })
          .run();
      });

      // Verify output was created
      if (!(await fileExists(outputPath))) {
        throw new Error("Failed to concatenate videos");
      }
      logger.info("Videos concatenated successfully", { outputPath });

      // Step 9: Replace original clip with new version
      onProgress?.("Finalizing", 95);
      logger.info("Replacing original clip with intro version");

      await fs.unlink(clipPath);
      await fs.rename(outputPath, clipPath);

      // Step 10: Cleanup temp files
      const tempFiles = [framePath, blurredFramePath, audioPath, boostedAudioPath, introVideoPath, concatListPath];
      for (const tempFile of tempFiles) {
        await fs.unlink(tempFile).catch(() => {});
      }

      onProgress?.("Complete", 100);
      logger.info("Voiceover intro added successfully", { clipPath });
    } catch (error: any) {
      logger.error("Failed to generate intro video", { error: error.message, clipPath, stack: error.stack });

      // Cleanup on error
      const tempFiles = [framePath, blurredFramePath, audioPath, boostedAudioPath, introVideoPath, concatListPath, outputPath];
      for (const tempFile of tempFiles) {
        await fs.unlink(tempFile).catch(() => {});
      }

      throw error;
    }
  }
}

export const clipService = new ClipService();
