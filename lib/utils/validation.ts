import { z } from 'zod';
import { YOUTUBE_URL_PATTERNS, CLIP_CONFIG } from '@/config/constants';

/**
 * Validate if a URL is a valid YouTube URL
 */
export function isValidYouTubeUrl(url: string): boolean {
  return YOUTUBE_URL_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Extract YouTube video ID from URL
 */
export function extractVideoId(url: string): string | null {
  // Standard watch URL
  const watchMatch = url.match(/[?&]v=([^&]+)/);
  if (watchMatch) return watchMatch[1];

  // Short URL
  const shortMatch = url.match(/youtu\.be\/([^?]+)/);
  if (shortMatch) return shortMatch[1];

  // Shorts URL
  const shortsMatch = url.match(/\/shorts\/([^?]+)/);
  if (shortsMatch) return shortsMatch[1];

  return null;
}

/**
 * Zod schema for job creation request
 */
export const createJobSchema = z.object({
  videoUrl: z
    .string()
    .refine((url) => isValidYouTubeUrl(url), {
      message: 'Invalid YouTube URL',
    }),
  options: z
    .object({
      clipDuration: z
        .number()
        .min(CLIP_CONFIG.minDuration)
        .max(CLIP_CONFIG.maxDuration)
        .optional(),
      maxClips: z.number().min(1).max(10).optional(),
      includeSubtitles: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Sanitize filename to prevent path traversal
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.+/g, '.')
    .substring(0, 255);
}

/**
 * Validate job ID format (UUID)
 */
export function isValidJobId(id: string): boolean {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(id);
}
