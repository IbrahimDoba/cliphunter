export const APP_CONFIG = {
  name: 'Cliphunter',
  description: 'Transform YouTube videos into engaging short clips',
  version: '0.1.0',
} as const;

export const VIDEO_CONFIG = {
  // Supported aspect ratios
  aspectRatios: {
    vertical: { width: 9, height: 16 }, // TikTok, YouTube Shorts, Instagram Reels
    square: { width: 1, height: 1 },
    horizontal: { width: 16, height: 9 },
  },

  // Video quality presets
  qualityPresets: {
    low: {
      videoBitrate: '500k',
      audioBitrate: '64k',
      preset: 'veryfast',
    },
    medium: {
      videoBitrate: '1000k',
      audioBitrate: '128k',
      preset: 'fast',
    },
    high: {
      videoBitrate: '2500k',
      audioBitrate: '192k',
      preset: 'medium',
    },
  },

  // Default settings
  defaults: {
    quality: 'medium' as const,
    aspectRatio: 'vertical' as const,
    fps: 30,
    resolution: { width: 1080, height: 1920 },
  },
} as const;

export const CLIP_CONFIG = {
  // Minimum clip duration in seconds
  minDuration: 15,

  // Maximum clip duration in seconds
  maxDuration: 60,

  // Default clip duration in seconds
  defaultDuration: 45,

  // Scene detection threshold (0-1)
  sceneThreshold: 0.4,

  // Minimum time between clips in seconds
  minTimeBetweenClips: 5,
} as const;

export const SUBTITLE_CONFIG = {
  // Whisper model size
  modelSize: 'base' as const,

  // Supported languages (MVP: English only)
  supportedLanguages: ['en'] as const,

  // Subtitle styling
  style: {
    fontName: 'Arial',
    fontSize: 24,
    primaryColor: '&HFFFFFF',
    outlineColor: '&H000000',
    bold: true,
    alignment: 2, // Bottom center
  },
} as const;

export const JOB_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export const PROCESSING_STEPS = {
  DOWNLOADING: 'downloading',
  ANALYZING: 'analyzing',
  TRANSCRIBING: 'transcribing',
  GENERATING: 'generating',
  DONE: 'done',
  ERROR: 'error',
} as const;

export const ERROR_MESSAGES = {
  INVALID_URL: 'Invalid YouTube URL',
  VIDEO_TOO_LONG: 'Video exceeds maximum duration',
  DOWNLOAD_FAILED: 'Failed to download video',
  PROCESSING_FAILED: 'Failed to process video',
  JOB_NOT_FOUND: 'Job not found',
  JOB_ALREADY_COMPLETED: 'Job already completed',
  CLIP_NOT_FOUND: 'Clip not found',
} as const;

export const YOUTUBE_URL_PATTERNS = [
  /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
  /^https?:\/\/youtu\.be\/[\w-]+/,
  /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
] as const;
