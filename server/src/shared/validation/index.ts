import { z } from 'zod';

// YouTube URL validation
export const youtubeUrlSchema = z.string().refine(
  (url) => {
    const patterns = [
      /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
      /^https?:\/\/youtu\.be\/[\w-]+/,
      /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
    ];
    return patterns.some((pattern) => pattern.test(url));
  },
  { message: 'Invalid YouTube URL' }
);

// Job options validation
export const jobOptionsSchema = z.object({
  clipDuration: z.number().min(15).max(90).optional(),
  maxClips: z.number().min(1).max(10).optional(),
  includeSubtitles: z.boolean().optional(),
  showSubscribe: z.boolean().optional(),
});

// Create job request validation
export const createJobRequestSchema = z.object({
  videoUrl: youtubeUrlSchema,
  options: jobOptionsSchema.optional(),
});

// Compilation config validation
export const compilationConfigSchema = z.object({
  jobId: z.string().min(1),
  targetDuration: z.number().min(30).max(600),
  narrationStyle: z.enum([
    'COMMENTARY',
    'DOCUMENTARY',
    'CASUAL',
    'DRAMATIC',
    'HUMOROUS',
  ]),
  subtitleStyle: z.enum([
    'WORD_BY_WORD_HIGHLIGHT',
    'SENTENCE_POP',
    'KARAOKE',
    'MINIMAL',
    'BOLD_KEYWORDS',
  ]),
  audioSettings: z.object({
    clipAudioMode: z.enum(['MUTED', 'DUCKED', 'FULL']),
    backgroundMusic: z.string().nullable(),
    musicVolume: z.number().min(0).max(1),
  }),
});

// Update script request validation
export const updateScriptRequestSchema = z.object({
  intro: z.object({
    text: z.string(),
  }),
  segments: z.array(
    z.object({
      clipId: z.string(),
      narrationBefore: z.string().optional(),
      narrationDuring: z.string().optional(),
      narrationAfter: z.string().optional(),
    })
  ),
  outro: z.object({
    text: z.string(),
  }),
});

// YouTube upload request validation
export const youtubeUploadRequestSchema = z.object({
  clipPath: z.string().min(1),
  title: z.string().min(1).max(100),
  description: z.string().max(5000),
  privacy: z.enum(['public', 'unlisted', 'private']),
});

// Export types from schemas
export type CreateJobRequestInput = z.infer<typeof createJobRequestSchema>;
export type JobOptionsInput = z.infer<typeof jobOptionsSchema>;
export type CompilationConfigInput = z.infer<typeof compilationConfigSchema>;
export type UpdateScriptRequestInput = z.infer<typeof updateScriptRequestSchema>;
export type YouTubeUploadRequestInput = z.infer<typeof youtubeUploadRequestSchema>;
