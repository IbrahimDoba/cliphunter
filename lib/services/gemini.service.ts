import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";
import { env } from "@/config/env";
import { logger } from "../utils/logger";
import * as path from "path";

export interface ClipSuggestion {
  start_time: string; // "MM:SS" format
  end_time: string;
  hook_type:
    | "curiosity"
    | "humor"
    | "emotion"
    | "surprise"
    | "value"
    | "controversy";
  title: string;
  description: string;
  virality_score: number;
  transcript_snippet: string | null;
}

export interface GeminiAnalysisResult {
  clips: ClipSuggestion[];
  transcript?: string;
  videoSummary?: string;
}

export interface TranscriptSegment {
  start_time: string;
  end_time: string;
  speaker: string | null;
  text: string;
}

export class GeminiService {
  private ai: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!env.GOOGLE_GEMINI_API_KEY) {
      throw new Error(
        "Gemini API key not configured. Set GOOGLE_GEMINI_API_KEY in .env.local"
      );
    }

    if (!this.ai) {
      this.ai = new GoogleGenAI({ apiKey: env.GOOGLE_GEMINI_API_KEY });
    }

    return this.ai;
  }

  /**
   * Analyze a video file and find the best viral clip moments
   * This uploads the video to Gemini's File API for analysis
   */
  async analyzeVideoForClips(
    videoPath: string,
    options: {
      maxClips?: number;
      minDuration?: number;
      maxDuration?: number;
      contentType?: "gaming" | "podcast" | "educational" | "entertainment";
      videoTitle?: string;
    } = {}
  ): Promise<ClipSuggestion[]> {
    const {
      maxClips = 5,
      minDuration = 30,
      maxDuration = 60,
      contentType = "entertainment",
      videoTitle = "Unknown Video",
    } = options;

    logger.info("Analyzing video with Gemini", {
      videoPath,
      maxClips,
      contentType,
    });

    try {
      const ai = this.getClient();

      // Upload video file to Gemini
      logger.info("Uploading video to Gemini Files API...");
      const uploadedFile = await ai.files.upload({
        file: videoPath,
        config: { mimeType: "video/mp4" },
      });

      logger.info("Video uploaded, waiting for processing...", {
        fileName: uploadedFile.name,
        uri: uploadedFile.uri,
      });

      // Wait for file to be processed (poll until state is ACTIVE)
      let fileState = uploadedFile.state;
      let attempts = 0;
      const maxAttempts = 60; // Max 5 minutes wait (5s * 60)

      while (fileState === "PROCESSING" && attempts < maxAttempts) {
        logger.info("Waiting for Gemini to process video...", {
          state: fileState,
          attempt: attempts + 1,
        });
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const fileInfo = await ai.files.get({ name: uploadedFile.name! });
        fileState = fileInfo.state;
        attempts++;
      }

      if (fileState === "FAILED") {
        throw new Error("Gemini failed to process the video file");
      }

      if (fileState !== "ACTIVE") {
        throw new Error(
          `Video processing timed out. Final state: ${fileState}`
        );
      }

      logger.info("Video processed by Gemini, analyzing for clips...");

      // Build the analysis prompt
      const prompt = this.buildAnalysisPrompt(
        maxClips,
        minDuration,
        maxDuration,
        contentType,
        videoTitle
      );

      // Generate content with video
      const response = await ai.models.generateContent({
        model: env.GEMINI_MODEL || "gemini-2.5-flash",
        contents: createUserContent([
          createPartFromUri(uploadedFile.uri!, uploadedFile.mimeType!),
          prompt,
        ]),
      });

      const text = response.text;

      // Parse the response
      const clips = this.parseClipSuggestions(text!, minDuration);

      // Delete the uploaded file to save storage
      try {
        await ai.files.delete({ name: uploadedFile.name! });
        logger.info("Deleted uploaded video from Gemini");
      } catch (deleteError) {
        logger.warn("Failed to delete video from Gemini", {
          error: deleteError,
        });
      }

      logger.info("Gemini analysis completed", { clipsFound: clips.length });

      return clips;
    } catch (error: any) {
      logger.error("Gemini video analysis failed", { error: error.message });
      throw new Error(`Gemini analysis failed: ${error.message}`);
    }
  }

  /**
   * Analyze a YouTube URL directly
   * The new SDK supports direct YouTube URL analysis
   */
  async analyzeYouTubeUrl(
    youtubeUrl: string,
    options: {
      maxClips?: number;
      minDuration?: number;
      maxDuration?: number;
      contentType?: "gaming" | "podcast" | "educational" | "entertainment";
      videoTitle?: string;
    } = {}
  ): Promise<ClipSuggestion[]> {
    const {
      maxClips = 5,
      minDuration = 30,
      maxDuration = 60,
      contentType = "entertainment",
      videoTitle = "Unknown Video",
    } = options;

    logger.info("Attempting to analyze YouTube URL with Gemini", {
      youtubeUrl,
    });

    try {
      const ai = this.getClient();
      const prompt = this.buildAnalysisPrompt(
        maxClips,
        minDuration,
        maxDuration,
        contentType,
        videoTitle
      );

      // Try direct YouTube URL analysis
      const response = await ai.models.generateContent({
        model: env.GEMINI_MODEL || "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [{ fileData: { fileUri: youtubeUrl } }, { text: prompt }],
          },
        ],
      });

      const text = response.text;
      const clips = this.parseClipSuggestions(text!, minDuration);

      logger.info("Direct YouTube URL analysis completed", {
        clipsFound: clips.length,
      });

      return clips;
    } catch (error: any) {
      // If direct URL fails, caller should fall back to download + analyze
      logger.warn(
        "Direct YouTube URL analysis failed, falling back to file upload",
        { error: error.message }
      );
      throw error;
    }
  }

  /**
   * Build the analysis prompt for finding viral clips
   */
  private buildAnalysisPrompt(
    maxClips: number,
    minDuration: number,
    maxDuration: number,
    contentType: string,
    videoTitle: string
  ): string {
    const contentGuidelines: Record<string, string> = {
      gaming:
        "Focus on: epic plays, fails, reactions, clutch moments, funny glitches, impressive skills",
      podcast:
        "Focus on: controversial opinions, funny exchanges, quotable moments, heated debates, insights",
      educational:
        "Focus on: key insights, surprising facts, actionable tips, memorable explanations",
      entertainment:
        "Focus on: funny moments, emotional peaks, surprises, satisfying conclusions, reactions",
    };

    return `You are an expert at identifying viral short-form video content for TikTok, YouTube Shorts, and Instagram Reels.

Analyze this video titled "${videoTitle}" and identify the ${maxClips} BEST segments that would perform well as viral short-form clips.

CRITICAL DURATION REQUIREMENTS - MUST FOLLOW:
- MINIMUM clip duration: ${minDuration} seconds (DO NOT go below this!)
- MAXIMUM clip duration: ${maxDuration} seconds
- Each clip MUST be between ${minDuration} and ${maxDuration} seconds long
- SHORT CLIPS UNDER ${minDuration} SECONDS WILL BE REJECTED
- Calculate: end_time minus start_time MUST equal at least ${minDuration} seconds

CONTENT REQUIREMENTS:
- Prioritize moments with STRONG hooks in the first 2-3 seconds
- ${contentGuidelines[contentType] || contentGuidelines.entertainment}
- Look for moments with high emotional impact, humor, surprise, or valuable information
- Consider audio cues like laughter, reactions, music drops, and emphasis
- Include complete moments - don't cut off mid-sentence or mid-action

For each segment, provide:
1. start_time: Start timestamp in MM:SS format (e.g., "02:34")
2. end_time: End timestamp in MM:SS format - MUST be at least ${minDuration} seconds after start_time (e.g., "03:15")
3. hook_type: One of [curiosity, humor, emotion, surprise, value, controversy]
4. title: A 3-7 word viral title (create curiosity, don't reveal the ending)
5. description: Why this would go viral (1 sentence)
6. virality_score: 1-10 rating of viral potential
7. transcript_snippet: Key quote or moment from this segment (if applicable, otherwise null)

VIRAL TITLE FORMULAS TO USE:
- "Wait For The Ending..."
- "Nobody Expected This"
- "This Is Why [X]..."
- "POV: [situation]"
- "When [X] Goes Wrong"
- "The [X] That Broke The Internet"
- "You Won't Believe What Happened"

IMPORTANT: Return ONLY a valid JSON array with no markdown formatting, no code blocks, no explanation.
The response should start with [ and end with ]

Example format (note: clip is ${minDuration}+ seconds):
[{"start_time": "02:34", "end_time": "03:19", "hook_type": "surprise", "title": "Nobody Saw This Coming", "description": "Unexpected plot twist with strong audience reaction", "virality_score": 9, "transcript_snippet": "Wait, what just happened?"}]`;
  }

  /**
   * Parse the clip suggestions from Gemini's response
   */
  private parseClipSuggestions(text: string, minDuration: number = 30): ClipSuggestion[] {
    try {
      // Clean potential markdown formatting
      let cleaned = text.trim();

      // Remove markdown code blocks if present
      if (cleaned.startsWith("```")) {
        cleaned = cleaned
          .replace(/```json?\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
      }

      // Find JSON array in the response
      const jsonStart = cleaned.indexOf("[");
      const jsonEnd = cleaned.lastIndexOf("]");

      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error("No JSON array found in response");
      }

      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

      const parsed = JSON.parse(cleaned) as ClipSuggestion[];

      // Validate the structure
      if (!Array.isArray(parsed)) {
        throw new Error("Response is not an array");
      }

      // Validate each clip - check structure and duration
      const validClips = parsed.filter((clip) => {
        // Check required fields
        if (!clip.start_time || !clip.end_time || !clip.hook_type || !clip.title || typeof clip.virality_score !== "number") {
          return false;
        }

        // Check duration is at least minDuration
        const startSeconds = this.timestampToSeconds(clip.start_time);
        const endSeconds = this.timestampToSeconds(clip.end_time);
        const duration = endSeconds - startSeconds;

        if (duration < minDuration) {
          logger.warn("Clip rejected - duration too short", {
            start: clip.start_time,
            end: clip.end_time,
            duration,
            minRequired: minDuration,
            title: clip.title,
          });
          return false;
        }

        return true;
      });

      if (validClips.length === 0) {
        logger.error("All clips were rejected due to short duration", {
          totalClips: parsed.length,
          minDuration,
        });
        throw new Error(`No valid clips found - all ${parsed.length} clips were shorter than ${minDuration} seconds`);
      }

      logger.info("Parsed clip suggestions", {
        count: validClips.length,
        rejected: parsed.length - validClips.length
      });

      return validClips;
    } catch (error: any) {
      logger.error("Failed to parse Gemini response", {
        error: error.message,
        text: text.slice(0, 500),
      });
      throw new Error(`Failed to parse Gemini response: ${error.message}`);
    }
  }

  /**
   * Convert MM:SS or HH:MM:SS timestamp to seconds
   */
  timestampToSeconds(timestamp: string): number {
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
   * Convert seconds to MM:SS timestamp
   */
  secondsToTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }

  /**
   * Transcribe a video file using Gemini
   */
  async transcribeVideo(videoPath: string): Promise<TranscriptSegment[]> {
    logger.info("Transcribing video with Gemini", { videoPath });

    try {
      const ai = this.getClient();

      // Upload video file to Gemini
      const uploadedFile = await this.uploadFile(ai, videoPath);

      logger.info("Video uploaded for transcription, analyzing...");

      const prompt = `
Transcribe this video with timestamps.

Return as JSON array:
[
  {
    "start_time": "MM:SS",
    "end_time": "MM:SS",
    "speaker": "Speaker 1" or null,
    "text": "transcribed text"
  }
]

Group into logical paragraphs (don't timestamp every word).
Identify different speakers if multiple people are talking.
`;

      const response = await ai.models.generateContent({
        model: env.GEMINI_MODEL || "gemini-2.5-flash",
        contents: createUserContent([
          createPartFromUri(uploadedFile.uri!, uploadedFile.mimeType!),
          prompt,
        ]),
      });

      // Cleanup
      try {
        await ai.files.delete({ name: uploadedFile.name! });
      } catch (e) {
        logger.warn("Failed to delete file after transcription", e);
      }

      const text = response.text;
      return this.parseTranscript(text!);
    } catch (error: any) {
      logger.error("Gemini transcription failed", { error: error.message });
      throw new Error(`Gemini transcription failed: ${error.message}`);
    }
  }

  /**
   * Helper to upload file to Gemini
   */
  private async uploadFile(ai: GoogleGenAI, filePath: string): Promise<any> {
    logger.info("Uploading file to Gemini Files API...");

    // Check if file exists

    const uploadedFile = await ai.files.upload({
      file: filePath,
      config: { mimeType: "video/mp4" },
    });

    logger.info("File uploaded, waiting for processing...", {
      fileName: uploadedFile.name,
      uri: uploadedFile.uri,
    });

    // Wait for file to be processed
    let fileState = uploadedFile.state;
    let attempts = 0;
    const maxAttempts = 60; // 5 mins

    while (fileState === "PROCESSING" && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const fileInfo = await ai.files.get({ name: uploadedFile.name! });
      fileState = fileInfo.state;
      attempts++;
    }

    if (fileState === "FAILED") {
      throw new Error("Gemini failed to process the file");
    }

    if (fileState !== "ACTIVE") {
      throw new Error(`Processing timed out. State: ${fileState}`);
    }

    return uploadedFile;
  }

  /**
   * Parse transcript JSON
   */
  private parseTranscript(text: string): TranscriptSegment[] {
    try {
      let cleaned = text.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned
          .replace(/```json?\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
      }

      const jsonStart = cleaned.indexOf("[");
      const jsonEnd = cleaned.lastIndexOf("]");

      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error("No JSON array found");
      }

      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
      return JSON.parse(cleaned);
    } catch (error: any) {
      logger.error("Failed to parse transcript", { error: error.message });
      throw new Error("Failed to parse transcript response");
    }
  }

  /**
   * Check if Gemini is configured
   */
  isConfigured(): boolean {
    return !!env.GOOGLE_GEMINI_API_KEY;
  }
}

export const geminiService = new GeminiService();
