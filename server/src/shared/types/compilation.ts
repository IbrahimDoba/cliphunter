// Define enums directly instead of importing from Prisma
// These must match the Prisma schema enums

export type CompilationStatus =
  | 'CONFIGURING'
  | 'ANALYZING'
  | 'GENERATING_SCRIPT'
  | 'REVIEWING'
  | 'GENERATING_VOICEOVER'
  | 'RENDERING'
  | 'COMPLETED'
  | 'FAILED';

export type NarrationStyle =
  | 'COMMENTARY'
  | 'DOCUMENTARY'
  | 'CASUAL'
  | 'DRAMATIC'
  | 'HUMOROUS';

export type SubtitleStyle =
  | 'WORD_BY_WORD_HIGHLIGHT'
  | 'SENTENCE_POP'
  | 'KARAOKE'
  | 'MINIMAL'
  | 'BOLD_KEYWORDS';

export type ClipAudioMode = 'MUTED' | 'DUCKED' | 'FULL';

// Status constants for easier use
export const COMPILATION_STATUS = {
  CONFIGURING: 'CONFIGURING',
  ANALYZING: 'ANALYZING',
  GENERATING_SCRIPT: 'GENERATING_SCRIPT',
  REVIEWING: 'REVIEWING',
  GENERATING_VOICEOVER: 'GENERATING_VOICEOVER',
  RENDERING: 'RENDERING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export const NARRATION_STYLE = {
  COMMENTARY: 'COMMENTARY',
  DOCUMENTARY: 'DOCUMENTARY',
  CASUAL: 'CASUAL',
  DRAMATIC: 'DRAMATIC',
  HUMOROUS: 'HUMOROUS',
} as const;

export const SUBTITLE_STYLE = {
  WORD_BY_WORD_HIGHLIGHT: 'WORD_BY_WORD_HIGHLIGHT',
  SENTENCE_POP: 'SENTENCE_POP',
  KARAOKE: 'KARAOKE',
  MINIMAL: 'MINIMAL',
  BOLD_KEYWORDS: 'BOLD_KEYWORDS',
} as const;

export const CLIP_AUDIO_MODE = {
  MUTED: 'MUTED',
  DUCKED: 'DUCKED',
  FULL: 'FULL',
} as const;

// Progress tracking
export interface CompilationProgress {
  step: string;
  percentage: number;
  message: string;
}

// Clip analysis result from AI
export interface ClipAnalysis {
  clipId: string;
  description: string; // What's happening in the clip
  emotionalTone: string; // exciting, funny, tense, etc.
  keyMoments: Array<{
    timestamp: number;
    description: string;
  }>;
  notableQuotes: string[];
  engagementScore: number; // 1-10
  bestSegment: {
    start: number;
    end: number;
    reason: string;
  };
}

// Selected clip for compilation
export interface SelectedClip {
  clipId: string;
  segmentStart: number;
  segmentEnd: number;
  orderIndex: number;
  purpose: string; // Why this clip was selected (e.g., "opening hook", "climax", "conclusion")
}

// Narration segment
export interface NarrationSegment {
  text: string;
  duration?: number; // Estimated duration in seconds
}

// Script structure
export interface CompilationScript {
  intro: NarrationSegment;
  segments: Array<{
    clipId: string;
    clipStart: number;
    clipEnd: number;
    narrationBefore?: NarrationSegment;
    narrationDuring?: NarrationSegment;
    narrationAfter?: NarrationSegment;
  }>;
  outro: NarrationSegment;
  totalEstimatedDuration: number;
}

// Word timing for subtitles
export interface WordTiming {
  word: string;
  start: number; // Start time in seconds
  end: number; // End time in seconds
}

// Voiceover file info
export interface VoiceoverFile {
  segmentId: string; // e.g., "intro", "clip_1_before", "outro"
  filePath: string;
  duration: number;
  wordTimings: WordTiming[];
}

// Audio settings
export interface AudioSettings {
  clipAudioMode: ClipAudioMode;
  backgroundMusic: string | null;
  musicVolume: number;
}

// Configuration for creating a compilation
export interface CompilationConfig {
  jobId: string;
  targetDuration: number; // in seconds
  narrationStyle: NarrationStyle;
  subtitleStyle: SubtitleStyle;
  audioSettings: AudioSettings;
}

// Full compilation object
export interface Compilation {
  id: string;
  userId: string;
  jobId: string;

  // Configuration
  targetDuration: number;
  narrationStyle: NarrationStyle;
  subtitleStyle: SubtitleStyle;
  clipAudioMode: ClipAudioMode;
  backgroundMusic: string | null;
  musicVolume: number;

  // Status
  status: CompilationStatus;
  progress: CompilationProgress | null;

  // Generated content
  clipAnalysis: ClipAnalysis[] | null;
  selectedClips: SelectedClip[] | null;
  script: CompilationScript | null;
  voiceoverFiles: VoiceoverFile[] | null;

  // Output
  outputPath: string | null;
  outputUrl: string | null;
  thumbnailPath: string | null;

  // Metadata
  error: string | null;
  createdAt: Date;
  updatedAt: Date;

  // Relations
  clips: CompilationClip[];
}

// Compilation clip (for detailed editing)
export interface CompilationClip {
  id: string;
  compilationId: string;
  sourceClipId: string;
  segmentStart: number;
  segmentEnd: number;
  orderIndex: number;
  analysis: ClipAnalysis | null;
  engagementScore: number | null;
  narrationBefore: string | null;
  narrationDuring: string | null;
  narrationAfter: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// API request types
export interface CreateCompilationRequest {
  jobId: string;
  targetDuration: number;
  narrationStyle: NarrationStyle;
  subtitleStyle: SubtitleStyle;
  audioSettings: AudioSettings;
}

export interface UpdateClipsRequest {
  clips: Array<{
    sourceClipId: string;
    segmentStart: number;
    segmentEnd: number;
    orderIndex: number;
  }>;
}

export interface UpdateScriptRequest {
  intro: { text: string };
  segments: Array<{
    clipId: string;
    narrationBefore?: string;
    narrationDuring?: string;
    narrationAfter?: string;
  }>;
  outro: { text: string };
}

export interface RegenerateScriptRequest {
  narrationStyle?: NarrationStyle;
  additionalInstructions?: string;
}

// API response types
export interface CompilationResponse {
  id: string;
  status: CompilationStatus;
  progress: CompilationProgress | null;
  config: {
    targetDuration: number;
    narrationStyle: NarrationStyle;
    subtitleStyle: SubtitleStyle;
    audioSettings: AudioSettings;
  };
  clipAnalysis: ClipAnalysis[] | null;
  selectedClips: SelectedClip[] | null;
  script: CompilationScript | null;
  outputUrl: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Narration style descriptions for UI
export const NARRATION_STYLE_INFO: Record<
  NarrationStyle,
  { label: string; description: string; example: string }
> = {
  COMMENTARY: {
    label: 'Commentary',
    description: 'Energetic, reaction-style narration',
    example: 'OH MY GOD, did you see that?! This is absolutely INSANE...',
  },
  DOCUMENTARY: {
    label: 'Documentary',
    description: 'Professional, informative tone',
    example:
      'In this pivotal moment, the situation took an unexpected turn...',
  },
  CASUAL: {
    label: 'Casual',
    description: 'Friendly, conversational style',
    example: "So basically what happened here is pretty wild...",
  },
  DRAMATIC: {
    label: 'Dramatic',
    description: 'Cinematic, storytelling approach',
    example:
      'No one could have predicted what came next. The silence before the storm...',
  },
  HUMOROUS: {
    label: 'Humorous',
    description: 'Witty, entertaining commentary',
    example: "And that's when things went completely off the rails, as they do...",
  },
};

// Subtitle style descriptions for UI
export const SUBTITLE_STYLE_INFO: Record<
  SubtitleStyle,
  { label: string; description: string }
> = {
  WORD_BY_WORD_HIGHLIGHT: {
    label: 'Word-by-word Highlight',
    description: 'Each word appears/highlights as spoken, colored keywords',
  },
  SENTENCE_POP: {
    label: 'Sentence Pop',
    description: 'Full sentences appear with animations',
  },
  KARAOKE: {
    label: 'Karaoke',
    description: 'Words highlight in sequence like karaoke',
  },
  MINIMAL: {
    label: 'Minimal',
    description: 'Simple white text, no effects',
  },
  BOLD_KEYWORDS: {
    label: 'Bold Keywords',
    description: 'Regular text with important words bolded/colored',
  },
};

// Duration presets for UI
export const DURATION_PRESETS = [
  { value: 60, label: '1 minute', description: 'TikTok, Reels, Shorts' },
  { value: 120, label: '2 minutes', description: 'Medium short-form' },
  { value: 180, label: '3 minutes', description: 'Extended short-form' },
  { value: 300, label: '5 minutes', description: 'Standard YouTube' },
] as const;
