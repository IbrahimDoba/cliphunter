import { JOB_STATUS, PROCESSING_STEPS } from '@/config/constants';

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];
export type ProcessingStep = (typeof PROCESSING_STEPS)[keyof typeof PROCESSING_STEPS];

export interface JobProgress {
  step: ProcessingStep;
  percentage: number;
  message: string;
}

export interface JobError {
  message: string;
  code: string;
  details?: unknown;
}

export interface JobOptions {
  clipDuration?: number;
  maxClips?: number;
  includeSubtitles?: boolean;
}

export interface Job {
  id: string;
  videoUrl: string;
  status: JobStatus;
  progress: JobProgress;
  result?: JobResult;
  error?: JobError;
  options: JobOptions;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobResult {
  videoTitle: string;
  duration: number;
  clips: ClipInfo[];
}

export interface ClipInfo {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  score: number;
  thumbnailUrl: string;
  videoUrl: string;
  title?: string; // Title overlay burned into the video
}

// Database types
export interface JobRecord {
  id: string;
  video_url: string;
  status: JobStatus;
  progress: string; // JSON string
  result: string | null; // JSON string
  error: string | null; // JSON string
  options: string; // JSON string
  created_at: number; // Unix timestamp
  updated_at: number; // Unix timestamp
}
