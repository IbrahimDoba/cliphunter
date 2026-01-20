export interface Clip {
  id: string;
  jobId: string;
  startTime: number;
  endTime: number;
  duration: number;
  score: number;
  videoPath: string;
  thumbnailPath: string;
  subtitlePath?: string;
  createdAt: Date;
}

export interface Scene {
  startTime: number;
  endTime: number;
  duration: number;
  score: number;
  hasAudioPeak?: boolean;
  hasTextMatch?: boolean;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  bitrate: number;
  title?: string;
}

export interface SubtitleSegment {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
}

export interface TranscriptionResult {
  segments: SubtitleSegment[];
  language: string;
  duration: number;
}
