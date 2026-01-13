import { queue } from "../lib/queue/queue";
import { jobService } from "../lib/services/job.service";
import { usageService } from "../lib/services/usage.service";
import { youtubeService } from "../lib/services/youtube.service";
import { videoService } from "../lib/services/video.service";
import { subtitleService } from "../lib/services/subtitle.service";
import { clipService } from "../lib/services/clip.service";
import { aiService } from "../lib/services/ai.service";
import { geminiService, ClipSuggestion } from "../lib/services/gemini.service";
import { storageService } from "../lib/storage";
import { env } from "../config/env";
import { JOB_STATUS, PROCESSING_STEPS } from "../config/constants";
import { logger } from "../lib/utils/logger";
import { JobResult, JobProgress } from "../types/job";

class VideoProcessor {
  private pollInterval: number;
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;

  constructor() {
    this.pollInterval = env.QUEUE_POLL_INTERVAL;
  }

  /**
   * Start the worker
   */
  start(): void {
    if (this.isRunning) {
      logger.warn("Worker already running");
      return;
    }

    this.isRunning = true;
    logger.info("🚀 Video processor worker started", {
      pollInterval: this.pollInterval,
    });

    // Start polling for jobs
    this.intervalId = setInterval(() => {
      this.processNextJob().catch((error) => {
        logger.error("Error in job processing loop", error);
      });
    }, this.pollInterval);

    // Process first job immediately
    this.processNextJob().catch((error) => {
      logger.error("Error processing first job", error);
    });
  }

  /**
   * Stop the worker
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    logger.info("Video processor worker stopped");
  }

  /**
   * Process next job in queue
   */
  private async processNextJob(): Promise<void> {
    if (queue.isQueueBusy()) {
      return;
    }

    const job = await queue.dequeue();

    if (!job) {
      return;
    }

    logger.info("Processing job", { jobId: job.id, videoUrl: job.videoUrl });

    try {
      // Check if Gemini is configured - use optimized pipeline
      if (geminiService.isConfigured()) {
        await this.processWithGemini(job);
      } else {
        // Fallback to legacy FFmpeg-based processing
        await this.processWithFFmpeg(job);
      }
    } catch (error: any) {
      logger.error("Job processing failed", {
        jobId: job.id,
        error: error.message,
      });

      await jobService.failJob(job.id, {
        message: error.message || "Unknown error occurred",
        code: "PROCESSING_ERROR",
        details: error,
      });

      await queue.fail(job.id);
    }
  }

  /**
   * Process video using Gemini AI for intelligent clip detection
   * Optimized pipeline:
   * 1. Try analyzing YouTube URL directly (Hybrid Approach)
   * 2. If successful, download ONLY segments (bandwidth saving)
   * 3. Fallback to full download if URL analysis fails
   */
  private async processWithGemini(job: any): Promise<void> {
    logger.info("Using Gemini-powered processing", { jobId: job.id });

    // Update job status to processing
    await jobService.updateJobStatus(job.id, JOB_STATUS.PROCESSING, {
      step: PROCESSING_STEPS.ANALYZING, // Start with analysis for URL method
      percentage: 0,
      message: "Analyzing video content...",
    });

    let clipSuggestions: ClipSuggestion[] | null = null;
    let videoPath: string | null = null;
    let isSegmentDownload = false;
    let videoTitle = "Unknown Video";
    let duration = 0;

    // Phase 1: Try Direct Analysis (Optimization)
    try {
      logger.info("Attempting direct YouTube analysis", { jobId: job.id });
      const videoInfo = await youtubeService.getVideoInfo(job.videoUrl);
      videoTitle = videoInfo.title;
      duration = videoInfo.duration;

      clipSuggestions = await geminiService.analyzeYouTubeUrl(job.videoUrl, {
        maxClips: job.options.maxClips || 5,
        minDuration: 30,
        maxDuration: 60,
        contentType: job.options.contentType || "entertainment",
        videoTitle: videoInfo.title,
      });

      logger.info("Direct analysis successful", {
        count: clipSuggestions.length,
        jobId: job.id,
      });

      // If we got here, we can proceed to segment download
      isSegmentDownload = true;
    } catch (error: any) {
      logger.warn(
        "Direct YouTube analysis failed, falling back to full download",
        {
          jobId: job.id,
          error: error.message,
        }
      );
      // Fallback will happen below
    }

    // Phase 2: Download
    if (isSegmentDownload && clipSuggestions) {
      // Optimized path: Download only segments
      await this.updateProgress(
        job.id,
        PROCESSING_STEPS.DOWNLOADING,
        20,
        "Downloading optimized segments..."
      );

      const segments = clipSuggestions.map((s) => ({
        start: s.start_time,
        end: s.end_time,
      }));

      videoPath = await youtubeService.downloadSegmentsOnly(
        job.videoUrl,
        segments,
        job.id,
        (progress) => {
          this.updateProgress(
            job.id,
            PROCESSING_STEPS.DOWNLOADING,
            20 + Math.round(progress.percentage * 0.2), // 20-40%
            `Downloading segments... ${progress.percentage}%`
          ).catch((e) => logger.error("Progress update failed", e));
        }
      );
    } else {
      // Fallback/Legacy path: Full download
      await this.updateProgress(
        job.id,
        PROCESSING_STEPS.DOWNLOADING,
        10,
        "Downloading full video (fallback)..."
      );

      const videoInfo = await youtubeService.downloadVideo(
        job.videoUrl,
        job.id,
        (progress) => {
          this.updateProgress(
            job.id,
            PROCESSING_STEPS.DOWNLOADING,
            10 + Math.round(progress.percentage * 0.2), // 10-30%
            `Downloading video... ${progress.percentage}%`
          ).catch((e) => logger.error("Progress update failed", e));
        }
      );

      videoPath = videoInfo.videoPath;
      videoTitle = videoInfo.title;
      duration = videoInfo.duration;

      // If we haven't analyzed yet (fallback case), do it now
      if (!clipSuggestions) {
        await this.updateProgress(
          job.id,
          PROCESSING_STEPS.ANALYZING,
          30,
          "Analyzing video file with Gemini..."
        );
        try {
          clipSuggestions = await geminiService.analyzeVideoForClips(
            videoPath,
            {
              maxClips: job.options.maxClips || 5,
              minDuration: 30,
              maxDuration: 60,
              contentType: job.options.contentType || "entertainment",
              videoTitle,
            }
          );
        } catch (err: any) {
          logger.error("Gemini file analysis also failed", {
            error: err.message,
          });
          throw new Error("Failed to analyze video with Gemini");
        }
      }
    }

    if (!clipSuggestions || !videoPath) {
      throw new Error("Failed to obtain clips or video file");
    }

    // Phase 3: Generate Clips (subtitles added in Phase 4 if enabled)
    await this.updateProgress(
      job.id,
      PROCESSING_STEPS.GENERATING,
      60,
      "Generating clips..."
    );
    const jobDir = await storageService.ensureJobDir(job.id);

    // If we used segment download, we need to adjust logic because we have one merged file
    // The "start_time" in suggestions refers to ORIGINAL video, but our file has them concatenated
    // However, clipService usually takes the original video.
    // To handle merged file properly, we strictly need to know where each clip starts in the merged file.
    // Assumption: yt-dlp merged them in order.

    // We will generate a modified list of suggestions for the clip generation phase
    // if we are using the merged file.

    let processableScenes = clipSuggestions;
    let sourcePath = videoPath;

    if (isSegmentDownload) {
      // Recalculate timestamps for the merged file
      // Clip 1 is at 0:00. Clip 2 is at start + duration of Clip 1...
      let currentOffset = 0;
      const remappedSuggestions = [];

      for (const clip of clipSuggestions) {
        const start = geminiService.timestampToSeconds(clip.start_time);
        const end = geminiService.timestampToSeconds(clip.end_time);
        const duration = end - start;

        remappedSuggestions.push({
          ...clip,
          start_time: geminiService.secondsToTimestamp(currentOffset),
          end_time: geminiService.secondsToTimestamp(currentOffset + duration),
        });

        currentOffset += duration;
      }

      // Use the remapped suggestions for cutting, but keep original metadata
      processableScenes = remappedSuggestions;
    }

    // Generate clips WITHOUT titles burned in - titles can be added later via UI
    // We still pass the suggestions but override titles to empty so clips are clean
    const cleanScenes = processableScenes.map(scene => ({
      ...scene,
      title: '', // Don't burn title into video - user can add via "Edit Title" button
    }));

    const clips = await clipService.generateClipsFromSuggestions(
      sourcePath,
      cleanScenes,
      jobDir,
      {
        quality: "medium",
        showSubscribe: job.options.showSubscribe ?? false, // Also make subscribe optional
      },
      (clipIndex, percent) => {
        const baseProgress = 50;
        const totalProgress = baseProgress + (percent / 100) * 25; // alloc 25% for generation

        this.updateProgress(
          job.id,
          PROCESSING_STEPS.GENERATING,
          Math.round(totalProgress),
          `Generating clip ${clipIndex + 1}/${processableScenes.length}...`
        ).catch((e) => logger.error("Progress update failed", e));
      }
    );

    // Phase 4: Add Subtitles (if requested)
    if (job.options.includeSubtitles) {
      await this.updateProgress(
        job.id,
        PROCESSING_STEPS.TRANSCRIBING,
        75,
        "Adding subtitles to clips..."
      );

      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        try {
          await this.updateProgress(
            job.id,
            PROCESSING_STEPS.TRANSCRIBING,
            75 + Math.round((i / clips.length) * 20),
            `Transcribing clip ${i + 1}/${clips.length}...`
          );

          // Transcribe the clip to get word-level timestamps
          const subtitleChunks = await geminiService.transcribeForSubtitles(
            clip.videoPath,
            3 // 3 words per chunk
          );

          if (subtitleChunks.length > 0) {
            // Add subtitles to the clip
            await clipService.addSubtitlesToClip(clip.videoPath, subtitleChunks);
            logger.info(`Added subtitles to clip ${i + 1}`, {
              clipId: clip.id,
              chunkCount: subtitleChunks.length,
            });
          }
        } catch (err) {
          logger.warn(`Failed to add subtitles to clip ${i + 1}, continuing`, {
            error: err,
            clipId: clip.id,
          });
        }
      }
    }

    // Phase 4.5: Voice-Over is now OPTIONAL - added via UI button after clip generation
    // Users can click "Add Voiceover Intro" button on each clip to add voice-over
    // This keeps initial clips clean and gives users control over what gets added

    // Phase 5: Build Result
    // Use original suggestions for metadata (titles, scores)
    // Map the generated clips back to the original timestamps (if we remapped them)
    // Wait, generated clips structure has startTime/endTime.
    // If we used remapped scenes, the generated clips will have 0:00 based timestamps.
    // We should restore the original timestamps for the DB/UI result.

    const finalClips = clips.map((clip, index) => {
      const original = clipSuggestions![index]; // Use original suggestion
      return {
        id: clip.id,
        startTime: geminiService.timestampToSeconds(original.start_time),
        endTime: geminiService.timestampToSeconds(original.end_time),
        duration: clip.duration,
        score: clip.score,
        thumbnailUrl: `/outputs/${job.id}/thumbnails/${clip.id}.jpg`,
        videoUrl: `/outputs/${job.id}/clips/${clip.id}.mp4`,
        title: clip.title || original.title,
      };
    });

    // Complete job
    await jobService.completeJob(job.id, {
      videoTitle,
      duration,
      clips: finalClips,
    });

    // Record usage only on successful completion
    await usageService.recordUsage(job.userId, finalClips.length);
    logger.info("Usage recorded for successful job", {
      userId: job.userId,
      clipsGenerated: finalClips.length,
    });

    // Cleanup
    await youtubeService.cleanup(videoPath);
    await queue.complete(job.id);

    logger.info("Gemini processing completed successfully", {
      jobId: job.id,
      clips: finalClips.length,
      mode: isSegmentDownload ? "optimized" : "full",
    });
  }

  /**
   * Helper to convert Gemini Transcript to SRT
   */
  private async saveTranscriptToSrt(
    transcript: any[],
    outputPath: string
  ): Promise<void> {
    const fs = await import("fs/promises");

    let srtContent = "";
    transcript.forEach((segment, index) => {
      // Format:
      // 1
      // 00:00:01,000 --> 00:00:04,000
      // Text

      // Pad milliseconds (simple approximation)
      const start = segment.start_time.includes(",")
        ? segment.start_time
        : `${segment.start_time},000`;
      const end = segment.end_time.includes(",")
        ? segment.end_time
        : `${segment.end_time},000`;

      // Ensure HH:MM:SS format (Gemini might return MM:SS)
      const formatTs = (ts: string) => {
        const parts = ts.split(":");
        if (parts.length === 2) return `00:${ts}`;
        return ts;
      };

      srtContent += `${index + 1}\n`;
      srtContent += `${formatTs(start)} --> ${formatTs(end)}\n`;
      srtContent += `${segment.text.trim()}\n\n`;
    });

    await fs.writeFile(outputPath, srtContent, "utf-8");
  }

  /**
   * Legacy FFmpeg-based processing (fallback when Gemini is not configured)
   */
  private async processWithFFmpeg(job: any): Promise<void> {
    logger.info("Using legacy FFmpeg processing", { jobId: job.id });

    // Update job status to processing
    await jobService.updateJobStatus(job.id, JOB_STATUS.PROCESSING, {
      step: PROCESSING_STEPS.DOWNLOADING,
      percentage: 0,
      message: "Downloading video...",
    });

    // Step 1: Download video with progress tracking
    const videoInfo = await youtubeService.downloadVideo(
      job.videoUrl,
      job.id,
      (progress) => {
        // Map download progress to 0-25% of total job progress
        const jobProgress = Math.round(progress.percentage * 0.25);
        const message =
          progress.percentage < 100
            ? `Downloading video... ${progress.percentage}% (${progress.speed})`
            : "Download complete, processing...";

        this.updateProgress(
          job.id,
          PROCESSING_STEPS.DOWNLOADING,
          jobProgress,
          message
        ).catch((err) =>
          logger.error("Failed to update download progress", err)
        );
      }
    );

    await this.updateProgress(
      job.id,
      PROCESSING_STEPS.ANALYZING,
      25,
      "Analyzing video..."
    );

    // Step 2: Analyze video and detect scenes
    const maxClips = job.options.maxClips || 5;
    const scenes = await videoService.analyzeVideo(
      videoInfo.videoPath,
      maxClips
    );

    await this.updateProgress(
      job.id,
      PROCESSING_STEPS.TRANSCRIBING,
      45,
      "Generating clip titles..."
    );

    // Step 2.5: Generate AI titles for each clip (if OpenAI is configured)
    let clipTitles: string[] = [];
    try {
      if (env.OPENAI_API_KEY) {
        clipTitles = await aiService.generateClipTitles(
          videoInfo.title,
          scenes.length
        );
        logger.info("Generated clip titles", { titles: clipTitles });
      } else {
        logger.info("OpenAI not configured, skipping title generation");
      }
    } catch (error) {
      logger.warn("Failed to generate clip titles, continuing without titles", {
        error,
      });
    }

    await this.updateProgress(
      job.id,
      PROCESSING_STEPS.TRANSCRIBING,
      50,
      "Generating subtitles..."
    );

    // Step 3: Generate subtitles (optional)
    let subtitlePath: string | null = null;
    if (job.options.includeSubtitles) {
      const jobDir = await storageService.ensureJobDir(job.id);
      subtitlePath = await subtitleService.generateSubtitles(
        videoInfo.videoPath,
        jobDir
      );
    }

    await this.updateProgress(
      job.id,
      PROCESSING_STEPS.GENERATING,
      60,
      "Generating clips..."
    );

    // Step 4: Generate clips WITHOUT titles burned in - titles can be added later via UI
    const jobDir = await storageService.ensureJobDir(job.id);
    const clips = await clipService.generateClips(
      videoInfo.videoPath,
      scenes,
      jobDir,
      {
        includeSubtitles: job.options.includeSubtitles,
        subtitlePath: subtitlePath || undefined,
        quality: "medium",
        // Don't burn titles into video - user can add via "Edit Title" button
        titles: undefined,
        showSubscribe: false, // Also don't auto-add subscribe overlay
      },
      (clipIndex, percent) => {
        const baseProgress = 60;
        const clipProgress = 35 / scenes.length;
        const totalProgress =
          baseProgress +
          clipIndex * clipProgress +
          (percent / 100) * clipProgress;

        this.updateProgress(
          job.id,
          PROCESSING_STEPS.GENERATING,
          Math.round(totalProgress),
          `Generating clip ${clipIndex + 1}/${scenes.length}...`
        ).catch((err) => logger.error("Failed to update progress", err));
      }
    );

    // Step 5: Build result - include generated titles in metadata (but not burned into video)
    const result: JobResult = {
      videoTitle: videoInfo.title,
      duration: videoInfo.duration,
      clips: clips.map((clip, index) => ({
        id: clip.id,
        startTime: clip.startTime,
        endTime: clip.endTime,
        duration: clip.duration,
        score: clip.score,
        thumbnailUrl: `/outputs/${job.id}/thumbnails/${clip.id}.jpg`,
        videoUrl: `/outputs/${job.id}/clips/${clip.id}.mp4`,
        // Store the AI-generated title in metadata (user can apply it via "Edit Title" button)
        title: clipTitles[index] || clip.title,
      })),
    };

    // Complete job
    await jobService.completeJob(job.id, result);

    // Record usage only on successful completion
    await usageService.recordUsage(job.userId, clips.length);
    logger.info("Usage recorded for successful job", {
      userId: job.userId,
      clipsGenerated: clips.length,
    });

    // Cleanup downloaded video
    await youtubeService.cleanup(videoInfo.videoPath);

    await queue.complete(job.id);

    logger.info("Job completed successfully", {
      jobId: job.id,
      clipsGenerated: clips.length,
    });
  }

  /**
   * Update job progress
   */
  private async updateProgress(
    jobId: string,
    step: JobProgress["step"],
    percentage: number,
    message: string
  ): Promise<void> {
    await jobService.updateJobProgress(jobId, {
      step,
      percentage,
      message,
    });
  }
}

// Create and start worker
const processor = new VideoProcessor();

// Handle graceful shutdown
process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down gracefully...");
  processor.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down gracefully...");
  processor.stop();
  process.exit(0);
});

// Start the processor
processor.start();
